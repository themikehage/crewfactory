COMPLETED
# Unify Lab-Channel Orchestration

**Status**: Completed
**Date**: 2026-07-12

## Problem Statement

The laboratory subsystem (`experiment-runner.ts`) **reinvents the wheel** by manually implementing the entire agent lifecycle pipeline that `ChannelOrchestrator` already provides. This creates:

1. **~500 lines of duplicate code** — `runSingleVariant` (141 lines) and `runMultiVariant` (264 lines) are ~80% structurally identical, differing only in agent count, replyMode, maxChainDepth, negotiationProtocol, and output format. The pipeline they both implement is the same one `dispatchUserMessage` drives internally.

2. **Drift risk** — Any improvement to channel orchestration (abort handling, chain depth tracking, equilibrium detection, round counting) must be separately reimplemented in the lab, or the lab misses it entirely.

3. **Fragile token collection** — Token summation logic is copy-pasted twice (lines 353-392 and 616-651), with a dual-fallback strategy (channel messages → agent session stats → message usage objects). This should be a shared utility.

4. **Manual cleanup** — The lab manually tracks `registeredIds: string[]` and runs stop loops (lines 657-661), duplicating cleanup logic already handled by `abortDispatch`.

The user's directive:

> "El laboratorio no debería reinventar la rueda, debería reutilizar lo que ya le ofrecen los canales y hacer adaptables los parámetros que necesite."

## Current Architecture

### What `ExperimentRunner` does today

```
runSingleVariant / runMultiVariant:
  1. Register temporary agents (agentRegistry.register, ~20 lines)
  2. Clean stale channel (channelStore.deleteChannel)
  3. Create channel (channelStore.createChannel, ~20 lines with variant-specific config)
  4. Add members (channelStore.updateMembers, ~20 lines with variant-specific mappings)
  5. Create session + save metadata (sessionManager, ~10 lines)
  6. Dispatch (channelOrchestrator.dispatchUserMessage, 1 line)
  7. Wait for completion — implicit via dispatchUserMessage's chain promise
  8. Collect messages (channelStore.getMessages)
  9. Collect tokens (iterate messages + fallback to agent session stats, ~40 lines)
  10. Extract agreement + negotiation metrics
  11. Destroy agents (agentRegistry.stop loop, ~5 lines)
  12. Return VariantRunResult
```

### What `ChannelOrchestrator.dispatchUserMessage` already does

```
dispatchUserMessage:
  1. Append user message to channel store
  2. Reset negotiation state
  3. Create AbortController for the chain
  4. Initialize chain tracking (activeChains with count/resolve)
  5. If broadcast mode → runSequentialBroadcastLoop (sequential rounds until equilibrium or max depth)
  6. If non-broadcast → runDispatchRound (fire-and-forget each agent, chaining via activeChains counter)
  7. Return chainPromise that resolves when all agents finish
```

The orchestrator already handles: agent dispatching, chain depth enforcement, equilibrium detection (2 consecutive silent rounds), negotiation/arbitration, event broadcasting, and abort propagation. The lab just doesn't use these capabilities as a client — it builds its own parallel scaffolding around them.

## Proposed Architecture

### The lab becomes a client of the channel subsystem

Instead of the lab manually orchestrating each step, it:

1. **Defines a `VariantConfig`** that parameterizes what makes variants different
2. **Uses a single `runVariant(config)` method** that calls `ChannelOrchestrator.runToCompletion()`
3. **`ChannelOrchestrator.runToCompletion()`** handles the full lifecycle for programmatic consumers

```
ExperimentRunner.runVariant(config):
  1. Validate business rules (min agents)
  2. Register temporary agents (loop over config.agents, resolve model with fallback)
  3. Resolve blueprint config if config.blueprintId
  4. Call channelOrchestrator.runToCompletion(username, channelId, taskPrompt, sessionId, signal)
       → Internally:
         a. Clean stale channel
         b. Create channel with variant-specific settings
         c. Add members with variant-specific replyModes
         d. Create session metadata
         e. dispatchUserMessage → wait for chain promise
         f. Collect messages, tokens, negotiation state
         g. Return { messages, metrics }
  5. Destroy temporary agents
  6. Build VariantRunResult from metrics
  7. Return
```

