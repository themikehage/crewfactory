COMPLETED
# Decompose ChannelOrchestrator

**Status:** Completed
**Date:** 2026-07-12

## Problem Statement

`ChannelOrchestrator` (`apps/server/src/channels/channel-orchestrator.ts`) is a 1072-line God class with 13+ distinct responsibilities. Two methods dominate 55% of the file:

| Method | Lines | % of file |
|---|---|---|
| `runAgentPrompt` | L459-864 (406) | 38% |
| `dispatchToAgentAsyncInternal` | L270-453 (184) | 17% |

Concrete issues:

1. **Duplicated negotiation block** — L330-414 and L1018-1053 are verbatim copies of the same negotiation ingest/broadcast/escalate logic, differing only in the escalation path.
2. **Message-publish triplet repeated 4 times** — `channelStore.appendMessage + broadcast + eventBroker.publishEvent` appears at L398-407, L419-428, L432-442, L1001-1011.
3. **`buildAgentNameMap` called twice per prompt** — at L558 and L844 with identical result. The method scans all members and calls `agentRegistry.get()` for each.
4. **Circular dependency** — `channel-orchestrator.ts` imports `agentRegistry` (L2), and `agent-registry.ts` imports `channelOrchestrator` (L6). They are coupled at the module level, making them untestable in isolation.
5. **12 deeply nested property accesses** on `agentEntry.server.session.*` (model, messages, session, cwd, etc.), scattered across `runAgentPrompt` with no abstraction.
6. **`resolveDeploymentContext` duplicated** — `channel-orchestrator.ts:560-577` mirrors `prompt-builder.ts:141-183` nearly identically.
7. **Double eventBroker publishing** — SessionManager already subscribes to each session and publishes `agent_start`, `text_delta`, `tool_start`, etc. to eventBroker (L590-671). ChannelOrchestrator subscribes to the same session events (L606) and publishes the identical events, causing every channel event to appear twice in the global log. ChannelOrchestrator should only broadcast channel-specific WebSocket events.

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ChannelOrchestrator (1072 lines)             │
├─────────────────────────────────────────────────────────────────┤
│  dispatchUserMessage (L148)                                     │
│    ├── buildAgentNameMap (L155)                                 │
│    ├── parseMentions (L156)                                     │
│    ├── channelStore.appendMessage + broadcast + eventBroker     │
│    ├── channelStore.resetNegotiationState                       │
│    ├── runSequentialBroadcastLoop / runDispatchRound            │
│    │     └── dispatchToAgentAsync → dispatchToAgentAsyncInternal│
│    │           ├── queue.enqueue(→ runAgentPrompt)              │
│    │           │     ├── validate abort                         │
│    │           │     ├── load channel/agent → 12x nested access │
│    │           │     ├── ensure model                           │
│    │           │     ├── memory context (agent + channel)       │
│    │           │     ├── buildAgentNameMap (1st call)           │
│    │           │     ├── resolveDeploymentContext (DUPLICATED)  │
│    │           │     ├── promptComposer.compose                 │
│    │           │     ├── system instructions                    │
│    │           │     ├── subscribe events → broadcast + publish │
│    │           │     ├── session.prompt() ← AWAITED             │
│    │           │     ├── extract tokens (L762-776)              │
│    │           │     ├── stripThinkBlocks (L778)                │
│    │           │     ├── isSilentContent (L780)                 │
│    │           │     ├── memory.store                           │
│    │           │     ├── broadcast: channel_agent_end + publish │
│    │           │     ├── parse tool calls (L814-842)            │
│    │           │     ├── buildAgentNameMap (2nd call, L844)     │
│    │           │     ├── parseMentions (L845)                   │
│    │           │     └── build ChannelMessage (L847-861)        │
│    │           └── Negotiation block (L330-414) ★DUPLICATED★   │
│    │                 ├── ingest                                 │
│    │                 ├── broadcast round/agreed/rejected        │
│    │                 ├── escalation → ArbitrationProtocol       │
│    │                 ├── publish triplet ★                     │
│    │                 └── dispatchToAgentAsync to arbiter        │
│    ├── resolveRecipients (L866)                                 │
│    ├── buildAgentPrompt (L905)                                  │
│    ├── isSilentContent (L939)                                   │
│    ├── stripThinkBlocks (L945)                                  │
│    ├── runSequentialBroadcastLoop (L949)                        │
│    │     └── loop over members                                  │
│    │           ├── queue.enqueue(→ runAgentPrompt)              │
│    │           ├── publish triplet ★                            │
│    │           └── Negotiation block (L1018-1053) ★DUPLICATED★ │
│    ├── abortDispatch (L106)                                     │
│    ├── getActiveStreams (L85)                                   │
│    └── removeAgentQueue (L97)                                   │
├─────────────────────────────────────────────────────────────────┤
│  agentRegistry ←─circular─→ ChannelOrchestrator                  │
│  sessionManager imports eventBroker, publishes same events       │
└─────────────────────────────────────────────────────────────────┘
```

**Circular dependency chain:**
```
channel-orchestrator.ts → agentRegistry (for agent lookup)
agent-registry.ts → channelOrchestrator.removeAgentQueue() (at agent stop)
```

**Double publish chain:**
```
session.prompt() fires events
  ├── SessionManager.subscribe → eventBroker.publishEvent (session scope)
  └── ChannelOrchestrator.subscribe → eventBroker.publishEvent (channel scope)  ← DUPLICATE
