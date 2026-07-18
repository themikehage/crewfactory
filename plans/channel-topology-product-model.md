# Channel Topology Product Model: Safe Team Configuration

## Status: Draft

## Objective

Replace free-form role and `replyMode` combinations with validated, understandable team topologies. Users should choose an intended collaboration pattern, not reverse-engineer dispatch rules.

## Audit Evidence

- A channel becomes broadcast when any member is configured as `broadcast`, even if other members are configured for another interaction model.
- Role and reply mode are edited independently; targeted members can have no targets and teams can have no viable initial recipient.
- The current UI exposes implementation choices without explaining whether a configuration will respond, debate, delegate, or produce a final answer.

## Product Contract

Every channel has a `topology` with a versioned configuration. The product validates it before save and displays its execution semantics in plain language.

Initial supported topologies:

| Topology | Purpose | Default execution |
|---|---|---|
| `leader_specialists` | A leader owns the final response and delegates targeted input to specialists. | Sequential, leader-gated |
| `sequential_review` | Specialists review a shared draft in a fixed order. | Sequential |
| `roundtable` | Peers contribute independently to one task. | Sequential by default; parallel is advanced opt-in |
| `debate_with_arbiter` | Two or more positions negotiate; a designated arbiter resolves divergence. | Sequential, protocol-gated |
| `mention_only` | A human explicitly calls agents when required. | Mention-triggered |

## Non-Goals

- Do not remove advanced custom configurations; move them behind an explicit expert mode.
- Do not alter the actual prompt hierarchy in this plan.

## Implementation Phases

### Phase 1: Canonical topology schema

1. Add a discriminated shared schema for topology kind, member assignments, scheduler policy, entry point, terminal owner, and optional arbiter.
2. Define invariants: one leader where required, unique arbiter, no self-targeting, all targeted members reachable, at least one user-reachable entry member, and no incompatible mixed scheduler modes.
3. Add a topology validator that returns structured diagnostics and suggested repairs rather than generic validation errors.
4. Migrate legacy member-level configuration by inferring a topology only when unambiguous; otherwise mark it `legacy_custom` and require review.

### Phase 2: Configuration UX

1. Replace the first-level role/reply-mode editor with a topology picker and a short behaviour preview.
2. Build guided member assignment screens per topology, exposing only valid choices.
3. Show a live execution preview: who receives a user message first, who can respond next, and who delivers the final output.
4. Retain a guarded expert mode for legacy/custom routing; validate and explain every warning before save.

### Phase 3: Runtime adoption

1. Make the scheduler consume topology semantics rather than infer global behaviour from one member's `replyMode`.
2. Explicitly reject invalid channel updates on the server, including programmatic `manage_factory` operations.
3. Record the selected topology version in each execution so historical runs remain interpretable after future changes.

### Phase 4: Templates and migration experience

1. Provide production-ready templates for common teams, including the Facebook content team shown in the audit conversation.
2. Offer an in-app migration review for existing channels, displaying the inferred topology, warnings, and a safe rollback point.
3. Add import/export support for topology definitions with schema versioning.

## Verification

- Schema and property tests covering invalid graphs, reachability, uniqueness, and migration classification.
- Server route tests proving invalid topology updates cannot be persisted.
- UI tests for guided setup and execution-preview accuracy.
- E2E tests for one complete run of every supported topology.

## Acceptance Criteria

- A standard channel can be configured without exposing raw reply modes.
- The product explains the first recipient, the turn order, and final owner before the user sends a message.
- Invalid or non-responsive teams cannot be saved without an explicit expert-mode acknowledgement.
- Existing channels have a non-destructive migration path.

## Dependencies

- Relies on the execution protocol plan for deterministic scheduler modes and execution visibility.

