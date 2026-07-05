# CrewFactory - Development Steps

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
- Rediseño de navegación estilo Slack con acordeones de Proyectos/Agentes/Canales en el sidebar izquierdo y panel/desplegable de sesiones a la derecha.

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
- [x] 15.3 Server persistence: User-level storage mapped in `/tmp/crewfactory/{username}/integrations.json`
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

## Phase 21: AutoConsulting Multi-Agent CrewFactory Builder Integration
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

## Phase 32: Anti-Chatter Rules & Channel Abort Mechanism
- [x] 32.1 `apps/server/src/channels/channel-orchestrator.ts` — Injected strict anti-chatter constraints (no courtesy acknowledgments, silent mode `(silent)` when no new technical work exists, and task-only tagging). Suppressed silent messages and stopped unnecessary chain propagation.
- [x] 32.2 `apps/server/src/channels/channel-orchestrator.ts` — Implemented `abortDispatch(channelId, sessionId)` to abort running agent sessions and stop chain execution loops instantly upon request.
- [x] 32.3 `apps/server/src/routes/channels.ts` & `apps/server/src/ws/handler.ts` — Added `POST /api/channels/:id/abort` REST endpoint and `channel_abort` WebSocket message handler.
- [x] 32.4 `apps/client/src/hooks/useChannel.ts` & `apps/client/src/components/channels/ChannelChatArea.tsx` — Wired `abortDispatch` to `InputArea`'s `onAbort` prop, enabling functional Stop button behavior for channel executions.
- [x] 32.5 Verification — TypeScript compilation passes clean (EXIT 0) for server and client.
## Phase 33: Per-Channel Configurable MAX_CHAIN_DEPTH
- [x] 33.1 `packages/shared/src/schemas.ts` — Added `maxChainDepth?: number` to `ChannelSchema`, `CreateChannelSchema`, and `UpdateChannelSchema`.
- [x] 33.2 `apps/server/src/channels/channel-store.ts` & `channel-orchestrator.ts` — Persisted `maxChainDepth` and dynamically evaluated execution depth against `channel.maxChainDepth ?? 5`.
- [x] 33.3 `apps/client/src/components/channels/ChannelSettingsModal.tsx` — Created settings modal with interactive slider for adjusting max chain depth (1-20 steps).
- [x] 33.4 `apps/client/src/components/channels/ChannelChatArea.tsx` & `useChannel.ts` — Wired "Ajustes" button in header to open `ChannelSettingsModal` and update channel configuration.
- [x] 33.5 Verification — TypeScript compilation passes clean (EXIT 0) for server and client.


---
crear un plan de despliegue facil en vps
- [x] migrar la interfaz a una interfaz slack like

## Phase 34: Storage Coherency, Security & Performance Fixes
- [x] 34.0 Pre-implementation storage backup and migration script (`migrate-storage.ts`)
- [x] 34.1 Scope channels baseDir by username and verify ownership on REST routes
- [x] 34.2 Scope agent-registry baseDir by username and scan user directories at startup
- [x] 34.3 Pass username to create-agent-server and channel-orchestrator model lookup
- [x] 34.4 Remove token query parameters in WorkspaceFileEditor (use blob URLs)
- [x] 34.5 Remove token query parameters in ImageGrid (use AuthenticatedImage & blob tab open)
- [x] 34.6 Clean up localStorage keys (active context, models) on logout
- [x] 34.7 Convert listSessions in session-manager to concurrent async I/O
- [x] 34.8 Implement backwards chunked tail-read for getMessages in channel-store
- [x] 34.9 Implement log rotation for channel messages (10MB messages.jsonl limit)

