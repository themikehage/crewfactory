# Channel Production Verification and Rollout

## Status: Draft

## Objective

Establish the test, observability, migration, and rollout discipline required to safely ship the channel runtime, topology, and prompt-governance changes.

## Audit Evidence

- CodeGraph reports no dedicated coverage for the orchestrator, prompt runner, channel hook, or core channel rendering components.
- Current failures are mostly asynchronous and cross-layer, so compile checks alone cannot prove correctness.

## Quality Gates

No production-default change is released until it passes deterministic runtime tests, WebSocket recovery tests, client rendering tests, scenario E2E tests, telemetry validation, and a controlled rollout.

## Implementation Phases

### Phase 1: Observability baseline

1. Define structured logs and metrics around execution, turn, event sequence, queue latency, skipped turns, model failures, tool terminal states, negotiation outcomes, and reconnect recovery.
2. Add correlation IDs from incoming `channel_send` through WebSocket broadcasts, persistence, and frontend diagnostics.
3. Build an internal execution inspector that can reconstruct a run without reading raw server logs.

### Phase 2: Test harness

1. Add deterministic fake-agent and fake-tool fixtures that stream controlled tokens, thinking, tool updates, failures, silence, and delays.
2. Build server integration tests for scheduler ordering, topology validation, negotiation/arbitration, abort, reconnect, and prompt cache invalidation.
3. Add client reducer/component tests for event ordering, deduplication, gap recovery, tool lifecycle, and terminal-state rendering.
4. Add E2E reference scenarios for leader-specialists, sequential review, roundtable, debate with arbiter, and the Facebook content team.

### Phase 3: Migration and release controls

1. Add feature flags for execution protocol, topology UX, prompt governance, and event-stream client.
2. Write forward-only data migrations with preflight validation, backups, idempotency, and an explicit legacy-custom fallback.
3. Run shadow executions where safe: compare legacy and new scheduler projections without changing user-visible output.
4. Define rollback boundaries per flag; do not require data rollback to restore the legacy renderer.

### Phase 4: Progressive rollout

1. Enable the new protocol for internal/test channels first, then selected opt-in users, then a staged percentage of new channels.
2. Track error rate, unclosed execution rate, event gaps, tool terminal-state coverage, time to final answer, and user abort rate.
3. Set launch thresholds and automatic rollback conditions before each stage.
4. Publish operational runbooks for stalled executions, event gaps, migration anomalies, and model-provider errors.

## Acceptance Criteria

- All critical runtime paths have automated coverage, including failure and recovery paths.
- Dashboards can identify an execution stuck without a terminal state within minutes.
- A flagged rollback restores stable behaviour without data loss.
- The production launch is backed by measurable SLOs and documented incident response.

## Dependencies

- Coordinates the rollout of the execution protocol, topology product model, and prompt-governance plans.

