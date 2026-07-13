COMPLETED
# Technical Debt: Better Auth WS Migration Hotfix

## Context

Phase 119 (Better Auth + First-Run Onboarding) migrated JWT localStorage auth to httpOnly cookie sessions via `better-auth`. The migration fixed auth security but left 3 chained bugs:

1. `apiFetch` in `apps/client/src/lib/api.ts` did NOT send `credentials: "include"` → all REST calls 401
2. `ws-client.ts` tried to fetch `session.token` from `/api/auth/get-session`, which Better Auth never exposes → WS stayed `disconnected`
3. `ws/handler.ts` only accepted auth via `{ type: "auth", token }` message, but browser JS cannot read httpOnly cookie → WS could never auth

Hotfix (2026-07-13) restored functionality with minimal changes, but introduced/worked around technical debt instead of fixing the architecture.

This plan tracks the proper payoff.

---

## Problem Analysis

### P1 — Manual session table ownership
**Files:** `apps/server/src/auth/db.ts`, `auth/onboarding.ts`, `lib/auth-helpers.ts`, `ws/handler.ts`

- `db.ts` does `CREATE TABLE IF NOT EXISTS user/session/account/verification` manually with `INTEGER` for `expiresAt`
- Better Auth's SQLite adapter also creates/migrates those tables, potentially with different column types
- `onboarding.ts` inserts programmatic sessions with raw SQL `INSERT INTO session (id, token, expiresAt, ...)` bypassing the adapter
- Result: schema drift, expiration format mismatch (ISO string vs int ms), and broken queries like `WHERE expiresAt > ?` with ISO string vs integer

**Debt:** We own a table we don't own. Future Better Auth upgrades may add columns (e.g., `impersonatedBy`) and break silently.

### P2 — Auth validation duplicated and fragile
**Files:** `lib/auth-helpers.ts` (90 lines of `parseExpiresAt`, `isExpired`, `extractToken`, regex cookie parsing), `ws/handler.ts` duplicate logic

- Cookie parsing only looked for `better-auth.session_token`, missing `__Secure-better-auth.session_token` prefix used in production HTTPS
- `split(".")[0]` was leftover from JWT days; Better Auth tokens are opaque
- Expiration check handled both string and number via `Date.parse` / numeric heuristic, but should be delegated to Better Auth

**Debt:** Security-critical code duplicated, easy to desync.

### P3 — WS identity via object reference / property mutation
**Files:** `ws/handler.ts` `getWsIdFromContext`, `ensureWsId`, `onOpen`, `onClose`, `apps/server/src/index.ts`

- Original code stored `ws.wsId = id` on Hono's `WSContext`. Hono/Bun does NOT guarantee same object reference in `onClose` vs `onOpen` → `wsId: undefined` logs
- Hotfix added closure `capturedId` in `index.ts` + fallback search by `ws.raw` reference. Works but mutates `raw.wsId` and uses `any`
- `wsCounter` global + `wsSocketMeta` map with manual cleanup is leak-prone

**Debt:** WS lifecycle managed via globals, not via Hono's `c` or Bun's `data` field.

### P4 — Legacy token prop drilling
**Files:** `components/settings/ProvidersTab.tsx`, `GeneralTab.tsx`, `EnvVarsTab.tsx`, `IntegrationsTab.tsx`, `McpTab.tsx`, `SettingsPage.tsx`, `PreviewPanel.tsx`

- All received `token: string | null` prop, now unused, suppressed as `_token`
- `apiFetch` still has fallback `localStorage.getItem("token")` → `Authorization: Bearer`
- `PreviewPanel` had its own `new WebSocket()` separate from `wsClient` singleton

**Debt:** Confusing for new devs, dead code, two WS connections to same `/ws` endpoint.

### P5 — Offline queue and race conditions
**Files:** `lib/ws-client.ts`, `hooks/useConnectionAware.ts`, `components/chat/ChatArea.tsx`

- `offlineQueue: Array<Record<string, unknown>>` unbounded, flushes via `shift()` without backpressure
- `prompt` can arrive before `session_subscribe` → server had no subscription, events lost (fixed via auto-subscribe hotfix, but still race)
- `useConnectionAwareEffect` replays action on every `connected` state, but `ChatArea` unsubscribes/resubscribes on StrictMode remount causing duplicate handlers (seen in browser logs: 13 subscribed → 13 unsubscribed → 13 resubscribed)

---

## Proposed Solution

### Phase 1 — Single source of truth for sessions (Critical)

**Goal:** Remove manual SQL on `session` table.

- Delete `CREATE TABLE` from `db.ts`, let Better Auth handle migrations via `auth` instance. Keep only `getDb()` for other app tables if needed, or use Better Auth's `db` adapter.
- Replace `createProgrammaticSession` / `createProgrammaticSessionSync` with `auth.api` or `auth.adapter`:
```ts
const session = await auth.api.createSession({
  body: { userId: user.id, expiresIn: 60*60*24*7 }
})
return session.token
// or
const token = `cf_${randomBytes(32).toString("base64url")}`
await db.prepare("INSERT...").run(...) via adapter, not raw
```
- Update `lib/auth-helpers.ts` to use single function `validateSessionFromRequest(req): Promise<{username} | null>` that calls `auth.api.getSession({ headers })` instead of manual query. Keep sync fallback only for WS hot path if needed, but with shared `isExpired` util.

