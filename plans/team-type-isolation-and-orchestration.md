# Team Type Isolation and Orchestration Delegation

## Objective

Make `Negotiation` and `Orchestration` two irreversible Team creation choices, and make an Orchestration leader coordinate its registered members through real `delegate_task` tool calls rather than `@` mentions.

## Findings (2026-07-19)

1. **Team type is currently mutable end-to-end.** `UpdateTeamSchema` accepts `teamType`, `TeamSettingsModal` lets the user select either type, `PATCH /api/teams/:id` persists it, and `TeamStore.updateTeam()` applies it. Existing tests explicitly assert that switching works.
2. **Orchestration is a leader-only stateless stub.** `TeamOrchestrator.runOrchestrationLoop()` calls `TeamPromptRunner.runStateless()` only once for the leader; it never invokes team specialists or gathers their results.
3. **The active prompt is a Channel prompt, not an Orchestration prompt.** Teams reuse `channel-member` composition with a broadcast deployment. `role.leader.delegation` directs the leader to use `@Name`, and `instance.channel.roster` states that mentions activate participants. Neither is true in Teams.
4. **Changing the wording alone cannot enable delegation.** `runStateless()` uses `streamSimple()` without an agent tool-execution loop, so the leader cannot call `delegate_task`. Although the standard tool activation engine exposes that tool to normal agent sessions, stateless Team calls do not receive or execute it.
5. **The existing session and delegation infrastructure already fits Orchestration.** `SessionManager.getOrCreateSession()` accepts a workspace override, and `delegate_task` already provides cancellation, depth limits, structured result envelopes, and event forwarding. Today an agent-target delegation opens the target agent's workspace, so it needs a shared-workspace override and a Team member allowlist.

## Design Decisions

- `teamType` is selected only in creation. Legacy Teams without it remain `Negotiation` through the current compatibility fallback.
- `Negotiation` retains stateless parallel debate and the negotiation/arbitration configuration.
- `Orchestration` is a persistent agent session owned by the Team leader. It reuses the standard chat/session lifecycle, tool UI, history, delegation cards, permissions, and cancellation behavior instead of a Team-specific execution loop.
- Every Orchestration Team owns one shared workspace. The owner and every delegated member operate in that same workspace for the lifetime of the Team session.
- `lead` identifies the owner agent; all other members are allowed delegation targets. The owner prompt receives their agent id, display name, role, and concise capability summary.
- Use a Team-specific prompt assembly mode and fragments. Do not change the Channel fragments: channels remain mention-driven and broadcast/targeted as they are today.
- Reuse `delegate_task(targetType: "agent", targetId: member.agentId, task)` for execution, constrained to the configured Team members. Do not add a Team-specific transport or infer calls from textual `@mentions`.

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

### Phase 154C: Persistent Orchestration Session and Shared Workspace

- Create one persistent owner session for an Orchestration Team (stable Team-derived session id, bound to the `lead` agent) instead of calling `TeamPromptRunner.runStateless()`. The Team detail route should reuse the standard session chat, streaming, tool logs, delegation cards, history, permissions, and abort controls.
- Resolve and persist one Team workspace, then pass it as `SessionOverrides.workspaceDir` to the owner session. The current session manager supports this override, so no parallel workspace system is needed.
- Extend the `delegate_task` construction context with an optional inherited workspace and permitted agent-id set. For an Orchestration owner, agent-target delegations must use the Team workspace override and reject targets outside the Team's non-lead members.
- Add a Team orchestration prompt context containing the owner identity and a roster of permitted delegates: agent id, name, role, and capability summary. Require `delegate_task` for work delegation and explicitly prohibit `@` mentions as a dispatch mechanism.
- Keep delegation results on the owner session's normal continuation queue; its existing result envelopes and tool UI become the Team's specialist reports without translating them through Team stateless messages.
- Make the Team abort action abort the owner session and recursively cancel its `delegationRegistry` descendants. Preserve the existing depth and permission protections.

### Phase 154D: Verification and Documentation

- Unit-test immutable type behavior, team-specific prompt selection, membership validation, delegation result aggregation, and abort propagation.
- Add an integration test proving the owner session delegates to a listed specialist by id in the Team workspace, receives its envelope, and produces the final response without `@` activation.
- Build server, shared package, and client; update `about.md` and mark the related steps complete after implementation.

## Acceptance Criteria

- A Team's type cannot be changed after creation through the UI, API, schema, or store.
- Negotiation Teams run only the stateless debate/consensus path; Orchestration Teams open only their persistent owner-session path.
- The Orchestration leader has an accurate member roster and uses executable `delegate_task` calls with team-member ids.
- Textual `@member` mentions do not trigger or stand in for delegation in Orchestration.
- Delegated results, failures, and cancellation are visible through the reused session chat/tool UI, and the owner can synthesize them.