### Key Design Decisions

#### Decision 1: `VariantConfig` interface

```typescript
interface VariantConfig {
  variantKey: "single" | "multiNoLeader" | "multiWithLeader";
  agents: LabAgent[];
  taskPrompt: string;
  replyMode: "user-only" | "broadcast" | "targeted";
  maxChainDepth: number;
  negotiationProtocol?: ChannelNegotiationProtocol;
  blueprintId?: string;
  contextItems?: ChannelContextItem[];
  outputFormatter?: (messages: ChannelMessage[]) => string;
}
```

**Rationale**: Encapsulates all variant differences in a single config object. The three variants become three config instances, not three separate methods. `outputFormatter` handles the single difference between single-agent output (plain text) and multi-agent output (prefixed with agent name).

#### Decision 2: `ChannelOrchestrator.runToCompletion()`

The orchestrator exposes a method that programmatic consumers (lab, scripts, tests) call instead of manually wiring the pipeline:

```typescript
interface RunToCompletionConfig {
  channelId: string;
  channelName: string;
  description: string;
  agents: Array<{ agentId: string; agentName: string }>;
  members: ChannelMember[];
  maxChainDepth: number;
  showThinking: boolean;
  showTools: boolean;
  negotiationProtocol?: ChannelNegotiationProtocol;
  contextItems?: ChannelContextItem[];
  taskPrompt: string;
  sessionId: string;
  sessionName: string;
  signal?: AbortSignal;
}

interface RunToCompletionResult {
  status: "completed" | "failed" | "aborted";
  messages: ChannelMessage[];
  tokensIn: number;
  tokensOut: number;
  negotiationRounds: number;
  escalationsToLeader: number;
  agreementReached: boolean;
}
```

Method signature:
```typescript
async runToCompletion(
  username: string,
  config: RunToCompletionConfig
): Promise<RunToCompletionResult>
```

**Rationale**: The orchestrator is the authority on agent dispatch, chain tracking, abort handling, and equilibrium detection. It already has the `activeChains` counter mechanism that resolves when all agents complete. `runToCompletion()` wraps that with setup and teardown. The lab should not have its own polling, its own abort controllers, or its own silence detection.

**Important**: After `runToCompletion` returns, the caller is responsible for destroying the channel and stopping agents. The orchestrator should not auto-destroy — the lab may want to inspect channel state, and the frontend may want to replay messages via `GET /channels/:id`.

#### Decision 3: Token collection as shared utility

Extract the token summation logic into `core/agent-utils.ts`:

```typescript
export function collectChannelTokens(
  username: string,
  channelId: string,
  sessionId: string,
  agentIds: string[]
): { tokensIn: number; tokensOut: number }
```

**Rationale**: The fallback strategy (channel messages → registered agent session stats → message usage objects) is identical in both variants. Making it a utility eliminates drift and centralizes the fallback logic. The agent-utils file already contains agent-related utilities (`parseEnvelope`, `forwardSubagentEvents`, `resolveModelWithFallback`), so token collection fits naturally.

#### Decision 4: Temporary channel lifecycle

Lab channels still use `lab_` prefix for isolation from user channels (`channel-store.ts:86` already filters them out of `listChannels`). The cleanup flow:

1. `runToCompletion()` creates the channel, dispatches, waits, collects metrics
2. Caller (lab) destroys channel via `channelStore.deleteChannel`
3. Caller stops agents via `agentRegistry.stop`

The `stopExperiment` abort path already handles this via `abortDispatch` + agent stop loop. No changes needed to abort logic.

#### Decision 5: `runVariant` replaces `runSingleVariant` + `runMultiVariant`

A single method that takes a `VariantConfig` and returns `VariantRunResult`:

```typescript
private static async runVariant(
  username: string,
  exp: LabExperiment,
  config: VariantConfig,
  sessionId: string,
  signal: AbortSignal
): Promise<VariantRunResult>
```

**Rationale**: The two existing methods share ~80% of their code. The only real differences are captured in the config. This eliminates ~400 lines of duplication. Business rule validation (min agents for multiNoLeader=2, multiWithLeader=3) becomes a simple guard clause at the top.

## Detailed Implementation Steps

### Step 1: Create token collection utility in `core/agent-utils.ts`

