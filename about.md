# CrewFactory
**Type:** PRODUCTION
**Description:** Web interface for CrewFactory with real-time streaming, multi-session chat, user authentication, and dynamic provider management. Wraps the @earendil-works/pi-coding-agent SDK.
**Stack:** Bun, Hono, React 19, Vite, TypeScript (strict), Tailwind CSS v4, Framer Motion, WebSocket
**Theme:** Slack Aubergine (light) with dark mode support
**Deployment Target:** Coolify (Docker)
**Database Tier:** No database (localStorage client-side, filesystem sessions server-side at /tmp/crewfactory)

## Features

### Authentication
- JWT-based login with bcrypt password hashing
- Credentials via Coolify env vars (AUTH_USERNAME, AUTH_PASSWORD_HASH base64-encoded)
- Protected routes and WebSocket connections

### Chat & Streaming
- Multi-session chat (create, switch, delete sessions)
- Real-time streaming via WebSocket (Hono/Bun upgrade)
- Message rendering: user, assistant, tool calls, thinking blocks
- Abort active generation
- Steer/follow-up during streaming (Enter=steer, Alt+Enter=follow_up)
- Context Window Meter with token usage bar and manual Compact button

### Multimedia Support (Images & Documents)
- **Hybrid Input Strategy**:
  - **Images**: converted to base64 on client and sent inline via WebSocket using the pi SDK's native vision parameters (`images?: ImageContent[]`).
  - **Documents (PDF, Office, etc.)**: uploaded via Multipart HTTP POST directly to the workspace storage folder (`assets/uploads`), auto-appending workspace paths to the prompt so agents can read them.
- **Visual Preview Templates (Premium UI)**:
  - **PDFs**: rendered inline via authenticated iframe viewers with "Open in New Tab" controls.
  - **Audio & Video**: embedded natively using HTML5 `<audio>` and `<video>` players with customizable layouts.
  - **Office Documents (DOCX, XLSX, PPTX, etc.)**: rendered as premium info cards with extension badges and direct authenticated download buttons.

### Provider Management
- Dynamic provider configuration via web UI (no env vars needed)
- 35 supported providers from pi SDK plus native Qwen Cloud (Anthropic, OpenAI, Google, DeepSeek, Groq, Mistral, Qwen, etc.)
- API key management: add/remove keys per provider, persisted to auth.json
- Model selector below chat input: shows only configured providers, nested dropdown for model selection
- Model persistence in localStorage, applied to sessions via SDK's setModel()
- Auth status indicators (configured/not configured per provider)

### PWA (Progressive Web App)
- Installable on mobile via manifest.json with `display: standalone`
- Service worker with Workbox for asset caching (auto-update on new deploy)
- Apple touch icon + status bar styling for iOS standalone mode
- Auto-update via `vite-plugin-pwa` with `registerType: "autoUpdate"`
- Offline-capable assets (JS, CSS, HTML, icons)
- Navigation interception disabled (`navigateFallback: undefined`) to prevent stale content after deployments; server handles all navigation requests directly

### Mobile-First Responsive
- Breakpoints: 375px (base), 768px (sm), 1280px (lg)
- Sidebar: hidden by default on mobile, overlay with backdrop when open
- Header: compact on mobile (h-10 vs h-12)
- Responsive padding, font sizes, and button sizing throughout

### Theme
- Supabase dark theme via tailwindcss-tweakcn
- Colors: bg #121212, surface #171717, accent green #4ade80
- Typography: Outfit (display/body), JetBrains Mono (mono)
- Design tokens via Tailwind CSS v4 @theme (always use semantic tokens, no raw hex in code)

