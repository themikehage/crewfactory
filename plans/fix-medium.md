# Medium Severity Fixes

## M1 — emit() swallows listener errors silently

**File:** `apps/server/src/ai/agent-session.ts:159-165`

**Problem:** `catch {}` hides ALL listener errors. Debugging is impossible.

**Fix:**
```typescript
private emit(event: any) {
  for (const listener of this.eventListeners) {
    try {
      listener(event);
    } catch (err) {
      console.error("[AgentSession] Event listener error:", err);
    }
  }
}
```

---

## M2 — Race window: abort() no-op between isStreaming=true and AbortController

**File:** `apps/server/src/ai/agent-session.ts:172-173`

**Problem:** If `abort()` is called after `isStreaming=true` but before
`new AbortController()`, the guard `if (this.abortController)` prevents the abort.

**Fix:** Initialize `abortController` BEFORE setting `isStreaming`:

```typescript
this.abortController = new AbortController();
this.isStreaming = true;
```

---

## M3 — dispose() does not await abort()

**File:** `apps/server/src/ai/agent-session.ts:457-460`

**Problem:** `dispose()` calls `this.abort()` without `await`. The event listeners
are cleared immediately, so shutdown events have no listeners. The caller may
delete the session directory while the loop's finally block is still writing.

**Fix:**
```typescript
async dispose(): Promise<void> {
  await this.abort();
  this.eventListeners.clear();
}
```

Update callers in `session-manager.ts` to `await session.dispose()`.

---

## M4 — Constructor calls throwing methods with no recovery

**File:** `apps/server/src/ai/agent-session.ts:66-67`

**Problem:** `initializeTools()` and `restoreSessionState()` throw inside the
constructor, leaving a partially-initialized object.

**Fix:** Add a static factory method:

```typescript
static async create(options: CreateAgentSessionOptions): Promise<AgentSession> {
  const session = new AgentSession(options);
  await session.initializeAsync();  // any async setup
  return session;
}
```

Or wrap in try-catch during `sessionManager.getOrCreateSession()`.

---

## M5 — dispose() may return before prompt() settles (session dir deleted while writing)

**File:** `apps/server/src/ai/agent-session.ts:457-460` + `session-manager.ts:246`

**Problem:** `destroySession()` calls `rmSync(sessionDir, { recursive: true })`
after `dispose()`. If `dispose()` returns before the finally block finishes, the
session directory is deleted while the agent loop is still writing to it.

**Fix:** See M3 — make `dispose()` properly await the abort + loop termination.

---

## M6 — authStorage typed as any

**File:** `apps/server/src/ai/agent-session.ts:24`

**Problem:** No type contract for `authStorage`. Callers have no type safety.

**Fix:** Define the expected interface:

```typescript
interface AuthStorage {
  getCredentials(provider: string): Promise<{ apiKey?: string; baseUrl?: string } | null>;
  setCredentials(provider: string, creds: Record<string, string>): Promise<void>;
}
```

And use it instead of `any`.

---

## M7 — Dynamic import in abort() for delegationRegistry

**File:** `apps/server/src/ai/agent-session.ts:363-366`

**Problem:** Dynamic import of singleton prevents mocking in tests.

**Fix:** Accept `DelegationRegistry` as an optional constructor parameter:

```typescript
interface CreateAgentSessionOptions {
  // ...
  delegationRegistry?: DelegationRegistry;
}
// In abort():
const registry = this.delegationRegistry ?? (await import("../core/delegation-registry")).delegationRegistry;
```

---

## M8 — Hardcoded "bash" special-casing in tool wrapper

**File:** `apps/server/src/ai/agent-session.ts:78-81`

**Problem:** The `execute` wrapper checks `toolDef.name === "bash"` to use a
different argument order. Any new tool with a non-standard signature would need
another branch.

**Fix:** Standardize tool execute signatures. All tools should use
`(toolCallId, params, signal)`. Update the bash tool's wrapper in
`_refreshToolRegistry` or the bash tool itself.

---

## M9 — No rollback when _persist fails

**File:** `apps/server/src/ai/agent-session.ts:197,281,343,354` + `session-persistence.ts`

**Problem:** In-memory state is updated before file write. If write fails, in-memory
and on-disk state diverge.

