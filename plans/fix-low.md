# Low Severity Fixes

## L1 — getContextUsage type mismatch skips system prompt tokens

**File:** `apps/server/src/ai/agent-session.ts:386`

**Problem:** `estimateContextTokens(context)` receives `SessionContext` but expects
`Context | Message[]`. Works by duck typing but system prompt and tools are not
counted.

**Fix:** Build a proper `Context` object before estimating:

```typescript
getContextUsage() {
  const sessionContext = this.sessionManager.buildSessionContext();
  const context: Context = {
    systemPrompt: sessionContext.systemPrompt || "",
    messages: sessionContext.messages as Message[],
    tools: this.activeTools as any,
  };
  const estimate = estimateContextTokens(context);
  // ...
}
```

---

## L2 — inputTokens/outputTokens naming is semantically wrong

**File:** `apps/server/src/ai/agent-session.ts:388-391`

**Problem:** `inputTokens` maps to `estimate.usageTokens` (last assistant's total
usage, which includes output), and `outputTokens` maps to
`estimate.trailingTokens` (messages after last usage).

**Fix:** Rename to reflect what they actually are (or compute true input/output):

```typescript
return {
  totalTokens: estimate.tokens,
  lastUsageTokens: estimate.usageTokens,
  unaccountedTokens: estimate.trailingTokens,
  limit: this.model?.contextWindow ?? 1_000_000,
};
```

Update the frontend `ContextIndicator.tsx` to match the new field names.

---

## L3 — steer/followUp have no isStreaming guard

**File:** `apps/server/src/ai/agent-session.ts:336-356`

**Problem:** `steer()` and `followUp()` queue messages even when `isStreaming ===
false`. They sit in the queue until the next `prompt()`.

**Fix:** Add a warning log but do NOT throw (queuing for next prompt is valid):

```typescript
steer(messageText: string): void {
  if (!this.isStreaming) {
    console.warn("[AgentSession] steer() called while not streaming — message queued for next prompt");
  }
  // ... push to queue
}
```

---

## L4 — undefined tool return coerced to string "undefined"

**File:** `apps/server/src/ai/agent-session.ts:91-97`

**Problem:** If `toolDef.execute()` returns `undefined`, `JSON.stringify(undefined)`
returns the string `"undefined"`, which becomes the LLM-visible result.

**Fix:** Handle undefined/null explicitly:

```typescript
execute: async (toolCallId, params, signal) => {
  const res = await toolDef.execute(toolCallId, params, signal);
  if (res == null) {
    return { content: [{ type: "text", text: "" }], details: {} };
  }
  // ... rest of normalization
}
```

---

## L5 — compact() is a stub

**File:** `apps/server/src/ai/agent-session.ts:372-375`

Already covered in `debt-agentsession.md`.

---

## L6 — WS: No error displayed when token is invalid

**File:** `apps/client/src/lib/ws-client.ts:110-114`

**Problem:** On `auth_error`, the client closes silently with no user feedback.

**Fix:** Add an `onStatusChange` callback that the UI can display:

```typescript
// ws-client.ts
type StatusChangeHandler = (status: string) => void;
private onStatusChange?: StatusChangeHandler;

// In constructor:
constructor(onStatusChange?: StatusChangeHandler) {
  this.onStatusChange = onStatusChange;
}

// On auth_error:
this.onStatusChange?.("auth_expired");
```

```typescript
// In ChatArea or MainLayout:
wsClient = new WsClient((status) => {
  if (status === "auth_expired") {
    setError("Session expired. Please log in again.");
    // Optionally redirect to login
  }
});
```

---

## L7 — EXEC/LAB session subscriptions silently skipped

**File:** `apps/server/src/ws/handler.ts:115-117`

**Problem:** Client receives no feedback when subscribing to an exec/lab session.

**Fix:** Send an explicit response:

```typescript
if (sessionId.startsWith(SessionPrefix.EXEC) || sessionId.startsWith(SessionPrefix.LAB)) {
  safeSend(ws, JSON.stringify({
    type: "session_subscribed",
    sessionId,
    readOnly: true,
  }));
  return;
}
```

---

## L8 — TOCTOU race in subscribeWsToSession meta write

**File:** `apps/server/src/ws/handler.ts:119-139`

**Problem:** `wsSocketMeta` update happens after `getOrCreateSession` (async I/O).

**Fix:** Update meta before the async call:

```typescript
// Update metadata first (synchronous)
wsSocketMeta.set(ws.wsId, { ...meta, sessionId });

// Then do async work
const session = await sessionManager.getOrCreateSession(user.username, sessionId);
```

---

## L9 — WS: No feedback on permanent disconnect

**File:** `apps/client/src/lib/ws-client.ts:130-135`

Covered by M13 (max retries) + L6 (status callback).

---

## L10 — WS: Network errors not distinguished from normal close

**File:** `apps/client/src/lib/ws-client.ts:138-140`

**Problem:** `ws.onerror` just calls `ws.close()`, making every error look like
a normal close.

**Fix:** Track error state:

```typescript
private lastError: string | null = null;

// In constructor:
ws.onerror = (e) => {
  this.lastError = "Network error";
  ws.close();
};

// Expose for UI:
getLastError(): string | null { return this.lastError; }
```

---

## L11 — turn_start/turn_end dropped

**File:** `apps/server/src/ai/agent-session.ts:253-320`

**Problem:** The loop emits `turn_start` and `turn_end` but the event mapper
ignores them.

**Fix:** Forward them to the frontend:

```typescript
} else if (evt.type === "turn_start") {
  this.emit({ type: "turn_start" });
} else if (evt.type === "turn_end") {
  this.emit({ type: "turn_end" });
}
```

---

## L12 — Unknown event types silently ignored

**File:** `apps/server/src/ai/agent-session.ts:253-320`

**Problem:** If the vendor adds a new event type, it's silently dropped.

**Fix:** Add a fallback log:

```typescript
// At the end of the if/else chain:
} else {
  console.warn("[AgentSession] Unknown vendor event type:", (evt as any).type);
}
```

---

## L13 — compat.ts barrel export may collide

**File:** `apps/server/src/ai/vendor/ai/src/compat.ts:21`

**Problem:** `export * from "./index.ts"` re-exports everything. If both files
export a symbol with the same name, it silently resolves to the first.

**Fix:** Explicitly re-export only what's needed, or remove the re-export and
have consumers import from the specific module.

---

## Execution Order

Batch these together (each is 1-5 lines):
1. **L4** (undefined return guard)
2. **L3** (steer warning log)
3. **L8** (meta write before async)
4. **L11** (turn_start/turn_end forwarding)
5. **L12** (unknown event log)
6. **L7** (readOnly response)
7. **L1** (context type fix)
8. **L2** (token naming)
9. **L6** (auth error display)
10. **L9 + L10** (disconnect feedback)
11. **L13** (barrel export cleanup)
