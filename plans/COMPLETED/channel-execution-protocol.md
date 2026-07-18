COMPLETED

# Channel Execution Protocol: Ordered, Durable Runtime

## Status: Draft

## Objective

Replace the implicit, fire-and-forget channel dispatch with a durable execution protocol. Each user request must have a traceable execution, ordered agent turns, terminal state, and a single event model for text, thinking, tools, negotiation, and errors.

## Audit Evidence

- `runDispatchRound()` launches eligible members concurrently; `AgentWorkQueue` serializes only per agent, so unrelated agents stream simultaneously into the same channel.
- `channel_agent_end` is emitted before the final `channel_message`, causing the client to drop the live state before it can reconcile it with the persisted result.
- The client ignores `channel_agent_tool_update`; tool results are modelled separately from calls and rendered out of chronological order.
- Errors, silent responses, chain limits, and aborts do not form a persistent execution record visible to users after reconnect.

## Product Contract

For every submitted channel message the product creates one `ChannelExecution` with an immutable ID. It exposes a declared topology and ordered turn plan, a durable event stream with a strictly increasing sequence number, a terminal state (`completed`, `aborted`, `failed`, `stalled`, or `completed_with_warnings`), one `ChannelTurn` per attempted dispatch, and one ordered activity timeline per turn.

The UI may render live events optimistically, but the persisted execution log is authoritative for reconnect and recovery.

## Non-Goals

- Do not change agent roles, prompts, or default topologies in this plan.
- Do not redesign the channel visual hierarchy beyond consuming the new execution model.
- Do not remove existing JSONL message history until migration is verified.

## Implementation Phases

### Phase 1: Shared execution schema and persistence

1. Define shared Zod schemas for `ChannelExecution`, `ChannelTurn`, and discriminated `ChannelExecutionEvent` payloads.
2. Add monotonic `sequence`, ISO timestamp, execution ID, turn ID, channel ID, session ID, and agent ID where applicable to every event.
3. Add `ChannelExecutionStore` with append-only event persistence, atomic snapshots, bounded retention, and read APIs for execution detail and active state.
4. Make event writes idempotent by event ID and validate state transitions centrally.
5. Retain message JSONL as the conversation projection; do not infer execution status from messages.

### Phase 2: Deterministic scheduler

1. Introduce a channel-scoped scheduler that owns an execution and produces an explicit turn plan before invoking an agent.
2. Support scheduler modes: `sequential`, `parallel`, and `leader-gated`; only `sequential` is enabled by default initially.
3. Move depth limits, abort state, silence handling, queueing, and terminal completion into the scheduler.
4. Record every skip with a machine-readable reason (`observer`, `not_mentioned`, `not_targeted`, `no_model`, `aborted`, `chain_limit`, `silent`).
5. Await turn completion before releasing the next sequential turn. Parallelism, when enabled later, must retain deterministic display order by turn index.

### Phase 3: Event bridge and reconciliation

1. Make `AgentPromptRunner` emit execution events instead of independently broadcasting presentation events.
2. Normalise tool calls under one ID and lifecycle: `tool_started`, `tool_updated`, `tool_completed`, `tool_failed`.
3. Emit `turn_completed` only after the final message projection and all tool states have been persisted.
4. Broadcast persisted events to WebSocket subscribers after storage succeeds; include sequence numbers for deduplication and gap detection.
5. Add REST endpoints for active execution state and paged event recovery. On reconnect, resume from the last sequence rather than relying on timing-based message refetches.

### Phase 4: Client state model and rendering

1. Replace ad-hoc `streamingAgents` mutations with an execution reducer keyed by execution and turn IDs.
2. Consume every tool update/end event and preserve completed tool state after agent end.
3. Render tools inline in their chronological position, with `running`, `completed`, `failed`, and partial-output states.
4. Render terminal outcomes and skipped turns as concise activity entries instead of disappearing silently.
5. Add stale-stream detection and a recovery action when event sequence gaps cannot be reconciled automatically.

### Phase 5: Migration, compatibility, and cleanup

1. Feature-flag the protocol per channel and preserve the legacy projection during migration.
2. Provide a compatibility adapter that emits legacy channel events from the new execution stream until all clients have migrated.
3. Remove legacy active-stream maps and duplicate event paths only after production telemetry proves parity.

## Verification

- Unit tests for execution transition validation, event ordering, deduplication, abort, silence, and chain-limit states.
- Integration tests for sequential dispatch, per-agent queue contention, reconnect from a sequence cursor, and tool lifecycle completion.
- Client reducer tests proving a completed tool never regresses to running and final text follows its turn activity.
- E2E test with two agents, two tools, reconnect during a tool call, and a user abort.

## Acceptance Criteria

- A channel execution always reaches a visible terminal state within its configured timeout or after explicit abort.
- No sequential channel renders overlapping agent text.
- Every started tool has one terminal state visible after the agent turn finishes.
- Reloading or reconnecting preserves the exact ordered activity timeline.
- A failed or skipped agent is explained to the user and recorded for diagnostics.

## Dependencies

- Must be implemented before the topology UX and negotiation UX plans consume execution state.