### Workspace & Hybrid Agent Instantiation
- Structured directory per user at `/tmp/crewfactory/{username}/`:
  - `workspace/` — User global workspace root (contains `.agents/skills/` for factory skills, `AGENTS.md` — the only entity with manager-level instructions, `assets/` for uploads/generated, and memories/ for short-term and session notes)
  - `repos/{repoId}/workspace/` — Git repository workspace (contains `.agents/skills/`, `assets/`, `memories/` skeleton for repo context, identified by a unique UUID `repoId` to support renaming)
  - `repos/{repoId}/project.json` — Repository metadata mapping the UUID to its friendly name and clone settings
  - `agents/{id}/workspace/` — Programmatic agent workspace with same subdirs skeleton but NO AGENTS.md or factory skill provisioning — they see global factory skills as read-only via `getResolvedSkillPaths(username)`
  - `channels/{id}/workspace/` — Multi-agent channel workspace, same structure as agents
  - `sessions/` — User chat sessions and metadata
  - `agents/{id}/sessions/` — Agent chat sessions
  - `channels/{id}/` — Channel definitions and message logs
- **Global mode:** Agent CWD is the workspace root. Used for cross-repo tasks, admin, and skill authorship.
- **Repo mode:** Agent CWD is `repos/{repoId}/workspace`. Sessions tagged with `repoId` in `metadata.json`.
- **Agent/Channel mode:** Agent CWD is the entity's workspace. Global factory skills injected via `getResolvedSkillPaths()`.
- `ensureWorkspaceSubdirs()` creates the common subdirectory skeleton for any entity workspace.
- Dashboard view (initial screen) lets users list, create or clone Git repositories.

### Tool Permissions
- Per-session tool access control: toggle `read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`
- Presets: **Full Access** (all 7 tools) and **Read-Only** (read, grep, find, ls only)
- Tools persisted in session `metadata.json` — survive server restarts and session reopens
- Applied immediately to live agent session via `session.setActiveToolsByName()`
- Sandbox badge in chat header shows current mode (Read-Only / Full Access / N/7 Tools)
- Tools also sent per-prompt via WebSocket for immediate override

### Context Window Meter
- Real-time context usage bar in chat footer (tokens / context window / percentage)
- Color-coded states: <70% green, 70-90% amber, >90% red
- Manual "Compact" button triggering `session.compact()` via WebSocket
- Context usage emitted automatically after each `message_end` event

### Live Render Preview
- Página "Preview" en la interfaz del proyecto para renderizar apps construidas por el agente
- **Servidor dedicado de preview (Puerto 3001)**: corre un servidor de archivos estáticos independiente (`Bun.serve`) en el mismo contenedor/proceso para aislar por completo el render del frontend del framework Vite y Service Workers de CrewFactory.
- **Aislamiento por Path (No auth en assets)**: las URLs tienen el formato `http://localhost:3001/:username/:repo/index.html`. El path provee aislamiento de datos y evita requerir tokens en sub-assets como JS/CSS/imágenes.
- Sirve archivos estáticos desde el directorio de build (`dist/`, `build/`, `.output/` auto-detectados) con MIME correctas.
- SPA routing con fallback a `index.html` para cualquier ruta no-asset
- **HTML rewriting automático**: inyecta `<base href="/:username/:repo/">` + stripea el atributo `crossorigin` + reescribe paths absolutos (`src="/"`, `href="/"`, `fetch("/"`, `new URL("/"`) para compatibilidad total con Vite SPAs, React Router BrowserRouter, y frameworks como Next.js, Nuxt, Astro
- **Build config determinista**: modal de configuración con framework preset (Auto/Vite/Next/Nuxt/Astro/HTML/Custom), build command y output directory editables
- **Auto-detect de framework**: escanea `package.json` (deps, scripts) y archivos de configuración (`vite.config.ts`, `next.config.js`, etc.)
- **Build trigger manual**: botón "Build Now" en toolbar, spawn `buildCommand` via `bash -c`, transmite logs en vivo por WS
- **Logs de build en tiempo real**: panel colapsable con stdout/stderr stream, auto-scroll
- **Build endpoint**: `POST /api/preview/build?repo=X` con abort (`POST /api/preview/build/abort`)
- **Persistencia**: configuración guardada en `.preview.json` dentro del repo workspace
- Toolbar con estado de build (idle/building/ready/error), recargar, abrir en nueva pestaña (usando `noreferrer`)
- Modos responsive: 375px, 768px, 1280px y Full
- Detección automática de build via WebSocket: regex que cubre 10+ comandos
- `fs.watch` sobre el build dir con polling fallback cada 2s para Docker overlay filesystems
- Framework-agnóstico — compatible con React (Vite), HTML estático, Next.js, Nuxt, Astro, etc.


