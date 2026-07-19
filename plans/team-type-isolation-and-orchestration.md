# Team Type Isolation and Orchestration Delegation

## Objective

Make `Negotiation` and `Orchestration` two irreversible Team creation choices, and make an Orchestration leader coordinate its registered members through real `delegate_task` tool calls rather than `@` mentions.

## Findings (2026-07-19)

1. **Team type is currently mutable end-to-end.** `UpdateTeamSchema` accepts `teamType`, `TeamSettingsModal` lets the user select either type, `PATCH /api/teams/:id` persists it, and `TeamStore.updateTeam()` applies it. Existing tests explicitly assert that switching works.
2. **Orchestration is a leader-only stub.** `TeamOrchestrator.runOrchestrationLoop()` calls `TeamPromptRunner.runStateless()` only once for the leader; it never invokes team specialists or gathers their results.
3. **The active prompt is a Channel prompt, not an Orchestration prompt.** Teams reuse `channel-member` composition with a broadcast deployment. `role.leader.delegation` directs the leader to use `@Name`, and `instance.channel.roster` states that mentions activate participants. Neither is true in Teams.
4. **Changing the wording alone cannot enable delegation.** `runStateless()` uses `streamSimple()` without an agent tool-execution loop, so the leader cannot call `delegate_task`. Although the standard tool activation engine exposes that tool to normal agent sessions, stateless Team calls do not receive or execute it.
5. **The existing `delegate_task` contract is usable for Team members.** It supports `targetType: "agent"`, an agent id, cancellation, depth limits, structured result envelopes, and forwarding of tool events. Orchestration must give the leader a parent execution session capable of running this tool and translate its results into Team messages/streaming.

## Design Decisions

- `teamType` is selected only in creation. Legacy Teams without it remain `Negotiation` through the current compatibility fallback.
- `Negotiation` retains stateless parallel debate and the negotiation/arbitration configuration.
- `Orchestration` has exactly one `lead`; all other members are selectable delegation targets. Its leader receives a dedicated Team roster with agent id, display name, role, and concise role/system-prompt capability summary.
- Use a Team-specific prompt assembly mode and fragments. Do not change the Channel fragments: channels remain mention-driven and broadcast/targeted as they are today.
- Reuse `delegate_task(targetType: "agent", targetId: member.agentId, task)` for execution. Do not add a Team-specific transport or infer calls from textual `@mentions`.

## Implementation Plan

### Phase 154A: Lock the Team Type

- Remove `teamType` from `UpdateTeamSchema`; it remains required/optional only in `CreateTeamSchema`.
- Add defense in `TeamStore.updateTeam()` that ignores or rejects a supplied `teamType`, protecting direct/internal callers as well as HTTP.
- Reject `teamType` in `PATCH /api/teams/:id` with a clear 400 error before storage mutation.
- Replace the editable type selector in `TeamSettingsModal` with an immutable, localized type badge/explanation. Do not include `teamType` in its save payload.
- Hide/disable negotiation-only settings for Orchestration; preserve existing negotiation settings only for Negotiation Teams.
- Update the prior switching test into regression tests covering schema, route/store guard, and UI request payload behavior.

### Phase 154B: Team-Specific Prompts

- Add an `orchestration-team` assembly mode (or an equivalent explicit Team deployment kind) to `prompt-assembly.ts` and `PromptComposer`.
- Add isolated orchestration fragments:
  - A leader contract requiring task decomposition, delegation through `delegate_task`, result review, and final synthesis.
  - A roster declaring each registered member's `agentId`, name, role, and capability summary, with explicit target examples.
  - An explicit prohibition on using `@mentions` to delegate and on treating roster members as an ambient broadcast channel.
- Ensure Negotiation keeps its current stateless debate prompt, with a team-neutral roster that does not promise mention activation.
- Add prompt composition tests proving the Orchestration leader sees its roster and tool-only delegation rule, while Channel leader prompts remain unchanged.

### Phase 154C: Tool-Capable Orchestration Runtime

- Introduce an isolated per-dispatch orchestration parent session (or a dedicated tool-capable Team runner) for the leader. It must accept the Team-composed system prompt, have the standard tool activation set, and not reuse/mutate the leader agent's normal chat history.
- Wire `delegate_task` into that parent context and expose only current non-lead Team members as valid `targetType: "agent"` targets. Validate target membership server-side so a leader cannot delegate outside its Team through this path.
- Map delegated lifecycle events and structured results to Team WebSocket events/messages, including tool start/end/error and specialist reports, so the Team UI shows why and to whom work was delegated.
- Feed completed delegation summaries back to the leader in the same orchestration turn (or explicit bounded follow-up turns), then persist and broadcast its final synthesis as the leader Team message.
- Make abort propagate from `team_abort` to the orchestration parent and its `delegationRegistry` descendants; retain session/depth/permission protections.

### Phase 154D: Verification and Documentation

- Unit-test immutable type behavior, team-specific prompt selection, membership validation, delegation result aggregation, and abort propagation.
- Add an integration test with a mocked tool-capable runner that proves the leader delegates to a listed specialist by id, receives its envelope, and produces the final Team response without `@` activation.
- Build server, shared package, and client; update `about.md` and mark the related steps complete after implementation.

## Acceptance Criteria

- A Team's type cannot be changed after creation through the UI, API, schema, or store.
- Negotiation Teams run only the debate/consensus path; Orchestration Teams run only the leader/delegation path.
- The Orchestration leader has an accurate member roster and uses executable `delegate_task` calls with team-member ids.
- Textual `@member` mentions do not trigger or stand in for delegation in Orchestration.
- Delegated results, failures, and cancellation are visible in the Team conversation and the leader can synthesize them.
