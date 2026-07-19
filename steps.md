## Phase 158: Sidebar Navigation Robustness
- [x] 158.1 Unified workspace active context transitions with a central useReducer inside useWorkspaceContext.ts
- [x] 158.2 Extracted single write-only localStorage persistence sync effect and URL context mapping sync logic
- [x] 158.3 Consolidated session-utils.ts predicate, body and path builders under a single resolved context type
- [x] 158.4 Refactored useSessionResolver to return loading/resolved states and prevent redundant redirect loops
- [x] 158.5 Eliminated callback props drilling by consuming useWorkspaceContext directly inside MainLayout, SessionSidebar and MobileBottomBar
- [x] 158.6 Verified strict TypeScript typecheck compilation and production builds of apps/client

## Phase 159: Fix Sidebar Navigation Flickering
- [x] 159.1 Refactored useWorkspaceContext.ts select callbacks and reducer initialization to prevent eager state changes conflicting with router transitions, resolving sidebar flickering.

## Phase 160: Fix Team Workspace Routing and Delegation UI
- [x] 160.1 Add teamId support to workspace endpoint and validateWorkspacePath in files.ts
- [x] 160.2 Propagate teamId from parent session metadata to delegated and subagent sessions in spawn-subagent-tool.ts and delegate-tool.ts
- [x] 160.3 Propagate activeTeam context parameter in ChatArea.tsx back navigation button and preserve team context in onOpenSubagentConsole callback
- [x] 160.4 Replace delegated session badge in ChatArea.tsx with the truncated task title from metadata
- [x] 160.5 Redesign delegate_task message UI in ToolCallRow.tsx to show task details and look consistent with spawn_subagent style
- [x] 160.6 Pass activeTeamId down from ChatArea through MessageList, ToolCallRow, ToolBody to ImageGrid and WorkspaceFileEditor
- [x] 160.7 Verify client and server compilation build checks

## Phase 161: Teams UI Improvements
- [x] 161.1 Resolve loading issue on Negotiation teams by returning null immediately instead of sending fallback sessions API call (useSessionResolver.ts)
- [x] 161.2 Update agent selection UI in AddTeamMemberModal / AddMemberModal to display agent ID and role clearly, avoiding name confusion
- [x] 161.3 Create TeamOrgTab.tsx and TeamOrgPage.tsx components to visualize team hierarchy flow
- [x] 161.4 Enable Org tab on workspace ContextTabBar for activeTeam contexts and add teams route path mapping
- [x] 161.5 Integrate header with members/settings buttons in Orchestration team view within TeamChatArea.tsx
- [x] 161.6 Verify full TypeScript client compilation build checks successfully

## Phase 162: Negotiation Team Session Support
- [x] 162.1 Lifted Orchestration-only constraint on POST /api/sessions and skipped starting agent sessions for Negotiation teams
- [x] 162.2 Refactored useSessionResolver to allow Negotiation team sessions to fall through to standard multi-session resolution
- [x] 162.3 Verified client and server compilation build checks successfully

## Phase 163: Robust Negotiation & Arbitration in Negotiation Teams
- [x] 163.1 Add quorumThreshold to NegotiationProtocolSchema and round to TeamMessageSchema
- [x] 163.2 Create TeamNegotiationEvaluator with vote classification and round outcome consensus logic
- [x] 163.3 Refactor handleTeamNegotiation to track round votes and evaluate consensus
- [x] 163.4 Integrate round numbers and consensus checks in runStatelessDebateLoop, removing hardcoded Spanish fallback
- [x] 163.5 Add unit test suite in team-negotiation.test.ts and verify all 110 server tests pass successfully

## Phase 164: Teams Support in manage_factory & Global Agent Prompt
- [x] 164.1 Add teams definition to FACTORY_CONTRACTS and allow custom actions via Record<string, ActionContract> actions type definition.
- [x] 164.2 Implement handleTeams handler in factory-tool.ts to handle CRUD, send, and member updates for teams.
- [x] 164.3 Wire teams to main execute switch in factory-tool.ts and add refresh hooks.
- [x] 164.4 Update DEFAULT_AGENTS_MD with section 4. Teams and add factory-teams skill content to default-factory-skills.ts.
- [x] 164.5 Verify server typechecks and existing team tests pass successfully.
