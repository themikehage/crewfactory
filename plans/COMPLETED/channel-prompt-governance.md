COMPLETED

# Channel Prompt Governance: Enforce Team Policies Over Agent Preferences

## Status: Draft

## Objective

Make channel policies reliable regardless of an individual agent's stylistic prompt. A channel must be able to require concise contributions, turn discipline, output ownership, and negotiation protocol without relying on the model to resolve conflicting prose.

## Audit Evidence

- The current composer concatenates identity, role, instance, protocol, and output fragments as text. The agent's custom system prompt is embedded in the identity layer rather than constrained by a formal priority model.
- Channel prompt appends are cached by agent/channel; role, membership, reply mode, protocol, and output-mode changes do not have an explicit invalidation contract.
- Execution eligibility is partly encoded in prompts and partly in runtime routing, leaving ambiguous responsibility for silence, brevity, and final-answer ownership.

## Product Contract

Channel policy is an explicit, versioned control plane. Runtime routing enforces what can be decided deterministically; prompts express only the remaining judgement. The effective prompt is inspectable, attributable, and tied to the channel configuration version used by a turn.

## Policy Precedence

1. Platform safety and tool permissions.
2. Channel execution policy: topology, turn ownership, output ownership, limits, and mandatory protocol.
3. Channel role policy: leader, specialist, reviewer, observer, arbiter.
4. Agent identity and domain expertise.
5. Task-local instructions and skills.

Lower layers may add detail but cannot negate a higher-layer policy.

## Implementation Phases

### Phase 1: Typed policy model

1. Define shared schemas for channel behaviour policy: contribution budget, required response condition, handoff semantics, final-owner rule, negotiation protocol, and output contract.
2. Move deterministic rules out of natural-language prompts: eligibility, maximum turns, final-answer ownership, and observer suppression stay in the scheduler.
3. Define policy conflicts and a compiler that fails closed for incompatible topology/policy combinations.

### Phase 2: Prompt assembly and cache correctness

1. Refactor the composer to emit structured prompt segments with source, priority, channel version, and checksum.
2. Render the final model prompt in priority order with an explicit non-override section for channel policy.
3. Replace the implicit prompt cache with a key containing channel configuration version, member assignment version, agent prompt version, skills revision, and workspace instruction revision.
4. Invalidate or rebuild cached appends on every relevant channel/member/agent update.

### Phase 3: Contribution protocol

1. Define concise, machine-parseable contribution envelopes for specialists: contribution, confidence, evidence, requested handoff, and optional blocking issue.
2. Require the leader/arbiter to synthesize the final answer; specialists should not independently claim completion unless topology permits it.
3. Add model-agnostic fallback handling when an agent violates the contract: label the turn as non-conformant, preserve it, and continue or stop according to policy.

### Phase 4: Explainability and authoring UX

1. Add an effective-policy inspector showing the active topology, hard rules, role rules, agent prompt contribution, and final compiled prompt checksum.
2. Add linting when an agent prompt conflicts with channel policy, with fixes such as “move detailed reporting to leader only”.
3. Show the policy/version used on each execution for reproducible diagnosis.

## Verification

- Unit tests for precedence, conflict detection, cache invalidation, and compilation determinism.
- Prompt-fixture tests covering detailed agents in concise channels, observers, leaders, arbiters, and custom expert-mode channels.
- Integration tests confirming channel configuration changes take effect on the next turn without restart.

## Acceptance Criteria

- A verbose agent cannot bypass a channel's concise-contribution policy.
- Only the configured final owner emits a final team answer in leader-owned topologies.
- The effective policy and prompt version for any turn are inspectable.
- Updating a channel's topology, role, or protocol changes the next prompt deterministically.

## Dependencies

- Should be designed alongside the topology model and integrated with the execution scheduler before changing production defaults.