### Task Runner (Supervisor Loop)
- Decompose high-level goals into sequential task steps using active session LLM
- Persistent runner state saved in session `tasks.json`
- Start, pause, reset, and manual adjustments (add, reorder, edit, delete steps) of the queue
- Auto-continuation loop (Supervisor) running asynchronously in server background
- Premium sliding Tasks side panel with shimmers, pulse spinners, and expanded task execution output logs

### Integrations Hub
- Dynamic and fully customizable integrations catalog configured per user on the server
- Automatic integration status detection linked with existing user-level environment variables
- Repository-specific context variables linked dynamically to resources (GitHub repos, Coolify applications, Neon databases, Vercel projects)
- Dynamic Quick Action buttons triggering custom workflows with variable replacements sent as chat prompts to the agent

### Programmatic Agents & First-Class Context (`agentId`)
- **Independent AI Workers**: Programmatic agents with isolated workspaces at `/tmp/crewfactory/{username}/agents/{agentId}/workspace` and persistent definitions (`definition.json`), fully isolated per user.
- **Factory Architecture**: Factory function `createAgentServer` producing lightweight Hono servers per agent.
- **Unified Chat Integration**: Integrated directly into main `ChatArea` as a First-Class Context (`agentId`), providing isolated sessions, custom system prompts, inherited skills, and model selection.

### Multi-Agent Group Channels (`channelId`) & Mention System
- **Collaborative Group Spaces**: Multi-agent channels with isolated workspaces at `/tmp/crewfactory/{username}/channels/{channelId}/workspace` and append-only message logs (`messages.jsonl`), fully isolated per user.
- **Session Message Isolation**: Channel message histories and live WebSocket streams strictly isolated per session ID (`sessionId`).
- **Sequential Orchestrator & Configurable Depth**: Dynamic execution depth control with configurable `maxChainDepth` per channel (default 5, editable up to 20 via UI).
- **Configurable Thought & Tool Visibility**: Options (`showThinking` and `showTools`) to toggle the visibility and real-time streaming of agents' reasoning (thinking blocks) and tool execution details inside the channel chat.
- **Flexible Reply Modes**: `user-only` (responds to human), `broadcast` (triggers all channel agents), `targeted` (responds to selected peers), and `mention-only` (responds exclusively when explicitly tagged).
- **@Mention Tagging System**: Real-time `@name` / `@id` / `@user` parsing, interactive autocomplete dropdown in `InputArea`, roster prompt injection, and markdown highlight rendering.
- **Differentiated Communication Protocol & Anti-Chatter**: Context-aware prompts distinguishing User messages (direct assistance & task delegation) from Peer Agent messages (silent mode `(silent)` when no new work deliverable exists, eliminating courtesy ping loops).
- **Execution Abort Mechanism**: Instant server-side cancellation (`abortDispatch`) triggered via WS `channel_abort`, REST `/api/channels/:id/abort`, or the UI Stop button.
- **Environmental Context Variables**: Structured key-value context array per channel (`context: ChannelContextItem[]`), dynamically injected into agent prompts.
- **Clean Sub-header & Modal Management**: Floating `ChannelMembersModal`, `ChannelContextModal`, and `ChannelSettingsModal` accessible via subtle header icon buttons with numeric counter badges.

