COMPLETED
# High Severity Fixes

## H1 — Pre-loop throw leaves isStreaming=true permanently

**File:** `apps/server/src/ai/agent-session.ts:197-214`

**Problem:** If `sessionManager.appendMessage()` or `buildSessionContext()` throws
between `isStreaming=true` and the LLM call, the flag is never reset.

**Fix:** Wrap the entire pre-loop setup in a try-catch:

```typescript
async prompt(messageText: string, opts?: any): Promise<any> {
  if (this.isStreaming) throw new Error("Session is already streaming");
  this.isStreaming = true;
  this.abortController = new AbortController();

  try {
    // ... all setup code ...
    await runAgentLoop(...);
  } catch (err: unknown) {
    this.emit({
      type: "agent_error",
      error: err instanceof Error ? err.message : String(err ?? "Unknown error"),
    });
    this.emit({ type: "agent_end", messages: this.messages, willRetry: false });
  } finally {
    this.isStreaming = false;
    this.abortController = null;
    this.messages = this.sessionManager.buildSessionContext().messages;
  }
}
```

Move the existing try-catch (which wraps `runAgentLoop`) to encompass the entire
method body after the `isStreaming` guard.

---

## H2 — navigateTree() can corrupt messages mid-stream

**File:** `apps/server/src/ai/agent-session.ts:377-381`

**Problem:** `navigateTree()` calls `sessionManager.branch()` which changes the
session's `leafId`. If called while `prompt()` is running, the next
`buildSessionContext()` returns messages from a different branch.

**Fix:** Add an `isStreaming` guard:

```typescript
async navigateTree(targetId: string, options?: { summarize?: boolean }): Promise<{ editorText: string }> {
  if (this.isStreaming) {
    throw new Error("Cannot navigate while session is streaming");
  }
  this.sessionManager.branch(targetId);
  this.messages = this.sessionManager.buildSessionContext().messages;
  return { editorText: "" };
}
```

---

## H3 — steer/followUp messages duplicated in LLM context

**File:** `apps/server/src/ai/agent-session.ts:336-356`

**Problem:** `steer()` and `followUp()` call `sessionManager.appendMessage()` AND
push to the queue. The queue is drained by `getSteeringMessages()` which pushes
the message into `currentContext.messages`. But the message ALSO exists in
`sessionContext.messages` (from `buildSessionContext()` on line 200). The LLM
sees the message twice.

**Fix:** Do NOT call `sessionManager.appendMessage()` in `steer()` and `followUp()`.
The queue drain in `getSteeringMessages()` will add the message to
`currentContext.messages` at the correct point in the loop. The message is still
persisted when `prompt()` completes normally (or by the drain mechanism).

```typescript
steer(messageText: string): void {
  const msg = { role: "user" as const, content: messageText, timestamp: Date.now() };
  this.steeringQueue.push(msg);
  // Do NOT appendMessage here — the queue drain handles it
}

followUp(messageText: string): void {
  const msg = { role: "user" as const, content: messageText, timestamp: Date.now() };
  this.followUpQueue.push(msg);
  // Do NOT appendMessage here — the queue drain handles it
}
```

---

## H4 — sendContextUsage() error kills subscription pipe

**File:** `apps/server/src/ws/handler.ts:189`

**Problem:** Inside the session subscription callback, `sendContextUsage()` is
called inside a `catch {}` that terminates the callback. If it throws, no more
events reach the client.

**Fix:** Add logging and do NOT let it terminate the callback:

```typescript
const sendContextUsage = () => {
  try {
    const contextUsage = session.getContextUsage();
    const sessionStats = session.getSessionStats();
    if (contextUsage || sessionStats) {
      safeSend(ws, JSON.stringify({ type: "context_usage", sessionId, contextUsage, sessionStats }));
    }
  } catch (err) {
    console.error("[WS] sendContextUsage failed:", err);
  }
};
```

Replace bare `catch {}` with `catch (err) { console.error(...) }` at ALL locations
in handler.ts (lines 52, 59, 70, 84, 96, 107, 189, 222).

---

## H5 — Out-of-order WS messages cause phantom messages

**File:** `apps/client/src/components/chat/ChatArea.tsx:296-339`

**Problem:** `message_update` can arrive before `message_start`. The handler
checks `last?.isStreaming` — if no message is streaming, it appends a new entry
instead of updating.

**Fix:** Track active streaming message by `responseId`:

```typescript
const [streamingMessageIds, setStreamingMessageIds] = useState<Set<string>>(new Set());

// In message_start handler:
if (msg.role === "assistant") {
  setStreamingMessageIds(prev => new Set(prev).add(msg.responseId || msg.id || ""));
}

// In message_update handler:
const streamingId = evt.responseId || evt.message?.responseId;
if (streamingId && !streamingMessageIds.has(streamingId)) {
  // message_start hasn't arrived yet — drop or queue this update
  return;
}
```

Alternative simpler fix: add a 50ms buffer that waits for `message_start` before
processing updates for the same `responseId`.

---

## H6 + H7 + H8 — tool_execution_update dropped, AgentHarness not used, compact is stub

These are covered in the technical debt plans (see `debt-agentsession.md`).

---

## Execution Order

1. **H1** (pre-loop try-catch) — prevents permanent session lock
2. **H3** (steer duplication) — prevents context corruption
3. **H4** (sendContextUsage logging) — prevents silent pipe death
4. **H2** (navigate guard) — prevents message corruption
5. **H5** (out-of-order messages) — prevents phantom messages
