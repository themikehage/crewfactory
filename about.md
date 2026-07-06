# CrewFactory
**Type:** PRODUCTION
**Description:** Web interface for CrewFactory with real-time streaming, multi-session chat, user authentication, and dynamic provider management. Powered by a local vendored AI agent runner module.
**Stack:** Bun, Hono, React 19, Vite, TypeScript (strict), Tailwind CSS v4, Framer Motion, WebSocket
**Theme:** oklch theme (Tailwind CSS v4) with light and dark mode (dark by default)
**Deployment Target:** Coolify (Docker)
**Database Tier:** No database (localStorage client-side, filesystem sessions server-side at /tmp/crewfactory)

## Features

### Authentication
- JWT-based login with bcrypt password hashing
- Credentials via Coolify env vars (AUTH_USERNAME, AUTH_PASSWORD_HASH base64-encoded)
- Protected routes and WebSocket connections

### Chat & Streaming
- Multi-session chat (create, switch, delete sessions)
- Real-time streaming via a **single shared WebSocket connection** (`wsClient` singleton) with automatic exponential-backoff reconnect
- Message rendering: user, assistant, tool calls, thinking blocks
- Abort active generation
- Steer/follow-up during streaming (Enter=steer, Alt+Enter=follow_up)
- Context Window Meter with token usage bar and manual Compact button
- **Streaming Reconnection & Session Persistence:** Resolves page refresh issues during active streaming (e.g., waiting for long-running tools). Real-time message synchronization updates the session's active messages on every append, while the WebSocket handler immediately pushes current streaming states (`agent_start`) and token context meters upon client reconnection, marking the last assistant message as active.
- **Virtualized Execution Sessions:** API and CLI executions for Agents, Repositories, and Channels are virtualized as read-only sessions in the chat UI. Toggled via a switch in the session popover, showing historical log messages with distinct "API" / "CLI" badges and locking the chat input to prevent interactive steer inputs.
- **Rutas Jerárquicas Estructuradas:** El router enruta de forma contextualizada las vistas en la URL (ej: `/repos/{repoName}/session/{sessionId}`, `/repos/{repoName}/workspace`, `/agents/{agentId}/...`). Al recargar la página se mantiene al 100% el estado del contexto de trabajo y las breadcrumbs dinámicas reflejan exactamente la jerarquía del usuario (`Proyectos / got / Files`).
- **Ubicación de Sesiones:** El popover de gestión de sesiones de chat fue movido de la cabecera global a la barra de navegación de pestañas (Chat, Files, Preview) pegado a la derecha, agrupando el control de las sesiones directamente al espacio donde pertenecen.

### Multimedia Support (Images & Documents)
- **Hybrid Input Strategy**:
  - **Images**: converted to base64 on client and sent inline via WebSocket using the vendored agent runtime's native vision parameters (`images?: ImageContent[]`). Image grid in chat supports click-to-expand modal with fullscreen overlay, Escape to close, and authenticated image loading.
  - **Documents (PDF, Office, etc.)**: uploaded via Multipart HTTP POST directly to the workspace storage folder (`assets/uploads`), auto-appending workspace paths to the prompt so agents can read them.
- **Visual Preview Templates (Premium UI)**:
  - **PDFs**: rendered inline via authenticated iframe viewers with "Open in New Tab" controls.
  - **Audio & Video**: embedded natively using HTML5 `<audio>` and `<video>` players with customizable layouts.
  - **Office Documents (DOCX, XLSX, PPTX, etc.)**: rendered as premium info cards with extension badges and direct authenticated download buttons.
- **Syntax Highlighting in Workspace**: Code files in `WorkspaceFileEditor` receive language-class tags (`language-typescript`, `language-json`, etc.) based on file extension for CSS syntax highlighting support.

### Provider Management
- Dynamic provider configuration via web UI (no env vars needed)
- Native OpenAI-compatible cloud providers, Qwen Cloud, and OpenCode Go (Anthropic, OpenAI, Google, DeepSeek, Groq, Mistral, Qwen, OpenCode Go, etc. routed via compatible endpoints)
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

