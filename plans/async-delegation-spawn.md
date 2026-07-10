# Async Delegation & Spawn with Session Navigation

## Problem

Currently `spawn_subagent` and `delegate_task` block the parent agent's entire loop
while the subagent runs. The frontend shows a `SubagentConsole` modal for live
viewing. This defeats the purpose of delegation -- the parent should continue
working while sub-tasks execute in the background.

## Requirements

1.  No more modal. Delegation/spawn redirects the user to the delegation's own
    session view in the chat UI.
2.  Chats show a "delegations tracker" (analogous to `FloatingTasks`) listing
    active/completed delegations.
3.  The parent agent does NOT block. It returns to work immediately after the
    tool call, seeing a "delegation started" result.
4.  When a delegation completes:
    - If parent is **streaming** (working): inject the result as a **steer**
      message into the running loop so the parent processes it at the next
      natural breakpoint.
    - If parent is **idle**: inject as a normal prompt.
5.  The parent agent is **always** notified of success/error and must respond
    to the user accordingly.

## Architecture Overview

```
 Vendor Agent Loop (runLoop)
   │
   ├── LLM turn
   │     ├── LLM returns text + toolCalls
   │     ├── executeToolCalls()
   │     │     ├── spawn_subagent ──► fire & forget (returns immediately)
   │     │     └── delegate_task  ──► fire & forget (returns immediately)
   │     └── turn_end
   │
   ├── getSteeringMessages() ◄── checks DelegationResultQueue
   │     └── if delegation completed → inject as toolResult message
   │
   ├── next LLM turn (sees delegation result in context)
   │     └── agent processes result, responds to user
   │
   └── getFollowUpMessages() ◄── when agent would stop naturally
         └── if delegation completed while idle → inject as prompt
```

The vendor loop already supports `getSteeringMessages` and
`getFollowUpMessages` hooks (see `agent-loop.ts:167,253,257`). The
`AgentSession` wrapper currently does NOT pass these hooks. We will wire them
to a new `DelegationResultQueue` on the session.

## Implementation Plan

### Phase 1: Delegation Registry & Result Queue (Backend Core)

#### 1a. Create `apps/server/src/core/delegation-registry.ts`

```typescript
interface PendingDelegation {
  toolCallId: string;
  parentSessionId: string;
  targetType: "spawn" | "delegate";
  targetLabel: string;          // e.g. "Subagent (code review)" or "Agent: code-helper"
  task: string;                 // truncated summary
  status: "running" | "success" | "error" | "blocked";
  startedAt: string;
  completedAt?: string;
  result?: EnvelopeResult;
  subagentSessionId: string;    // the delegation's own session ID
}

class DelegationRegistry {
  // Per-session delegation map
  private delegations: Map<string, Map<string, PendingDelegation>>;

  register(sessionId: string, d: PendingDelegation): void;
  complete(sessionId: string, toolCallId: string, result: EnvelopeResult): void;
  getPending(sessionId: string): PendingDelegation[];
  getAll(sessionId: string): PendingDelegation[];
  getByToolCallId(sessionId: string, toolCallId: string): PendingDelegation | undefined;
}
```

Singleton export `delegationRegistry`.

#### 1b. Add DelegationResultQueue to `AgentSession`

In `apps/server/src/ai/agent-session.ts`:

```typescript
class AgentSession {
  // New properties
  private delegationResultQueue: AgentMessage[] = [];
  private abortController: AbortController | null = null;

  // New method: store delegation result for injection
  addDelegationResult(resultMessage: AgentMessage): void {
    this.delegationResultQueue.push(resultMessage);
  }

  // New internal methods for the loop config
  private drainSteeringMessages(): Promise<AgentMessage[]> {
    const msgs = [...this.delegationResultQueue];
    this.delegationResultQueue = [];
    return Promise.resolve(msgs);
  }

  private drainFollowUpMessages(): Promise<AgentMessage[]> {
    const msgs = [...this.delegationResultQueue];
    this.delegationResultQueue = [];
    return Promise.resolve(msgs);
  }
}
```

#### 1c. Wire hooks into vendor loop config

In `AgentSession.prompt()` (lines 199-211 of `agent-session.ts`), add:

```typescript
const loopConfig = {
  // ... existing config ...
  getSteeringMessages: () => this.drainSteeringMessages(),
  getFollowUpMessages: () => this.drainFollowUpMessages(),
};
```