```

## Proposed Architecture

```
┌──────────────────────────────────────────────────────────────┐
│              ChannelOrchestrator (~200 lines)                 │
│              Thin coordinator — orchestration only            │
├──────────────────────────────────────────────────────────────┤
│  dispatchUserMessage          → runDispatchRound             │
│  runDispatchRound             → per-agent fire-and-forget    │
│  resolveRecipients            → member filtering             │
│  runSequentialBroadcastLoop   → sequential mode              │
│  abortDispatch                → abort controllers            │
│  getActiveStreams             → streaming state query        │
│  buildAgentPrompt             → history formatting           │
│                                                              │
│  DEPENDS ON: AgentPromptRunner, ChannelNegotiationHandler,   │
│              ChannelMessagePublisher                          │
└──────────┬───────────────────────────────────────────────────┘
           │
           ├──► AgentPromptRunner (NEW, ~150 lines)
           │    ┌──────────────────────────────────────────────┐
           │    │  run(username, channelId, member, msg,       │
           │    │      signal) → DispatchResult                │
           │    │    ├── validate abort                        │
           │    │    ├── load agent (model check, memory)      │
           │    │    ├── load channel (members, context)        │
           │    │    ├── subscribe session events              │
           │    │    │     → broadcast channel WS events only  │
           │    │    │     → NO eventBroker.publishEvent       │
           │    │    ├── session.prompt()                      │
           │    │    ├── ResponseParser.parse()                │
           │    │    ├── memory.store                          │
           │    │    └── build ChannelMessage                  │
           │    └──────────────────────────────────────────────┘
           │
           ├──► ChannelNegotiationHandler (NEW, ~70 lines)
           │    ┌──────────────────────────────────────────────┐
           │    │  handle(message, channel, protocol,          │
           │    │           broadcastFn) → { action,           │
           │    │           escalationMessage? }               │
           │    │    ├── ingest pair                           │
           │    │    ├── broadcast round/agreed/rejected       │
           │    │    ├── if escalated → build escalation msg   │
           │    │    └── save state                            │
           │    └──────────────────────────────────────────────┘
           │
           ├──► ChannelMessagePublisher (NEW, ~30 lines)
           │    ┌──────────────────────────────────────────────┐
           │    │  publish(username, channelId, channelName,   │
           │    │          message)                             │
           │    │    ├── channelStore.appendMessage            │
           │    │    ├── broadcast(channelId, ...)             │
           │    │    └── eventBroker.publishEvent              │
           │    └──────────────────────────────────────────────┘
           │
           ├──► ResponseParser (NEW, ~50 lines)
           │    ┌──────────────────────────────────────────────┐
           │    │  parse(session, channel) →                   │
           │    │    { content, thinking, toolCalls, tokens }  │
           │    │    ├── extract tokens (L762-776)             │
           │    │    ├── stripThinkBlocks                      │
           │    │    ├── isSilentContent                       │
           │    │    ├── parse thinking blocks (L817-821)      │
           │    │    └── parse tool calls + results (L823-841) │
           │    └──────────────────────────────────────────────┘
           │
           └──► deployment-context.ts (MOVED to shared, ~40 lines)
                ┌──────────────────────────────────────────────┐
                │  resolveDeploymentContext(username, channelId,│
                │      agentId) → DeploymentContext             │
                │    ├── load channel → members, reply mode    │
                │    ├── build member list with names          │
                │    └── return { mode, members, role, ... }   │
                └──────────────────────────────────────────────┘