## Phase 35: Isolated Port-Based Project Preview (Option C)
- [x] 35.1 Create `apps/server/src/preview-server.ts` running on port 3001
- [x] 35.2 Hook `startPreviewServer()` into Hono startup inside `apps/server/src/index.ts`
- [x] 35.3 Add `VITE_PREVIEW_BASE_URL` in `apps/client/.env` (pointing to localhost:3001 in dev)
- [x] 35.4 Update client `PreviewPanel.tsx` to read base URL and iframe path isolation
- [x] 35.5 Expose port 3001 in Dockerfile for production compatibility
- [x] 35.6 Revert service worker navigateDenylist since port 3001 is another origin
- [x] 35.7 Validate full build pipeline for client and server (EXIT 0)

## Phase 36: Multimedia Support in Chat (Images & Documents)
- [x] 36.1 Update backend WebSocket prompt handler to parse base64 image array (`images?: ImageContent[]`) and apply to Pi agent session prompts
- [x] 36.2 Implement interactive clip attachment button, file type selector, and horizontal preview list in client `InputArea.tsx`
- [x] 36.3 Add asynchronous helper to parse images to base64 and upload documents to Workspace uploads folder using Multipart HTTP POST
- [x] 36.4 Autocomplete prompt text with workspace uploaded document links to inform the agent of their paths
- [x] 36.5 Refactor `ImageGrid.tsx` to handle `activeRepoName` workspace image resolution
- [x] 36.6 Refactor `ToolResultInspector.tsx` and `MessageList.tsx` to support rendering PDFs inside iframes, audio/video players, and downloadable Office cards
- [x] 36.7 Validate full build pipeline for client and server (EXIT 0)

## Phase 37: Config & Workspace Import/Export Backup
- [x] 37.1 Mount backup router `/api/backup` in Hono server
- [x] 37.2 Expose context clearing helpers in session-manager and agent-registry
- [x] 37.3 Implement recursive zip walker with exclusions (`node_modules`, `.git`, build outputs)
- [x] 37.4 Build `GET /api/backup/export` supporting `lightweight` vs `full` zip packaging
- [x] 37.5 Build `POST /api/backup/import` supporting `merge` vs `overwrite` restoration
- [x] 37.6 Integrate backup/restore settings cards in React `SettingsPage.tsx`
- [x] 37.7 Build overwrite destructive warning modal with download-backup shortcut and confirm input field
- [x] 37.8 Validate server/client builds and run walker exclusion unit tests

## Phase 38: Slack-Like Interface Migration (Navigation Simplification)
- [x] 38.1 Auditoría y plan de simplificación de navegación aprobado por el usuario
- [x] 38.2 Unificar barra lateral en `SessionSidebar.tsx` (selector de contexto, accesos rápidos, acordeón de sesiones y administración)
- [x] 38.3 Modificar `MainLayout.tsx` para hacer la barra lateral persistente y limpiar el header superior
- [x] 38.4 Ajustar ancho de árbol de archivos de Workspace a `w-64`
- [x] 38.5 Verificar compilación de producción del cliente

## Phase 39: Sidebar de Navegación Tipo Slack y Sesiones a la Derecha
- [x] 39.1 Crear componente `SessionDrawer.tsx` para gestionar sesiones en el lado derecho
- [x] 39.2 Integrar `SessionDrawer` en `MainLayout.tsx` con botón en la barra superior
- [x] 39.3 Rediseñar `SessionSidebar.tsx` incorporando acordeones interactivos para Proyectos, Agentes y Canales
- [x] 39.4 Limpieza de props no utilizadas en el sidebar izquierdo
- [x] 39.5 Verificar compilación y empaquetado de producción del cliente
- [x] 38.6 Extraer `ensureWorkspaceSubdirs()` de `ensureWorkspaceStructure()` para reutilizar en agentes y canales
- [x] 38.7 `getResolvedSkillPaths()` acepta `username` opcional e incluye factory skills globales para todas las entidades
- [x] 38.8 Agents y channels reciben subestructura completa (`.agents/skills/`, `assets/`, `memories/`) en su workspace
- [x] 38.9 Solo el agente global tiene AGENTS.md y factory skills — proyectos/agentes/canales las ven como referencia read-only
- [x] 38.10 Validación: compilación servidor y cliente pasa (EXIT 0)

