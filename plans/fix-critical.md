# Critical Fixes

## C1 — AgentSession catch block can lock session permanently

**File:** `apps/server/src/ai/agent-session.ts:325-327`

**Problem:** `catch (err: any) { this.emit({ type: "agent_error", error: err.message }); }`
If `err` is `undefined`, `null`, or a primitive (`throw "string"`), `err.message` throws a
`TypeError` inside the catch. The `finally` block never runs, `isStreaming` stays `true`,
session is dead forever.

**Fix:**
```typescript
} catch (err: unknown) {
  const errorMsg = err instanceof Error ? err.message : String(err ?? "Unknown error");
  this.emit({ type: "agent_error", error: errorMsg });
  this.emit({ type: "agent_end", messages: this.messages, willRetry: false });
}
```

Also emit `agent_end` with current `this.messages` instead of `[]`, so the frontend
gets the accumulated messages even on error.

---

## C2 — steer() and followUp() share the same queue

**File:** `apps/server/src/ai/agent-session.ts:45-55, 336-356`

**Problem:** Both `drainSteeringMessages()` and `drainFollowUpMessages()` drain the SAME
`delegationResultQueue`. Since `getSteeringMessages()` is called first and more
frequently, `getFollowUpMessages()` always finds an empty queue. The APIs are
functionally identical.

**Fix:**

Rename the single queue to `steeringQueue` and give `drainFollowUpMessages()` its
own `followUpQueue`:

```typescript
private steeringQueue: AgentMessage[] = [];
private followUpQueue: AgentMessage[] = [];

drainSteeringMessages(): Promise<AgentMessage[]> {
  const msgs = [...this.steeringQueue];
  this.steeringQueue = [];
  return Promise.resolve(msgs);
}

drainFollowUpMessages(): Promise<AgentMessage[]> {
  const msgs = [...this.followUpQueue];
  this.followUpQueue = [];
  return Promise.resolve(msgs);
}

steer(messageText: string): void {
  const msg = { role: "user" as const, content: messageText, timestamp: Date.now() };
  this.steeringQueue.push(msg);
  this.sessionManager.appendMessage(msg);
  this.messages = this.sessionManager.buildSessionContext().messages;
}

followUp(messageText: string): void {
  const msg = { role: "user" as const, content: messageText, timestamp: Date.now() };
  this.followUpQueue.push(msg);
  this.sessionManager.appendMessage(msg);
  this.messages = this.sessionManager.buildSessionContext().messages;
}

addDelegationResult(resultMessage: AgentMessage): void {
  this.steeringQueue.push(resultMessage);
}
```

Also ensure `addDelegationResult()` does NOT persist the message (it is not a user
message and should not survive a reload — delegation results are ephemeral). Remove
the `sessionManager.appendMessage()` call from `addDelegationResult()`.

---

## C3 — JWT not re-verified mid-session

**File:** `apps/server/src/ws/handler.ts:292-323`

**Problem:** JWT is verified once on `auth` message. If token expires mid-session,
the WebSocket remains functional indefinitely.

**Fix:**

1. Store `exp` from decoded JWT in `userMap`:
```typescript
interface UserSession {
  username: string;
  exp: number;
}
const userMap = new Map<string, UserSession>();
```

2. In `onMessage`, before processing any message type, check expiry:
```typescript
const userEntry = userMap.get(ws.wsId);
if (!userEntry) {
  safeSend(ws, JSON.stringify({ type: "error", error: "Not authenticated" }));
  return;
}
if (Date.now() >= userEntry.exp * 1000) {
  safeSend(ws, JSON.stringify({ type: "auth_error", error: "Token expired" }));
  userMap.delete(ws.wsId);
  try { ws.close(); } catch {}
  return;
}
```

3. Store `exp` on auth:
```typescript
const decoded = jwt.verify(data.token as string, process.env.JWT_SECRET!) as AuthPayload & { exp: number };
userMap.set(ws.wsId, { username: decoded.username, exp: decoded.exp });
```

---

## C4 — AgentSession bypasses the Agent class

**File:** `apps/server/src/ai/agent-session.ts` (entire file)

**Problem:** AgentSession calls `runAgentLoop()` directly instead of using pi's
`Agent` class, losing 409 lines of state management, separate queues, structured
errors, waitForIdle, and lifecycle handling.

**Fix:** Refactor AgentSession to use pi's `Agent` class internally.