Event publishing — after refactor:

  session.prompt() fires events
    ├── SessionManager.subscribe → eventBroker.publishEvent  (GLOBAL LOG — session scope, no change)
    └── AgentPromptRunner.subscribe → broadcast channel WS events ONLY
         ├── channel_agent_token
         ├── channel_agent_thinking
         ├── channel_agent_start / channel_agent_end
         ├── channel_agent_tool_start / channel_agent_tool_end
         └── (NO eventBroker calls here)

  ChannelMessagePublisher.publish() → eventBroker.publishEvent
    └── Only for appending/finalizing messages in channel (user_message, agent_message)

Circular dependency resolution:
  agent-registry.ts: remove `import { channelOrchestrator }` line
  channel-orchestrator.ts: remove `import { agentRegistry }` line
  AgentPromptRunner: imports agentRegistry (direct consumer)
  agent-registry.ts stop(): use removeAgentQueue callback registered by ChannelOrchestrator
```

## Detailed Implementation Steps

### Step 1: Create `deployment-context.ts` (shared utility)

**New file:** `apps/server/src/core/channel/deployment-context.ts`

Extract duplicated logic from:
- `channel-orchestrator.ts:560-577` (L560-L577)
- `prompt-builder.ts:141-183` (resolveDeploymentContext)

```typescript
export async function resolveDeploymentContext(
  username: string, channelId: string, agentId?: string
): Promise<DeploymentContext>
```

- Uses dynamic imports for `channelStore` and `agentRegistry` to avoid circular deps
- Returns `{ mode: "solo" }` if no channel context is available
- Both callers update to import from this shared module

### Step 2: Create `ChannelMessagePublisher`

**New file:** `apps/server/src/channels/channel-message-publisher.ts`

```typescript
export function publishChannelMessage(
  username: string,
  channelId: string,
  channelName: string,
  message: ChannelMessage,
  eventType?: "user_message" | "agent_message",
  agentName?: string
): void
```

- Encapsulates: `channelStore.appendMessage` + `broadcast({ type: "channel_message", ... })` + `eventBroker.publishEvent`

Replace 4 occurrences:
- L168-177 (user message in `dispatchUserMessage`)
- L398-407 (escalation in `dispatchToAgentAsyncInternal`)
- L419-428 (rejection in `dispatchToAgentAsyncInternal`)
- L432-442 (normal agent message in `dispatchToAgentAsyncInternal`)
- L1001-1011 (in `runSequentialBroadcastLoop`)

### Step 3: Create `ChannelNegotiationHandler`

**New file:** `apps/server/src/channels/channel-negotiation-handler.ts`

Unify the duplicated negotiation blocks:

```typescript
export interface NegotiationResult {
  action: "continue" | "stop" | "escalate";
  escalationMessage?: ChannelMessage;
  isAgreed: boolean;
  isRejected: boolean;
}