**Files:** `auth/db.ts`, `auth/onboarding.ts`, `lib/auth-helpers.ts`
**Tests:** Add `auth-helpers.test.ts` covering cookie prefixes, expired token (int + ISO), missing token.

### Phase 2 — WS factory with proper identity (Critical)

**Goal:** No more global `wsCounter` + property mutation.

Create `ws/factory.ts`:
```ts
export function createWsContext() {
  const id = crypto.randomUUID();
  const state: WsSocketMeta = { missedPings: 0 };
  return {
    id,
    onOpen: (evt, ws, rawHeaders) => { /* use id via closure, store raw */ },
    onMessage: ...,
    onClose: ...
  }
}
```

In `index.ts`:
```ts
app.get("/ws", upgradeWebSocket((c) => {
  const rawHeaders = c.req.raw.headers;
  const ctx = createWsContext();
  return {
    onOpen: (e, ws) => ctx.onOpen(e, ws, rawHeaders),
    onMessage: (e, ws) => ctx.onMessage(e, ws),
    onClose: (e, ws) => ctx.onClose(e, ws),
  }
}))
```

- Store `wsId` in closure, not on `ws` object
- Use `WeakMap<raw, meta>` or `ws.data = { wsId }` (Bun's `ServerWebSocket.data` is designed for this)
- Remove `getWsIdFromContext` search loop, use direct closure variable
- Cleanup `wsSocketMeta` on close without searching

**Files:** `ws/handler.ts` → split into `ws/factory.ts`, `ws/handler.ts`, `ws/registry.ts`
**Tests:** `ws/factory.test.ts` - open/close lifecycle retains id

### Phase 3 — Remove legacy token drilling (Medium)

- Delete `token` prop from `ProvidersTabProps`, `GeneralTabProps`, `EnvVarsTabProps`, `IntegrationsTabProps`, `McpTabProps`
- In `SettingsPage.tsx` remove `const token = ""` and stop passing it
- In `apiFetch` remove `localStorage.getItem("token")` fallback, keep only `credentials: "include"`
- In `PreviewPanel.tsx` delete `localStorage.getItem("token")` reads, use `apiFetch` for all `/api/preview/*` calls, and reuse `wsClient` singleton for preview status instead of separate `new WebSocket()`

**Files:** 6 components + `lib/api.ts`, `components/preview/PreviewPanel.tsx`
**Validation:** `grep -r "localStorage.getItem(\"token\")" apps/client/src` should return 0 results

### Phase 4 — Robust offline queue and subscription ordering (Medium)

- In `ws/handler.ts` `onMessage` for `prompt`, ensure subscription before `getOrCreateSession` (already hotfixed, but make it transactional):
```ts
await subscribeWsToSession(ws, user, sessionId); // idempotent
const session = await getOrCreateSession(...);
```
- In `ws-client.ts`, add max queue size (e.g., 50) and drop oldest with warning
- Add `isConnected()` method and expose to `ChatArea` to disable send button when disconnected (graceful degradation)
- In `useConnectionAwareEffect`, add dedup: only replay if `sessionId` actually changed or after disconnect, not on every `connected` event

**Files:** `ws/handler.ts`, `lib/ws-client.ts`, `hooks/useConnectionAware.ts`, `components/chat/ChatArea.tsx`

### Phase 5 — Observability and docs (Low)

- Replace `console.log("[WS Server] ...")` with structured logger (`pino` or existing `eventBroker`)
- Add `about.md` section "WebSocket Auth: Cookie-based handshake with closure-captured wsId, auto-subscribe on prompt"
- Update `plans/_index.md` and `steps.md` to mark Phase 119 as fully done once this debt is paid
- Add integration test: start server, login via `auth.api.signInEmail`, open WS with cookie, send prompt, assert `agent_start` received

---

## Implementation Order

1. **Phase 1** (2-3h) — unblocks all other phases, removes most critical debt
2. **Phase 2** (2h) — fixes WS identity properly, removes `unknown` logs
3. **Phase 3** (1h) — cleanup, reduces confusion
4. **Phase 4** (1-2h) — polish UX, prevent lost messages
5. **Phase 5** (0.5h) — docs + logger

Total estimated: ~7h

---

## Acceptance Criteria

- [ ] No raw `INSERT INTO session` in codebase
- [ ] `grep -rn "better-auth\.session_token" --include="*.ts"` only in one util file
- [ ] `wsHandler` uses closure-captured `wsId`, no `ws.wsId =` mutation, no `getWsIdFromContext` loop
- [ ] `grep -rn "localStorage.getItem(\"token\")" apps/client` returns 0
- [ ] `PreviewPanel` uses `wsClient` singleton, not `new WebSocket`
- [ ] `apiFetch` does NOT read localStorage
- [ ] WS close logs always show valid `wsId`, never `unknown` or `undefined`
- [ ] Sending prompt immediately after `auth_success` delivers `agent_start` within 500ms (no race)
- [ ] `about.md` documents WS cookie auth flow
- [ ] Unit tests for `auth-helpers` and `ws/factory`

---

## Risks

- Better Auth adapter API for creating sessions may not be public → need to check `auth.adapter.create` or use `auth.api.signInEmail` with custom logic
- Changing WS factory may break `channel_join` cleanup if not tested with multi-channel
- Removing `token` prop is breaking for external forks, but internal is safe

---

## Related

- Phase 119: Better Auth Integration (original)
- `plans/debt-websocket.md` — earlier WS debt, now partially fixed by this plan
- Issue: WS offline after Better Auth (2026-07-13 hotfix)