This is the critical integration point. The vendor loop will now pick up
delegation results between turns (steering) or when done (follow-up).

---

### Phase 2: Non-blocking Tool Execution

#### 2a. Modify `spawn-subagent-tool.ts`

Current flow: `await subSession.prompt(task)` -- blocks parent.

New flow:

```
execute():
  1. Create subagent session (same as current)
  2. Set up abort signal chaining, event forwarding
  3. Launch subSession.prompt(task) WITHOUT await (fire & forget)
  4. Register in delegationRegistry
  5. Return immediately: { status: "delegated", subagentSessionId, task }
  6. On background completion:
     a. Parse envelope
     b. Update delegationRegistry (status → success/error)
     c. Emit WS event: delegation_update
     d. Call parentSession.addDelegationResult(formattedToolResultMessage)
```

Key changes:

- **No blocking**: `const promise = subSession.prompt(args.task)` (no await)
- **Store promise** for cleanup/abort tracking
- **Return early**: The tool returns `{ status: "delegated", subagentSessionId, ... }`
  which becomes a tool_result for the parent ("Delegation started").
- **Completion handler**: `.then(() => { ... inject result ... })` and
  `.catch((err) => { ... inject error ... })` on the stored promise.

**Important**: The $AbortSignal$ from the parent still works. If the parent
aborts, we abort the background promise too.

The tool result message for injection should be formatted as a `toolResult`
message (role: "toolResult") containing the envelope text. This way the vendor
loop processes it as a normal tool result when it sees it via
`getSteeringMessages`.

```typescript
// Format for injection
const toolResultMsg: AgentMessage = {
  role: "toolResult" as const,
  toolCallId: `delegation_${toolCallId}`,
  toolName: "spawn_subagent",
  content: [{ type: "text", text: envelopeStr }],
  details: { ...envelope, subagentSessionId },
  isError: status === "error",
  timestamp: Date.now(),
};
```

#### 2b. Modify `delegate-tool.ts`

Same treatment as spawn_subagent. Fire and forget the delegated session,
return immediately, inject via DelegationResultQueue on completion.

For channel target type: `channelOrchestrator.dispatchUserMessage()` already
returns a promise. Fire it in background.

#### 2c. Ensure delegation sessions are not filtered

The WS handler (handler.ts:91) filters `exec_*` and `lab_*` sessions. The
`del_*` and `sub_*` sessions should remain subscribable so the frontend can
render them as chat sessions.

---

### Phase 3: WebSocket Events for Delegation

New WS message types broadcast to the user's sockets:

```typescript
// Emitted when delegation starts
{ type: "delegation_started", parentSessionId, toolCallId, subagentSessionId, task, targetType }

// Emitted when delegation status changes (still running)
{ type: "delegation_update", parentSessionId, toolCallId, status: "running" | "success" | "error" }

// Emitted when delegation completes
{ type: "delegation_completed", parentSessionId, toolCallId, status, result: EnvelopeResult }
```

These are broadcast via `broadcastToUser()` so the user receives them
regardless of which session they're currently viewing.

Added in `apps/server/src/ws/handler.ts`:

```typescript
// In the broadcastToUser section (or from delegation-registry.ts)
broadcastToUser(username, { type: "delegation_started", ... });
```

---

### Phase 4: REST API for Delegations

```typescript
GET /api/sessions/:id/delegations
→ { delegations: PendingDelegation[] }

GET /api/sessions/:id/delegations/:toolCallId
→ { delegation: PendingDelegation }
```

Added in `apps/server/src/routes/sessions.ts`.

---

### Phase 5: Frontend -- Delegation Session Redirect

#### 5a. Remove modal, add navigation

In `ToolCallRow.tsx` and `ChatArea.tsx`:

- **Remove** `SubagentConsole` modal rendering (lines 609-625 in ChatArea.tsx)
- **Remove** `subagentDrawer` state
- **When delegation starts**: Navigate to the delegation session URL

The delegation session URL is:
```
/session/{subagentSessionId}
```
or scoped:
```
/agents/{agentId}/session/{subagentSessionId}
/projects/{projectName}/session/{subagentSessionId}
```

Since delegation sessions (`sub_*` and `del_*`) are normal sessions, they
render naturally in `ChatArea` with their own messages.

#### 5b. Delegation session badge