### Theme & Localization
- oklch theme with light and dark mode support (dark by default)
- **Theme toggle** in Settings (General): Dark / Light / System, persisted in localStorage, applied via class on `<html>` with `matchMedia` listener for system preference
- **Language selector** in Settings (General): English / Spanish, persists locale in localStorage, uses per-component `.literals.ts` files for full i18n coverage
- Colors: defined dynamically using oklch values (bg, card, popover, primary, secondary, muted, accent, destructive, border, input, ring, sidebar, etc.)
- Typography: Outfit (sans), JetBrains Mono (mono)
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

### AG-UI Protocol & Interactive Agent Components
- **Generative UI Pipeline:** Bridges agent-to-frontend execution via custom tool call interceptions, enabling rich components to render directly in the message stream.
- **Interactive Approvals:** The `request_approval` tool suspends agent backend execution on critical tasks, rendering a warning card with a premium animated layout (custom buttons, severity indicators, pulsing active dot, and fluid Framer Motion transitions) and markdown tech details. Settled reactively via WebSocket `ui_action`.
- **Inline Rich Charts:** The `render_chart` tool allows agents to display responsive line, bar, pie, and area charts using Recharts, integrated with Tailwind CSS v4 dark tokens.
- **Natural Session Persistency:** Interactive components are mapped natively as standard agent tool calls/results, meaning they survive server reboots and restore their state upon session reopening.
- **Robust Multi-File Creation:** The `propose_code_change` tool recursively creates parent directories if they do not exist before writing proposed content, preventing ENOENT failures on new directories.
- **Streaming & API Fault-Tolerance:** UI card components (`DynamicFormCard`, `DiffApplyCard`, `ApprovalForm`, `AgentConfigCard`, `MediaCard`) feature defensive object destructuring and default parameters, preventing React runtime crashes when arguments are streamed partially or are undefined. Additionally, `AgentConfigCard` handles API failures gracefully without freezing, and `MediaCard` utilizes declarative React error states for image fallbacks to avoid DOM duplication or leaking partially resolved keys like `[Media Asset: undefined]` during streaming, integrating authenticated image fetching to securely load assets from protected workspace pathways.
- **Reactive UI Refreshes:** The `refresh_ui` tool allows agents to notify the user's interface to dynamically reload specific sections or all sidebar lists (projects, agents, channels, experiments, and skills) in real-time immediately after modifying workspace resources.
- **Subagent Native Delegation (`spawn_subagent`):** Official worker agent tool using the fire-and-wait model (Option A). Enables orchestrator agents to run focused, self-contained subtasks in fresh-context sessions, persisting full message logs and `metadata.json` mapping relations under `sessions/{parentId}/subagents/sub_{toolCallId}/`. Automatically propagates `AbortSignal` for instant subagent cancellation and expects a structured YAML/YAML-like result envelope (status, executive_summary, artifacts, risks).


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

### Dynamic Model Sourcing & Capabilities Matrix
- **Hot-Reloading Catalog**: Supports the `POST /api/providers/:id/refresh` endpoint to query dynamic models in real-time from endpoints (like OpenCode Go or Qwen) with credentials.
- **AI Capability Inference**: Automatically evaluates returned model naming patterns (heuristics) to resolve and bind critical engine flags (`reasoning`, `multimodal` vision, context sizes) dynamically.
- **Provider Info Modal**: Interactive details panel in Settings showing a comprehensive overview matrix of the model IDs, contexts, and capabilities (Text/Vision/Reasoning tags) for connected providers.

### Programmatic Agents & First-Class Context (`agentId`)
- **Independent AI Workers**: Programmatic agents with isolated workspaces at `/tmp/crewfactory/{username}/agents/{agentId}/workspace` and persistent definitions (`definition.json`), fully isolated per user.
- **Factory Architecture**: Factory function `createAgentServer` producing lightweight Hono servers per agent.
- **Unified Chat Integration**: Integrated directly into main `ChatArea` as a First-Class Context (`agentId`), providing isolated sessions, custom system prompts, inherited skills, and model selection.
- **Agent Profile Photos**: Agents support optional avatars via `avatarUrl`. Upload/remove avatar in the agent edit modal. Avatar stored server-side at `/tmp/crewfactory/{username}/agents/{agentId}/avatar.*` and served via `GET /api/agents/:id/avatar`.

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
- **Hierarchical Roles & Visual Org Chart**: Channel members can be assigned hierarchical roles (`lead`, `senior`, `member`, `observer`). Displays Lead indicators in the sub-header and card previews. Features an interactive SVG-based Org Chart view rendering orthogonal branching tree connections on desktop, with a grouped card list fallback on mobile devices.