### Global Logs Console
- **Real-Time System Monitoring**: Live dashboard showing all system operations (user/agent messages, raw reasoning deltas, tool start/end parameters/results) across any session or channel.
- **Central Event Broker**: Singleton server module (`eventBroker`) buffering recent logs in-memory and broadcasting events via WebSockets.
- **Rich Interactive Control**: Filtering by source type (Sessions/Channels) and event type (Messages/Thoughts/Tools), manual scrolling freezer, screen log clearing, and WebSocket connection status badges.

### AutoConsulting Multi-Agent Pi Integration (`autoconsulting`)
- **WebBuilder Agent**: Autonomous A2A agent powered directly by `@earendil-works/pi-coding-agent` SDK (port 4104).
- **Project Workspaces**: Each project maintains its own isolated workspace at `/tmp/ac-projects/{projectId}`.
- **Deployment Skills**: Pre-installed static skills for GitHub (`github-deploy`), Cloudflare (`cloudflare-deploy`), and Neon Postgres (`neon-db`).
- **Real-Time Streaming API & WS**: Server mounts `/api/pi/projects` endpoints and `/ws/pi` WebSocket handler for live streaming of tool executions and agent responses.
- **Interactive UI**: `PiProjectWorkspaceView` tab inside `ProjectDetailView` allowing users to chat directly with Pi coding agents, track active skills, and monitor token usage.

### Config & Workspace Backup (Portability)
- **Lightweight Export**: Generates a compact zip containing only configuration files (`credentials.json`, `auth.json`, `integrations.json`, `env.json`), user programmatic agent definitions, custom channel definitions, and global workspace skills.
- **Full Workspace Backup**: Generates a complete backup zip including all configurations, agent/channel definitions, short/long-term memories, uploaded assets, and project repositories.
- **Strict Size/Memory Exclusions**: Walk algorithm automatically filters and ignores memory-intensive build assets (`node_modules/`, `.git/`, `dist/`, `build/`, `.next/`, `.output/`) to prevent server memory bloat.
- **Merge/Overwrite Restoration Modes**: Supports merging zip configurations with current setups, or cleanly wiping all data before overwrite.
- **Safety Preflight & Warnings**: Shows warning modals on destructive overwrite imports, offering quick backup downloads and text verification inputs.

