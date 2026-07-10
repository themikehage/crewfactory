# API Error Detection — Silent Failures Surface

## Problem

When the LLM API returns an error (403, rate limit, content filter, etc.),
the error flows through the entire chain as an `AssistantMessage` with
`stopReason: "error"` and `content: []` (empty). Every layer treats it as a
normal message, so the frontend renders nothing and the user sees a blank
assistant response with no indication of failure.

## Root Cause Chain

```
openai-completions.ts           stream.push({ type: "error", ... })
    ↓
agent-loop.ts:342-355           "error" handled identically to "done" → message_end emitted
    ↓
agent-session.ts:279-287        message_end appended to session, forwarded to WS (no stopReason check)
    ↓
agent-session.ts:325-328        Catch only fires on throws, NOT on in-stream error messages
    ↓
agent-session.ts:160-165        emit() swallows listener errors silently
    ↓
ws/handler.ts                   agent_error never sent → frontend never notified
    ↓
MessageList.tsx:210-267         content: [] renders nothing, errorMessage field never read
```

## Implementation Plan

### Phase 1: Detect and Fire `agent_error` on In-Stream Errors

#### 1a. `agent-session.ts` — Check `stopReason` in `message_end` handler

In `AgentSession.prompt()`, the `message_end` event handler (line 249/279):

```typescript
} else if (evt.type === "message_end") {
    // NEW: detect API errors and emit agent_error
    const msg = evt.message as any;
    if (msg?.role === "assistant" && msg?.stopReason === "error") {
        this.emit({
            type: "agent_error",
            error: msg.errorMessage || "Provider returned an error response.",
            sessionId: this.sessionManager.getSessionId(),
        });
    }

    if (evt.message && (evt.message.role === "assistant" || evt.message.role === "toolResult")) {
        // still append the message so the history is preserved
        this.sessionManager.appendMessage(evt.message);
        this.messages = this.sessionManager.buildSessionContext().messages;
    }
    this.emit({
        type: "message_end",
        message: evt.message,
    });
}
```

This ensures that when `stopReason === "error"`, an `agent_error` event is
emitted and forwarded to the frontend via WebSocket. The error message is
still appended to history (so the user can see it on reload) BUT the
frontend also gets the error signal.

#### 1b. `agent-session.ts` — Also emit `agent_error` from the catch block even when messages exist

The current catch block (line 325) emits `agent_end` with `messages: []`.
Change it to emit with whatever messages we have:

```typescript
} catch (err: any) {
    this.emit({ type: "agent_error", error: err.message });
    // Preserve messages that were accumulated before the throw
    this.emit({ type: "agent_end", messages: this.messages, willRetry: false });
}
```

---

### Phase 2: Surface Error Messages in the Frontend

#### 2a. `ChatArea.tsx` — Update `agent_error` handler to show inline error

Current handler (line 364-367):

```typescript
const unsubError = subscribe("agent_error", (data: unknown) => {
    const evt = data as Record<string, unknown>;
    setError(String(evt.error ?? l.unknownError));
});
```

This sets a top-level error banner. Improve to also inject a visible error
message into the message list:

```typescript
const unsubError = subscribe("agent_error", (data: unknown) => {
    const evt = data as Record<string, unknown>;
    const errorText = String(evt.error ?? l.unknownError);

    // Set dismissable banner
    setError(errorText);

    // Also inject a visible error block in the message list
    setMessages((prev) => {
        const last = prev[prev.length - 1];
        // Don't duplicate if the last message is already an error
        if (last?.role === "assistant" && (last as any).stopReason === "error") return prev;
        // Add an assistant message with the error visible
        const errorMsg: Message = {
            role: "assistant",
            content: `[API Error] ${errorText}`,
            isError: true,
            stopReason: "error",
        };
        return [...prev, errorMsg];
    });
});
```

#### 2b. `MessageList.tsx` — Render error messages distinctly

In the `AgentTurn` or message rendering section, add a check at the top:

```typescript
// Before block iteration
if (msg.stopReason === "error") {
    const errorText = msg.errorMessage
        || (typeof msg.content === "string" ? msg.content : "")
        || "The API returned an error. Please check your provider configuration.";
    return (
        <div className="px-4 py-3 rounded-lg bg-destructive/10 border border-error/20 text-destructive text-sm">
            <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span className="font-semibold text-xs uppercase tracking-wider">API Error</span>
            </div>
            <p className="text-xs leading-relaxed opacity-90">{errorText}</p>
        </div>
    );
}
```

Also add `stopReason` and `errorMessage` to the `Message` interface:

```typescript
interface Message {
    // ... existing fields ...
    stopReason?: string;
    errorMessage?: string;
    isError?: boolean;
}
```

#### 2c. `ChatArea.tsx` — Clear error on next successful agent_start

When a new successful agent turn starts, clear any previous error:

```typescript
const unsubStart = subscribe("agent_start", () => {
    setStreaming(true);
    setError(null);  // Clear previous error
});
```

---

### Phase 3: Server-Side Logging for Error Visibility

#### 3a. `agent-session.ts` — Log API errors

Add `console.warn` when `stopReason === "error"` is detected:

```typescript
if (msg?.role === "assistant" && msg?.stopReason === "error") {
    console.warn(
        `[API Error] Session ${this.sessionManager.getSessionId()}:`,
        msg.errorMessage || "Unknown error"
    );
    // ... emit agent_error ...
}
```