### Multi-Variant Agent Benchmarking Laboratory (`experimentId`)
- **Decoupled Architecture**: No hardcoding or concrete project coupling. Standardized blueprints loaded dynamically from JSON configurations (`apps/server/src/laboratory/blueprints/`).
- **Sequential Multi-Variant Runs**: Executes three variants sequentially to prevent rate limits:
  1. **Single Agent (Baseline)**: Virtual single-agent channel.
  2. **Multi-Agent No Leader (Horizontal)**: Direct debate using a sequential round-robin execution loop with consensus barriers to prevent infinite chatter loops.
  3. **Multi-Agent With Leader (Hierarchical)**: Targeted debate moderated by a lead agent with a structured negotiation protocol (agreement, counter-offers, round tracking, escalations).
- **LLM-Judge Evaluation**: Automated judge scoring outputs from 0-100 on customizable criteria, providing reasons.
- **Compound Scoring Engine**: Computes Global Score based on weights (50% Quality, 30% Efficiency, 20% Negotiation). Efficiency calculated using execution time and token overhead relative to Single Agent baseline.
- **Dynamic Predefined Catalog**: Supports pre-configured dichotomy templates (e.g. Cost vs Quality, Speed vs Safety, Simplicity vs Features) to suggest stances and generate agent briefings.
- **Interactive UI Dashboard**: Includes a step-by-step setup wizard (Template/Scratch), live WebSocket multi-column execution logs, custom SVG metrics comparison charts, and metrics matrices.
- **Rediseño de Navegación Premium & Enrutamiento URL**: Se removió el sidebar lateral interno de la página de laboratorio para maximizar el espacio útil. La navegación por sub-pestañas internas se eliminó por completo en favor de una ruta navegable y recargable en la URL (ej: `/laboratory` para crear un experimento, `/laboratory/:experimentId` para cargar un experimento específico). Un popover desplegable (`ExperimentPopover`) permite ver y gestionar el histórico de experimentos de forma unificada.
- **Generación y Creación Unificada (Generador IA)**: La creación de experimentos mediante modales se unificó directamente dentro del Generador IA (vista por defecto cuando no hay un experimento activo). El usuario describe la tripulación que desea generar, y tras su generación, puede ajustar directamente en el panel el **Nombre del Experimento** y los **Criterios de Evaluación** del LLM-Judge antes de hacer clic en **"Crear Experimento"**, lo cual registra el experimento y redirige por URL al instante.
- **Visualización del Debate del Laboratorio en Tiempo Real mediante Chat**: El detalle del experimento reemplaza la visualización estática de 3 columnas por un sistema de pestañas individuales para cada variante (Baseline, Horizontal, Jerárquico). Cada pestaña integra el componente de chat `ChannelMessageList` y se conecta de forma reactiva a la sesión mediante WebSockets, permitiendo ver el streaming en vivo de tokens, razonamientos colapsables y llamadas a herramientas a medida que los agentes debaten en tiempo real. Se muestra una sección lateral con métricas de telemetría y puntuaciones del LLM-Judge en formato de widget circular.
- **Arquitectura de Componentes Modulares**: Refactorización completa de la vista del Laboratorio dividiéndola en subcomponentes lógicos especializados (`VariantViewer`, `JudgeReport`, `IaGenerator`, `ExperimentEditorModal`, `RunExperimentModal`) que reducen la complejidad y mejoran la mantenibilidad del código cliente.
- **Bypass Autónomo No-Blocking**: Las herramientas interactivas del protocolo AG-UI (`request_approval` y `ask_question`) se auto-resuelven de forma instantánea y autónoma cuando el agente corre dentro de una simulación de laboratorio (`isLaboratory` flag), permitiendo que el Baseline y demás tracks finalicen de principio a fin sin interrupciones.
- **Cálculo Exacto de Tokens Consumidos**: Se corrigió el cálculo de tokens consumidos en corridas de variantes e hilos de comparación (benchmarks/harness). Al finalizar cada ejecución, los tokens consumidos por mensaje en el prompt del LLM se estampan como metadatos (`tokensIn` y `tokensOut`) en cada `ChannelMessage` del canal virtual. El cálculo agrega estos valores directamente y cuenta con un fallback dinámico que consulta los estados acumulados de las sesiones persistentes en `agentRegistry`.
- **Judge Management UI — Scores por Criterio + Evaluación On-Demand**: Los scores per-criterio (`criteriaScores` como `Record<string, number>`) y el `judgeReasoning` del LLM-Judge ahora se **persisten** en `VariantRunResultSchema.scores` (campos opcionales, no rompen datos existentes). El motor de scoring (`scoring.ts`) acepta un `judgeDetail` opcional y lo propaga al resultado. El runner pasa reasoning + criteriaScores del judge para las 3 variantes. Nuevo endpoint **`POST /api/experiments/:id/judge`** para re-evaluar (on-demand) un experimento ya `completed` con las tres variantes con `finalOutput`: corre `LabJudge.evaluateRuns()`, recalcula scores, guarda el experimento y hace `broadcastToUser` con `experiment_status` (`running -> activeVariant: "judging"`, `completed -> experiment`). La UI agrega un **tab "Comparativa"** en el header (visible solo cuando `status === "completed"`) con cards side-by-side de las 3 variantes, `globalScore` con corona para la ganadora, tabla de desglose por criterio en columnas (top score destacado en `primary`), y reasoning del judge en cards colapsables por variante. Botón **"Re-evaluar con Judge"** disponible tanto dentro de la vista comparativa (con spinner) como en el popover de opciones del header (entre Ejecutar y Editar, solo cuando `completed`). Estado `isJudging` local gestionado por el botón on-demand. Nota: el cliente infiere `VariantRunResult` desde un tipo espejo local en `apps/client/src/types/laboratory.ts` (no desde el Zod schema de `packages/shared`), sincronizado también con los campos nuevos.
- **Configuración de Agentes Dinámica y Reglas de Negocio**: Permite añadir y remover agentes de la propuesta generada por IA en tiempo real. Notifica visualmente al usuario sobre la regla de negocio que requiere un mínimo de 3 agentes para habilitar los tracks colaborativos del experimento (Colaboración Horizontal y Jerárquica), inhabilitando las acciones de creación e instanciación si no se cumple con el mínimo requerido.




