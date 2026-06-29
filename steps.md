# Pi Web Wrapper - Development Steps

## Phase 1: Research & Design
- [x] 1.0 Brainstorming requirements
- [x] 1.1 Research pi SDK integration
- [x] 1.2 Design system (palette, typography)
- [x] 1.3 Architecture design (API, components, data flow)

## Phase 2: Critical Files
- [x] 2.1 Create about.md
- [x] 2.2 Create steps.md
- [x] 2.3 Create AGENTS.md

## Phase 3: Project Setup
- [x] 3.1 Initialize monorepo structure
- [x] 3.2 Setup root package.json
- [x] 3.3 Setup server (Hono + pi SDK)
- [x] 3.4 Setup client (React + Vite + Tailwind)
- [x] 3.5 Setup shared package
- [x] 3.6 Install dependencies
- [x] 3.7 Validate builds

## Phase 4: Authentication
- [x] 4.1 Backend auth routes (login, me)
- [x] 4.2 JWT middleware
- [x] 4.3 Frontend AuthContext
- [x] 4.4 Login page component
- [x] 4.5 Protected routes

## Phase 5: WebSocket Integration
- [x] 5.1 Backend WebSocket handler
- [x] 5.2 Frontend WebSocket client
- [x] 5.3 Event types and handlers
- [x] 5.4 Reconnection logic

## Phase 6: Pi SDK Integration
- [x] 6.1 Session manager (create, get, destroy)
- [x] 6.2 Prompt endpoint
- [x] 6.3 Event streaming
- [x] 6.4 Abort functionality

## Phase 7: Frontend UI
- [x] 7.1 Layout components (Header, Sidebar, Main)
- [x] 7.2 Chat components (MessageList, InputArea)
- [x] 7.3 Message rendering (user, assistant, tool calls)
- [x] 7.4 Streaming UI
- [x] 7.5 Session management UI
- [x] 7.6 Model selector

## Phase 8: Polish
- [ ] 8.1 Responsive design (375px, 768px, 1280px)
- [ ] 8.2 Loading states
- [ ] 8.3 Error handling
- [x] 8.4 Keyboard shortcuts (Enter=send/steer, Alt+Enter=follow_up, Escape=cancel)
- [ ] 8.5 Accessibility

## Phase 9: Docker & Deployment
- [x] 9.1 Create Dockerfile
- [x] 9.2 Create docker-compose.yml (dev)
- [x] 9.3 Deploy to Coolify
- [x] 9.4 Configure environment variables
- [x] 9.5 Verify deployment

## Phase 10: Prompts & Skills
- [x] 10.1 Implement API route for session skills
- [x] 10.2 Implement frontend SkillsSelector in Chat Input
- [x] 10.3 Implement API route for global workspace skills
- [x] 10.4 Implement standalone Skills Library page

## Phase 11: Persistent User Workspace
- [x] 11.1 Shared file schema types
- [x] 11.2 Run agent CWD in user-level workspace folder
- [x] 11.3 Workspace file operations API (GET, PUT, POST, DELETE, PATCH)
- [x] 11.4 Collapsible Workspace Explorer panel and code editor inside front web

---

## Phase 12: Workspace Organizado y Agentes Híbridos
- [x] 12.1 Shared Types & Schemas con `repoName`
- [x] 12.2 Inicialización de workspace con subcarpetas (`repos`, `assets`, `memories`)
- [x] 12.3 Persistencia de metadatos de sesión en `metadata.json`
- [x] 12.4 CWD de agente y scoping de repositorio dinámicos en backend
- [x] 12.5 Componente Dashboard en React para administración de proyectos y clonación git
- [x] 12.6 Segmentación de sesiones e interfaz MainLayout para Modo Global y Modo Proyecto

## Proximas ideas:
- Sistema de prompts para que el agente pueda interactuar con la api del backend y auto usarse

---