#### 3b. `agent-session.ts` — Log in the catch block

```typescript
} catch (err: any) {
    console.error(`[Agent Loop Error] Session ${this.sessionManager?.getSessionId()}:`, err);
    this.emit({ type: "agent_error", error: err.message });
    // ...
}
```

---

### Phase 4: Handle Empty Content Messages (Defense in Depth)

#### 4a. `agent-loop.ts` — Validate message content before using it

In `runLoop` (after `streamAssistantResponse` returns), add a validation:

```typescript
const message = await streamAssistantResponse(...);

// NEW: if the message has no content blocks, convert to a visible error
if (message.stopReason !== "error" && message.content.length === 0) {
    message.content = [{ type: "text", text: "The model returned an empty response." }];
    message.stopReason = "error";
    message.errorMessage = "Empty response from provider";
}
```

#### 4b. `openai-completions.ts` — Validate non-empty response at source

After the blocks are processed and before `end()`, add:

```typescript
// After blocks processing, before push "done"
if (output.content.length === 0 && output.stopReason !== "error") {
    output.content = [{ type: "text", text: "" }]; // ensure at least empty text
    // Or better: emit error
    output.stopReason = "error";
    output.errorMessage = "Provider returned empty response";
}
```

---

### Phase 5: Provider Error Message Sanitization

#### 5a. `error-body.ts` or `openai-completions.ts` — Make error messages user-friendly

Create a helper `sanitizeUserErrorMessage()`:

```typescript
function sanitizeUserErrorMessage(raw: string): string {
    // Hide internal details, expose the actionable part
    if (raw.includes("403")) return "Authentication failed. Check your API key.";
    if (raw.includes("429") || raw.includes("rate limit")) return "Rate limit exceeded. Please wait before trying again.";
    if (raw.includes("401")) return "Invalid API key. Update it in Settings.";
    if (raw.includes("insufficient_quota")) return "API quota exceeded. Check your billing.";
    if (raw.includes("content_filter")) return "Response blocked by content safety filter.";
    if (raw.includes("timeout") || raw.includes("timed out")) return "Request timed out. The model may be overloaded.";
    // Generic fallback
    const clean = raw.replace(/\b(sk-[a-zA-Z0-9]{10,})/g, "sk-***"); // mask leaked keys
    return clean.length > 200 ? clean.slice(0, 200) + "..." : clean;
}
```

Apply in `openai-completions.ts` catch block:

```typescript
output.errorMessage = sanitizeUserErrorMessage(formatProviderError(normalizeProviderError(error)));
```

And in `lazy.ts` `createSetupErrorMessage`:

```typescript
errorMessage: sanitizeUserErrorMessage(error instanceof Error ? error.message : String(error)),
```

---

### Phase 6: Frontend Error Banner Improvements

#### 6a. `ChatArea.tsx` — Stop streaming on agent_error

Current error banner at line 493-498 just shows the error. Add auto-dismiss
after errors that are not from the API (e.g., client-side issues):

```typescript
{error && (
    <div className="px-3 sm:px-4 py-2 bg-destructive/10 border-b border-error/20 text-destructive text-xs flex-shrink-0">
        <span className="font-semibold">Error: </span>
        {error}
        <button onClick={() => setError(null)} className="ml-2 underline text-destructive/70 hover:text-destructive">
            Dismiss
        </button>
    </div>
)}
```

#### 6b. `ChatInput.tsx` — Enable re-send after error

Ensure `streaming` is `false` after an error so the user can type a new
message. The `agent_end` already sets `streaming = false`, but we should
also set it in the `agent_error` handler for safety:

```typescript
const unsubError = subscribe("agent_error", (data: unknown) => {
    // ...
    setStreaming(false);  // Ensure input is re-enabled
});
```

---

## Files Modified

### Server (4 files)

| File | Change |
|------|--------|
| `apps/server/src/ai/agent-session.ts` | Check `stopReason === "error"` in `message_end` handler, emit `agent_error`, log errors, preserve messages in catch |
| `apps/server/src/ai/vendor/agent/src/agent-loop.ts` | Validate empty content, convert to error message |
| `apps/server/src/ai/vendor/ai/src/api/openai-completions.ts` | Sanitize error messages, handle empty content at source |
| `apps/server/src/ai/vendor/ai/src/api/lazy.ts` | Apply `sanitizeUserErrorMessage` on setup errors |

### Client (3 files)

| File | Change |
|------|--------|
| `apps/client/src/components/chat/ChatArea.tsx` | Inject visible error message, clear on new turn, ensure streaming=false, improve error banner |
| `apps/client/src/components/chat/MessageList.tsx` | Render dedicated error card for `stopReason === "error"` messages |
| `apps/client/src/components/chat/tools/ToolCallRow.tsx` | Handle result errors gracefully |

---

## Verification

1. Trigger a 403 (wrong API key) — verify red error banner + inline error message
2. Trigger a 429 (rate limit) — verify user-friendly "rate limit" message
3. Trigger a content filter — verify "content safety filter" message
4. Send a valid prompt after error — verify previous error is cleared
5. Test page reload during error — verify error message is preserved in session history
6. Verify non-error messages render exactly as before (no regressions)