Add `collectChannelTokens(username, channelId, sessionId, agentIds)`:
- Read channel messages via `channelStore.getMessages(username, channelId, 100, sessionId)`
- Sum `tokensIn`/`tokensOut` from agent messages
- If zero, fallback to `agentRegistry.get(agentId)` → `entry.server.session.getSessionStats()` → `entry.server.session.messages[].usage`
- Return `{ tokensIn, tokensOut }`

### Step 2: Add `RunToCompletionConfig` and `RunToCompletionResult` types

Place in `packages/shared/src/schemas.ts` or a new `apps/server/src/channels/types.ts` file. These are server-only types since they describe internal orchestrator API — prefer a types file near the orchestrator rather than polluting shared schemas.

### Step 3: Implement `ChannelOrchestrator.runToCompletion()`

In `apps/server/src/channels/channel-orchestrator.ts`:

1. Create channel with `channelStore.createChannel`
2. Set members with `channelStore.updateMembers`
3. Create session + metadata via `sessionManager.getOrCreateSession` + `saveSessionMetadata`
4. Call `this.dispatchUserMessage(username, channelId, taskPrompt, sessionId)` — which returns `chainPromise`
5. Await `chainPromise` (respect abort signal via `Promise.race`)
6. Collect messages via `channelStore.getMessages`
7. Collect tokens via `collectChannelTokens`
8. Extract negotiation metrics via `channelStore.getNegotiationState`
9. Return `RunToCompletionResult`

Abort signal handling: If the signal fires, call `this.abortDispatch(username, channelId, sessionId)` and return with `status: "aborted"`.

### Step 4: Add `VariantConfig` type

In `apps/server/src/laboratory/types.ts` (new file or inline in experiment-runner):

```typescript
interface VariantConfig {
  variantKey: "single" | "multiNoLeader" | "multiWithLeader";
  replyMode: "user-only" | "broadcast" | "targeted";
  maxChainDepth: number;
  hasNegotiationProtocol: boolean;
  minAgents: number;
}
```

This captures the 5 things that differ between variants. The actual agent list comes from `exp.variants[variantKey].agents`.

### Step 5: Refactor `ExperimentRunner` — single `runVariant` method

Replace `runSingleVariant` (L272-413) and `runMultiVariant` (L415-679) with:

```typescript
private static async runVariant(
  username: string,
  exp: LabExperiment,
  config: VariantConfig,
  sessionId: string,
  signal: AbortSignal
): Promise<VariantRunResult>
```

Logic:
1. Validate `run.agents.length >= config.minAgents` — return failed result if not met
2. Register temporary agents (loop, resolve models with `resolveModelWithFallback`, track `registeredIds`)
3. Resolve blueprint config if `exp.blueprintId`
4. Build channel members with `config.replyMode` and variant-specific role/target logic
5. Build channel config with `config.maxChainDepth`, negotiation protocol if applicable
6. Call `channelOrchestrator.runToCompletion(username, runToCompletionConfig)`
7. On return: stop agents, build `VariantRunResult` from result
8. Return

### Step 6: Simplify `executeAllVariants`

Replace 3 separate blocks (lines 107-147, each ~15 lines of boilerplate) with a loop:

```typescript
const variantConfigs: VariantConfig[] = [
  { variantKey: "single", replyMode: "user-only", maxChainDepth: 3, hasNegotiationProtocol: false, minAgents: 1 },
  { variantKey: "multiNoLeader", replyMode: "broadcast", maxChainDepth: 8, hasNegotiationProtocol: false, minAgents: 2 },
  { variantKey: "multiWithLeader", replyMode: "targeted", hasNegotiationProtocol: true, minAgents: 3 },
];

for (const config of variantConfigs) {
  if (signal.aborted) return;
  const sessionId = `lab_run_${crypto.randomUUID()}`;
  exp.variants[config.variantKey].activeSessionId = sessionId;
  exp.activeVariant = config.variantKey;
  await ExperimentStore.saveExperiment(username, exp);
  broadcastToUser(username, { type: "experiment_status", experimentId: exp.id, status: "running", activeVariant: config.variantKey });
  const result = await this.runVariant(username, exp, config, sessionId, signal);
  exp.variants[config.variantKey].result = result;
  await ExperimentStore.saveExperiment(username, exp);
  // Calculate baseline after single variant
  if (config.variantKey === "single") {
    baselineStats = { durationMs: result.durationMs, totalTokens: result.tokensIn + result.tokensOut };
  }
}
```