### Global Logs Console
- **Real-Time System Monitoring**: Live dashboard showing all system operations (user/agent messages, raw reasoning deltas, tool start/end parameters/results) across any session or channel.
- **Central Event Broker**: Singleton server module (`eventBroker`) buffering recent logs in-memory and broadcasting events via WebSockets.
- **Rich Interactive Control**: Filtering by source type (Sessions/Channels) and event type (Messages/Thoughts/Tools), manual scrolling freezer, screen log clearing, and WebSocket connection status badges.

### AutoConsulting Multi-Agent Pi Integration (`autoconsulting`)
- **WebBuilder Agent**: Autonomous A2A agent powered by the local AI runner module (port 4104).
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

### Model Context Protocol (MCP) Marketplace & Gallery
- **Single Source of Truth**: MCP configuration lives exclusively in the dedicated `/mcps` page. The Settings tab no longer duplicates MCP management; instead it provides a quick link to `/mcps`.
- **Predefined Catalog Gallery**: Browse and install popular MCP servers (Filesystem, GitHub, PostgreSQL, Puppeteer, Memory Graph, Brave Search) with a single-click installation.
- **Custom Stdio & HTTP support**: Register custom servers using local stdio commands (Node/Python subprocesses) or remote HTTP/SSE links.
- **Preflight Connection Testing**: Connect to a server temporarily to discover and list tools before saving the configuration.
- **Automatic dynamic agent tools injection**: Automatically connects enabled MCP servers at session startup, registers discovered tools with namespaced prefix `mcp_${serverId}_${toolName}`, and transparently routes tool executions.
- **Process Lifecycle Guard**: Gracefully stops and cleans up active subprocess connections at session termination or process exit (SIGINT/SIGTERM) to avoid zombie processes.
- **Workspace Sandboxing**: Replaces `$WORKSPACE_DIR` dynamically to restrict directory-level tools access strictly to the user workspace `/tmp/crewfactory/{username}/workspace` for multi-user security.
- **Preserved Active State & SDK Compatibility**: Preserves active MCP tools during client prompt events and REST permissions updates to prevent deactivation side-effects. Automatically translates MCP content (text and base64 images) into conforming `AgentToolResult` outputs.

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
| GET/POST/PATCH/DELETE | /api/channels | Channel CRUD, member management (`/members`), context variables (`PUT /:id/context`), abort execution (`POST /:id/abort`), message dispatch (`/send`), benchmark suite (`/benchmark`), and prompt optimization (`/optimize`) |
| GET/POST | /api/mcp | Retrieve and update the full Model Context Protocol (MCP) server configuration settings |
| GET | /api/mcp/catalog | Retrieve the official marketplace pre-curated collection of servers |
| GET | /api/mcp/servers | Retrieve the list of all configured user servers |
| POST | /api/mcp/servers | Create a new custom server configuration |
| PUT | /api/mcp/servers/:id | Update an existing server configuration |
| DELETE | /api/mcp/servers/:id | Uninstall or delete a server configuration |
| POST | /api/mcp/servers/:id/connect | Manually trigger a global client connection test |
| POST | /api/mcp/servers/:id/disconnect | Disconnect active global client connection |
| POST | /api/mcp/servers/test-connection | Preflight connection tester endpoint (no persist) |
| POST | /api/mcp/catalog/:id/install | Install built-in server from the gallery |
| GET | /api/mcp/status | Query statuses of all configured servers |
| GET | /api/backup/export | Export zip backup (supports ?type=light|full) |
| POST | /api/backup/import | Import zip backup (supports ?mode=merge|overwrite) |
| POST | /api/skills/reset | Reset default manager skills (prefixed with factory-) |
| GET | /api/health | Health check |