### Task Delegation & Meta-Agent Optimization Loop
- **Unified CLI Delegation**: Command-line helper script `scripts/delegate.ts` executed via Bun. Lets the global meta-agent delegate prompt execution to programmatic agents (`--agent`), channels (`--channel`), or repository sessions (`--repo`) with live SSE streams rendered directly to stdout.
- **Active Observation API**: Endpoint `GET /api/agents/:id/observe` (SSE) providing live streaming of internal agent execution events (thoughts, text deltas, tool calls, errors).
- **Execution Log Store**: Structured folder persistence under `/tmp/crewfactory/{username}/[agents|repos]/{id}/executions/{execId}/` saving prompt execution detail files (`prompt.json`, `messages.jsonl`, `tool-calls.json`, `errors.json`, `summary.json`) upon completion.
- **Continuous Optimization Loop**: Factory skills `factory-delegate`, `factory-observe`, and `factory-quick-actions` teaching the global director how to delegate tasks, inspect execution reports, detect repetitive sequences, and compile/register optimized Quick Actions.
- **Rich Monitoring UI**: "Historial" (Executions) logs tab in `AgentsPage.tsx` with collapsable tool detail pre-blocks and real-time Observed status indicators in `ChatArea.tsx`.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Login, returns JWT |
| GET | /api/auth/me | Current user info |
| GET/POST/DELETE | /api/sessions | Session CRUD (supports optional `repoName`) |
| POST | /api/sessions/:id/prompt | Send prompt (REST) |
| POST | /api/sessions/:id/model | Set active model |
| GET | /api/sessions/:id/messages | Get session messages |
| POST | /api/sessions/:id/abort | Abort generation |
| GET | /api/models | Available models (dynamic from SDK) |
| GET | /api/providers | List providers with auth status |
| GET | /api/providers/:id/models | Models for a provider |
| POST | /api/providers/:id/key | Set API key |
| DELETE | /api/providers/:id/key | Remove API key |
| GET | /api/preview/state | Get preview build state for a repo (`?repo=name`) |
| GET | /api/preview/config | Get preview build config (`?repo=name`) |
| POST | /api/preview/config | Save preview build config (framework, buildCommand, outputDir) |
| POST | /api/preview/build | Trigger build from config (`?repo=name`) |
| POST | /api/preview/build/abort | Cancel running build (`?repo=name`) |
| GET | /api/preview/{username}/{repoName}/* | Serve static files from repo build dir with SPA fallback (path-based isolation, no token) |
| GET | /api/workspace-repos | List repos in workspace/repos/ |
| POST | /api/workspace-repos | Create empty repo or clone from Git URL |
| PATCH/DELETE | /api/workspace-repos/:id | Rename project name or delete project (and sessions) |
| GET/PUT/POST/DELETE/PATCH | /api/workspace/* | Workspace file operations (supports `?repo=name`, `?agentId=id`, `?channelId=id` scoping) |
| GET | /api/sessions/:id/tools | Get active tool permissions for session |
| POST | /api/sessions/:id/tools | Set and persist tool permissions for session |
| GET | /api/sessions/:id/tasks | Get session task runner state |
| POST | /api/sessions/:id/tasks | Set and persist task checklist |
| POST | /api/sessions/:id/tasks/decompose | Trigger AI subtask decomposition |
| POST | /api/sessions/:id/tasks/run | Start/resume the supervisor loop |
| POST | /api/sessions/:id/tasks/pause | Pause execution and abort active stream |
| POST | /api/sessions/:id/tasks/reset | Reset all steps to pending and clear logs |
| GET | /api/integrations/templates | List all configured integration templates |
| POST | /api/integrations/templates | Update or define new integrations and custom quick actions |
| GET | /api/integrations/bindings/:repoName | Get repository linkages for active repository |
| GET/POST/PATCH/DELETE | /api/agents | Agent registration, listing, updating (restarts server), and deletion (and sessions) |
| GET | /api/agents/:id/observe | SSE event stream of agent actions, thoughts, and tools |
| GET | /api/agents/:id/executions | List saved execution logs for the agent |
| GET | /api/agents/:id/executions/:execId | Retrieve detail logs of a specific agent execution |
| POST | /api/sessions/:id/prompt/stream | Stream prompts (SSE) for standard repository-scoped sessions |
| GET | /api/sessions/repos/:repoName/executions | List saved execution logs for the repository |
| GET | /api/sessions/repos/:repoName/executions/:execId | Retrieve detail logs of a specific repository execution |
| GET/POST/PATCH/DELETE | /api/channels | Channel CRUD, member management (`/members`), context variables (`PUT /:id/context`), abort execution (`POST /:id/abort`), and message dispatch (`/send`) |
| GET | /api/backup/export | Export zip backup (supports ?type=light|full) |
| POST | /api/backup/import | Import zip backup (supports ?mode=merge|overwrite) |
| GET | /api/health | Health check |


## Architecture

```
apps/client/   React 19 + Vite + Tailwind CSS v4 + Framer Motion
apps/server/   Bun + Hono + Zod + @earendil-works/pi-coding-agent SDK
packages/shared/  Shared Zod schemas and types
```

### Key Server Modules
- `pi/session-manager.ts` — Singleton managing AgentSession lifecycle, authStorage, modelRegistry and workspace CWD per user. Supports `repoName` for hybrid agent instantiation. Persists session metadata in `{sessionDir}/metadata.json`.
- `pi/task-runner.ts` — Task runner queue storage and supervisor background loop execution.
- `routes/files.ts` — Workspace file CRUD API with `?repo=name` scoping and `/workspace-repos` endpoints for repo management.
- `routes/preview.ts` — Preview file serving, config CRUD (`/config`), and build trigger/abort (`/build`)
- `pi/preview-config.ts` — Auto-detect framework from `package.json`/config files, load/save `.preview.json`
- `pi/preview-builder.ts` — Spawn build via `bash -c`, stream stdout/stderr logs via WS, abort support
- `pi/preview-watcher.ts` — `fs.watch` on build dir, build status detection, broadcast preview_status via WS
- `lib/auth-helpers.ts` — Shared `getUsername()` helper supporting `?token=` query param and `Authorization` header
- `routes/providers.ts` — Dynamic provider configuration API
- `routes/backup.ts` — Backup Hono router for exporting and importing zip archives.
- `routes/models.ts` — Model listing from SDK's modelRegistry.getAvailable()
- `routes/sessions.ts` — Session CRUD, tool permissions, and task runner endpoints
- `agents/create-agent-server.ts` — Factory for isolated agent Hono servers. Inherits user authStorage and modelRegistry.
- `agents/agent-registry.ts` — Singleton managing programmatic agent lifecycle and filesystem persistence.
- `channels/channel-store.ts` — Filesystem store for channel definitions and message logs.
- `channels/channel-orchestrator.ts` — Sequential multi-agent message dispatch and recipient resolution.
- `routes/agents.ts` — REST endpoints for programmatic agent management.
- `routes/channels.ts` — REST endpoints for channel CRUD and member administration.
- `ws/handler.ts` — WebSocket auth via JWT, streaming via session.subscribe(), and channel event broadcasting.
- `middleware/auth.ts` — JWT verification middleware for REST routes
- `preview-server.ts` — Standalone static file server on port 3001 with path-based isolation for project preview (no auth tokens in URLs)

### Key Client Modules
- `pages/DashboardPage.tsx` — Initial view: lists repos, creates/clones Git projects, accesses global workspace.
- `pages/AgentsPage.tsx` — Management dashboard for programmatic agents.
- `pages/ChannelsPage.tsx` — Management dashboard for multi-agent channels with card actions.
- `components/channels/ChannelChatArea.tsx` — Dedicated container for channel WS streaming and multi-agent execution.
- `components/channels/ChannelMessageList.tsx` — Multi-agent message list with agent badges, avatars, and RichMarkdown.
- `components/channels/ChannelMembersModal.tsx` — Floating modal for member management and targeted agent selection.
- `components/channels/ChannelContextModal.tsx` — Floating modal for managing key-value channel context variables.
- `hooks/useWebSocket.ts` — WebSocket client with auto-reconnect, event subscription
- `components/chat/ModelSelector.tsx` — Nested dropdown for provider/model selection
- `pages/SettingsPage.tsx` — Provider, global env variables, and Integrations Hub template editor.
- `components/layout/AppRouter.tsx` — Context-aware router supporting Repo, Agent, and Channel active modes.
- `components/layout/MainLayout.tsx` — App shell with persistent left Sidebar (Slack-like), breadcrumb navigation in the header, and a right-side SessionDrawer trigger button.
- `components/chat/ChatArea.tsx` — Single-agent/project message list, streaming state, layout structure with side-by-side right drawer.
- `components/sidebar/SessionSidebar.tsx` — Left sidebar displaying active context, navigation links (Chat, Workspace, Preview), collapsible accordions for Proyectos (Repos), Agentes, and Canales, and administration links.
- `components/sidebar/SessionDrawer.tsx` — Sliding right drawer containing session history list, message counts, session statuses, creation, and deletion controls.
- `components/preview/PreviewPanel.tsx` — Full-page iframe preview with build status, toolbar, and responsive mode toggle
- `components/ui/Logo.tsx` — CrewFactory logo component (favicon-based, responsive sizing).
- `components/workspace/WorkspacePanel.tsx` — File explorer scoped to active workspace.