When viewing a delegation session in ChatArea, show a visible badge/indicator:

```
[Delegation Session] ←→ [Back to Parent]
```

- Badge says "Subagent Session" or "Delegated Task"
- "Back to Parent" button navigates to the parent session
- Input is enabled for subagent sessions (users CAN interact with subagents
  while they run, though the subagent will only see new messages)

#### 5c. How the redirect works

When the frontend receives a `tool_execution_start` event for
`spawn_subagent` or `delegate_task`, the `ChatArea` handler:

1. Stores the delegation info (toolCallId, subagentSessionId, task)
2. Navigates to the delegation session: `navigate(path)`

The navigation triggers `useEffect` with the new `sessionId`, which:
- Calls `loadMessages()` to load the delegation session's messages
- Subscribes to the delegation session's WebSocket events
- Shows the delegation session as a normal chat

---

### Phase 6: Frontend -- Delegations Tracker (FloatingDelegations)

#### 6a. New component `apps/client/src/components/chat/FloatingDelegations.tsx`

Similar structure to `FloatingTasks.tsx`:

```tsx
interface PendingDelegation {
  toolCallId: string;
  subagentSessionId: string;
  task: string;
  targetType: "spawn" | "delegate";
  status: "running" | "success" | "error" | "blocked";
  startedAt: string;
  completedAt?: string;
  result?: { status: string; executive_summary: string };
}

interface Props {
  delegations: Map<string, PendingDelegation>;
  onNavigateToSession: (sessionId: string) => void;
  parentSessionId: string;
}
```

Features:
- Sticky top panel within the message list (same position as FloatingTasks)
- Shows **only** when there are delegations for the current parent session
- Each delegation row shows:
  - Status indicator (pulsing green for running, checkmark for success, X for error)
  - Task summary (truncated to 60 chars)
  - Target type icon (spawn/delegate)
  - Elapsed time counter for running delegations
  - Click to navigate to the delegation's session
- Completed delegations shown briefly with green/red indicator and summary
- Max 5 entries shown; if more, show count

#### 6b. ChatArea Integration

Add to `ChatArea.tsx`:

```typescript
const [delegations, setDelegations] = useState<Map<string, PendingDelegation>>(new Map());

// Subscribe to delegation events
const unsubDelStarted = subscribe("delegation_started", (data) => {
  setDelegations(prev => {
    const next = new Map(prev);
    next.set(data.toolCallId, {
      toolCallId: data.toolCallId,
      subagentSessionId: data.subagentSessionId,
      task: data.task,
      targetType: data.targetType,
      status: "running",
      startedAt: new Date().toISOString(),
    });
    return next;
  });

  // Navigate to delegation session
  navigate(getSessionPath(data.subagentSessionId));
});

const unsubDelCompleted = subscribe("delegation_completed", (data) => {
  setDelegations(prev => {
    const next = new Map(prev);
    const existing = next.get(data.toolCallId);
    if (existing) {
      next.set(data.toolCallId, {
        ...existing,
        status: data.status,
        completedAt: new Date().toISOString(),
        result: data.result,
      });
    }
    return next;
  });
});
```

Render in the message list (alongside FloatingTasks):

```tsx
<FloatingDelegations
  delegations={delegations}
  onNavigateToSession={(sessionId) => navigate(getSessionPath(sessionId))}
  parentSessionId={sessionId}
/>
```

#### 6c. Load initial delegations from API

When a session is loaded, fetch existing delegations:

```typescript
const fetchDelegations = async () => {
  const token = localStorage.getItem("token");
  const res = await fetch(`/api/sessions/${sessionId}/delegations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.ok) {
    const data = await res.json();
    setDelegations(data.delegations);
  }
};
```

---

### Phase 7: Result Injection Flow Details

#### 7a. Agent is streaming (working) → inject via steering

```
1. Subagent completes
2. Background .then() fires
3. Parses envelope: success/error
4. delegationRegistry.complete(parentSessionId, toolCallId, result)
5. broadcastToUser: delegation_completed
6. Calls: parentSession.addDelegationResult(toolResultMessage)
7. Vendor loop's getSteeringMessages() is called at next turn boundary
8. Returns [toolResultMessage]
9. Loop adds it to context as message (line 183-189 of agent-loop.ts)
10. Next LLM call sees the tool result
11. Agent processes it and responds
```

#### 7b. Agent is idle → inject via follow-up

```
1-6. Same as above
7. Agent's loop would stop (no tool calls, no steering)
8. getFollowUpMessages() returns [toolResultMessage]
9. Outer loop continues (line 257-262 of agent-loop.ts)
10. Pending messages are processed
11. Agent generates response
```

#### 7c. Agent is idle + no loop running

If the parent completed its entire loop (isStreaming === false) and a
delegation completes:

```
1-6. Same as above
7. addDelegationResult stores the message
8. Since !isStreaming, the subagent completion handler calls:
   session.prompt("Delegation result received:\n" + envelopeText)