## Phase 40: Sidebar UX Overhaul & Session Popover Refactor
- [x] 40.1 Crear hook de resolución automática de sesiones `useSessionResolver` reactivo a cambios de contexto y sessionId nulo
- [x] 40.2 Refactorizar `SessionSidebar.tsx`: unificar navegación a pestañas horizontales compactas estilo Slack, extensibles por tipo de contexto (CONTEXT_TABS)
- [x] 40.3 Refactorizar `SessionSidebar.tsx`: reemplazar el Selector de Contexto duplicado por un botón "Factory" siempre visible para navegar a la sesión global
- [x] 40.4 Crear componente `SessionPopover.tsx` para reemplazar el drawer lateral derecho por un menú contextual flotante bajo el botón de Sesiones
- [x] 40.5 Integrar `SessionPopover` en `MainLayout.tsx` dentro de un contenedor relativo y eliminar `SessionDrawer.tsx`
- [x] 40.6 Verificar que la compilación de TypeScript no contenga errores

## Phase 41: Global Monitoring Console & Real-time Event Broker
- [x] 41.1 Define shared schemas and interfaces (GlobalLogEvent)
- [x] 41.2 Create apps/server/src/lib/event-broker.ts singleton
- [x] 41.3 Create apps/server/src/routes/logs.ts and register in index.ts
- [x] 41.4 Subscribe and forward events in pi/session-manager.ts
- [x] 41.5 Subscribe and forward events in channels/channel-orchestrator.ts
- [x] 41.6 Add client routing for /logs page in useRouter.ts and AppRouter.tsx
- [x] 41.7 Add link to SessionSidebar.tsx and breadcrumbs support in MainLayout.tsx
- [x] 41.8 Implement LogsConsolePage.tsx with filters and autoscroll control
- [x] 41.9 Verify build and run production check
- [x] 41.10 Update session metadata updatedAt timestamp on backend agent events
- [x] 41.11 Refactor control page to display cards for all streaming/active sessions
- [x] 41.12 Combine consecutive token deltas inside consolidated logs console tab
- [x] 41.13 Validate full build and push changes

## Phase 42: Robust Task Delegation & Meta-Agent Optimization Loop
- [x] 42.1 Defined Zod schemas for execution logs in shared packages
- [x] 42.2 Implemented agent observation API (`GET /api/agents/:id/observe`) and execution log storage on Hono server
- [x] 42.3 Implemented repository session SSE prompting (`POST /api/sessions/:id/prompt/stream`) and execution logging on backend
- [x] 42.4 Created Bun CLI helper script `scripts/delegate.ts` for unified task delegation to agents, channels, and repos
- [x] 42.5 Configured new and updated factory skills (`factory-delegate`, `factory-observe`, `factory-quick-actions`)
- [x] 42.6 Implemented frontend "Executions" detail logs modal in `AgentsPage.tsx`
- [x] 42.7 Implemented visual observed status indicator badge in `ChatArea.tsx` header

## Phase 43: Agent & Channel Workspace Isolation
- [x] 43.1 backend files.ts path validation support for agentId and channelId
- [x] 43.2 client routing and prop propagation for activeAgent and activeChannel
- [x] 43.3 client ImageGrid, ToolCallRow, resolveFileUrl, resolveImageUrl, InputArea, WorkspacePanel update to append scoping parameters
- [x] 43.4 verification of build compilation of server and client
- [x] 43.5 Homogenized repository workspace directories to `repos/{repoName}/workspace` to match agents and channels folders layout
- [x] 43.6 Decoupled repository workspaces to use a unique UUID-based repoId instead of human-readable repoName, adding project.json metadata mapping and client-side selection support

