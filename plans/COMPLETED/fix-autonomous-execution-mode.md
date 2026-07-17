COMPLETED
# Implementation Plan - Fix Autonomous Execution Mode in Chat

This plan fixes the issue where enabling "Autonomous" mode in a chat session does not work (it keeps asking for confirmation for all commands).

## Root Cause

1. **Frozen Hook Parameter**: In `session-manager.ts`, the `beforeToolCall` hook is created with a static `executionMode` resolved from the session's metadata *at initialization time*. Even when the user toggles the mode in the frontend, the hook continues using the old cached parameter.
2. **Missing Delegation Inheritance**: Spawning subagents or delegating tasks from an autonomous main session defaults the child sessions back to "builder" / "standard" mode instead of inheriting the parent's autonomous setting.

## Proposed Changes

### Core Session & Sandbox

#### [MODIFY] [before-tool-call-hook.ts](file:///c:/Users/themi/AgentWorkspace/crewfactory/apps/server/src/core/session/before-tool-call-hook.ts)
- Modify `createBeforeToolCallHook` to dynamically read `executionMode` from `metadata.json` first, only falling back to the parameter `executionMode` if it is not present in the metadata. This allows the hook to instantly reflect the new mode when toggled in the UI.

### Agent Tools

#### [MODIFY] [spawn-subagent-tool.ts](file:///c:/Users/themi/AgentWorkspace/crewfactory/apps/server/src/core/tools/spawn-subagent-tool.ts)
- Modify the subagent spawning logic to inherit `"autonomous"` mode from the parent session if the parent is in autonomous mode and no explicit type is provided by the agent.

#### [MODIFY] [delegate-tool.ts](file:///c:/Users/themi/AgentWorkspace/crewfactory/apps/server/src/core/tools/delegate-tool.ts)
- Modify the delegation logic to propagate the parent session's `"autonomous"` mode to the delegated child session.

## Verification Plan

### Automated Tests
- Run existing permission/subagent tests to ensure no regressions:
  ```bash
  bun test src/__tests__/subagent-permissions.test.ts src/__tests__/subagent-permission-inheritance.test.ts
  ```

### Manual Verification
- Verify that toggling between Standard and Autonomous modes in the chat UI dynamically updates the permissions without restarting the session.