Create a thin adapter that instantiates `Agent` and delegates:

```typescript
class AgentSession {
  private agent: Agent;

  async prompt(messageText: string, opts?: any): Promise<void> {
    this.agent.prompt(messageText, { signal: this.abortController?.signal });
  }

  steer(messageText: string): void {
    this.agent.steer(messageText);
  }

  followUp(messageText: string): void {
    this.agent.followUp(messageText);
  }
}
```

This requires:
- Passing the `loopConfig` and `context` to the `Agent` constructor
- Wiring `agent.subscribe()` to our event listeners
- Letting `Agent` handle queue management, lifecycle, and abort
- Keeping our custom `convertToLlm`, `getApiKey`, and `streamFn`

**Estimated effort:** 2-3 days (moderate refactor, careful testing needed)

---

## C5 — Only openai-completions registered

**File:** `apps/server/src/ai/vendor/ai/src/compat.ts:127-136`

**Problem:** Only `openai-completions` is registered. Models with other API types
(`anthropic-messages`, `google-generative-ai`, etc.) silently fail.

**Fix:** This is a product decision, not a bug. If only OpenAI-compatible providers
are needed (OpenRouter, Qwen, etc.), this is correct. If Anthropic/Google support
is needed, the provider files must be ported from pi.

**Action:** Add a `console.warn` when a model has no registered provider:

```typescript
// in stream() or complete() in compat.ts
if (!getApiProvider(api)) {
  console.warn(`No API provider registered for api: ${api}. Available: ${getApiProviders().map(p => p.api).join(", ")}`);
}
```

---

## C6 — all.ts has 33 broken imports

**File:** `apps/server/src/ai/vendor/ai/src/providers/all.ts`

**Problem:** Every import points to a non-existent file. Never imported, but
dangerous if anything ever references it.

**Fix:** 
1. Delete `all.ts`
2. Verify no imports reference it (`grep -r "providers/all"`)

---

## C7 — Zero tests for AI vendor

**File:** `apps/server/src/ai/vendor/` (entire directory)

**Problem:** No tests exist. pi has 273.

**Fix:** Add critical-path tests as a new `ai/__tests__/` directory:
1. `agent-loop-initialization.test.ts` — verify `runAgentLoop` accepts config
2. `agent-session-prompt.test.ts` — verify prompt/steer/abort lifecycle
3. `session-persistence.test.ts` — verify append/build/restore round-trip
4. `compat-stream.test.ts` — verify stream/complete with mock provider
5. `convert-to-llm.test.ts` — verify message format conversion

Each test should use a `faux` provider (already exists in vendor) to avoid
real API calls.

**Priority:** Start with 3 tests, expand as regressions appear.

---

## C8 — node.ts exports broken symbol

**File:** `apps/server/src/ai/vendor/agent/src/node.ts:1`

**Problem:** `export { NodeExecutionEnv } from "./harness/env/nodejs.ts"` — file
does not exist.

**Fix:** Delete `node.ts` (it has no consumers in CrewFactory).

---

## C9 — auth/types.ts imports missing oauth

**File:** `apps/server/src/ai/vendor/ai/src/auth/types.ts`

**Problem:** Imports from `../utils/oauth/types.ts` which does not exist. Lives
only because `@ts-nocheck` suppresses the error.

**Fix:**
1. Read `auth/types.ts` and `auth/resolve.ts`
2. Remove the oauth import or replace with the CrewFactory equivalent
3. Remove `@ts-nocheck` and fix any resulting type errors

---

## C10 — types.ts has 8 dead type imports

**File:** `apps/server/src/ai/vendor/ai/src/types.ts:2-10`

**Problem:** 8 `import type` from non-existent provider files, hidden by
`@ts-nocheck`.

**Fix:**
1. Remove all 8 dead imports (AnthropicOptions, GoogleOptions, etc.)
2. Remove `@ts-nocheck` from the file
3. Fix any resulting type errors (likely none, these are unused types)

---

## Execution Order

1. **C2** (steer/followUp queue) — simplest, high impact, unlocks correct delegation
2. **C1** (catch block) — 3 lines, prevents session death
3. **C3** (JWT re-verify) — security, prevents token abuse
4. **C6 + C8 + C9 + C10** — delete dead files/fix broken imports (batch)
5. **C5** (provider warning) — 1 line addition
6. **C7** (tests) — start with 3 core tests
7. **C4** (Agent class migration) — biggest effort, plan separately