## Phase 44: Entity Deletion & Configuration Updating
- [x] 44.1 Shared schemas: Define `UpdateAgentDefinitionSchema` in `schemas.ts`
- [x] 44.2 Server `AgentRegistry`: Implement `update` method to restart Hono server on definition changes
- [x] 44.3 Server Agents API: Add `PATCH /api/agents/:id` endpoint and cascading session deletes in `DELETE /api/agents/:id`
- [x] 44.4 Server Channels API: Add cascading session deletes in `DELETE /api/channels/:id`
- [x] 44.5 Server Repos API: Add `DELETE /api/workspace-repos/:id` with cascading session and folder deletes, and `PATCH /api/workspace-repos/:id` to update project name
- [x] 44.6 Client `useAgents` hook: Add `updateAgent` method
- [x] 44.7 Client Agents Page: Add edit/delete buttons, deletion confirmation, and reuse `RegisterModal` for editing
- [x] 44.8 Client Projects Dashboard: Add edit/delete buttons, name rename modal, and secure name-matching delete confirmation modal
- [x] 44.9 Verification: Run client type checking and verify clean builds

## Phase 45: Qwen Cloud Provider Integration
- [x] 45.1 Create backend file `qwen-provider.ts` defining dynamic provider registration for official Qwen 3.7, 3.6, and 3.5 models
- [x] 45.2 Update `session-manager.ts` to register the new Qwen provider upon user context initialization
- [x] 45.3 Verify successful server compilation and run model registration validation
## Phase 46: Hierarchical Roles & Visual Org Chart in Channels
- [x] 46.1 Define ChannelRole schema and update ChannelMember schemas in packages/shared
- [x] 46.2 Update member endpoints to support role persistence in apps/server Hono routes
- [x] 46.3 Add Role selection dropdowns in client AddMemberModal and ChannelMembersModal
- [x] 46.4 Sort and display role badges in right panel MembersPanel
- [x] 46.5 Render interactive SVG-based Org Chart view with orthogonal connections on desktop and cards layout on mobile
- [x] 46.6 Integrate toggle view button and Lead details in ChannelChatArea sub-header
- [x] 46.7 Resolve Lead indicators in ChannelCard and load agents on ChannelsPage mount
- [x] 46.8 Verify successful builds of server and client applications

## Phase 47: Hackathon Track 3 Roadmap — Foundations & Negotiation SM & Delegation (F0, F1, F3)
- [x] 47.1 Extend shared Zod schemas (NegotiationProtocol, ScoringRubric, DelegationPattern) in packages/shared
- [x] 47.2 Add database/store level read/write persistence for NegotiationState and TaskLedger in channel-store
- [x] 47.3 Implement NegotiationStateMachine generic engine in apps/server/src/channels/negotiation-state.ts
- [x] 47.4 Integrate NegotiationStateMachine and TaskLedger into ChannelOrchestrator dispatch workflow
- [x] 47.5 Emit negotiation events (channel_negotiation_round/agreement/escalation) and parse system messages
- [x] 47.6 Build task ledger tracking assignments for lead-role delegation patterns
- [x] 47.7 Support rendering system messages and custom advanced fields in ChannelSettingsModal and ChannelMessageList
- [x] 47.8 Update setup-autoconsulting-channel setup script to pre-configure roles, negotiation, and delegation


## Phase 48: Hackathon Track 3 Roadmap — Benchmark, Optimization, MCP & Licensing (F2, F4, F5, F6)
- [x] 48.1 Build background harness runner and scoring metrics evaluator for Condition A vs B benchmark
- [x] 48.2 Mount Hono REST endpoints `GET/POST /api/channels/:id/benchmark` to run and serve benchmarks
- [x] 48.3 Build React `ChannelBenchmarkPanel.tsx` component in client with evaluation reports rendering
- [x] 48.4 Implement generic stdio JSON-RPC Client and Registry (`mcp-client.ts`, `mcp-registry.ts`) for MCP integration
- [x] 48.5 Mount GET/POST Hono router `/api/mcp` and inject enabled MCP custom tools into Pi agent sessions
- [x] 48.6 Add premium interactive MCP configuration tab in client Settings page
- [x] 48.7 Implement Meta-Agent prompt optimizer logic (`optimizer.ts`) to refine system prompts based on evaluation metrics
- [x] 48.8 Mount Hono REST endpoints `GET/POST /api/channels/:id/optimize` to run and retrieve optimization step history
- [x] 48.9 Build React `ChannelOptimizePanel.tsx` component to control and display prompt refinement progress
- [x] 48.10 Add MIT License in workspace root for standard open-source submission
- [x] 48.11 Verify successful builds of server and client applications