export function handleNegotiation(
  username: string,
  channelId: string,
  agentMsg: ChannelMessage,
  channel: Channel,
  memberAgentId: string,
  incomingMsg: ChannelMessage,
  broadcastFn: (type: string, data: any) => void
): NegotiationResult
```

- Creates `NegotiationProtocol` instance, ingests pair
- Saves state to channelStore
- Broadcasts `channel_negotiation_round`, `channel_negotiation_agreement`, `channel_negotiation_rejected`, `channel_negotiation_escalation`
- If escalated, builds escalation message via `ArbitrationProtocol`
- Returns structured result — caller acts on `action`

The first block (L330-414) had access to a local `depth` variable and an immediate `dispatchToAgentAsync` call for escalation. The unified handler returns the escalation message; the caller dispatches it. The second block (L1018-1053) in `runSequentialBroadcastLoop` only needed agreement detection (no escalation path there).

### Step 4: Create `ResponseParser`

**New file:** `apps/server/src/channels/response-parser.ts`

Extract from `runAgentPrompt` L762-863:

```typescript
export interface ParsedResponse {
  content: string;
  stripped: string;
  thinking: string;
  toolCalls: ToolCallResult[];
  tokensIn: number;
  tokensOut: number;
  isSilent: boolean;
}

export function parseResponse(
  session: { messages: any[] },
  channel: { showThinking: boolean; showTools: boolean }
): ParsedResponse
```

Sub-steps:
- Extract last assistant message from session.messages
- Read full response text (string or content array)
- Extract token usage (`lastMsg.usage.input/output`)
- `stripThinkBlocks()` if `!channel.showThinking`
- `isSilentContent()` check
- Parse thinking blocks: iterate `lastMsg.content` for `type === "thinking"` blocks
- Parse tool calls: find `type === "toolCall"` blocks and match with `toolResult` messages
- Return structured `ParsedResponse`

Also extract:
- `isSilentContent()` as standalone export
- `stripThinkBlocks()` as standalone export

### Step 5: Create `AgentPromptRunner`

**New file:** `apps/server/src/channels/agent-prompt-runner.ts`

This is the main extraction — the core of `runAgentPrompt` (L459-864).

```typescript
export class AgentPromptRunner {
  constructor(private activeStreams: Map<string, Map<string, ActiveAgentStream>>) {}