## Phase 13: Tool Permissions (Server-Persisted)
- [x] 13.1 Shared schema: `ToolPermissionsSchema` + `AVAILABLE_TOOLS` constant in `packages/shared`
- [x] 13.2 Session manager: `persistSessionTools()` + `getSessionTools()` methods, persists to `metadata.json`
- [x] 13.3 Session manager: loads persisted tools on session creation and applies via `setActiveToolsByName()`
- [x] 13.4 Session manager: preserves existing metadata fields when writing (no data loss)
- [x] 13.5 API: `GET /api/sessions/:id/tools` — returns active tools for session (defaults to full access)
- [x] 13.6 API: `POST /api/sessions/:id/tools` — sets and persists tools, applies immediately to live session
- [x] 13.7 Client: `InputArea` fetches tools from server on session change (replaces localStorage-only)
- [x] 13.8 Client: `InputArea` persists tool changes via `POST /api/sessions/:id/tools`
- [x] 13.9 Client: `InputArea` exposes `onToolsChange` prop for real-time parent updates
- [x] 13.10 Client: `ChatArea` displays sandbox status badge in header (Read-Only / Full Access / N/7 Tools)

---

## Phase 14: Task Runner (Persistent Task Queue)
- [x] 14.1 Shared schemas: Zod types for TaskStatus, RunnerStatus, Task, and TaskRunnerState
- [x] 14.2 WebSocket tracking: track connected sockets by sessionId and broadcast helper
- [x] 14.3 Server Task Runner loop & decomposition logic in `apps/server/src/pi/task-runner.ts`
- [x] 14.4 REST endpoints `/api/sessions/:id/tasks` (GET, POST, /decompose, /run, /pause, /reset)
- [x] 14.5 Client layout updates: disable message composition in `InputArea.tsx` during task runner execution
- [x] 14.6 Client `TasksPanel.tsx` drawer rendering checklist, log code blocks, and controllers
- [x] 14.7 Client `ChatArea.tsx` layout and toggle button integration

---

## Phase 17: PWA (Progressive Web App)
- [x] 17.1 Install vite-plugin-pwa
- [x] 17.2 Generate icons (192x192, 512x512) with sharp
- [x] 17.3 Configure manifest.json (standalone display, theme_color, icons)
- [x] 17.4 Update index.html with manifest link, theme-color, apple-touch-icon
- [x] 17.5 Build generates sw.js + service worker registration

---

## Phase 16: Context Window Meter
- [x] 16.1 Server: emit `context_usage` via WebSocket after each `message_end`
- [x] 16.2 Server: handle `compact` and `get_context_usage` WebSocket messages
- [x] 16.3 Client: `ContextMeter.tsx` component (progress bar, token count, Compact button)
- [x] 16.4 Client: integrate ContextMeter in ChatArea between messages and InputArea
- [x] 16.5 Server: REST endpoint `GET /api/sessions/:id/context` for fetch on page load
- [x] 16.6 Server: emit `context_usage` on `agent_start`, `agent_end`, and after model change
- [x] 16.7 Client: fetch context on session mount via REST
- [x] 16.8 Client: refresh button in ContextMeter for manual refresh

---

## Phase 15: Integrations Hub (Declarative Infrastructure Operations)
- [x] 15.1 Shared schemas: QuickAction, IntegrationTemplate, SaveTemplates, and RepoBindings
- [x] 15.2 Server router: CRUD endpoints under `/api/integrations/templates` and `/api/integrations/bindings`
- [x] 15.3 Server persistence: User-level storage mapped in `/tmp/pi-web-users/{username}/integrations.json`
- [x] 15.4 Client settings: Tab rendering with status connection indicator, credentials update, and template custom editing
- [x] 15.5 Client workspace: Dual-tab RightDrawer container with sliding toggle integration
- [x] 15.6 Client panel: InfrastructurePanel rendering active bindings form and dynamic Quick Action prompt buttons

---

## Phase 18: PWA Navigation Fix
- [x] 18.1 Disable SW navigation interception (navigateFallback: undefined in vite.config.ts)
- [x] 18.2 Rebuild client and server with new SW configuration
- [x] 18.3 Verify CSS/JS/assets served correctly without SW interference