The scoring section (lines 149-241) remains unchanged as it works on the results populated in the loop.

### Step 7: Verify and test

Run `bun run build` from `apps/server`. Manually verify in the UI that:
- All 3 variants execute successfully
- Token counts match before/after
- Abort during execution works
- Judge evaluation still works
- Export variant still works
- Channel recreation on GET `lab_*` still works

## Affected Files

| File | Change | Impact |
|------|--------|--------|
| `apps/server/src/laboratory/experiment-runner.ts` | Major simplification (~500 lines removed) | Core refactor |
| `apps/server/src/channels/channel-orchestrator.ts` | Add `runToCompletion()` (~80 lines) | New feature |
| `apps/server/src/core/agent-utils.ts` | Add `collectChannelTokens()` (~40 lines) | New utility |
| `apps/server/src/laboratory/types.ts` | New file with `VariantConfig` type | New type |
| `packages/shared/src/schemas.ts` | No changes expected | None |

**No changes needed in:**
- `apps/server/src/channels/channel-store.ts` — `createChannel` already supports `lab_` prefixed channels and `listChannels` already filters them out (line 86)
- `apps/server/src/routes/experiments.ts` — API surface unchanged (the router only calls `ExperimentRunner.runExperiment` and `stopExperiment`)
- `apps/server/src/routes/channels.ts` — `GET /channels/:id` lab recreation logic (lines 63-100) still works since lab channels are still created by `channelStore.createChannel`
- `apps/server/src/laboratory/experiment-store.ts` — No API change; still saves/reads `LabExperiment` with same structure
- `apps/server/src/laboratory/judge.ts` — No change; reads variant results unchanged
- `apps/server/src/laboratory/scoring.ts` — No change; reads variant results unchanged

## Verification Criteria

- [x] `bun run build` from `apps/server` succeeds with no type errors
- [ ] All 3 variants run successfully (single, multiNoLeader, multiWithLeader)
- [ ] Token collection returns same values as before (compare representative runs)
- [ ] Judge evaluation produces same scores as before
- [ ] Run history persists correctly (reload experiment page, verify past runs load)
- [ ] WebSocket streaming during lab execution works (status updates and channel messages broadcast)
- [ ] Lab channel recreation on GET `/channels/:lab_*` still works
- [ ] `stopExperiment` (abort) works correctly — agents destroyed, channel cleaned, status set to "failed"
- [ ] Export variant to workspace still works
- [ ] `activeSessionId` tracking in frontend still works (used for session replay)

## Risks and Mitigations

| Risk | Likelihood | Severity | Mitigation |
|------|-----------|----------|------------|
| `runToCompletion` chain promise never resolves | Low | High | Chain promises already resolve in current code via `activeChains` counter and equilibrium detection (2 silent rounds). No new mechanism introduced. Respect abort signal via `Promise.race` with signal. |
| Token counts differ from current implementation | Medium | Medium | Extract existing logic verbatim into `collectChannelTokens`. Run before/after comparison on representative experiments. |
| Blueprint-based config resolution breaks | Low | Medium | Blueprint resolution logic (lines 498-521) moves into `runVariant` unchanged. It runs before `runToCompletion` and passes resolved values as config. |
| Concurrent aborts during multi-variant execution | Low | Low | Each variant gets its own `lab_*` channel ID. `abortDispatch` already scopes by channel. The `AbortController` passed to `runToCompletion` is per-experiment, shared across all variants — sequential execution means no race. |
| Lab `isLaboratory` flag behavior lost | Low | High | The `isLaboratory` flag is used in routes/channels.ts:63 for dynamic recreation and in experiments.ts:381 for cascading session deletion. It is not set on channel objects — it's derived from the `lab_` prefix. No behavior change since channels retain `lab_` prefix. |
| Frontend `activeSessionId` breaks | Low | Medium | `activeSessionId` is still set on each variant before execution (unchanged from current code). Session IDs are still `lab_run_*` format. |
