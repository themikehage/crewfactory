# pi-web-wrapper
**Type:** PRODUCTION
**Description:** Web interface for pi coding agent with real-time streaming, multi-session chat, user authentication, and dynamic provider management. Wraps the @earendil-works/pi-coding-agent SDK.
**Stack:** Bun, Hono, React 19, Vite, TypeScript (strict), Tailwind CSS v4, Framer Motion, WebSocket
**Deployment Target:** Coolify (Docker)
**Database Tier:** No database (localStorage client-side, filesystem sessions server-side at /tmp/pi-web-users)

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

### Provider Management
- Dynamic provider configuration via web UI (no env vars needed)
- 35 supported providers from pi SDK (Anthropic, OpenAI, Google, DeepSeek, Groq, Mistral, etc.)
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
- Structured workspace per user at `/tmp/pi-web-users/{username}/workspace/`:
  - `repos/` — Git repositories, each is an isolated agent context
  - `assets/uploads/` — User-uploaded files
  - `assets/generated/` — Agent-generated outputs
  - `memories/repos/` — Per-repo agent notes
  - `memories/sessions/` — Short-term session context files
- **Global mode:** Agent CWD is the workspace root. Used for cross-repo tasks and admin.
- **Repo mode:** Agent CWD is `repos/{repoName}`. Sessions tagged with `repoName` in `metadata.json`. Sidebar and file explorer are scoped to the active repo.
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
- Sirve archivos estáticos desde el directorio de build (`dist/`, `build/`, `.output/` auto-detectados) con MIME correctas y `X-Frame-Options: SAMEORIGIN`
- SPA routing con fallback a `index.html` para cualquier ruta no-asset
- **HTML rewriting automático**: inyecta `<base href="/api/preview/">` + reescribe paths absolutos (`src="/"`, `href="/"`, `fetch("/"`, `new URL("/"`) para compatibilidad total con Vite SPAs, React Router BrowserRouter, y frameworks como Next.js, Nuxt, Astro
- **Build config determinista**: modal de configuración con framework preset (Auto/Vite/Next/Nuxt/Astro/HTML/Custom), build command y output directory editables
- **Auto-detect de framework**: escanea `package.json` (deps, scripts) y archivos de configuración (`vite.config.ts`, `next.config.js`, etc.)
- **Build trigger manual**: botón "Build Now" en toolbar, spawn `buildCommand` via `bash -c`, transmite logs en vivo por WS
- **Logs de build en tiempo real**: panel colapsable con stdout/stderr stream, auto-scroll
- **Build endpoint**: `POST /api/preview/build?repo=X` con abort (`POST /api/preview/build/abort`)
- **Persistencia**: configuración guardada en `.preview.json` dentro del repo workspace
- Toolbar con estado de build (idle/building/ready/error), recargar, abrir en nueva pestaña
- Modos responsive: 375px, 768px, 1280px y Full
- Detección automática de build via WebSocket: regex que cubre 10+ comandos
- `fs.watch` sobre el build dir con polling fallback cada 2s para Docker overlay filesystems
- Token de autenticación refrescado automáticamente al cambiar de repo o re-loguear
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
| GET | /api/preview/* | Serve static files from repo build dir with SPA fallback (`?repo=name&token=jwt`) |
| GET | /api/workspace-repos | List repos in workspace/repos/ |
| POST | /api/workspace-repos | Create empty repo or clone from Git URL |
| GET/PUT/POST/DELETE/PATCH | /api/workspace/* | Workspace file operations (supports `?repo=name` scoping) |
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
| POST | /api/integrations/bindings/:repoName | Update repository linkages for active repository |
| WS | /ws | WebSocket for real-time streaming (events: prompt, steer, follow_up, abort, compact, get_context_usage, context_usage) |
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
- `routes/models.ts` — Model listing from SDK's modelRegistry.getAvailable()
- `routes/sessions.ts` — Session CRUD, tool permissions, and task runner endpoints
- `routes/integrations.ts` — REST API for dynamic user-level integration templates and project bindings.
- `ws/handler.ts` — WebSocket auth via JWT, streaming via session.subscribe()
- `middleware/auth.ts` — JWT verification middleware for REST routes

### Key Client Modules
- `pages/DashboardPage.tsx` — Initial view: lists repos, creates/clones Git projects, accesses global workspace.
- `hooks/useWebSocket.ts` — WebSocket client with auto-reconnect, event subscription
- `components/chat/ModelSelector.tsx` — Nested dropdown for provider/model selection
- `pages/SettingsPage.tsx` — Provider, global env variables, and Integrations Hub template editor.
- `components/layout/AppRouter.tsx` — Routing logic with repo context state (global vs repo mode). Persists active context in localStorage.
- `components/layout/ChatLayout.tsx` — Mobile-first layout with collapsible sidebar
- `components/layout/MainLayout.tsx` — App shell with context-aware header (back to Dashboard button) and scoped SessionSidebar.
- `components/chat/ChatArea.tsx` — Message list, streaming state, error display, layout structure with side-by-side right drawer.
- `components/chat/RightDrawer.tsx` — Tabbed panel drawer container hosting Tasks and Infrastructure panels.
- `components/chat/TasksPanel.tsx` — Checklist component displaying subtasks, logs, and controls.
- `components/chat/InfrastructurePanel.tsx` — Renders input fields for repository mappings and quick action triggers.
- `components/sidebar/SessionSidebar.tsx` — Filters sessions by active `repoName`; creates sessions with correct context.
- `components/preview/PreviewPanel.tsx` — Full-page iframe preview with build status, toolbar, and responsive mode toggle
- `components/workspace/WorkspacePanel.tsx` — File explorer scoped to active repo via `?repo=` query param.
