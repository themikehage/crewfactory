# Testing Plan for Laboratory (Manual & Automated)

## Priority Matrix

Tests are ordered by (1) judging relevance, (2) code complexity risk, (3) ease of implementation.

---

## Tier 1: Critical Path (negotiation + lab)

These are the features judges will evaluate directly. Bugs here = demo failure.

### 1.1 Negotiation State Machine (`negotiation-state.test.ts`) — 45 min

**File:** `apps/server/src/__tests__/negotiation-state.test.ts`

```typescript
describe("NegotiationStateMachine", () => {
  const config = {
    agreementPattern: "ACUERDO",
    counterPattern: "PERO",
    rejectPattern: "NO",
    maxRounds: 3,
  };

  it("detects agreement and sets status to agreed")
  it("detects counter-proposal and increments rounds")
  it("detects rejection and sets status to rejected")
  it("escalates after maxRounds with no pattern match")
  it("does not escalate before maxRounds")
  it("ignores messages on a closed pair (already agreed)")
  it("resets single pair to open state")
  it("resets all pairs to empty state")
  it("persists and restores from initial state")
  it("handles case-insensitive patterns")
  it("handles text with multiple patterns (first match wins)")
  it("returns pairKey correctly for ordered sender/receiver")
});
```

**Acceptance:** 12 tests passing, all state transitions verified.

### 1.2 Negotiation Handler Integration (`channel-negotiation-handler.test.ts`) — 30 min

**File:** `apps/server/src/__tests__/channel-negotiation-handler.test.ts`

```typescript
describe("handleNegotiation", () => {
  it("returns action 'continue' for a standard message")
  it("returns action 'stop-agreed' when agreement detected")
  it("returns action 'stop-rejected' when rejection detected")
  it("returns action 'escalate' with escalation message and arbiter member")
  it("returns 'continue' when channel has no negotiationProtocol")
  it("broadcasts channel_negotiation_round event on each ingest")
  it("broadcasts channel_negotiation_agreement event on agreement")
  it("broadcasts channel_negotiation_escalation event on escalation")
  it("persists negotiation state after each ingest")
  it("resets negotiation state on new user message dispatch")
});
```

**Acceptance:** 10 tests passing. All WS events verified via mock broadcast.

### 1.3 Scoring Engine (`scoring.test.ts`) — 20 min

**File:** `apps/server/src/__tests__/scoring.test.ts`

```typescript
describe("calculateVariantScores", () => {
  it("returns 100 taskQuality and 100 globalScore for perfect single agent")
  it("penalizes efficiency when multi-agent is slower than baseline")
  it("scores negotiation high when agreement reached early")
  it("penalizes negotiation when escalations occurred")
  it("returns undefined negotiationScore for single agent variant")
  it("weighs taskQuality at 60% for single, 50% for multi")
  it("clamps all scores between 0 and 100")
  it("handles baseline with zero durationMs (division by zero safe)")
  it("preserves judgeDetail when provided (reasoning + criteriaScores)")
});
```

**Acceptance:** 9 tests passing. All edge cases covered.

---

## Tier 2: Demo Reliability (MCP + WS)

### 2.1 MCP Client Connectivity (`mcp-client.test.ts`) — 30 min

**File:** `apps/server/src/__tests__/mcp-client.test.ts`

```typescript
describe("McpClient", () => {
  it("connects to stdio server and lists tools")
  it("calls a tool and returns result")
  it("handles server crash gracefully with error")
  it("times out on stalled request")
  it("connects to HTTP server via SSE")
  it("rejects unknown server transport")
  it("cleans up stdio subprocess on disconnect")
  it("handles malformed JSON response from server")
});
```

**Acceptance:** 8 tests passing. Use mock subprocess for stdio, mock fetch for HTTP.

### 2.2 MCP Registry (`mcp-registry.test.ts`) — 20 min

**File:** `apps/server/src/__tests__/mcp-registry.test.ts`

```typescript
describe("McpRegistry", () => {
  it("loads catalog with 10 predefined servers")
  it("registers a custom server configuration")
  it("connects a global client to a configured server")
  it("lists tools from a connected server")
  it("generates tool definitions with mcp_ prefix")
  it("handles migration from npx to bunx command")
  it("disconnects and cleans up all clients on stopAll")
});
```

**Acceptance:** 7 tests passing.

### 2.3 WebSocket Factory (`ws-factory.test.ts`) — EXISTS, needs audit — 15 min

**File:** `apps/server/src/__tests__/ws-factory.test.ts` (already exists)

Verify existing tests cover:
- [ ] Cookie-based auth extraction from rawHeaders
- [ ] fallback sync DB lookup for programmatic tokens
- [ ] Transactional auto-subscribe on prompt
- [ ] Pong timeout handling

Add any missing cases. **Target: 12+ tests passing.**

---

## Tier 3: End-to-End Validation (manual + scripted)

### 3.1 Lab End-to-End Smoke Test — 15 min

Manual verification checklist:

```
[ ] Create experiment from AutoConsulting blueprint
[ ] Experiment appears in list with correct 3 variants
[ ] Run experiment — all 3 variants complete without errors
[ ] Variant A (single) completes with taskQuality + efficiencyScore
[ ] Variant B (multi_no_leader) completes with negotiationScore populated
[ ] Variant C (multi_with_leader) completes with agreementReached=true
[ ] LLM-Judge runs and populates judgeReasoning + criteriaScores
[ ] Comparativa tab shows all 3 variants with scores
[ ] Variant C has crown icon (highest globalScore)
[ ] Export to workspace creates agents + channel
[ ] Exported channel has negotiationProtocol in settings
[ ] Exported channel opens in Org Chart with hierarchy
```

### 3.2 Channel Negotiation End-to-End — 15 min

Manual verification:

```
[ ] Create channel with negotiationProtocol (agreement/counter/reject patterns, maxRounds=3)
[ ] Add 3 agents with distinct roles
[ ] Send user message
[ ] Verify agents respond in round-robin
[ ] Verify "Ronda 1/3" badge appears
[ ] Verify agreement badge appears when agent says "ACUERDO"
[ ] Verify chain stops after agreement
[ ] Verify escalation fires when 3+ rounds with no agreement
[ ] Verify arbiter agent receives escalation message
[ ] Verify negotiation-state.json is written to disk
```

---

## Test Execution

```bash
# Run all tests
cd apps/server && bun test

# Run specific test files
bun test src/__tests__/negotiation-state.test.ts
bun test src/__tests__/scoring.test.ts
bun test src/__tests__/mcp-client.test.ts

# Run with coverage
bun test --coverage
```

## Estimated Total Effort

| Tier | Tests | Time |
|---|---|---|
| T1: Negotiation + Scoring | 31 tests | 1h 35m |
| T2: MCP + WS | 15+ tests | 1h 05m |
| T3: E2E Manual | 23 checks | 30 min |
| **Total** | **46+ tests** | **~3h 10m** |

---

## What NOT to Test (out of scope for hackathon)

- Channel orchestrator full integration (too complex to mock, E2E manual verification suffices)
- Laboratory experiment runner (covered by E2E manual smoke test)
- Agent session (already has `agent-session.test.ts` with 144 lines of tests)
- Permission engine (low hackathon relevance)
- Factory tool contracts (already has `factory-contracts.test.ts`)
- Frontend components (use manual E2E verification)