  async run(
    username: string,
    channelId: string,
    member: ChannelMember,
    incomingMsg: ChannelMessage,
    signal: AbortSignal
  ): Promise<DispatchResult>
}
```

Pipeline (faithful to original order):
1. Abort check
2. Load channel from `channelStore`
3. Load agent from `agentRegistry`
4. Validate agent availability (not stopped)
5. Ensure model (reuse L485-506 with `sessionManager.getUserContext`)
6. Initialize active streams map
7. Broadcast `channel_agent_start` (channel WS only, no eventBroker)
8. Load memory context (agent + channel memory) — reuse L538-555
9. Call shared `resolveDeploymentContext()`
10. Compose prompt via `promptComposer.compose()`
11. Set system instructions
12. Build user prompt text via `buildAgentPrompt()` (pass existing function or delegate)
13. Subscribe to session events:
    - `text_delta` → `channel_agent_token` + update activeStreams
    - `thinking_delta` → `channel_agent_thinking` + update activeStreams
    - `tool_execution_start` → `channel_agent_tool_start` + update streams
    - `tool_execution_end` → `channel_agent_tool_end` + update streams
    - **NO eventBroker.publishEvent calls** — SessionManager already handles these
14. `session.prompt(promptText)` — await
15. Catch errors: broadcast `channel_agent_error` + `channel_agent_end` (no eventBroker)
16. Cleanup: `unsub()`, remove agent from activeStreams map
17. Call `ResponseParser.parse()` for token extraction, think stripping, silent detection
18. Auto-store memory if enabled and not silent
19. Broadcast `channel_agent_end` (channel WS only)
20. If silent, return `{ agentMsg: null }`
21. Parse mentions (reuse `buildAgentNameMap` cache — call once, use for both deployment context and mentions)
22. Build and return `ChannelMessage`

Key differences from original:
- `buildAgentNameMap` called **once** at top (passed through pipeline) — fixes Task G
- No `eventBroker.publishEvent` calls — fixes Task F
- Uses `ChannelMessagePublisher.publish()` for final message append
- Uses shared `resolveDeploymentContext()`

### Step 6: Refactor `ChannelOrchestrator` to thin coordinator

After extracting Steps 1-5, `ChannelOrchestrator` reduces to ~200 lines:

**Remaining responsibilities:**
- `dispatchUserMessage()` — entry point, setup abort controllers, create ChannelMessagePublisher calls
- `runDispatchRound()` — resolve recipients, fire-and-forget dispatch per member
- `runSequentialBroadcastLoop()` — sequential mode with `ChannelNegotiationHandler` and `ChannelMessagePublisher`
- `resolveRecipients()` — unchanged
- `buildAgentPrompt()` — unchanged (can stay as private helper)
- `abortDispatch()` — abort controllers, clear active streams
- `getActiveStreams()` — unchanged
- `removeAgentQueue()` — unchanged (used by agent-registry via callback)
- Chain depth tracking — unchanged

**Removed:**
- `runAgentPrompt()` — extracted to AgentPromptRunner
- `dispatchToAgentAsync()` / `dispatchToAgentAsyncInternal()` — simplified; uses AgentPromptRunner + ChannelNegotiationHandler + ChannelMessagePublisher
- All `eventBroker.publishEvent` calls for streaming events
- Duplicated negotiation block (uses handler)
- Duplicated deployment context (uses shared module)
- `isSilentContent()`, `stripThinkBlocks()` — moved to ResponseParser

### Step 7: Remove eventBroker calls from ChannelOrchestrator

In `AgentPromptRunner`, remove ALL `eventBroker.publishEvent()` calls. SessionManager (L590-671) already publishes:
- `agent_start`, `agent_end`, `text_delta`, `thinking_delta`, `tool_start`, `tool_end`, `error`

`ChannelMessagePublisher` will be the sole publisher for:
- `user_message` (when a user sends to channel)
- `agent_message` (when final agent response is appended)

`AgentPromptRunner` only broadcasts channel-specific WebSocket events:
- `channel_agent_start`, `channel_agent_end`
- `channel_agent_token`, `channel_agent_thinking`
- `channel_agent_tool_start`, `channel_agent_tool_end`
- `channel_agent_error`

### Step 8: Fix circular dependency

**Current circular chain:**
```
channel-orchestrator.ts → agents/index.ts → agents/agent-registry.ts → channel-orchestrator.ts
```

**Solution:** `agent-registry.ts` no longer imports `channelOrchestrator` directly. Instead, ChannelOrchestrator registers a callback:

```typescript
// In agent-registry.ts, add:
let onStopCallback: ((agentId: string) => void) | null = null;
export function setAgentStopCallback(fn: (agentId: string) => void) {
  onStopCallback = fn;
}