## Phase 19: Live Render Preview (Project Preview via iframe + dist/)
- [x] 19.1 Shared schemas: PreviewStatus, PreviewState, BuildEvent
- [x] 19.2 Refactor getUsername helper from files.ts to shared lib/auth-helpers.ts
- [x] 19.3 Preview route /api/preview/state + /api/preview/* with MIME, SPA fallback, X-Frame-Options, CSP
- [x] 19.4 Register previewRouter in index.ts before static SPA fallback
- [x] 19.5 preview-watcher.ts (fs.watch + polling fallback + broadcastToUser via WS)
- [x] 19.6 WS handler: detect build via tool_execution_start/end on bash commands
- [x] 19.7 PreviewPanel.tsx: iframe + toolbar (reload, new tab, responsive 375/768/1280/Full) + build status
- [x] 19.8 Integración UI: /preview route in useRouter, AppRouter, MainLayout header button
- [x] 19.9 Validación: server + client typecheck and build pass
- [x] 19.10 HTML rewriting: inject `<base>` + rewrite src/href/fetch/URL paths for Vite/SPA compatibility
- [x] 19.11 Multi-build-dir support: auto-detect dist/, build/, .output/ directories
- [x] 19.12 Extended build regex: vite build, webpack, tsc, next build, nuxt build, astro build, etc.
- [x] 19.13 Polling fallback for Docker overlay filesystems (2s interval)
- [x] 19.14 Token auto-refresh: reactively regenerate iframe src on token/repo change
- [x] 19.15 Build session tracking: only ensureWatcher on agent_end if build actually ran

## Phase 20: Deterministic Build Config (Vercel-style)
- [x] 20.1 Shared schemas: FrameworkPreset, PreviewConfig, SavePreviewConfig
- [x] 20.2 preview-config.ts: auto-detect framework (package.json, config files), save/load .preview.json
- [x] 20.3 preview-builder.ts: spawn bash build command, stream logs via preview_build_log WS events
- [x] 20.4 Preview config endpoints: GET/POST /api/preview/config
- [x] 20.5 Build trigger endpoints: POST /api/preview/build, POST /api/preview/build/abort
- [x] 20.6 PreviewPanel: config drawer with framework preset selector + build command + output dir
- [x] 20.7 PreviewPanel: Build Now button + build log panel with live streaming
- [x] 20.8 Validate: typecheck + build pass

---

## Phase 21: AutoConsulting Multi-Agent Pi WebBuilder Integration
- [x] 21.1 Core Pi session manager module (`autoconsulting/src/pi/session-manager.ts`) supporting project-level workspaces (`/tmp/ac-projects/{projectId}`)
- [x] 21.2 Static deployment skills: `github-deploy`, `cloudflare-deploy`, `neon-db` (`autoconsulting/src/pi/skills/`)
- [x] 21.3 WebSocket streaming handler (`autoconsulting/src/pi/ws-handler.ts`) for project sessions (`/ws/pi`)
- [x] 21.4 REST API endpoints for projects & sessions (`autoconsulting/src/routes/projects.ts`) mounted on server factory
- [x] 21.5 New `WebBuilder` A2A agent (`autoconsulting/src/agents/web-builder/`) on port 4104 using Pi SDK directly
- [x] 21.6 Client React hook `usePiSession.ts` and interactive `PiProjectWorkspaceView.tsx` tab in project detail view
- [x] 21.7 Verification: backend & frontend compilation and build pass cleanly


## Phase 22: Programmatic Agent System (Foundation)
- [x] 22.1 Shared schemas: `AgentDefinitionSchema`, `AgentStatusSchema`, `AgentInfoSchema` + types in `packages/shared`
- [x] 22.2 `apps/server/src/agents/types.ts` — `AgentServer` + `AgentEntry` internal types
- [x] 22.3 `apps/server/src/agents/create-agent-server.ts` — single factory: isolated workspace, AuthStorage, ModelRegistry, DefaultResourceLoader + skills, AgentSession, Hono app with SSE `/prompt`, `/messages`, `/abort`, `/health`
- [x] 22.4 `apps/server/src/agents/agent-registry.ts` — singleton `AgentRegistry` with `register()`, `get()`, `list()`, `stop()`, `stopAll()`
- [x] 22.5 `apps/server/src/agents/index.ts` — barrel export
- [x] 22.6 `apps/server/src/routes/agents.ts` — REST CRUD: `GET /api/agents`, `POST /api/agents`, `GET /api/agents/:id`, `DELETE /api/agents/:id`, `POST /api/agents/:id/prompt` (SSE), `GET /api/agents/:id/messages`, `POST /api/agents/:id/abort`
- [x] 22.7 `apps/server/src/index.ts` — mount `agentsRouter` on `/api/agents`
- [x] 22.8 TypeScript typecheck: EXIT 0

## Phase 23: Channels (Multi-Agent Real-time Group Chat)
- [x] 23.1 Shared schemas: `ReplyMode`, `ChannelMember`, `Channel`, `ChannelMessage`, `CreateChannel`, etc. in `packages/shared`
- [x] 23.2 `apps/server/src/channels/channel-store.ts` — Filesystem store for channel definitions and append-only message history
- [x] 23.3 `apps/server/src/channels/channel-orchestrator.ts` — Sequential multi-agent message dispatch, recipient resolution (`user-only`, `broadcast`, `targeted`), and circuit breaker loop protection (`MAX_CHAIN_DEPTH = 5`)
- [x] 23.4 `apps/server/src/channels/index.ts` — Barrel export for channels module
- [x] 23.5 `apps/server/src/routes/channels.ts` — REST endpoints for channels CRUD, member management, and message dispatch
- [x] 23.6 `apps/server/src/ws/handler.ts` — Real-time channel WebSocket handlers (`channel_join`, `channel_send`, real-time message broadcasting, and agent token streaming)
- [x] 23.7 `apps/server/src/index.ts` — Mount `channelsRouter` on `/api/channels`
- [x] 23.8 Client data hooks — `useChannels.ts`, `useChannel.ts`
- [x] 23.9 Client UI components — `ChannelsPage.tsx`, `ChannelDetailPage.tsx`, `ChannelCard.tsx`, `ChannelMessages.tsx`, `ChannelInput.tsx`, `MembersPanel.tsx`, `AddMemberModal.tsx`
- [x] 23.10 Client navigation — added `/channels` and `/channel/:id` routes in `useRouter.ts`, `AppRouter.tsx`, and `#` icon in `MainLayout.tsx`
- [x] 23.11 Verification — TypeScript compilation passes clean (EXIT 0) for both server and client

## Phase 24: Agent Chat Unification in ChatArea
- [x] 24.1 `packages/shared/src/schemas.ts` — Added `agentId?: string` to `CreateSessionSchema` and `SessionSchema`
- [x] 24.2 `apps/server/src/pi/session-manager.ts` — Resolved agent context (`agentId`), workspace directory (`/tmp/pi-agents/{agentId}/workspace`), systemPrompt inheritance, and agent skill loading
- [x] 24.3 `apps/server/src/routes/sessions.ts` — Supported `agentId` in `POST /api/sessions`
- [x] 24.4 Client active context state — Updated `AppRouter.tsx`, `MainLayout.tsx`, and `SessionSidebar.tsx` for Agent context mode (`activeAgent`), displaying `Chat [Agent: AgentName]` in header and filtering sessions by agent
- [x] 24.5 `apps/client/src/pages/AgentsPage.tsx` — Replaced simple `ChatModal` with direct context switch & redirection to the full `ChatArea`
- [x] 24.6 Verification — TypeScript compilation passes clean (EXIT 0) for both server and client

## Phase 25: Channel Agent Fix and Rich UX Upgrade
- [x] 25.1 `apps/server/src/agents/create-agent-server.ts` — Connected agent creation to user `authStorage` & `modelRegistry` (`piSessionManager.getUserContext("admin")`), providing access to configured API keys
- [x] 25.2 `apps/server/src/channels/channel-orchestrator.ts` — Added dynamic fallback model verification before prompting agents to prevent null model errors
- [x] 25.3 `apps/client/src/components/channels/ChannelMessages.tsx` — Upgraded UI to support `RichMarkdown` formatting, syntax highlighting, agent badges, and real-time streaming deltas
- [x] 25.4 `apps/client/src/pages/ChannelDetailPage.tsx` — Enhanced header, active agent counts, and responsive layout
- [x] 25.5 Verification — TypeScript compilation passes clean (EXIT 0) for server and client

## Phase 26: Unified Channel Sessions & Modal Member Management
- [x] 26.1 `packages/shared/src/schemas.ts` — Added `channelId?: string` to `CreateSessionSchema` and `SessionSchema`
- [x] 26.2 `apps/server/src/pi/session-manager.ts` & `routes/sessions.ts` — Supported `channelId` in `getOrCreateSession`, metadata persistence (`/tmp/pi-channels/{channelId}/workspace`), and `POST /api/sessions`
- [x] 26.3 Client active context state — Updated `AppRouter.tsx`, `MainLayout.tsx`, and `SessionSidebar.tsx` for Channel context mode (`activeChannel`), displaying `Chat [Channel: #channelName]` in header and filtering sessions by channel
- [x] 26.4 `apps/client/src/pages/ChannelsPage.tsx` — Updated channel cards to switch context to `activeChannel` and redirect to main `ChatArea`
- [x] 26.5 `apps/client/src/components/channels/ChannelMembersModal.tsx` — Built floating modal for channel member management with explicit agent selection when `targeted` replyMode is chosen
- [x] 26.6 Integration in `MainLayout.tsx` — Added "Miembros" button in header when in channel mode to trigger `ChannelMembersModal`
- [x] 26.7 Verification — TypeScript compilation passes clean (EXIT 0) for server and client

## Phase 27: Modular ChannelChatArea Architecture
- [x] 27.1 `apps/client/src/components/channels/ChannelMessageList.tsx` — Specialized multi-agent message list with agent badges, avatars, streaming deltas, and `RichMarkdown`
- [x] 27.2 `apps/client/src/components/channels/ChannelChatArea.tsx` — Dedicated channel chat container managing channel WS events, multi-agent state, channel header with members modal, and shared input area
- [x] 27.3 `apps/client/src/components/layout/AppRouter.tsx` — Routed `route.page === "chat"` to `ChannelChatArea` when `activeChannel` is active
- [x] 27.4 Verification — TypeScript compilation passes clean (EXIT 0) for server and client

## Phase 28: Topbar Breadcrumbs Navigation
- [x] 28.1 `apps/client/src/components/layout/MainLayout.tsx` — Refactored topbar title header into modular breadcrumb navigation separated by `/` slashes (`Chat / Agent: AgentName`, `Chat / Channel: #channelName`, etc.) with interactive route navigation.
- [x] 28.2 Verification — TypeScript compilation passes clean (EXIT 0) for client build.

## Phase 29: Channel Context Array (Key-Value Pairs)
- [x] 29.1 `packages/shared/src/schemas.ts` — Defined `ChannelContextItemSchema` and updated channel schemas with `context?: ChannelContextItem[]`
- [x] 29.2 `apps/server/src/channels/channel-store.ts` — Supported `context` array in channel creation, filesystem persistence (`channel.json`), loading, and update helpers
- [x] 29.3 `apps/server/src/routes/channels.ts` — Added `PUT /api/channels/:id/context` REST endpoint
- [x] 29.4 `apps/server/src/channels/channel-orchestrator.ts` — Formatted and injected channel context environmental variables into agent system prompts
- [x] 29.5 `apps/client/src/components/channels/ChannelContextModal.tsx` — Built interactive floating modal for viewing, adding, editing, and deleting key-value variables
- [x] 29.6 Integration — Added "Contexto" buttons to `ChannelCard.tsx`, `ChannelsPage.tsx`, and `ChannelChatArea.tsx`
- [x] 29.7 Verification — TypeScript compilation passes clean (EXIT 0) for server and client

## Phase 30: Channel Session Agent Memory Isolation Fix
- [x] 30.1 `apps/server/src/channels/channel-orchestrator.ts` — Reset agent session internal runtime state (`agent.reset()`) before dispatching prompts to isolate channel session histories and prevent previous session state leakage.
- [x] 30.2 `apps/client/src/components/sidebar/SessionSidebar.tsx` — Updated `deleteSession` remaining session filtering to properly respect `activeChannel` and `activeAgent` context modes.
- [x] 30.3 Verification — TypeScript compilation passes clean (EXIT 0) for server and client.

## Phase 31: Active Tagging Protocol Prompt Injection
- [x] 31.1 `apps/server/src/channels/channel-orchestrator.ts` — Enhanced `buildAgentPrompt` to inject active tagging protocol rules (`Channel Participants & Tagging Protocol`), explaining routing mechanics and instructing agents to explicitly tag teammates when needing input/review.
- [x] 31.2 Verification — TypeScript compilation passes clean (EXIT 0) for server and client.
