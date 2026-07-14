COMPLETED

# Technical Debt: WebSocket Robustness

## Problem

The WebSocket system has accumulated several production-readiness gaps:

1. **JWT never re-verified** (CRITICAL, covered in `fix-critical.md`)
2. **Out-of-order messages** cause phantom messages (HIGH, covered in `fix-high.md`)
3. **Reconnection has no jitter or max retries** (MEDIUM, covered in `fix-medium.md`)
4. **Offline queue has no size limit** (MEDIUM, covered in `fix-medium.md`)
5. **No message deduplication on reconnect** (MEDIUM)
6. **channel_join does not clean up session subscription** (MEDIUM, covered in `fix-medium.md`)
7. **No user feedback on permanent disconnect** (LOW)
8. **sendContextUsage error kills subscription pipe** (HIGH, covered in `fix-high.md`)

This plan covers what is NOT already in the severity-level fix files.

---

## M5 — Message deduplication on reconnect

**File:** `apps/client/src/components/chat/ChatArea.tsx:296-339`

**Problem:** After reconnect, `message_start` events from the server may
duplicate messages already fetched by `loadMessages()` (which runs 500ms after
reconnect).

**Fix:** Track received message IDs and skip duplicates:

```typescript
const receivedMessageIds = useRef<Set<string>>(new Set());

// In message_start handler:
const msgId = evt.message?.responseId || evt.message?.id;
if (msgId && receivedMessageIds.current.has(msgId)) {
  return;  // duplicate
}
if (msgId) {
  receivedMessageIds.current.add(msgId);
}
// ... rest of handler

// Reset on session change:
useEffect(() => {
  receivedMessageIds.current.clear();
  // ...
}, [sessionId]);
```

---

## M6 — WebSocket connection status indicator

**File:** `apps/client/src/lib/ws-client.ts`

**Problem:** The UI has no persistent indicator of WebSocket connection state.
Temporary disconnections are invisible to the user.

**Fix:** Add an `onConnectionChange` callback:

```typescript
type ConnectionState = "connecting" | "connected" | "disconnected" | "permanently_disconnected";

class WsClient {
  private onConnectionChange?: (state: ConnectionState) => void;
  private state: ConnectionState = "disconnected";

  constructor(onConnectionChange?: (state: ConnectionState) => void) {
    this.onConnectionChange = onConnectionChange;
  }

  private setState(state: ConnectionState) {
    this.state = state;
    this.onConnectionChange?.(state);
  }
}
```

In `MainLayout.tsx`, render a connection indicator:

```tsx
<div className={`w-2 h-2 rounded-full ${
  wsState === "connected" ? "bg-success" :
  wsState === "connecting" ? "bg-warning animate-pulse" :
  "bg-error"
}`} title={`WebSocket: ${wsState}`} />
```

---

## M7 — Ping/pong health check with timeout

**File:** `apps/client/src/lib/ws-client.ts`

**Problem:** The client relies on the server's heartbeat (30s interval, 3 missed
pings = 90s timeout). The client never proactively checks health.

**Fix:** Add client-side ping timer:

```typescript
private pingInterval: ReturnType<typeof setInterval> | null = null;
private lastPong: number = Date.now();

// On connect:
this.pingInterval = setInterval(() => {
  if (Date.now() - this.lastPong > 45000) {  // 45s without pong
    console.warn("[WS] No pong received, reconnecting...");
    this.ws?.close();
    this.reconnect();
  }
}, 15000);

// On pong message:
this.lastPong = Date.now();

// On disconnect:
if (this.pingInterval) clearInterval(this.pingInterval);
```

---

## M8 — Graceful degradation when WS fails

**File:** `apps/client/src/components/chat/ChatArea.tsx`

**Problem:** When WebSocket disconnects, the user can type messages but they
queue silently and never send. No feedback.

**Fix:** In `ChatInput.tsx`, disable the send button when not connected:

```typescript
// ws-client.ts exposes:
isConnected(): boolean { return this.state === "connected"; }

// In ChatInput:
disabled={!wsClient.isConnected() || streaming || runnerActive}
```

And show a visual warning:

```tsx
{!wsConnected && (
  <div className="px-4 py-2 bg-warning/10 border-t border-warning/20 text-warning text-[11px] text-center">
    Connection lost. Reconnecting...
  </div>
)}
```

---

## M9 — Race condition in pending-prompt after session creation

**File:** `apps/client/src/components/chat/ChatArea.tsx:432-442`

**Problem:** The `pending-prompt-{sessionId}` localStorage pattern has a race
when multiple sessions are created rapidly:

1. Create session A, set `pending-prompt-A`
2. Navigate to session A, useEffect reads and sends the prompt
3. Before the prompt starts streaming, user creates session B
4. Navigate to B, B's useEffect also fires
5. If A's prompt starts streaming on the server after navigating to B...
6. The WebSocket subscription was changed to B, so A's response is lost

**Fix:** Navigate to session first, THEN send the prompt via the existing
WebSocket subscription:

```typescript
// In createSessionAndSend:
const session = await createRes.json();
const path = getSessionPath(session.id);
navigate(path);

// Don't use localStorage. Instead, queue the message in memory.
// After navigate, ChatArea will re-mount with the new sessionId.
// We can use a global pending prompt store:
window.__pendingPrompts = window.__pendingPrompts || {};
window.__pendingPrompts[session.id] = finalText;

// In ChatArea useEffect:
const pending = window.__pendingPrompts?.[sessionId];
if (pending) {
  delete window.__pendingPrompts[sessionId];
  setTimeout(() => handleSend(pending), 500);
}
```

---

## Implementation Order

1. **M5** (message dedup) — prevents duplicate messages on reconnect
2. **M9** (pending-prompt race) — prevents lost messages during fast session switching
3. **M6** (connection indicator) — user feedback on WS state
4. **M8** (graceful degradation) — disable send when disconnected
5. **M7** (client-side ping) — faster detection of dead connections