**Fix:** In `_appendEntry()`, write the file FIRST, then update in-memory:

```typescript
private _appendEntry(entry: SessionEntry): void {
  if (!this.loaded) this._load();
  this._persist(entry);  // write to disk first
  this.fileEntries.push(entry);  // then update memory
  this.byId.set(entry.id, entry);
}
```

---

## M10 — Full file rewrite on first persist

**File:** `session-persistence.ts:580-588`

**Problem:** First `_persist()` call rewrites the entire file with `"w"` flag.
If process crashes between `openSync` and writing all entries, the file is empty.

**Fix:** Write to a temp file, then rename:

```typescript
if (!this.flushed) {
  const tmpFile = this.sessionFile + ".tmp";
  const fd = openSync(tmpFile, "w");
  for (const e of this.fileEntries) {
    writeFileSync(fd, `${JSON.stringify(e)}\n`);
  }
  closeSync(fd);
  renameSync(tmpFile, this.sessionFile);
  this.flushed = true;
}
```

---

## M11 — Image tokens not counted in context estimation

**File:** `apps/server/src/ai/agent-session.ts:396-407`

**Problem:** The fallback token estimator ignores `type: "image"` content blocks.

**Fix:** Add image token estimation:

```typescript
for (const block of msg.content) {
  if (block.type === "text" && block.text) {
    charCount += block.text.length;
  } else if (block.type === "image" && block.data) {
    // Rough estimate: ~1200 tokens per image (standard vision model)
    const imageTokens = 1200;
    charCount += imageTokens * 4;  // convert to char-equivalent for /4 division
  }
}
```

---

## M12 — WS: Reconnection has no jitter

**File:** `apps/client/src/lib/ws-client.ts:130`

**Problem:** Without jitter, multiple clients reconnect in synchronized waves.

**Fix:**
```typescript
const baseDelay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
const jitter = Math.random() * 1000;
const delay = baseDelay + jitter;
```

---

## M13 — WS: No max retries

**File:** `apps/client/src/lib/ws-client.ts:130-135`

**Problem:** Client retries forever if server is permanently gone.

**Fix:**
```typescript
private static readonly MAX_RETRIES = 20;

// In reconnect logic:
if (this.reconnectAttempts >= WsClient.MAX_RETRIES) {
  console.error("[WS] Max reconnection attempts reached. Giving up.");
  this.setState("disconnected");
  this.onStatusChange?.("permanently_disconnected");
  return;
}
```

---

## M14 — WS: Offline queue has no size limit

**File:** `apps/client/src/lib/ws-client.ts:42`

**Problem:** Queue grows unbounded if connection is down for extended period.

**Fix:**
```typescript
private static readonly MAX_QUEUE_SIZE = 100;

// In send():
if (this.state !== "open") {
  if (this.offlineQueue.length >= WsClient.MAX_QUEUE_SIZE) {
    this.offlineQueue.shift();  // drop oldest
  }
  this.offlineQueue.push(data);
  return;
}
```

---

## M15 — WS: channel_join does not clean up session subscription

**File:** `apps/server/src/ws/handler.ts:460-480`

**Problem:** Joining a channel after subscribing to a session leaves the old
subscription active.

**Fix:** Call the old unsub function before setting channel ID:

```typescript
if (data.type === "channel_join") {
  // Unsubscribe from previous session
  const oldUnsub = wsSubscriptions.get(ws.wsId);
  if (oldUnsub) {
    oldUnsub();
    wsSubscriptions.delete(ws.wsId);
  }
  // ... rest of channel_join logic
}
```

---

## Execution Order

1. **M1** (emit logging) — quick win, enables debugging
2. **M2** (abortController init order) — 1 line move
3. **M12 + M13** (WS jitter + max retries) — client-side, no backend changes
4. **M9** (persist rollback) — prevents data corruption
5. **M10** (atomic write) — prevents data loss on crash
6. **M3** (dispose await) — prevents dir deletion race
7. **M4** (factory method) — safer construction
8. **M6** (authStorage type) — better type safety
9. **M7** (delegationRegistry injection) — better testability
10. **M8** (bash special-case) — cleaner tool wrapper
11. **M11** (image tokens) — accurate context meter
12. **M14** (queue limit) — memory safety
13. **M15** (channel_join cleanup) — correct subscription lifecycle
