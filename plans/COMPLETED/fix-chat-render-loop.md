COMPLETED
# Fix: Maximum update depth exceeded in ChatArea (render loop)

## Problem

`ChatArea.tsx:355` throws "Maximum update depth exceeded" during streaming when WebSocket `message_update` events arrive rapidly. Each `setMessages` call triggers a re-render that cascades into an infinite loop through `useChatScroll`.

## Root Cause

**`ChatArea.tsx:189`** — the `dependencies: [messages]` inline array creates a new reference on every render, even when `messages` hasn't changed. This makes `useChatScroll`'s internal `useEffect` fire after **every** render:

```tsx
// ChatArea.tsx:188-191
const { scrollToBottom } = useChatScroll(scrollContainerRef, {
    dependencies: [messages],   // <-- NEW array ref EVERY render
    isStreaming: streaming
});
```

```tsx
// useChatScroll.ts:81-87
useEffect(() => {
    if (isAtBottomRef.current) {
      scrollToBottom(isStreaming ? "instant" : "smooth");
    } else {
      setShowScrollButton(true);
    }
}, [dependencies, isStreaming, scrollToBottom]); // dependencies is always new
```

## Cascade Mechanism

1. WS `message_update` event arrives → `setMessages` (line 355) → re-render
2. Re-render → `[messages]` is new ref → `useChatScroll` effect fires
3. Effect calls `scrollToBottom()` → DOM scroll manipulation + `setIsAtBottom(true)`, `setShowScrollButton(false)`
4. DOM manipulation triggers scroll event → `handleScroll` → more state setters
5. If another WS event arrives during this cycle, it restarts the cascade
6. React detects >50 sequential updates → throws "Maximum update depth exceeded"

## Fix

### 1. Remove inline array (ChatArea.tsx)

Replace `dependencies: [messages]` with direct `messages` prop:

```tsx
// Before
useChatScroll(scrollContainerRef, {
    dependencies: [messages],
    isStreaming: streaming
});

// After
useChatScroll(scrollContainerRef, {
    messages,
    isStreaming: streaming
});
```

### 2. Update useChatScroll interface and effect

```tsx
// Before
interface UseChatScrollOptions {
  threshold?: number;
  dependencies?: unknown[];
  isStreaming?: boolean;
}

// After
interface UseChatScrollOptions {
  threshold?: number;
  messages?: unknown[];
  isStreaming?: boolean;
}

// In hook body, rename destructuring:
const { threshold = 50, messages, isStreaming = false } = options;

// Effect dependency:
}, [messages, isStreaming, scrollToBottom]);
```

### 3. Cleanup: remove unused `setShowScrollButton` export

`useChatScroll` exports `setShowScrollButton` but no consumer uses it. Remove from return object:

```tsx
// Before
return { isAtBottom, showScrollButton, setShowScrollButton, scrollToBottom, handleScroll };

// After
return { isAtBottom, showScrollButton, scrollToBottom, handleScroll };
```

## Files Changed

| File | Change |
|------|--------|
| `apps/client/src/components/chat/ChatArea.tsx:189` | `dependencies: [messages]` → `messages` |
| `apps/client/src/hooks/useChatScroll.ts:3-7` | Rename `dependencies` to `messages` in interface |
| `apps/client/src/hooks/useChatScroll.ts:11` | Destructure `messages` instead of `dependencies` |
| `apps/client/src/hooks/useChatScroll.ts:87` | Effect deps: `[messages, isStreaming, scrollToBottom]` |
| `apps/client/src/hooks/useChatScroll.ts:89-95` | Remove unused `setShowScrollButton` from return |