9. This starts a new agent loop
10. Agent processes the delegation result
```

---

### Phase 8: Edge Cases & Cleanup

#### 8a. Multiple simultaneous delegations

- `DelegationResultQueue` is an array (FIFO)
- Results injected in order of completion
- Agent processes them in sequence

#### 8b. Abort propagation

- When parent aborts, background subagent promises are aborted
- The `.catch()` handler stores the abort as "blocked" status
- Agent sees "delegation aborted" if it queries later

#### 8c. Session deletion during delegation

- When parent session is deleted, running background promises are aborted
- `delegationRegistry` is cleaned up
- Subagent sessions persist but are orphaned (user can still view)

#### 8d. Page refresh during delegation

- Delegations are server-side state (in memory)
- On page refresh, the client fetches delegations from REST API
- Running delegations continue server-side
- The client re-subscribes to WS events

#### 8e. Delegation session as a real session

- Delegation sessions (`sub_*`, `del_*`) are normal `AgentSession` instances
- They have their own message history, tool calls, etc.
- They appear in the session popover (with a badge for identification)
- Users can type messages to delegation sessions (interactive)
- The subagent processes new messages as steer/follow-up

---

## Files Modified

### Server (7 files)

| File | Change |
|------|--------|
| `apps/server/src/core/delegation-registry.ts` | **NEW** -- Delegation registry singleton |
| `apps/server/src/ai/agent-session.ts` | Add `delegationResultQueue`, `addDelegationResult()`, `drainSteeringMessages()`, `drainFollowUpMessages()` |
| `apps/server/src/core/tools/spawn-subagent-tool.ts` | Fire-and-forget execution, register delegation, inject result on completion |
| `apps/server/src/core/tools/delegate-tool.ts` | Same as spawn_subagent |
| `apps/server/src/ws/handler.ts` | Add `delegation_started/update/completed` WS broadcasts |
| `apps/server/src/routes/sessions.ts` | Add `GET /:id/delegations` and `GET /:id/delegations/:toolCallId` |
| `apps/server/src/core/agent-utils.ts` | Add helper `formatDelegationResultMessage()` |

### Client (5 files)

| File | Change |
|------|--------|
| `apps/client/src/components/chat/ChatArea.tsx` | Add delegations state, WS subscriptions, remove SubagentConsole modal, add FloatingDelegations |
| `apps/client/src/components/chat/FloatingDelegations.tsx` | **NEW** -- Delegations tracker UI component |
| `apps/client/src/components/chat/tools/ToolCallRow.tsx` | Remove "View Live Console" button, handle redirect |
| `apps/client/src/components/chat/tools/SubagentConsole.tsx` | **DELETE** -- No longer needed |
| `apps/client/src/hooks/useWebSocket.ts` | Add delegation event types |

### Shared (1 file)

| File | Change |
|------|--------|
| `packages/shared/src/schemas.ts` | Add `PendingDelegation` Zod schema |

---

## Migration / Data Impact

- No data migration needed. Delegation state is in-memory.
- Existing `sub_*` and `del_*` sessions on disk remain readable via REST API.
- The `SubagentConsole` component is deleted; all existing functionality
  (viewing delegation messages) is handled by the normal `ChatArea`.

---

## Verification

1. Start a parent session, delegate a long task (e.g., "analyze 10 files")
2. Verify parent returns immediately and continues working
3. Navigate to the delegation session URL -- see subagent messages in real-time
4. Return to parent session -- see the delegation tracker showing running status
5. Wait for completion -- verify parent agent receives the result and responds
6. Test with parent streaming when delegation completes -- verify result is steered
7. Test with parent idle -- verify result is prompted
8. Test multiple simultaneous delegations
9. Test abort during delegation
10. Test page refresh during delegation