## Architecture

```
apps/client/   React 19 + Vite + Tailwind CSS v4 + Framer Motion
apps/server/   Bun + Hono + Zod + Local AI Runner Module (src/ai/)
packages/shared/  Shared Zod schemas and types
```

### Key Server Modules
- `ai/` — Vendored and decoupled core agent runtime, including ModelRegistry, SessionManager (persistence), DefaultResourceLoader, AuthStorage, BashTool, and loadSkills.
- `pi/session-manager.ts` — Singleton managing local AgentSession lifecycle, authStorage, modelRegistry and workspace CWD per user. Supports `repoName` for hybrid agent instantiation. Persists session metadata in `{sessionDir}/metadata.json`.
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
- `routes/sessions.ts` — Session CRUD, tool permissions, and task runner endpoints (awaited on critical reads to prevent race conditions during initialization)
- `agents/create-agent-server.ts` — Factory for isolated agent Hono servers. Inherits user authStorage and modelRegistry.
- `agents/agent-registry.ts` — Singleton managing programmatic agent lifecycle and filesystem persistence. `get(id, username?)` enforces ownership when username is provided.
- `channels/channel-store.ts` — Filesystem store for channel definitions and message logs.
- `channels/channel-orchestrator.ts` — Sequential multi-agent message dispatch and recipient resolution.
- `benchmark/harness.ts` — Background benchmark harness runner comparing Conditions A vs B.
- `benchmark/optimizer.ts` — Meta-Agent loop refining prompts based on benchmark metrics.
- `pi/mcp-client.ts` — Stdio and HTTP/SSE JSON-RPC Client for MCP Server integrations with Bun (with 5-second request timeouts).
- `pi/mcp-registry.ts` — Manager for MCP server lifecycle, catalog definitions, connection preflights, and dynamic tool injection (with parallel server startup).
- `routes/mcp.ts` — REST endpoints for MCP catalog, server configs management, manual connections, testing, and status queries.
- `routes/agents.ts` — REST endpoints for programmatic agent management.
- `routes/channels.ts` — REST endpoints for channel CRUD, member administration, benchmarks, and optimization.
- `ws/handler.ts` — Single WebSocket endpoint handling auth (JWT), session subscription (`session_subscribe`), channel dispatch, and event broadcasting. Uses `wsSocketMeta` reverse index for O(1) cleanup on disconnect. Wires `channelOrchestrator` and `eventBroker` broadcasters via injected functions (`setChannelBroadcastHandler`, `setEventBroadcaster`) to avoid circular dependencies.
- `lib/event-broker.ts` — Singleton buffering recent global log events per user (up to 150) and broadcasting to user WS sockets via injected `setEventBroadcaster()` (no dynamic require).
- `middleware/auth.ts` — JWT verification middleware for REST routes
- `preview-server.ts` — Standalone static file server on port 3001 with path-based isolation for project preview (no auth tokens in URLs)