// In stop():
// Replace: channelOrchestrator.removeAgentQueue(id);
// With:
if (onStopCallback) onStopCallback(id);
```

```typescript
// In channel-orchestrator.ts (or an init file / ws/handler.ts):
import { setAgentStopCallback } from "../agents/agent-registry";
setAgentStopCallback((agentId) => channelOrchestrator.removeAgentQueue(agentId));
```

Alternatively, have `AgentPromptRunner` handle this since it already imports `agentRegistry`. The `removeAgentQueue` call would move there.

**Best approach:** Register callback at server startup. The `agent-registry.ts:stop()` already calls `channelOrchestrator.removeAgentQueue(id)` only once at L145. Replace it with a callback registration pattern.

Then `agent-registry.ts` removes `import { channelOrchestrator }` from L6.

`channel-orchestrator.ts` already imports `agentRegistry` via L2. If it only imports types (`AgentEntry`), the import is fine. But the new `AgentPromptRunner` will use `agentRegistry.get()` — so it will be the new home for that import, not the orchestrator.

### Step 9: Verify

```bash
cd apps/server && bun run build  # TypeScript compilation
```

Manual verification:
- Channel dispatch: user-only, broadcast, targeted, mention-only
- Channel abort mid-stream
- Negotiation protocol: agreement, rejection, escalation to arbiter
- Streaming WebSocket events: tokens, thinking, tool calls
- No duplicate events in global event log
- Laboratory experiments still work (uses `channelOrchestrator.dispatchUserMessage`)
- Agent stop cleans up queues (callback pattern)

## Affected Files

| File | Change |
|---|---|
| `apps/server/src/channels/channel-orchestrator.ts` | Major refactor: remove ~500 lines, keep coordinator logic |
| `apps/server/src/channels/agent-prompt-runner.ts` | **NEW** ~150 lines |
| `apps/server/src/channels/channel-negotiation-handler.ts` | **NEW** ~70 lines |
| `apps/server/src/channels/channel-message-publisher.ts` | **NEW** ~30 lines |
| `apps/server/src/channels/response-parser.ts` | **NEW** ~50 lines |
| `apps/server/src/core/channel/deployment-context.ts` | **NEW** ~40 lines |
| `apps/server/src/core/session/prompt-builder.ts` | Replace `resolveDeploymentContext` with shared import |
| `apps/server/src/agents/agent-registry.ts` | Add `setAgentStopCallback`, remove `channelOrchestrator` import |
| `apps/server/src/ws/handler.ts` | Register `setAgentStopCallback` at startup |
| `apps/server/src/laboratory/experiment-runner.ts` | No changes expected (uses `channelOrchestrator` public API) |
| `apps/server/src/core/tools/delegate-tool.ts` | No changes expected |
| `apps/server/src/routes/channels.ts` | No changes expected |

## Verification Criteria

1. `bun run build` from `apps/server/` succeeds with zero errors
2. Channel dispatch modes all work:
   - User message → all broadcast agents reply
   - User message → only targeted agents reply
   - User message → only mentioned agents reply
   - Agent message → eligible agents chain to next round
3. Channel abort works: abort controller signals, streams stop, active streams cleaned
4. Negotiation flows work:
   - Agreement detected and chain stops
   - Rejection detected and chain stops (with message)
   - Escalation triggers arbiter dispatch
5. Streaming to channel WebSocket works: `channel_agent_token`, `channel_agent_thinking`, `channel_agent_start/end`, `channel_agent_tool_start/end`
6. No duplicate events in global event log: SessionManager publishes once, ChannelMessagePublisher publishes once for message appends
7. Laboratory experiments still run: `experiment-runner.ts` uses `channelOrchestrator.dispatchUserMessage` — unchanged public API
8. `removeAgentQueue` callback fires when agent is stopped

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Breaking circular dependency may cause runtime import order issues | Use callback registration pattern (deferred binding at startup, not import time). Test with `bun run dev` which hits real import order. |
| `AgentPromptRunner` must handle 12 deeply nested `agentEntry.server.session.*` accesses | Pass `agentEntry` as typed object. Create a small `AgentSessionFacade` interface if needed, but simplest is to keep the import as-is. |
| `ChannelMessagePublisher` must preserve exact JSONL message format | Verify by inspecting `channelStore.appendMessage` output format. Compare messages.json content before/after refactor with diff. |
| `SessionManager` double-publish is a side-effect that other code may depend on | Audit all `eventBroker` consumers for duplicate events. The frontend uses the global log for activity view; duplicates there are already a bug. Fix is correctness, not risky. |
| `buildAgentNameMap` caching may return stale data if agent names change mid-dispatch | Agent names are immutable during a session. Build once per `run()` invocation — no cache lifecycle issue. |
| Experiment runner may depend on internal ChannelOrchestrator behavior | `experiment-runner.ts` only calls `dispatchUserMessage` and `abortDispatch` — public API unchanged. |
| `delegate-tool.ts` uses `channelOrchestrator.dispatchUserMessage` with a `delegateSessionId` | Public API unchanged. Delgation flows are unchanged. |