## Phase 49: Decoupled Multi-Variant Agent Benchmarking Laboratory
- [x] 49.1 Shared Zod schemas: `LabStanceSchema`, `LabAgentSchema`, `VariantRunSchema`, `VariantRunResultSchema`, `LabTestCaseSchema`, `LabBlueprintSchema`, `LabExperimentSchema`.
- [x] 49.2 Predefined dichotomy templates catalog and JSON experiment store.
- [x] 49.3 Programmatic isolated agent registration and virtual channel runner sequential orchestrator.
- [x] 49.4 LLM-Judge evaluator and compound scoring engine.
- [x] 49.5 REST API endpoints under `/api/experiments` and user WebSocket status broadcasting.
- [x] 49.6 React `LaboratoryPage` UI featuring an interactive configuration wizard (Template/Scratch) and dynamic metrics charts/comparison dashboards.
- [x] 49.7 Verification: clean monorepo builds and successful TypeScript typechecking.

## Phase 50: Rediseño de Navegación del Laboratorio y Generador IA Editable
- [x] 50.1 Mover pestañas de Experimentos / Generador IA a primer nivel en MainLayout
- [x] 50.2 Crear popover flotante ExperimentPopover para listar el histórico de experimentos liberando espacio del sidebar
- [x] 50.3 Soportar el contexto KV del canal e imponer la regla de replyMode user-only para el miembro lead en el backend (/instantiate)
- [x] 50.4 Hacer editables todos los campos de la propuesta de equipo generado por IA (canal, contexto KV, agentes) antes de instanciar
- [x] 50.5 Mover el selector de modelo generador al lado del botón de generar con IA
- [x] 50.6 Sincronizar dinámicamente la edición del ID del agente con su correspondiente vinculación en los miembros del canal
- [x] 50.7 Validar consistencia y forzar replyMode del lead a user-only en el frontend
- [x] 50.8 Verificar que el backend y frontend compilen correctamente

## Phase 51: Visualización del Debate del Laboratorio en Tiempo Real mediante Chat
- [x] 51.1 Extender `VariantRunSchema` para incluir `activeSessionId` e inyectar el identificador al iniciar cada variante en `ExperimentRunner`
- [x] 51.2 Diseñar el subcomponente `VariantViewer` en el cliente para montar el hook `useChannel` y visualizar el chat dinámico con `ChannelMessageList`
- [x] 51.3 Incorporar selector de pestañas de variante alternables en `LaboratoryPage.tsx`
- [x] 51.4 Ocultar el input de chat en el laboratorio ya que los debates de experimentos son de lectura/telemetría estática
- [x] 51.5 Verificar la consistencia de tipos y compilación exitosa del cliente y servidor