### Key Client Modules
- `pages/DashboardPage.tsx` — Initial view: lists repos, creates/clones Git projects, accesses global workspace.
- `pages/AgentsPage.tsx` — Management dashboard for programmatic agents.
- `pages/ChannelsPage.tsx` — Management dashboard for multi-agent channels with card actions.
- `pages/MCPMarketplacePage.tsx` — Main MCP Marketplace page with tabbed views (Gallery catalog and Custom configurations).
- `components/mcp/MCPCard.tsx` — Card component representing a server, rendering connection statuses, toggles, errors logs, and discovered tools.
- `components/mcp/MCPCustomForm.tsx` — Form for custom stdio/HTTP server setup, environment variables editing, and connection testers.
- `components/ui/Toast.tsx` — Reusable premium Toast and ToastContainer components with Framer Motion animations.
- `components/channels/ChannelChatArea.tsx` — Dedicated container for channel WS streaming and multi-agent execution.
- `components/channels/ChannelMessageList.tsx` — Multi-agent message list with agent badges, avatars, and RichMarkdown.
- `components/channels/ChannelBenchmarkPanel.tsx` — Panel view rendering efficiency benchmark comparison reports (Condition A vs B).
- `components/channels/ChannelOptimizePanel.tsx` — Panel view managing prompt optimization auto-loops and timelines.
- `components/channels/ChannelMembersModal.tsx` — Floating modal for member management and targeted agent selection.
- `components/channels/ChannelContextModal.tsx` — Floating modal for managing key-value channel context variables.
- `lib/ws-client.ts` — **Singleton WebSocket client** shared across the entire app. Handles auth handshake, type-keyed event dispatch, exponential-backoff reconnect, and `session_subscribe` protocol. Replaces the per-hook WS connections that previously caused 3 simultaneous connections.
- `hooks/useWebSocket.ts` — Thin React wrapper over `wsClient`. Sends `session_subscribe` on connect and exposes `send`/`subscribe`.
- `hooks/useSessionStatusWs.ts` — Pure hook subscribing to `session_status` events via `wsClient`. No module-level mutable state.
- `hooks/useChannel.ts` — Channel data + WS event hook. Uses `wsClient.subscribe("*")` and filters by channelId/sessionId locally.
- `hooks/useRouter.ts` — Custom routing hook. Emits a global `popstate` event on pushState navigation to automatically sync independent hook states across SPA components.
- `components/chat/ModelSelector.tsx` — Nested dropdown for provider/model selection. Features reactive validation to automatically resolve fallback models in both frontend (`localStorage`) and backend session states when a selected provider key is disconnected.
- `pages/SettingsPage.tsx` — Shell page delegating to modular tab components under `components/settings/` (`GeneralTab`, `ProvidersTab`, `EnvVarsTab`, `IntegrationsTab`, `McpTab`).
- `components/settings/ProvidersTab.tsx` — Tab view managing API credentials. Features an interactive **Sincronizar** action for dynamic model fetching and an **Info** action displaying a premium capability matrix modal.
- `components/layout/AppRouter.tsx` — Context-aware router supporting Repo, Agent, and Channel active modes.
- `components/layout/MainLayout.tsx` — App shell with persistent left Sidebar (Slack-like), breadcrumb navigation in the header, and a right-side SessionDrawer trigger button.
- `components/chat/ChatArea.tsx` — Single-agent/project message list, streaming state, layout structure with side-by-side right drawer.
- `components/sidebar/SessionSidebar.tsx` — Left sidebar displaying active context, navigation links (Chat, Workspace, Preview), collapsible accordions for Proyectos (Repos), Agentes, and Canales, and administration links. Active highlight is suppressed when the current page is not a session view (Laboratory, Settings, Agents, Channels, etc.).
- `components/sidebar/SessionDrawer.tsx` — Sliding right drawer containing session history list, message counts, session statuses, creation, and deletion controls.
- `components/preview/PreviewPanel.tsx` — Full-page iframe preview with build status, toolbar, and responsive mode toggle
- `components/ui/Logo.tsx` — CrewFactory logo component (favicon-based, responsive sizing).
- `components/workspace/WorkspacePanel.tsx` — File explorer scoped to active workspace.
- `pages/LaboratoryPage.tsx` — Multi-variant benchmarking laboratory orchestration view.
- `components/laboratory/` — Dashboard panels including comparative metrics charts, live execution logs, historical sidebar, and step-by-step experiment wizard.
