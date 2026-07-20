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

## Phase 165: Session Observability MVP (Phases 1-3)
- [x] 165.1 Implement computeAndPersistMetrics in metadata-store.ts and hook it in session-event-publisher.ts on agent_end event
- [x] 165.2 Extend SessionListItem and SessionSchema in shared packages with metrics fields
- [x] 165.3 Optimize session-lister.ts messageCount reading from metadata and map metric fields for regular and virtual sessions
- [x] 165.4 Update GET /api/sessions endpoint in Hono to support search, filtering, pagination, and sorting
- [x] 165.5 Implement GET /api/sessions/:id/export endpoint in Hono supporting JSON, JSONL, and Markdown formats with 10MB limit
- [x] 165.6 Integrate Export dropdown button in MainLayout.tsx workspace toolbar for direct downloads
- [x] 165.7 Verify TypeScript build compilation of both apps/server and apps/client successfully

## Phase 166: Session Observability (Fases 4-7)
- [x] 166.1 Add executionId, turnCount, schedulingMode, and archived flags to SessionSchema in packages/shared/src/schemas.ts
- [x] 166.2 Update SessionListItem type and listSessions in apps/server/src/core/session/session-lister.ts, calculating turnCount dynamically for CLI executions
- [x] 166.3 Implement autoCleanupSessions method in SessionManager and hook it in index.ts startup and 12-hour interval
- [x] 166.4 Create analytics and batch routes in routes/sessions.ts and channels analytics routes in routes/channels.ts
- [x] 166.5 Build global AnalyticsPage dashboard with date filters and composed charts
- [x] 166.6 Create SessionTimeline component for vertical milestone rendering and integrate in ChatArea
- [x] 166.7 Integrate internal tabs (Chat, Analytics, Swimlanes) in ChannelDetailPage, rendering parallel rows and connecting turns with an SVG path
- [x] 166.8 Verify client and server compilation build checks

## Phase 167: Image Pipeline Optimization (Fases 1, 3, 6)
- [x] 167.1 Crear utilidad cache-headers.ts para aplicar headers HTTP (Cache-Control, ETag, Last-Modified) y manejar responses 304 Not Modified
- [x] 167.2 Integrar caching HTTP en endpoints de assets del workspace y archivos de sesión en files.ts, y en endpoint de avatar de agentes en agents.ts
- [x] 167.3 Modificar backend (auth.ts) para exponer el token de sesión en /api/auth/status, /api/auth/login y /api/auth/register
- [x] 167.4 Guardar y exponer el token de sesión en el cliente a través de AuthContext.tsx
- [x] 167.5 Crear file-urls.ts con una utilidad consolidada de resolución de URLs (resolveFileUrl) que soporte todos los contextos
- [x] 167.6 Simplificar AuthenticatedImage en ImageGrid.tsx para usar etiquetas <img> nativas con ?token=..., permitiendo caching nativo de navegador y reduciendo overhead
- [x] 167.7 Migrar todas las llamadas del cliente de resolveImageUrl y resolveFileUrl a la nueva utilidad consolidada en ImageGrid.tsx, ToolResultInspector.tsx, MessageBlocks.tsx y MessageList.tsx
- [x] 167.8 Verificar la compilación de producción de client y server

## Phase 168: Migrate Lab to Negotiation Teams and Remove Channels
- [x] 168.1 Removed Channels from Sidebar Accordion, mobile bottom bar, and general navigation views
- [x] 168.2 Reduced Laboratory to two execution variants: Baseline (single) and Negociación (multiWithLeader)
- [x] 168.3 Created LabNegotiationRunner implementing Team Negotiation Engine loop with virtual teams
- [x] 168.4 Mapped stream event protocols dynamically to maintain full visual backward-compatibility in client chat viewers
- [x] 168.5 Updated LabJudge.evaluateRuns to dynamically evaluate only the two active variants if the horizontal one is omitted
- [x] 168.6 Verified all 110 server tests and client production build successfully

## Phase 169: Fix TypeScript Type Errors
- [x] 169.1 Resolved all 31 compiler type errors on apps/server and packages/shared
- [x] 169.2 Confirmed strict typecheck compilation and verified all 110 tests pass cleanly

## Phase 170: Project and Team Avatar Support
- [x] 170.1 Add avatarUrl fields to TeamSchema, CreateTeamSchema, and update team-store persistence on server
- [x] 170.2 Update project route handlers (GET, POST, PATCH) in files.ts to read/save avatarUrl to project.json
- [x] 170.3 Add team support to EntityAvatar.tsx and useWorkspaceContext active context typings
- [x] 170.4 Render EntityAvatar for projects and teams in SessionSidebar, TeamDetailPage, TeamChatArea, and TeamCard
- [x] 170.5 Add avatarUrl configuration inputs in TeamsPage create dialog and TeamSettingsModal settings dialog
- [x] 170.6 Update main layout breadcrumbs structure and verify client and server compilation build checks

## Phase 171: Complete Channels Elimination and Full Teams Migration
- [x] 171.1 Removed channel references from all backend routes, storage mechanisms, and WebSocket loops
- [x] 171.2 Migrated laboratory export mechanism to output exclusively to Team entities
- [x] 171.3 Swapped all client routers, hooks, and pages (Analytics, Kanban, Dashboard, Delegations) from channels to teams
- [x] 171.4 Removed legacy senior/channel references in flow layout components (Canvas, Mobile, Node, Panel)
- [x] 171.5 Confirmed 0 errors on production builds of apps/client and verified existing server tests pass successfully

## Phase 172: Modal Alignment and Settings Standardization
- [x] 172.1 Create unified AvatarUploadField component supporting default and custom avatar uploads
- [x] 172.2 Implement server endpoints for project and settings avatar management and settings prompts
- [x] 172.3 Extract ProjectCreateModal, TeamCreateModal, and GlobalAgentSettingsModal components
- [x] 172.4 Standardize ProjectSettingsModal and TeamSettingsModal with AvatarUploadField and deletion Danger Zones
- [x] 172.5 Redesign ProjectsPage and TeamsPage layouts, removing inline edit forms and card gear configurations
- [x] 172.6 Clean up AgentsPage cards, removing direct edit buttons and simplifying page states
- [x] 172.7 Wire settings gears, custom Factory names and custom Factory avatars to MainLayout, Sidebar and Breadcrumbs
- [x] 172.8 Verify client builds successfully and all flows align to the new unified design system

## Phase 173: Orchestration Team Multi-Session & Streaming Alignment
- [x] 173.1 Remove custom orchestration-session hardcoding from useSessionResolver.ts so Orchestration teams resolve to standard UUID sessions.
- [x] 173.2 Update ChatArea.tsx send function to route Orchestration team messages via native WS prompts directly.
- [x] 173.3 Add params.sessionId support to the team send action in factory-tool.ts to avoid defaulting to a single global session.
- [x] 173.4 Confirm client build runs clean with 0 compilation errors.