## Phase 52: Laboratorio Unificado, Enrutamiento por URL y Corrección de Tokens
- [x] 52.1 Extender `ChannelMessageSchema` con campos `tokensIn` y `tokensOut` para persistencia
- [x] 52.2 Modificar `channel-orchestrator.ts` para extraer tokens consumidos por respuesta de agente y guardarlos en el mensaje
- [x] 52.3 Actualizar `ExperimentRunner.ts` para consolidar tokens consumidos desde el historial de mensajes de canal, con fallback robusto
- [x] 52.4 Ajustar `harness.ts` y `baseline-runner.ts` para calcular y reportar tokens en benchmarks a través de mensajes
- [x] 52.5 Implementar soporte de subrutas y experimentId en `useRouter.ts` y `AppRouter.tsx`
- [x] 52.6 Unificar barra de pestañas en `MainLayout.tsx` eliminando pestañas del laboratorio y simplificando navegación
- [x] 52.7 Modificar `LaboratoryPage.tsx` para usar el Generador de IA como la vista por defecto y permitir guardar experimentos directamente
- [x] 52.8 Verificar la compilación exitosa y el typechecking completo de cliente y servidor
## Phase 53: Migración de Tema oklch y Dark Mode por Defecto
- [x] 53.1 Configurar variables oklch en `:root` y `.dark` de `index.css`
- [x] 53.2 Mapear tokens del nuevo tema Tailwind v4 y oklch en `@theme inline` en `index.css`
- [x] 53.3 Habilitar el modo oscuro por defecto agregando la clase `dark` a la etiqueta `html` de `index.html`
- [x] 53.4 Sanear `OrgChartLines.tsx` eliminando strokes hardcodeados en favor de clases `stroke-border` y `stroke-muted`
- [x] 53.5 Migrar de forma automatizada todas las clases obsoletas de Slack y CrewFactory a los nuevos tokens de tema en 64 archivos .tsx
- [x] 53.6 Compilar y verificar el build exitoso de la aplicación cliente

## Phase 54: MCP Marketplace & Gallery
- [x] 54.1 Extend shared Zod schemas (McpTransportType, McpServerConfig, McpCatalogItem, McpConfig) in packages/shared
- [x] 54.2 Extend McpClient to support both stdio and HTTP (SSE + POST) transports natively in Bun
- [x] 54.3 Implement predefined MCP catalog gallery, status connection checks, and dynamic argument replacement
- [x] 54.4 Build routes/mcp.ts advanced endpoints (catalog, test connection, manual connect/disconnect, CRUD)
- [x] 54.5 Register `/mcps` route in useRouter.ts and AppRouter.tsx, and add link in SessionSidebar.tsx
- [x] 54.6 Build MCPMarketplacePage, MCPCard, and MCPCustomForm React components
- [x] 54.7 Update backup router to include mcp configurations in lightweight backups
- [x] 54.8 Verify successful builds of server and client applications
- [x] 54.9 Fix MCP tool execution mapping (parameters schema translation and conforming AgentToolResult structure)
- [x] 54.10 Fix active tools update side-effect deactivating MCP tools in WS handler and REST sessions router

## Phase 55: AG-UI Protocol & Interactive Agent Components
- [x] 55.1 Define shared schemas and Zod types for UiComponent and UiAction in packages/shared
- [x] 55.2 Implement backend UiApprovalRegistry and request_approval/render_chart tool definitions
- [x] 55.3 Inject custom UI tools into standard and programmatic agent sessions
- [x] 55.4 Handle ui_action WebSocket messages and resolve pending approval promises in backend
- [x] 55.5 Install recharts in apps/client dependencies and build ApprovalForm and ChartView components
- [x] 55.6 Intercept custom tools in ToolCallRow to render interactive client components
- [x] 55.7 Pass correct toolCallId props to ToolCallRow in MessageList and ChannelMessageList
- [x] 55.8 Compile monorepo successfully with zero TypeScript check errors

## Phase 56: Fix UI Interactive Tools & Directory Auto-Creation
- [x] 56.1 Modificar `ui-tools.ts` para crear directorios recursivamente antes de escribir archivos en `propose_code_change`
- [x] 56.2 Modificar `routes/sessions.ts` para mantener activas todas las herramientas interactivas UI al actualizar los permisos
- [x] 56.3 Modificar `ws/handler.ts` para mantener activas todas las herramientas interactivas UI al recibir un prompt
- [x] 56.4 Validar la compilación exitosa del servidor
