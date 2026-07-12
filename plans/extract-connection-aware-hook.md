# Extract useConnectionAwareEffect Hook

- **Status:** pending
- **Date:** 2026-07-12
- **Type:** refactor

## Problem

Two React hooks implement the same WebSocket connection-aware effect pattern:

**useWebSocket.ts:22-33:**
```typescript
useEffect(() => {
  if (!sessionId) return;
  if (wsClient.getState() === "connected") {
    wsClient.send({ type: "session_subscribe", sessionId });
  }
  const unsub = wsClient.onStateChange((state) => {
    if (state === "connected") {
      wsClient.send({ type: "session_subscribe", sessionId });
    }
  });
  return unsub;
}, [sessionId]);
```

**useChannel.ts:105-118:**
```typescript
useEffect(() => {
  if (!channelId) return;

  const joinChannel = () => {
    wsClient.send({ type: "channel_join", channelId });
  };

  if (wsClient.getState() === "connected") {
    joinChannel();
  }

  const unsubState = wsClient.onStateChange((state) => {
    if (state === "connected") joinChannel();
  });
  // ... message subscription follows, sharing same useEffect
}, [channelId]);
```

The pattern is identical: check current connection state, send if connected, register a state change listener that re-sends on reconnect. Only the WS message differs (`session_subscribe` vs `channel_join`).

## Proposed Solution

Extract a `useConnectionAwareEffect` hook that encapsulates the "send now + replay on reconnect" pattern:

```typescript
// apps/client/src/hooks/useConnectionAware.ts

import { useEffect, useRef } from "react";
import { wsClient } from "@/lib/ws-client";

export function useConnectionAwareEffect(
  action: () => void,
  deps: React.DependencyList
): void {
  const actionRef = useRef(action);
  actionRef.current = action;

  useEffect(() => {
    if (wsClient.getState() === "connected") {
      actionRef.current();
    }
    const unsub = wsClient.onStateChange((state) => {
      if (state === "connected") {
        actionRef.current();
      }
    });
    return unsub;
  }, deps);
}
```

The `actionRef` pattern avoids putting `action` itself in the dependency array, so the consumer controls when the effect re-fires via `deps` — this is critical because `action` might be recreated on every render (closures over sessionId/channelId). The ref ensures the latest closure is always called, while the effect only re-registers when `deps` actually change.

### Before/After

**useWebSocket.ts** — replace lines 22-33:

```typescript
// BEFORE
useEffect(() => {
  if (!sessionId) return;
  if (wsClient.getState() === "connected") {
    wsClient.send({ type: "session_subscribe", sessionId });
  }
  const unsub = wsClient.onStateChange((state) => {
    if (state === "connected") {
      wsClient.send({ type: "session_subscribe", sessionId });
    }
  });
  return unsub;
}, [sessionId]);

// AFTER
useConnectionAwareEffect(() => {
  if (!sessionId) return;
  wsClient.send({ type: "session_subscribe", sessionId });
}, [sessionId]);
```

The `if (!sessionId) return` guard moves inside the action so the hook stays registered even when sessionId becomes null (unsubscribing the state listener would prevent re-subscription if sessionId is restored later).

**useChannel.ts** — replace lines 105-118, preserving the message subscription (lines 120-188):

```typescript
// BEFORE
useEffect(() => {
  if (!channelId) return;

  const joinChannel = () => {
    wsClient.send({ type: "channel_join", channelId });
  };

  if (wsClient.getState() === "connected") {
    joinChannel();
  }

  const unsubState = wsClient.onStateChange((state) => {
    if (state === "connected") joinChannel();
  });

  const unsubMessage = wsClient.subscribe("*", (rawData) => { /* ... */ });

  return () => {
    unsubState();
    unsubMessage();
  };
}, [channelId]);

// AFTER
useConnectionAwareEffect(() => {
  if (!channelId) return;
  wsClient.send({ type: "channel_join", channelId });
}, [channelId]);

useEffect(() => {
  if (!channelId) return;

  const unsubMessage = wsClient.subscribe("*", (rawData) => { /* ... */ });

  return () => {
    unsubMessage();
  };
}, [channelId]);
```

The single large useEffect splits into two: `useConnectionAwareEffect` for joining, and a plain `useEffect` for message subscription. This keeps cleanup isolated — the message unsubscriber is independent of the state listener.

## Implementation Steps

1. Create `apps/client/src/hooks/useConnectionAware.ts` with the hook and actionRef pattern
2. Update `apps/client/src/hooks/useWebSocket.ts`:
   - Import `useConnectionAwareEffect`
   - Replace the session_subscribe useEffect (lines 22-33) with `useConnectionAwareEffect`
   - Move `if (!sessionId) return` guard inside the action
3. Update `apps/client/src/hooks/useChannel.ts`:
   - Import `useConnectionAwareEffect`
   - Replace the channel_join useEffect (lines 105-189) with two separate hooks:
     - `useConnectionAwareEffect` for the join pattern
     - Plain `useEffect` for the message subscription
4. Verify: `cd apps/client && bun run build`

## Affected Files

| File | Action |
|---|---|
| `apps/client/src/hooks/useConnectionAware.ts` | NEW |
| `apps/client/src/hooks/useWebSocket.ts` | Modify — replace useEffect with hook |
| `apps/client/src/hooks/useChannel.ts` | Modify — split useEffect, use hook |

## Verification Criteria

- [ ] `bun run build` passes in `apps/client`
- [ ] WebSocket auto-reconnect triggers `session_subscribe` and `channel_join` after server restart
- [ ] Session subscription fires on initial connect and after reconnect
- [ ] Channel join fires on initial connect and after reconnect
- [ ] Multiple rapid `sessionId` / `channelId` changes don't cause duplicate subscriptions
- [ ] Channel message subscription still works after the useEffect split
- [ ] When `sessionId` becomes null (user navigates away from session), the hook doesn't error — the guard inside the action prevents the send
