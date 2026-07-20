# CrewFactory
**Type:** PRODUCTION
**Description:** Web interface for CrewFactory with real-time streaming, multi-session chat, user authentication, and dynamic provider management. Powered by a local vendored AI agent runner module.
**Stack:** Bun, Hono, React 19, Vite, TypeScript (strict), Tailwind CSS v4, Framer Motion, WebSocket
**Theme:** oklch theme (Tailwind CSS v4) with light and dark mode (dark by default)
**Deployment Target:** Coolify (Docker)
**Database Tier:** No database (localStorage client-side, filesystem sessions server-side at /tmp/crewfactory)

## Client Routing

- **React Router Route Tree:** `AppRoutes` is the single declarative entry point below `BrowserRouter`, with an authenticated `AppRouter` layout and independent leaves for chat, delegations, workspace, preview, teams, laboratory, pipelines, administration, MCP alias, and 404.
- **Typed Navigation Paths:** `router/paths.ts` centralizes contextual, session, delegation, and workspace URL construction. `WorkspaceContextProvider` owns active project, agent, and team state plus its persisted convenience data, keeping the URL as the route authority.
- **Native URL State:** Route elements derive identifiers from `useParams`, locations from `useLocation`, and session suffixes from splats. `WorkspaceContextProvider` reads contextual segments from the full pathname, so its pathless shell boundary cannot retain stale route parameters; localStorage is convenience persistence only.
- **Unified Workspace Context Reducer & URL Synchronization:** Transitions are managed by a single central reducer inside `useWorkspaceContextState`, ensuring atomic, idempotent transitions. By refactoring eager selection callbacks to only stage properties in `localStorage` and initiate navigation, the URL remains the single source of truth for context transitions, eliminating race conditions and sidebar flickering. Reducer initialization reconstructs active named contexts from stored state if the route parameters match upon page load.
- **Reactive Session Resolver:** `useSessionResolver` returns reactive resolution states (`resolvedSessionId`, `resolving`) instead of triggering imperative navigation inside effects, collapsing dependencies from 12 down to 4 using context keys. The shell layout displays a loader while resolving, avoiding blank unauthenticated websocket loops or interface flashes.
- **Shell and Laboratory Boundaries:** `AppRouter` limits itself to authentication, providers, shell coordination, and URL-driven mobile history. Its stack records each pathname once, workspace selection is idempotent, and session resolution is scoped to the current route context to prevent stale asynchronous redirects. Vite resolves React and React DOM as singletons. `LaboratoryContext` exposes the isolated controller to laboratory leaves and modals.

## Features

### Authentication & First-Run Onboarding
- **Better Auth Integration:** Cookie-based secure session management utilizing the framework's native SQLite adapter.
- **First-Run Onboarding:** Automatic first-run setup flow: the system detects if no users are registered and redirects to a welcome page to create an admin account.
- **Zero Env-Var Secrets:** Authentication secrets (`.auth-secret`) are securely auto-generated and persisted in the data directory upon first launch.
- **Unified Session Verification:** SQLite-backed synchronous session resolution mapping active cookies, query tokens, or headers directly to active user records.
- **Programmatic Session Tokens:** Automatically generates secure session tokens for background subagents and tool subprocess environments.

### Real-Time Session Visualization
- **Centralized Sessions Context (`SessionsContext`)**: React context providing the entire session list with live status merging. It loads a live status snapshot on mount from `/api/sessions/statuses` and merges subsequent real-time updates via WebSocket `session_status` events. Replaces scattered `useSessionStatusWs()` usage with a single provider-driven hook (`useSessions()`) exposing derived data: `workingCount`, `idleCount`, `doneCount`, `workingSessions`, `idleSessions`, `doneSessions`, and agent-centric helpers (`getAgentStatus`, `getAgentKanbanStatus`, `getTeamMemberStatus`, `getTeamMemberKanbanStatus`).
- **Sidebar Agent Status (Like Slack)**: Each agent in the sidebar `SessionSidebar` now shows a colored dot (green = has active/streaming session, gray = idle) based on real-time session state, providing instant awareness of agent activity.
- **Team Members Panel Status**: `MembersPanel` shows session-based status dots next to each member's avatar, indicating whether they have active sessions outside the team.
- **Team Org Chart Session Status**: `OrgFlowCanvas` (desktop) and `OrgFlowMobile` render a session-status indicator dot on each agent node, complementing the existing team-streaming indicator.
- **Session Kanban Board (`/sessions`)**: A dedicated board page (`SessionsKanbanPage`) displaying all sessions in three columns — **Idle** (sleeping sessions), **Working** (streaming/active/task-running), and **Done** (completed API/CLI executions). Each session card shows name, context badge, message count, and relative time. Clicking navigates to the session chat. Accessible via sidebar navigation.
- **Status Categorization**: `working` = sessions with status "streaming", "active", or "task-running"; `done` = execution sessions (`isExecution: true`); `idle` = all other sleeping sessions.
- **Session Observability (Phases 1-7)**: Implements comprehensive server-side session statistics and analytics gathering, pagination/filtering queries, individual session export, global dashboards, vertical execution timelines, soft-delete archiving, and multi-agent channel swimlane flows:
  - **Enriched Metadata**: On every session run completion (`agent_end`), the server parses the session's prompt/assistant/system messages, calculating execution metrics (tokens, tool call counts/frequency, duration, models, and errors) and updates `metadata.json` atomically. `session-lister.ts` resolves `messageCount` from metadata, reducing file system I/O overhead from $O(N)$ scanning to $O(1)$.
  - **Server-Side Pagination & Filters**: The `GET /api/sessions` endpoint natively handles query params for search, context filtering (project, agent, channel, etc.), status matches, creation range filtering, custom sorting, and page offsets/limits.
  - **Session Exporting**: Support for downloading complete interactive sessions and API/CLI execution logs in JSON, JSONL, or formatted Markdown format via the `GET /api/sessions/:id/export` endpoint with a defensive 10MB file size safeguard. The UI exposes this through a premium floating Export dropdown directly in the layout tab bar.
  - **Global Analytics Dashboard (`/analytics`)**: Dashboard with interactive Recharts components showing sessions and token volume over time (Composed Chart), top tools called (Bar Chart), model usage distribution (Pie Chart), and failure metrics (Bar Chart) filtered by dates and entities.
  - **Interactive Session Timeline**: Collapsible vertical milestone flow inside standard chat areas, visualising prompt origins, agent thoughts, tool call inputs, and tool output execution logs.
  - **Session Archiving & Soft-Delete**: Mass archiving, unarchiving, and soft-deletion operations (via batch requests and popover toggles) alongside an automatic scheduler loop on the server to clean up old sessions based on days and max count parameters.
  - **Parallel Agent Swimlanes**: A horizontal timeline chart within teams mapping consecutive deliberation turns dynamically onto parallel agent tracks. Connects sequential steps chronologically using an SVG path canvas overlay, accompanied by detailed veto rate and arbitration analytics metrics.

### Chat & Streaming
- Multi-session chat (create, switch, delete sessions)
- Real-time streaming via a **single shared WebSocket connection** (`wsClient` singleton) with automatic exponential-backoff reconnect (with randomized jitter to prevent thundering herds), server-initiated 30s ping-pong keepalive checks to prune dead sockets, client-side proactive ping timeout detection (45s check), bounded offline queue (max 50, drops oldest with warning), maximum reconnection attempts cap (20 retries before transitioning to `permanently_disconnected`) and `isConnected()` guard. **Cookie-based auth**: after Better Auth migration, WS authenticates via httpOnly cookie (`better-auth.session_token` / `__Secure-` prefix) in `onOpen` handshake using `auth.api.getSession` with fallback sync DB lookup for programmatic tokens, not via JS-accessible token. Server uses factory pattern (`ws/factory.ts`) with closure-captured `wsId` via `crypto.randomUUID()`, registry pattern (`ws/registry.ts`) with `WeakMap`-free explicit cleanup (no `ws.wsId` mutation, no global counter, and symmetric session/team subscription context cleanup upon switching views), structured logger (`ws/logger.ts`), and auto-subscribes on `prompt` transactionally to avoid lost events race. Message deduplication logic filters out repeat `message_start` events on reconnection. Hybrid pending prompt caching stores prompt text and media parameters inside both an in-memory window registry and `localStorage` with a 30s TTL to prevent Lost Response race conditions during fast session changes while maintaining page-refresh persistence.
- **Hook de Conexión WebSocket Reentrante (`useConnectionAwareEffect`):** Hook customizado que implementa el patrón "send now + replay on reconnect" de forma segura con un `useRef` wrapper. Centraliza la lógica de suscripciones de sesiones (`useWebSocket`) y equipos (`useTeam`), aislando los listeners de estado de la subscripción de mensajes y previniendo fugas o ejecuciones duplicadas durante ciclos de desconexión.
- Message rendering: user, assistant, tool calls, thinking blocks (with compact single-line preview when collapsed and `animate-pulse` border during streaming)
- Abort active generation
- Steer/follow-up during streaming (Enter=steer, Alt+Enter=follow_up)
- **Experiencia de Scroll Robusta:** Implementación de scroll pinning inteligente mediante el hook customizado `useChatScroll`, con `ResizeObserver` reactivo para mantener anclaje ante cargas tardías de imágenes o tarjetas, y un botón flotante dinámico con indicador de "Nuevos mensajes" cuando el usuario está arriba del viewport en todos los layouts de chat (estándar, orquestación y el panel de negociación en `TeamMessageList`).
- **Foco de Input Inteligente:** Implementación de un hook customizado (`useChatInputFocus`) que gestiona el cursor de forma inteligente y robusta, posicionándolo en la caja de entrada (`ChatInput` o `WelcomeChatInput`) al ingresar a una sesión, tras finalizar la carga de mensajes históricos, o inmediatamente después de que el agente finalice la emisión de su mensaje a través del WebSocket.
- **Premium Floating Chat Input & Popovers:** Replaces the legacy 2-row chat input and fullscreen modals with a premium, unified floating card (`ChatInput`). It integrates:
  - **Inline Popovers:** Checkbox-based tool selectors (`ToolsPopover`) and searchable skills lists (`SkillsPopover`) directly above the action bar.
  - **Context Usage Indicator:** Compact token display (e.g. `12k / 128k`) using accurate LLM token counts with trailing estimation (`estimateContextTokens`) and a 2px dynamic, color-coded progress meter (`ContextProgressLine`) at the bottom edge of the input card.
  - **Context Compaction (Zap button):** Next to the token indicator, a clickable `Zap` button triggers manual, LLM-powered context compaction (via `prepareCompaction`/`compact` vendor harness), compressing long chat histories into structured summary checkpoints to free up context window space.
  - **Send/Stop Button:** Circular interactive button that morphs smoothly between sending and aborting streaming.
- **Agent Class Adoption & Progressive Tool Logs:** The backend `AgentSession` is fully refactored to delegate to the vendor `Agent` class internally, natively managing the dual message queues (steering/follow-up), execution loops, state updates, and turn failure handling. Progressive, progressive tool updates (`tool_execution_update` event stream) are broadcasted in real-time over WebSockets, allowing the client (`ToolCallRow`) to render running stdout/stderr output chunks of active commands dynamically.
- **Streaming Reconnection & Session Persistence:** Resolves page refresh issues during active streaming (e.g., waiting for long-running tools). Real-time message synchronization updates the session's active messages on every append. Upon client reconnection, the WebSocket handler immediately pushes current streaming states (`agent_start`) and token context meters, and the client performs a silent, background auto-refresh of the message list to recover any messages streamed during the disconnected period.
- **Agent Skills Prompt Injection:** Fully integrates the `<available_skills>` prompt-template specification. Available agent skills are loaded into memory and their XML-formatted metadata declarations (name, description, filesystem location) are dynamically injected into the system prompt across all agent session loops (initialization, next turns, prompts, continues). This allows the agent model to discover its available skills and read their files on the fly. Slash commands (e.g. `/cloudflare`) instantly load and inject active skill instructions in the user message queue, resolved directly from memory cache to avoid redundant filesystem read overhead.
- **Formularios de Herramientas Robustos (AskQuestionForm / ApprovalForm):** Las herramientas interactivas del chat cuentan con validación de conexión del WebSocket antes de enviar acciones, captura de errores de ejecución en la sesión (`ui_action_error`) para evitar bloqueos del estado de carga, y temporizadores de timeout de 15 segundos para resetear la interfaz. Se unificó además el uso del rol de mensaje `"toolResult"` para eliminar duplicidades visuales en la línea de tiempo.
- **Detección y Visualización de Errores de API (API Error Detection & Surfacing):** Mecanismo de control de errores de extremo a extremo que intercepta fallos de API del proveedor LLM (límites de tarifa, claves de API inválidas, filtros de contenido o respuestas vacías). Los errores se sanitizan en el servidor (eliminando credenciales y traduciéndolos a mensajes amigables y accionables), se persisten en el historial del chat para que sobrevivan a las recargas de página, y se muestran de forma destacada en la interfaz mediante una tarjeta styled que respeta los tokens de diseño de Tailwind CSS v4.
- **Virtualized Execution Sessions:** API and CLI executions for Agents, Repositories, and Teams are virtualized as read-only sessions in the chat UI. Toggled via a switch in the session popover, showing historical log messages with distinct "API" / "CLI" badges and locking the chat input to prevent interactive steer inputs.
- **Interactive Session Timeline:** Componente `SessionTimeline` integrado en `ChatArea` que muestra una línea de tiempo vertical con milestones (creación, prompts, pensamientos, tool calls, respuestas). Cada milestone tiene icono, badge de estado (success/error/pending), duración, y contenido expandible. Los thinking blocks se muestran en paneles color púrpura, los tool calls muestran argumentos JSON y output en monoespaciada. Accesible mediante modo `chatMode === "timeline"`.
- **Rutas Jerárquicas Estructuradas:** El router enruta de forma contextualizada las vistas en la URL (ej: `/projects/{projectName}/session/{sessionId}`, `/projects/{projectName}/workspace`, `/agents/{agentId}/...`). Al recargar la página se mantiene al 100% el estado del contexto de trabajo y las breadcrumbs dinámicas reflejan exactamente la jerarquía del usuario (`Proyectos / got / Files`).
- **Pestaña Contextual de Delegaciones:** Nueva pestaña contextual "Delegaciones" al lado de "Chat" y "Archivos" que muestra de forma interactiva e integrada el listado de subagentes en ejecución. Soporta split-screen en desktop para ver en tiempo real la metadata del resultado (resumen ejecutivo, artefactos producidos, riesgos) de cada subproceso sin contaminar la ventana del chat principal.
- **Ubicación de Sesiones:** El popover de gestión de sesiones de chat fue movido de la cabecera global a la barra de navegación de pestañas (Chat, Files, Preview) pegado a la derecha, agrupando el control de las sesiones directamente al espacio donde pertenecen.
- **Modularización del Layout Shell (Layout Refactoring):** El componente layout principal (`MainLayout.tsx`) ha sido refactorizado en múltiples submódulos específicos dentro de `components/layout/` (agrupados en subcarpetas `header`, `mobile`, `sidebar`, `tabs` y `hooks`), logrando un desacoplamiento limpio del gestor de sesiones de laboratorio y chat, y eliminando toda la duplicación de código e interfaces entre las vistas móviles y de escritorio.

### Multimedia Support (Images & Documents)
- **Hybrid Input Strategy**:
  - **Images**: converted to base64 on client and sent inline via WebSocket using the vendored agent runtime's native vision parameters (`images?: ImageContent[]`). Image grid in chat supports click-to-expand modal with fullscreen overlay, Escape to close, and authenticated image loading.
  - **Documents (PDF, Office, etc.)**: uploaded via Multipart HTTP POST directly to the workspace storage folder (`assets/uploads`), auto-appending workspace paths to the prompt so agents can read them. Additionally, for readable text/code files (under 100 KB), their full source contents are automatically read via client-side `FileReader` and injected inline into the prompt message inside a Markdown code block, allowing immediate context parsing.
- **Vision (Image Understanding) & Programmatic Tool (`vision`)**: Multimodal image input is natively supported in chat when a vision-enabled model (e.g. Claude 3.5 Sonnet, Gemini 2.5 Flash) is selected, displaying a visual "Vision" badge in the model selector. Additionally, a dedicated `vision` tool allows any agent or subagent to programmatically inspect and analyze image files located in the workspace, using a dedicated vision model configured in Settings > General Tab.
- **Image Generation (`generate_image`)**: Generates graphics and designs via OpenRouter's modality image endpoints. Enabled by configuring a dedicated image generation model in Settings > General Tab. Generated image files are saved to the workspace (`assets/generated/`) and rendered inline in the chat stream.
- **HTTP Caching & Native Authentication Pipeline**:
  - **Server-Side HTTP Caching**: Endpoints `/api/workspace/*`, `/api/sessions/:sessionId/files/*`, and `/api/agents/:id/avatar` serve assets with `ETag` (based on file `mtimeMs`), `Last-Modified`, and `Cache-Control` headers (with `immutable` caching enabled for generated images in `assets/generated/`). Conditional validation handles `If-None-Match` and `If-Modified-Since` requests returning `304 Not Modified` responses to prevent redundant file system reads and bandwidth waste.
  - **Native Token Authentication**: Instead of legacy `fetch` -> `blob` -> `createObjectURL` -> `revokeObjectURL` loops, client-side images are loaded natively by the browser using `<img src="/api/...??token=TOKEN">` tags. The short-lived session token is dynamically extracted from cookies on the server-side, passed down from the `/api/auth/status` (or login/register) response to `AuthContext`, and injected by the simplified `AuthenticatedImage` component. This leverages native browser preloaders and HTTP caching, rendering images immediately.
  - **Unified Asset URL Resolver**: A single helper `resolveFileUrl` in `@/lib/file-urls` consolidates workspace, session, agent, and team URL paths under a type-safe object options signature, eliminating duplication across chat components.
- **Visual Preview Templates (Premium UI)**:
  - **PDFs**: rendered inline via authenticated iframe viewers with "Open in New Tab" controls.
  - **Audio & Video**: embedded natively using HTML5 `<audio>` and `<video>` players with customizable layouts.
  - **Office Documents (DOCX, XLSX, PPTX, etc.)**: rendered as premium info cards with extension badges and direct authenticated download buttons.
- **Syntax Highlighting in Workspace**: Code files in `WorkspaceFileEditor` receive language-class tags (`language-typescript`, `language-json`, etc.) based on file extension for CSS syntax highlighting support.

### Provider Management
- Dynamic provider configuration via web UI (no env vars needed)
- Native OpenAI-compatible cloud providers, Qwen Cloud, and OpenCode Go (Anthropic, OpenAI, Google, DeepSeek, Groq, Mistral, Qwen, OpenCode Go, etc. routed via compatible endpoints)
- API key management: add/remove keys per provider, persisted to auth.json.
- **Auto-Sync & Model Persistence:** Al guardar una API key para proveedores dinámicos (Qwen o OpenCode Go), se dispara automáticamente una sincronización de modelos remotos de forma asíncrona. Los modelos sincronizados se guardan en el archivo `provider-models.json` del usuario en disco, persistiendo al reiniciar el servidor. Si se elimina la clave, se limpian los modelos almacenados y se vuelve a los defaults.
- Model selector below chat input: shows only configured providers, nested dropdown for model selection
- Model persistence in localStorage, applied to sessions via SDK's setModel()
- Auth status indicators (configured/not configured per provider)
- **Resolución Dinámica de Modelos:** No se utilizan modelos por defecto hardcodeados en el cliente ni en el backend. Las vistas del cliente guían al usuario con placeholders descriptivos y la última selección guardada en `localStorage` con la clave `crewfy-selected-model`. El backend realiza una validación y resolución en base a los proveedores configurados del usuario (`getUserDefaultModel`), previniendo caídas por llamadas a modelos inaccesibles o inexistentes.

### Factory Operations & Unified Tool (manage_factory)
- **Unified Tool:** A meta-tool `manage_factory(entity, action, id?, params?)` allows the agent to interact directly with all system entities (agents, projects, teams, sessions, env vars, LLM providers, custom skills, laboratory experiments) in a single tool call, eliminating the need for slow and error-prone bash/curl command executions.
- **Contract Auto-Discovery:** Endpoints `GET /api/factory/contracts` and `GET /api/factory/contract/:entity` expose the schemas of all entities dynamically, permitting client-side and model-side schema validation without hardcoding parameters.
- **Runtime Schema Validation:** Parameters passed to `manage_factory` are validated against their respective entity contract schemas at runtime, providing descriptive validation errors for self-correction.
- **Real-Time UI Synchronization:** Operations like `upsert` and `delete` automatically broadcast WebSocket updates to the client to refresh the sidebar, projects, channels, teams, or custom skills lists instantly.
- **Dynamic Team Support & Negotiation Robustness:** The `manage_factory` tool natively understands two types of Teams: Orchestration Teams (which behave as standard multi-session agent chats utilizing a persistent leader agent with native WebSocket streaming, mapping to unique UUID sessions) and Negotiation Teams (stateless parallel debate loops with arbitration and consensus protocol rules). Includes `send` action to dispatch team prompts asynchronously (supporting sessionId parameters) and `member` action to manage agent assignments. Refactored the debate loop with a trivial/non-substantive message guard (e.g. greeting filter returning guidance) and structured round 1 debate context injection to prevent loops/re-presentations. Parameterized the system prompt compilation cache to include arbiter and output modes, preventing prompt bleed between roles.

### Security & Environment Variables
- **Cifrado en Reposo:** Cifrado simétrico AES-256-GCM para los archivos de configuración sensibles (`env.json` y `auth.json`) derivando la clave criptográfica a partir del `JWT_SECRET` del servidor. Migración automática de archivos legacy en texto plano.
- **Filtrado de Salida de Terminal (Bash Output Filter):** Sanitización inteligente y optimizada sobre el stdout/stderr de todos los comandos ejecutados por agentes principales, programmatic agents y subagents para enmascarar automáticamente secretos del usuario con `***hidden***`.
- **API con Auditoría de Revelado:** Eliminación del revelado masivo de secretos. Incorporación del endpoint seguro `/api/env/reveal/:key` con logs de auditoría dedicados en `/tmp/crewfactory/_audit/{user}/env-access.log`.
- **Interfaz Masked de Usuario:** Enmascaramiento completo por defecto en la vista de variables de entorno del cliente (`EnvVarsTab`) con botones de revelado individual puntual.
- **Protección de Procesos de Infraestructura (Anti-Suicidio):** Intercepción en tiempo de ejecución de comandos destructivos en la herramienta `bash` para bloquear de forma preventiva cualquier intento de finalizar procesos asociados a los puertos críticos (`3000`, `3001`, `4104`, `5173`) o el PID del servidor principal.
- **Security Subagent Sandbox & Global Approval Engine:** Nested subagent sessions (spawned via `spawn_subagent` or delegated via `delegate_task`) and programmatic agents run inside a sandboxed environment where critical system directory deletion (`rm -rf`), downloading remote scripts to execute (`curl | bash`), and modifying environment files (`.env`) are strictly blocked. Interactive tool executions requiring user verification (`allow: "ask"`) register a request with the global `ApprovalManager` on the backend, which implements a 60-second countdown timeout (with auto-deny default) and broadcasts the request to all authenticated user WebSocket connections (`approval_request` event) and custom HTTP REST endpoints (`/api/approvals`). In the frontend, a floating global overlay (`GlobalApprovalOverlay`) renders these active approvals in real-time, allowing users to review, remember choices (persistent permission rule updates), and authorize or reject actions instantly from any context page in the application.
- **Recursive Subagent Cancellation (BFS Chaining & AbortToken):** Integrated a transitive, recursive cancellation model using Breadth-First Search (BFS) and `AbortToken` abstractions. When a parent session is aborted or destroyed, the cancellation signal propagates through the entire descendant subagent tree in a clean LIFO (Last-In-First-Out) cascading order, preventing orphaned LLM runs, CPU leaks, and unmanaged filesystem writes. This includes a recursive session destruction mechanism (`destroySession`) that automatically cleans up nested in-memory and on-disk child session folders and database connections.
- **Nested Subagent Depth Limit:** Establishes a configurable security boundary to control the nesting depth of subagents and delegated executions. Prevents infinite recursions and cascade costs by evaluating parent session ancestry from metadata before spawning new subagents or delegating tasks. Configurable globally via the `CREWFACTORY_SUBAGENT_MAX_DEPTH` environment variable (defaults to 1) or dynamically per-user in the General Settings UI.
- **Subagent Live Console & Session Unification & Model Inheritance:** Nested subagent sessions (`spawn_subagent` and `delegate_task`) are unified under `sessionManager.getOrCreateSession()`. This registers subagents dynamically in the global `SessionManager.sessions` registry, allowing the frontend Live Console to receive real-time execution events, streaming updates (`ThinkingBlock` and `ToolCallRow`), and resolve historical logs consistently without double session instantiation or silent event loss. Implemented robust model synchronization for restored and cached sessions to prevent model loss under async provider registry loading race conditions, ensuring that delegated subagents correctly inherit the parent session/leader model.
- **Autonomous Execution Mode:** Permite la ejecución autónoma de agentes en el chat mediante el bypass de solicitudes de aprobación manual para herramientas de edición y comandos bash. Los subagentes creados mediante `spawn_subagent` o delegados con `delegate_task` heredan automáticamente el modo `autonomous` de su sesión padre si no se especifica un tipo explícito, garantizando una ejecución fluida de tareas en background sin requerir confirmaciones interactivas constantes.

### Unified Creation Modals & Standardized Settings
- **Unified Creation Modals:** Extracted inline creation logic for projects (`ProjectCreateModal`) and teams (`TeamCreateModal`), integrating them as standalone reusable modals triggered exclusively from their respective listing pages.
- **Unified Avatar Uploads (`AvatarUploadField`):** A shared component managing profile image selection, default predefined avatars, and clearing files with real-time feedback. Integrated across agents, projects, teams, and global agent setting panels.
- **Chat-Scoped Gear Settings:** Inline configurations and edit actions are removed from card listings on the Projects and Agents pages. Custom settings can be modified exclusively via settings gears inside their active chat headers.
- **Danger Zone Deletion:** Standalone settings modals for projects and teams include a Danger Zone section allowing permanent deletion of the entity from filesystem and workspaces.
- **Custom Factory Identity & System Prompt:** Extended global settings (`GlobalAgentSettingsModal`) allowing customization of the Factory name (`factoryName`), global avatar, and custom system prompt instructions (`factorySystemPrompt`) injected dynamically into global chat sessions. Custom name and avatar propagate to the main sidebar and breadcrumbs navigation.

### PWA (Progressive Web App)
- Installable on mobile via manifest.json with `display: standalone`
- Service worker with Workbox for asset caching (auto-update on new deploy)
- Apple touch icon + status bar styling for iOS standalone mode
- Auto-update via `vite-plugin-pwa` with `registerType: "autoUpdate"`
- Offline-capable assets (JS, CSS, HTML, icons)
- Navigation interception disabled (`navigateFallback: undefined`) to prevent stale content after deployments; server handles all navigation requests directly

### Mobile-First Responsive (Slack iOS Style Split-Screen)
- **Breakpoints**: Mobile (< 768px), Tablet (768px - 1024px), Desktop (> 1024px).
- **Split-Screen Model (Mobile)**: On screens < 768px, the sidebar functions as the full-screen landing view when no context is active. When a project, agent, channel, or admin page is selected, the content slides in from the right to cover the sidebar.
- **Mobile Header (MobileTopbar)**: A simplified 48px header on mobile with context names, quick session creation `[+]`, and the menu drawer button `[≡]` placed on the top-left for native-feeling reach.
- **Mobile Bottom Navigation Bar**: A persistent 56px bottom bar on mobile that appears only when the sidebar drawer is open, providing instant access to Home, Skills Library, Settings, Logs, and Plugins. Content blocks automatically expand to full height (`bottom-0`) when the drawer is closed, maximizing vertical space for chat and other views.
- **Overlay Drawer**: Toggling the menu `[≡]` on the top-left slides the sidebar drawer in from the left over the active view with a dimming backdrop overlay (`opacity: 0.5`).
- **MCP Tab Consolidation**: The top-level MCP configurations are integrated as a tab inside **Settings** (replaces `/mcps` top-level page) and automatically redirected to `/settings` with tab `mcp` active.
- **Message Font Scale**: Chat bubbles (user, assistant, and rich markdown blocks) are scaled up to `text-base` (16px) on mobile viewports to avoid straining readers and improve touch accessibility.
- **Touch-Optimized Styling**: Interactive list elements, accordion headers, and buttons are dynamically resized to 48px heights with larger text sizes (16px) and wider spacing for natural tap targets.
- **Smooth Animations**: Hardware-accelerated concurrent transitions powered by `framer-motion` provide 200ms entering slide-in animations and 250ms overlay drawer slides.
- **Navigation Stack Synchronization**: Maintains navigation history stack in `localStorage` (`nav-stack-mobile`) synchronized with browser back/forward.

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
  - `projects/{projectId}/workspace/` — Git project workspace (contains `.agents/skills/`, `assets/`, `memories/` skeleton for project context, identified by a unique UUID `projectId` to support renaming)
  - `projects/{projectId}/project.json` — Project metadata mapping the UUID to its friendly name and clone settings
  - `agents/{id}/workspace/` — Programmatic agent workspace with same subdirs skeleton but NO AGENTS.md or factory skill provisioning — they see global factory skills as read-only via `getResolvedSkillPaths(username)`
  - `channels/{id}/workspace/` — Multi-agent channel workspace, same structure as agents
  - `sessions/` — User chat sessions and metadata
  - `agents/{id}/sessions/` — Agent chat sessions
  - `channels/{id}/` — Channel definitions and message logs
- **Global mode:** Agent CWD is the workspace root. Used for cross-project tasks, admin, and skill authorship.
- **Project mode:** Agent CWD is `projects/{projectId}/workspace`. Sessions tagged with `projectId` in `metadata.json`.
- **Agent/Channel/Team mode:** Agent CWD is the entity's workspace. Global factory skills injected via `getResolvedSkillPaths()`. Workspace API endpoints scope directories, file operations, uploads, and image rendering via `teamId` when navigating or executing inside a Team Orchestration session context.
- `ensureWorkspaceSubdirs()` creates the common subdirectory skeleton for any entity workspace.
- **Detalle y Edición de Proyectos:** Botón de información `(i)` en las tarjetas de proyecto para ver y editar el nombre o `cloneUrl`, además de visualizar datos técnicos del proyecto como ID, fecha de creación y ruta absoluta en disco.
- **Configuración Avanzada de Agentes (RegisterModal):** Drawer colapsable que permite configurar las `serialTools` (herramientas interactivas como `request_approval` y `ask_question`), e inspeccionar de solo lectura el `blueprintId` y fecha de creación del agente. El modal se extrajo a un componente compartido (`components/agents/RegisterModal.tsx`) y se puede acceder desde la página de agentes o desde el ícono de engranaje (Settings) en la toolbar del chat cuando hay un agente activo.

### Premium Dashboard & Sessions Management
- **Premium Spotify-Style Dashboard:** Pantalla de inicio rediseñada con secciones de Active Sessions (grid 2-columnas), Agents Team (scroll horizontal con avatares y dots de estado), Active Projects (tarjetas con acciones), y Active Teams (badge ORCH/NEG). Ruta `/dashboard` dedicada. Logo en la cabecera navega a `/dashboard`. Bienvenida personalizada con avatar del usuario.
- **Sessions Console View:** Consola de logs en vivo integrada como tercer tab en la página de sesiones, reemplazando la página independiente `LogsConsolePage`. Agrupa deltas consecutivos de texto/reasoning para reducir ruido visual. Filtros por tipo de fuente (Session/Channel) y tipo de evento (Mensajes/Thoughts/Tools). Congelación manual de scroll y limpieza de pantalla.
- **TabsNav Component:** Componente reutilizable de navegación por tabs con indicador de borde inferior.
- **SessionKanban Page (`/sessions`):** Tablero Kanban de 3 columnas (Idle/Working/Done) con tarjetas de sesión que muestran nombre, badge de contexto (proyecto/canal/agente), dot de estado animado, conteo de mensajes y tiempo relativo. Soporta selección múltiple con acciones batch (archivar, desarchivar, eliminar) y toggle de vista archivada. No utiliza librería drag-and-drop externa.

### Web Exploration & Web Fetch Tool (`web_fetch`)
- **Semantic Search & Direct Fetch:** Complementary retrieval layer. While `exa_search` performs semantic search queries across the web returning lists of snippets and URLs, `web_fetch` allows direct extraction of clean text/markdown from arbitrary URLs.
- **SSRF & DNS Rebinding Security Layer:** Deep request filtering. Blocks non-HTTP protocols, private IP ranges (CIDR masks covering 10.x, 172.16.x, 192.168.x, 127.x, 169.254.x), localhosts, and cloud metadata endpoints. Resolves DNS once via asynchronous lookup before connection to prevent DNS rebinding, and manually validates redirects at each hop (max 5 hops) to ensure no redirection to private ranges occurs.
- **Content Extraction Pipeline:** Uses `@mozilla/readability` (Firefox Reader Mode algorithm) inside lightweight `linkedom` virtual DOM to isolate core semantic contents (headings, paragraphs, lists, tables), stripping sidebars, navs, footers, and ads. `turndown` converts clean HTML to structural Markdown. If readability fails, a fallback regex-based HTML-to-text converter is engaged.
- **Sliding-Window Rate Limiting & Cache:** Enforces a sliding-window rate limit of 30 requests per minute per host, and clamps global concurrency to 3 simultaneous fetches. An in-memory LRU cache stores up to 200 entries with a 5-minute TTL, utilizing ETag conditional HTTP headers to minimize latency and bandwidth. Aborts connections immediately if response size exceeds 10MB during stream reading.
- **Premium Expandable UI:** Integrates with `ToolCallRow` rendering an interactive card showing page title, domain, fetch duration, cache status, original vs extracted size, and an expandable content panel.

### Custom Tool System (Agent-Defined Tools)

- **On-Demand Tool Creation**: El agente LLM puede crear, editar, activar/desactivar y eliminar tools personalizadas via la tool `manage_custom_tools` sin intervencion del usuario.
- **Contrato Zod Solido**: Cada tool se define con un objeto JSON validado estrictamente con Zod: `name`, `description`, `parameters` (JSON Schema), `execute` (modo de ejecucion), y `ui` (componentes visuales opcionales).
- **3 Modos de Ejecucion**:
  1. **Pipeline**: Secuencia de cualquier tool disponible en la sesión (mcp, custom, filesystem, system) con paso de variables entre pasos via `{variableName}`. Cuenta con protección contra recursión (profundidad máxima de 5) y detección de dependencias circulares mediante `AsyncLocalStorage`. Ejecucion secuencial controlada con `onError: stop|continue`.
  2. **UI**: Tool puramente visual sin ejecucion server-side. El agente define componentes estructurados que el frontend renderiza nativamente (card, card-list, table, badge, metric, code, section).
  3. **Subagent** (fase 2): La tool spawnca un subagente con instrucciones especificas.
- **Motor de Pipeline (PipelineEngine)**: Ejecuta secuencialmente los pasos, resolviendo variables con soporte de anidacion, emitiendo eventos `tool_execution_start/update/end` en tiempo real via WebSocket.
- **CustomToolStorage**: Persistencia en filesystem (`/app/data/users/{username}/custom-tools/{name}.json` + `_index.json`). CRUD completo con toggle enable/disable.
- **CustomToolRuntime**: Wrapper que convierte `CustomToolDefinition` → `AgentTool` compatible con `AgentSession._customTools`. Inyeccion dinamica identica al patron MCP.
- **UI Builder Engine (Frontend)**: Sistema de componentes React nativos que renderizan definiciones JSON estructuradas. Soporta composicion anidada (`section` contiene `card-list` que contiene `card` + `badge`). Escape hatch HTML via `{ type: "html" }` con Tailwind design system inyectado en iframe sandboxeado.
- **Agent Self-Service**: El system prompt del agente incluye documentacion completa sobre como definir tools, componentes UI disponibles, y sintaxis de variables. El agente puede auto-documentar sus tools creadas.
- **Entity Refresh Integration**: Las mutaciones de custom tools emiten `entity-updated` via WebSocket para refrescar el frontend en tiempo real.

### Deterministic Linear Execution Pipelines
- **Agent-First Pipelines**: A subcategory of workflows optimized for rigid, automated sequence execution (such as build → test → deploy stages) with determinism and fail-fast behavior. Fully managed and understood by the global agent, programmatic agents, and custom tools.
- **FS-Isolated Pipeline Workspaces**: Each pipeline has a dedicated folder under `/tmp/crewfactory/{username}/workspace/pipelines/{pipelineId}/` with segregated subdirectories for configs, scripts, outputs, and execution runs history.
- **Stage Definitions (Script & Agent)**: 
  - **Script stage**: Executes a deterministic shell script file (bash or powershell) with environment variables injected (pipeline run metadata, outputs from prior stages). Returns output variables parsed from standard output via custom markers (`---OUTPUT---`).
  - **Agent stage**: Instantiates an isolated AI agent session, interpolates inputs from prior stages, runs prompts, extracts output schema JSON from the model response, and destroys the session to optimize memory.
- **Fail-Fast Engine**: The runtime breaks execution on any stage failure (non-zero script exit code, timeout, or explicit agent reasoning error), marking the run status as failed on disk and broadcasting it to the client.
- **WebSocket Streaming Logs**: Emits real-time execution steps, stage status transitions, and stdout/stderr stream logs directly to the frontend via dedicated socket channels.
- **Custom Tool \`manage_pipelines\`**: Unified meta-tool enabling LLMs to create/update definitions, trigger executions, abort runs, retrieve detailed status with raw stage outputs, and read or patch execution scripts dynamically. The `upsert` action validates stages against `PipelineStageSchema` (Zod discriminated union on `type`) before persisting, rejecting malformed shapes (missing `type`, missing `script` filename, missing `prompt`) with descriptive schema errors so the model can self-correct instead of triggering opaque runtime crashes in the pipeline runner.
- **Visual Monitor & Stepper (Frontend UI)**: A premium detail page (`/pipelines/:id`) with stepper status colors (idle, running, completed, failed), terminal log viewer, and structured parsed output JSON viewer.

### Agent & Tools Scoping
- **Scoping por Configuración:** Permite limitar la visibilidad de agentes y herramientas (custom tools) a contextos específicos (canales, proyectos o agentes específicos).
- **ScopeConfigManager:** Módulo centralizado (`scope-config-manager.ts`) que gestiona el grafo de pertenencias de forma desacoplada de la estructura física del filesystem (los archivos persisten en sus directorios originales).
- **Auto-recuperación e Integridad:** Reconciliación automática y silenciosa de la configuración contra los archivos en disco en cada inicio o cambio de estado.
- **Herencia Aditiva de Tools:** Las herramientas de un agente se resuelven combinando las herramientas globales, las de su canal/proyecto de pertenencia, y las herramientas asignadas de forma exclusiva al agente en particular.
- **Gestión Mutex y Persistencia Atómica:** Locks en memoria para concurrencia y guardado seguro mediante escritura en archivo temporal y renombrado atómico.

### Tool Permissions & Execution Modes
- Per-session tool access control: toggle `read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`
- **Execution Modes & Presets:**
  - **Read-Only:** Modification tools (`write`, `edit`, `bash`) are completely disabled. Used for safe exploration (`explorer` subagents or Read-Only preset).
  - **Standard:** Modification tools are enabled but require explicit user confirmation for each action via interactive approval cards. Used for supervised execution (`builder` subagents or Standard preset).
  - **Autonomous:** Modification tools are executed immediately without asking for user confirmation (except for critical system-wide deny rules like fork bombs). Used for fully automated tasks (`autonomous` subagents or Autonomous preset).
- Tools and execution modes are persisted in session `metadata.json` — survive server restarts and session reopens
- Applied immediately to live agent session via `session.setActiveToolsByName()`
- Sandbox badge in chat header shows current mode (Read-Only / Standard / Autonomous / N/7 Tools)
- Tools also sent per-prompt via WebSocket for immediate override
- **Permission Engine:** Stateless rule evaluation (deny-first, then ask, then allow) implemented via the underlying agent `beforeToolCall` hook. Destructive patterns (such as fork bombs, recursive deletion of critical folders, piping network scripts into bash, or raw disk modifications) are blocked immediately. Potentially hazardous operations (like recursive deletions or writing outside workspace/temp boundaries) prompt the user for permission in Standard mode, whereas in Autonomous mode they run directly within the workspace.
- **Subagent Permission Inheritance & Persistent Choices:** Dynamic ruleset configuration combining system defaults, role-based subagent presets (explorer is read-only, builder is standard/supervised, autonomous is fully autonomous), parent session restrictions propagation, and persistent user-level decisions stored at `permission-decisions.json` in the user's directory. Inherited limits filter out active tools dynamically so subagents cannot call tools parent sessions are restricted from.

### Context Window Meter
- Real-time context usage bar in chat footer (tokens / context window / percentage)
- Color-coded states: <70% green, 70-90% amber, >90% red
- Manual "Compact" button triggering `session.compact()` via WebSocket
- Context usage emitted automatically after each `message_end` event

### Runtime Environment Check & Context Injection
- **Dynamic Context Detection:** Automatically checks server operating system, architecture, running runtime versions (Bun/Node), temp/home paths, and available shell utilities (git, docker, python, curl, jq, ffmpeg, pnpm, bun) once at startup.
- **Process-Level Cache:** Caches detected environment variables at startup to prevent unnecessary subprocess spawning and overhead during chat sessions.
- **OS-Specific Prompt Injection:** Injects a structured `Runtime Environment` block dynamically into the system prompts of standard session agents, programmatic agents, and spawned subagents.
- **Environment-Aware Command Hints:** Automatically injects shell execution instructions (e.g. advising against Linux heredocs or `curl` parameter styles on Windows PowerShell, and suggesting Unicode configuration for Python outputs) to prevent agents from attempting invalid commands and wasting tokens.

### AG-UI Protocol & Interactive Agent Components
- **Generative UI Pipeline:** Bridges agent-to-frontend execution via custom tool call interceptions, enabling rich components to render directly in the message stream.
- **Interactive Approvals:** The `request_approval` tool suspends agent backend execution on critical tasks, rendering a warning card with a premium animated layout (custom buttons, severity indicators, pulsing active dot, and fluid Framer Motion transitions) and markdown tech details. Settled reactively via WebSocket `ui_action`.
- **Inline Rich Charts:** The `render_chart` tool allows agents to display responsive line, bar, pie, and area charts using Recharts, integrated with Tailwind CSS v4 dark tokens.
- **Natural Session Persistency:** Interactive components are mapped natively as standard agent tool calls/results, meaning they survive server reboots and restore their state upon session reopening.
- **Robust Multi-File Creation:** The `propose_code_change` tool recursively creates parent directories if they do not exist before writing proposed content, preventing ENOENT failures on new directories.
- **Streaming & API Fault-Tolerance:** UI card components (`DynamicFormCard`, `DiffApplyCard`, `ApprovalForm`, `AgentConfigCard`, `MediaCard`) feature defensive object destructuring and default parameters, preventing React runtime crashes when arguments are streamed partially or are undefined. Additionally, `AgentConfigCard` handles API failures gracefully without freezing, and `MediaCard` utilizes declarative React error states for image fallbacks to avoid DOM duplication or leaking partially resolved keys like `[Media Asset: undefined]` during streaming, integrating authenticated image fetching to securely load assets from protected workspace pathways.
- **Reactive UI Refreshes:** The `refresh_ui` tool allows agents to notify the user's interface to dynamically reload specific sections or all sidebar lists (projects, agents, channels, experiments, and skills) in real-time immediately after modifying workspace resources.
- **Subagent Native Delegation (`spawn_subagent`):** Official worker agent tool using the fire-and-wait model (Option A). Enables orchestrator agents to run focused, self-contained subtasks in fresh-context sessions, persisting full message logs and `metadata.json` mapping relations under `sessions/{parentId}/subagents/sub_{toolCallId}/`. Automatically propagates `AbortSignal` for instant subagent cancellation and expects a structured YAML/YAML-like result envelope (status, executive_summary, artifacts, risks). En el frontend, se desactivó la navegación automática forzada al iniciar la delegación, se habilitó un botón de retroceso ("Volver a la Sesión Padre") para retornar ágilmente al chat de origen, y se implementó `FloatingDelegations` en la línea de tiempo del chat (`ChatArea.tsx`) para observar y navegar a delegaciones activas en tiempo real. Los resultados se encolan con el rol `"user"` mediante el mecanismo de `followUp` y se reanuda la sesión padre llamando a `.continue()`, previniendo errores de duplicación de toolResults en proveedores con APIs estrictas como DeepSeek.
- **Task Delegation (`delegate_task`):** Native delegation tool supporting execution targeting programmatic agents, projects, channels, or existing sessions. Creates isolated sessions starting with `del_` to prevent contamination of target/user chats, automatically propagates `AbortSignal`, and supports returning a clean structured summary envelope (status, executive summary, artifacts, risks) or the full conversation history. Persiste correctamente el `parentSessionId` y propaga el `teamId` en los metadatos del servidor, permitiendo que la interfaz renderice el botón de retroceso de manera consistente dentro del contexto del equipo, reteniendo el acceso a su espacio de trabajo y visualización de recursos. Cuenta con un bridge WebSocket síncrono para forwardear eventos de progreso en tiempo real al padre sin retrasos de importación, y resolución de promesas awaitable para evitar condiciones de carrera (B1) en dispatches paralelos, forzando por defecto el modo secuencial (broadcast) cuando se añade o actualiza un agente al rol de líder (B5).
### Agent & Channel Blueprint Gallery
- **Offline-First Blueprint Architecture:** Locally-provisioned gallery system that reads blueprint templates from a `community/` directory at the project root (`community/agents/` and `community/channels/`).
- **Blueprint Definitions & Metadata:** Blueprints are defined via standard `blueprint.json` files combining the runtime schema definition (id, name, role, systemPrompt, skills, context, members) with visual metadata (title, description, author, avatar, rating, downloads, tags, version, compatibility).
- **Cascading Skill Auto-Provisioning:** When installing an agent blueprint, the system automatically checks if its required skills (from the blueprint's `skills` array) exist in the user's workspace skills directory. If any are missing, they are copied dynamically from `community/skills/` to `/tmp/crewfactory/{username}/workspace/.agents/skills/`.
- **Cascading Dependency Installation:** When installing a multi-agent channel blueprint (e.g. `full-stack-team`), the system checks if all member agents exist in the user's registry. If any member agent is missing, it locates its corresponding agent blueprint and automatically installs it first (including its required skills and avatar icons).
- **Integrated Icon Routing:** Dedicated authenticated endpoints (`GET /api/gallery/blueprints/:id/icon`) stream raw SVG icons using the standard auth middleware, securely fetched on the frontend via `AuthenticatedImage` components.
- **Frontend Gallery Tab View:** Smooth, tabbed navigation within the "Agents" view ("My Agents" vs "Gallery") with dynamic search bar, type filtering buttons (All / Agents / Channels), and template grid cards.
- **Interactive Details Modal:** Custom pop-up details drawer showing detailed stats, authors, version compatibility, tags, required skills list, default models, channel members (for teams), and an expandable system prompt preview.
- **Autoconsulting Team Blueprint:** A complete community multi-agent channel template representing an autonomous consulting team (CEO Business Strategist, Technical Lead, Backend Developer, Frontend Developer, QA Engineer, and Marketing Specialist) that executes projects end-to-end, provisioning 9 specialized skills (`business-strategy`, `product-management`, `hono-api`, `neon-postgres`, `e2e-testing`, `agent-browser`, `content-creation`, `social-media`, etc.) dynamically upon installation.

### Live Render Preview
- Página "Preview" en la interfaz del proyecto para renderizar apps construidas por el agente
- **Servidor dedicado de preview (Puerto 3001)**: corre un servidor de archivos estáticos independiente (`Bun.serve`) en el mismo contenedor/proceso para aislar por completo el render del frontend del framework Vite y Service Workers de CrewFactory.
- **Aislamiento por Path (No auth en assets)**: las URLs tienen el formato `http://localhost:3001/:username/:project/index.html`. El path provee aislamiento de datos y evita requerir tokens en sub-assets como JS/CSS/imágenes.
- Sirve archivos estáticos desde el directorio de build (`dist/`, `build/`, `.output/` auto-detectados) con MIME correctas.
- SPA routing con fallback a `index.html` para cualquier ruta no-asset
- **HTML rewriting automático**: inyecta `<base href="/:username/:project/">` + stripea el atributo `crossorigin` + reescribe paths absolutos (`src="/"`, `href="/"`, `fetch("/"`, `new URL("/"`) para compatibilidad total con Vite SPAs, React Router BrowserRouter, y frameworks como Next.js, Nuxt, Astro
- **Build config determinista**: modal de configuración con framework preset (Auto/Vite/Next/Nuxt/Astro/HTML/Custom), build command y output directory editables
- **Auto-detect de framework**: escanea `package.json` (deps, scripts) y archivos de configuración (`vite.config.ts`, `next.config.js`, etc.)
- **Build trigger manual**: botón "Build Now" en toolbar, spawn `buildCommand` via `bash -c`, transmite logs en vivo por WS
- **Logs de build en tiempo real**: panel colapsable con stdout/stderr stream, auto-scroll
- **Build endpoint**: `POST /api/preview/build?project=X` con abort (`POST /api/preview/build/abort`)
- **Persistencia**: configuración guardada en `.preview.json` dentro del project workspace
- Toolbar con estado de build (idle/building/ready/error), recargar, abrir en nueva pestaña (usando `noreferrer`)
- Modos responsive: 375px, 768px, 1280px y Full
- Detección automática de build via WebSocket: regex que cubre 10+ comandos
- `fs.watch` sobre el build dir con polling fallback cada 2s para Docker overlay filesystems
- Framework-agnóstico — compatible con React (Vite), HTML estático, Next.js, Nuxt, Astro, etc.

### Laboratory & Experiments
- **Análisis Comparativo A/B:** Entorno dedicado para probar y comparar diferentes topologías de agentes sobre una misma tarea:
  - *Single Agent:* Ejecución de un único agente base.
  - *Multi-Agent Horizontal (sin líder):* Debate y negociación colaborativa distribuida sin jerarquías.
  - *Multi-Agent Jerárquico (con líder):* Debate estructurado con mediación y toma de decisiones a cargo de un agente líder/árbitro.
- **Divergencias y Arbitraje Autónomo (Divergence Detector):** Análisis en tiempo real de los mensajes para identificar de forma autónoma conflictos de puntuación técnica (SCORE delta >= 2), objeciones explícitas (`OBJECTION:`) o vetos de cumplimiento (`VETO:`), pausando el debate y delegando de inmediato al árbitro líder.
- **Resoluciones Vinculantes:** Los líderes/árbitros emiten veredictos finales e irrevocables utilizando el formato estricto `RESOLUTION: ... | REASONING: ... | OVERRULED: ...` para desbloquear e instrumentar la toma de decisiones inmediata.
- **Métricas de Trazabilidad de Deliberación:** Cálculo automático y visualización en el reporte del juez de la tasa de activación del debate, número de divergencias detectadas y resoluciones ejecutadas para comprobar la eficiencia del sistema multi-agente frente al baseline.
- **Fórmula de Scoring Optimizada:** La métrica de eficiencia está normalizada por la cantidad de agentes en cada variante, aplicando una penalidad logarítmica con suavizado que evita castigar injustamente a las topologías multi-agente.
- **Detección O(1) de Divergencias:** Optimización del detector de divergencias que limita el parseo de expresiones regulares costosas a un sliding window de los últimos 3 mensajes, realizando un escape temprano cuando no se detectan puntuaciones.
- **Slim System Prompts & Caching:** Reducción drástica del system prompt en experimentos a través del modo `experiment-member` (~200 tokens en lugar de ~1,370), guardando en caché los appends de prompt para evitar re-ensamblado y recargas de disco.
- **Bypass Silencioso Pre-LLM:** Los observadores (observers) evitan realizar llamadas innecesarias al LLM en canales multi-agente, garantizando a su vez la plena participación y debate dinámico de los agentes activos al haber removido el filtrado restrictivo por menciones.
- **Protocolo de Formato de Output:** Capa de prompt configurable que exige formatos específicos según rol (`full-proposal` para líderes, `diff-suggestion` para miembros en debate con post-procesado diff de cortesías, y `normal` para ejecuciones directas).
- **Evaluación Automatizada por LLM-Judge:** Calificación y feedback detallado por criterio a partir de una rúbrica configurable (Calidad, Eficiencia, Negociación, etc.), con cálculo de métricas de tokens consumidos y duración.
- **Canales Temporales Resilientes:** Generación dinámica y transparente en el backend de los canales asociados a cada variante (`lab_{experimentId}_{variantKey}`). Ante una solicitud GET, si el canal no está en el almacén pero el experimento existe, se recrea al vuelo garantizando la disponibilidad de la interfaz antes y después de las ejecuciones, eliminando errores `404 (Not Found)`.
- **Orquestación Unificada de Canales:** En lugar de implementar un ciclo de vida independiente, el laboratorio delega toda la ejecución al backend de canales a través de `ChannelOrchestrator.runToCompletion()`. Esto unifica el manejo de la profundidad de cadenas, el control de abortos, la detección de equilibrio y la agregación unificada de tokens de manera centralizada.
- **Lab Negotiation Runner:** Nuevo runner `lab-negotiation-runner.ts` que ejecuta experimentos de laboratorio simulando negociación/debate multi-agente en un canal/equipo aislado. Crea un canal virtual (`lab_{experimentId}_{variantKey}`) y un equipo temporal con `mode: "debate"`, mapea eventos del equipo al canal, y envía el `taskPrompt` como mensaje inicial. Soportado por el protocolo de negociación round-based del equipo.
- **Historial de Ejecuciones:** Registro y persistencia de corridas históricas con sus respectivas métricas, accesibles desde la barra de herramientas del laboratorio.
- **Sesiones de Diseño del Laboratorio:** Soporte completo para sesiones múltiples con el agente arquitecto del laboratorio (`lab-architect`) en `/laboratory/session/:sessionId`. Permite crear, renombrar, eliminar y alternar entre distintas sesiones de diseño desde la interfaz del laboratorio. Las ejecuciones temporales de experimentos (`lab_run_`) son filtradas para evitar fugas en el historial global y en la vista de Kanban.
- **Unificación de Rutas de Almacenamiento:** Los experimentos ahora se guardan bajo `{DATA}/users/{username}/experiments/` usando el helper compartido `getExperimentsDir`, manteniendo coherencia con las demás entidades del sistema. Se incluye una migración automática en tiempo de ejecución que detecta y mueve de forma segura los datos de la ruta legacy `{DATA}/{username}/experiments/` si existe.

### Channel-First Benchmarks
- **Punto de Partida en Canal Real:** Permite realizar un benchmark de rendimiento sobre un canal existente, sin contaminar la configuración original.
- **Clonación Efímera Segura:** El sistema clona de forma temporal la estructura del canal (`tmp_bench_{uuid}`) reutilizando las mismas referencias a los agentes del registro sin duplicarlos.
- **Comparación Double-Blind (Juez LLM):** Evaluación a ciegas (Alpha vs Beta) entre la respuesta colectiva del canal y el baseline de un agente solo (por defecto el líder).
- **Métricas e Historial de Iteraciones:** Registro de corridas históricas con desgloses de criterios, tiempos, consumo de tokens y gráficos de tendencias (Recharts) para medir el impacto de optimizaciones de prompt.
- **Clean-up Automático:** Limpieza garantizada de canales clones en abortos, errores, al eliminar el canal padre, y mediante un barrido de huérfanos al arrancar el servidor.

### Task Planning & Decomposition (decompose_tasks)
- Decompose complex high-level objectives into structured, dependency-aware task graphs (DAGs) generated by the agent.
- Autonomous agent execution loop: the agent acts as both planner and executor, driving task completion directly in its ReAct loop.
- Supports DAG and linear dependencies (`depends_on`, `estimated_steps`) to allow parallel/serial task coordination.
- Real-time plan visualization: premium `DecomposeResult` card rendered inline in the chat message stream.
- Task status tools (`update_task_status`, `complete_task_list`) to update task states, write to local `tasks.json` file, and resolve the next ready task in the DAG dynamically.
- Persistent task state injection: active task details and step-by-step instructions are injected directly into the agent's system prompt to keep it fully aware of the execution plan.
- Floating Task Accordion UI: premium glassmorphic overlay panel rendered at the top of the chat area, with real-time status indicators, progress bars, and execution controls (Play/Pause).
- Autonomous error handling and re-planning: if a task fails, the agent re-calls the tool to adjust the remaining steps.
- **Decoupled Task Decomposition**: Optimized task planning by removing the nested `streamSimple` LLM call inside tool execution. The agent now pre-computes the structured task list in its ReAct loop and registers it directly, resulting in instantaneous tool execution and streaming plan generation in the UI.
- **Robustness & Cache Layer**: Encapsulated state updates, circular dependency/deadlock checks, Zod schema validation, and atomic operations inside a cache-backed `TaskStateManager` to guarantee threat safety and avoid redundant disk read operations in the active agent prompts loop.
### Integrations Hub
- Dynamic and fully customizable integrations catalog configured per user on the server
- Automatic integration status detection linked with existing user-level environment variables
- Project-specific context variables linked dynamically to resources (GitHub repos, Coolify applications, Neon databases, Vercel projects)
- Dynamic Quick Action buttons triggering custom workflows with variable replacements sent as chat prompts to the agent

### Layered Prompt System
- **Dynamic Composition**: Splits the agent's prompt into 4 decoupled, conditional, and prioritized layers resolved at runtime based on the deployment context:
  1. **Identity**: Pure agent definition (name, role, and main expertise system prompt).
  2. **Role**: Injected conditionally based on the agent's channel role. Supported roles include:
     - `lead`: coordinates the execution, delegates tasks utilizing @mentions, and acts as the arbiter.
     - `senior`: intermediate authority who proactively proposes technical alternatives, reviews peer work, and alerts on risks.
     - `member`: standard active participant collaborating with peer agents and silent mode triggers.
     - `observer`: passive observer that never actively participates and always returns `(silent)` in its responses.
  3. **Instance**: Injected conditionally depending on the execution mode (individual Solo mode instructions or Channel roster participants and mode details). Roster details are enriched dynamically with each member's `role` and `replyMode`. Target/broadcast mode fragments dynamically substitute the current agent's `{replyMode}` and the channel's `{leaderName}` variables.
  4. **Protocol**: Injected conditionally based on channel settings (Negotiation rules or Arbitration decision-making).
- **Single-Leader Enforcement**: Validation on both server-side routes and frontend dropdown configurations ensures a channel can have at most 1 active `lead`.
- **Arbitration Unification**: Unified arbiter resolution (`isArbiter`) checks `negotiationProtocol.arbiterAgentId` configuration first, falling back to the `lead` role when no specific arbiter is selected.
- **Registry & Composer**: Powered by `PromptFragmentRegistry` resolving default system fragments and overrides from `prompt-overrides.json`, combined with `PromptComposer` to assemble the final unified system prompt.
- **Agent Server Dynamic Mutator**: Integrated with `DefaultResourceLoader.setAppendSystemPrompt` to update active session system instructions dynamically before executing prompts in `ChannelOrchestrator` or standard chats.
- **Centralized Prompt Assembly**: Implements `PromptAssemblyFactory` (`prompt-assembly.ts`) to centralize system prompt building across standard sessions, group channels, standalone agent servers, and subagent executors, resolving raw prompt bypass bugs.

### Dynamic Model Sourcing & Capabilities Matrix
- **Hot-Reloading Catalog**: Supports the `POST /api/providers/:id/refresh` endpoint to query dynamic models in real-time from endpoints (like OpenCode Go or Qwen) with credentials.
- **AI Capability Inference**: Automatically evaluates returned model naming patterns (heuristics) to resolve and bind critical engine flags (`reasoning`, `multimodal` vision, context sizes) dynamically.
- **Provider Info Modal**: Interactive details panel in Settings showing a comprehensive overview matrix of the model IDs, contexts, and capabilities (Text/Vision/Reasoning tags) for connected providers.

### Programmatic Agents & First-Class Context (`agentId`)
- **Independent AI Workers**: Programmatic agents with isolated workspaces at `/tmp/crewfactory/{username}/agents/{agentId}/workspace` and persistent definitions (`definition.json`), fully isolated per user.
- **Factory Architecture**: Factory function `createAgentServer` producing lightweight Hono servers per agent.
- **Unified Chat Integration**: Integrated directly into main `ChatArea` as a First-Class Context (`agentId`), providing isolated sessions, custom system prompts, inherited skills, and model selection.
- **Agent Profile Photos**: Agents support optional avatars via `avatarUrl`. Upload/remove avatar in the agent edit modal. Avatar stored server-side at `/tmp/crewfactory/{username}/agents/{agentId}/avatar.*` and served via `GET /api/agents/:id/avatar`.

- **Execution Abort Mechanism**: Instant server-side cancellation (`abortDispatch`) triggered via WS `channel_abort`, REST `/api/channels/:id/abort`, or the UI Stop button.
- **Cross-Session Memory Bleed Prevention**: Prevents memory bleed across channel chat sessions by isolating memories to their respective `sessionId` O global/static scopes. A substance gate (`isSubstantiveMessage`) filters out trivial messages (like "hola", "para", "ok") to prevent triggering unrelated memory injections. An updated historical label clearly identifies memories retrieved from previous sessions as read-only historical context for the agent.
- **On-Demand Context Reset and Memory Clearance**: An inline "Clear Memories" button inside `ChannelMemoriesModal` allows users to wipe all stored memories of a channel via `DELETE /api/channels/:id/memories`. A toolbar "Reset Context" button in `ChannelChatArea` aborts active generations and initiates a fresh session context immediately.
- **Environmental Context Variables**: Structured key-value context array per channel (`context: ChannelContextItem[]`), dynamically injected into agent prompts.
- **Clean Sub-header & Modal Management**: Floating `ChannelMembersModal`, `ChannelContextModal`, and `ChannelSettingsModal` accessible via subtle header icon buttons with numeric counter badges.
- **Hierarchical Roles & Interactive Org Chart (@xyflow/react)**: Channel members can be assigned hierarchical roles (`lead`, `senior`, `member`, `observer`). Displays Lead indicators in card previews and handles visualization as a primary first-level tab next to Chat. It features an interactive, high-performance visual canvas powered by `@xyflow/react` with custom node configurations, dynamic edge routing animations, fit-view/zoom controls, and minimap navigation on desktop. In mobile viewports, it falls back to a clean grouping card list layout. Clicking/tapping any agent node opens a sliding panel (desktop) or a bottom-sheet (mobile) containing editing selectors (role, replyMode, targeted partners), skills tags, and real-time streaming of current agent activity (thinking logs, output tokens, and active tool calls).
- **Channel Detail Page Rewrite (3-Tab System):** La página de detalle del canal fue reescrita con un sistema de 3 tabs sincronizado con la URL. Tab de **Chat** con vista expandida de conversación y entrada de mensajes. Tab de **Analíticas** con KPIs (sesiones totales, tasa de veto, arbitrajes, tiempo promedio de respuesta) y gráfico de distribución de turns por agente (PieChart). Tab de **Swimlanes** (línea de tiempo horizontal) que mapea turns consecutivos en carriles paralelos por agente con un SVG path overlay, detección de eventos de veto (`VETO:`), y panel de inspección de nodos seleccionados.
- **Cascading Membership Cleanup & Orphan Validation**: Deleting an agent cascades to remove its membership and target tags across all user channels on the server. Reads dynamically filter out deleted agent IDs, and the client displays warning badges, dashed red borders, and detailed panels for "missing" orphan agents to ensure robust workspace validation.

### Multi-Agent Stateless Debate Teams (`teamId`) & Negotiation
- **Collaborative Debate Spaces**: Multi-agent stateless team spaces with isolated workspaces at `/tmp/crewfactory/{username}/teams/{teamId}/workspace` and append-only message logs (`messages.jsonl`), fully isolated per user.
- **Team Types (current state)**: Teams persist an immutable `teamType` chosen at creation: `Negotiation` uses the parallel stateless debate/consensus loop, while `Orchestration` currently invokes only its designated leader through a stateless stub. The persistent owner-session and shared-workspace orchestration work is documented in `plans/team-type-isolation-and-orchestration.md`.
- **Orchestration Prompt Boundary**: The prompt composer now has an isolated `team-orchestration` mode. Its roster exposes each permitted delegate's id, role, and capability, and its leader contract requires `delegate_task` while explicitly forbidding `@` mentions as a dispatch mechanism. Channel prompts retain their existing mention-based behavior.
- **Orchestration Team Sessions**: Orchestration Teams reuse the standard multi-session chat. Every session is owned by the configured leader, carries `teamId` metadata and its own history, while all sessions and their delegated work resolve to the Team workspace.
- **Orchestration Team Context Variables**: Key-value team context variables are manageable via the TeamContextModal in Orchestration viewports and automatically formatted and injected into the leader agent's system prompt.
- **Team Context Isolation**: The reused Orchestration chat is scoped only by `activeTeam`; the leader remains a backend session owner and is never injected as the frontend active-agent context, preventing Team navigation from leaking into an individual agent session.
- **Team Session Resolution**: Opening a Team chat (both Orchestration and Negotiation) resolves its latest Team-scoped session or creates one, then navigates to `/teams/{teamId}/session/{sessionId}`. Both team types support standard multi-session management.
- **Hierarchical Teams Org Chart**: Teams support a native hierarchy Org Chart page at `/teams/{teamId}/org`, adapting the visual FlowCanvas structure to the `TeamMember` schema context.
- **Parallel Stateless Round Loop**: Parallel execution (`Promise.all`) of active debater members using `streamSimple` to query model configurations. Accumulates rounds as stateless text contexts (JSONL) preventing memory contamination of target agent histories.
- **Auto-Negotiation & Consensus Detection**: Consensus evaluation using Regex expressions (e.g. `(ACUERDO ALCANZADO:|ACEPTO)`). If all active members align in consensus, the debate terminates early. If max rounds are reached without agreement, the debate escalates to an Arbiter Agent (`arbiterAgentId`) to deliver a binding arbitrage resolution.
- **Hierarchical Roles**: Roster composition with `lead` (designated Arbiter), `member` (active debater), and `observer` (silent listener). Individual output modes per agent: `full-proposal` (forces full report outputs), `diff-suggestion` (forces code/text diff output), and `normal` (conversational response).
- **WS Event Streaming**: Real-time websocket streaming of thinking tokens and message deltas using specialized `team_send`, `team_join`, `team_abort`, and `team_*` events.
- **Management Modals & Detailed Canvas**: Collapsible `TeamMembersPanel`, configuration `TeamSettingsModal` to adjust agreement/veto regexes, and listing dashboard `TeamsPage` next to interactive chat console `TeamDetailPage`.

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
- **Página de Detalle de Experimento Independiente (`ExperimentDetailPage`)**: Las vistas detalladas se extrajeron de `LaboratoryPage` a un componente y ruta independiente `/laboratory/:experimentId`, logrando aislamiento de lógica y persistencia al recargar la página.
- **Unificación de Mensajería y Reutilización de MessageList**: Refactorización de `ChannelMessageList` para mapear mensajes e hilos de streaming a la estructura de `MessageList`, ganando de forma nativa acordeones interactivos de herramientas y bloques de razonamiento (pensamientos) de los agentes.
- **Historial de Ejecuciones Históricas (Runs)**: Cada ejecución del laboratorio se almacena incrementalmente en `runs/{runId}.json`, ofreciendo un selector reactivo en la cabecera del detalle para alternar y visualizar ejecuciones pasadas.
- **LLM Judge Streaming & Robustez**: El juez ahora realiza streaming en tiempo real de su razonamiento y texto vía WebSocket (`judge_streaming`), captura errores de validación mostrando la respuesta cruda, y mantiene su estado de evaluación activo tras recargas de página.
- **Tab de Configuración Reactivo**: Una pestaña de configuración dedicada (`ExperimentConfigTab`) muestra en tarjetas estructuradas los agentes, prompts de sistema, modelos y criterios de evaluación del experimento. Soporta edición inline reactiva del nombre, prompt del debate y criterios de evaluación mediante inputs asíncronos que conectan con la API `PATCH /api/experiments/:id`.
- **Arquitectura de Componentes Modulares**: Refactorización de la vista del Laboratorio dividiéndola en subcomponentes especializados (`VariantViewer`, `JudgeReport`, `ExperimentConfigTab`, `ExperimentEditorModal`, `RunExperimentModal`) para reducir complejidad y optimizar el rendimiento.
- **Bypass Autónomo No-Blocking**: Las herramientas interactivas del protocolo AG-UI (`request_approval` y `ask_question`) se auto-resuelven de forma instantánea y autónoma cuando el agente corre dentro de una simulación de laboratorio (`isLaboratory` flag), permitiendo que el Baseline y demás tracks finalicen de principio a fin sin interrupciones.
- **Cálculo Exacto de Tokens Consumidos**: Se corrigió el cálculo de tokens consumidos en corridas de variantes del laboratorio. Al finalizar cada ejecución, los tokens consumidos por mensaje en el prompt del LLM se estampan como metadatos (`tokensIn` y `tokensOut`) en cada `ChannelMessage` del canal virtual. El cálculo agrega estos valores directamente y cuenta con un fallback dinámico que consulta los estados acumulados de las sesiones persistentes en `agentRegistry`.
- **Judge Management UI — Scores por Criterio + Evaluación On-Demand**: Los scores per-criterio (`criteriaScores` como `Record<string, number>`) y el `judgeReasoning` del LLM-Judge ahora se **persisten** en `VariantRunResultSchema.scores` (campos opcionales, no rompen datos existentes). El motor de scoring (`scoring.ts`) acepta un `judgeDetail` opcional y lo propaga al resultado. El runner pasa reasoning + criteriaScores del judge para las 3 variantes. Nuevo endpoint **`POST /api/experiments/:id/judge`** para re-evaluar (on-demand) un experimento ya `completed` con las tres variantes con `finalOutput`: corre `LabJudge.evaluateRuns()`, recalcula scores, guarda el experimento y hace `broadcastToUser` con `experiment_status` (`running -> activeVariant: "judging"`, `completed -> experiment`). La UI agrega un **tab "Comparativa"** en el header (visible solo cuando `status === "completed"`) con cards side-by-side de las 3 variantes, `globalScore` con corona para la ganadora, tabla de desglose por criterio en columnas (top score destacado en `primary`), y reasoning del judge en cards colapsables por variante. Botón **"Re-evaluar con Judge"** disponible tanto dentro de la vista comparativa (con spinner) como en el popover de opciones del header (entre Ejecutar y Editar, solo cuando `completed`). Estado `isJudging` local gestionado por el botón on-demand. Nota: el cliente infener `VariantRunResult` desde un tipo espejo local en `apps/client/src/types/laboratory.ts` (no desde el Zod schema de `packages/shared`), sincronizado también con los campos nuevos.
- **Exportación de Variantes a Workspace**: Posibilidad de exportar los agentes y canales de una variante completada a entidades permanentes del espacio de trabajo. Si los agentes ya existen en el registro, se reutilizan de forma autónoma. El canal se crea con un UUID limpio y los miembros se configuran preservando la jerarquía (liderazgo del agente con replyMode 'user-only' y rol 'lead', y targeted replyMode para miembros normales).






### Global Logs Console
- **Real-Time System Monitoring**: Live dashboard showing all system operations (user/agent messages, raw reasoning deltas, tool start/end parameters/results) across any session or channel.
- **Central Event Broker**: Singleton server module (`eventBroker`) buffering recent logs in-memory and broadcasting events via WebSockets.
- **Rich Interactive Control**: Filtering by source type (Sessions/Channels) and event type (Messages/Thoughts/Tools), manual scrolling freezer, screen log clearing, and WebSocket connection status badges.

### AutoConsulting Multi-Agent
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

### Task Delegation & Unified Multi-Agent Primitives
- **Unified CLI Delegation**: Command-line helper script `scripts/delegate.ts` executed via Bun. Lets the global meta-agent delegate prompt execution to programmatic agents (`--agent`), channels (`--channel`), or project sessions (`--project`) with live SSE streams rendered directly to stdout.
- **Active Observation API**: Endpoint `GET /api/agents/:id/observe` (SSE) providing live streaming of internal agent execution events (thoughts, text deltas, tool calls, errors).
- **Execution Log Store**: Structured folder persistence under `/tmp/crewfactory/{username}/[agents|projects]/{id}/executions/{execId}/` saving prompt execution detail files (`prompt.json`, `messages.jsonl`, `tool-calls.json`, `errors.json`, `summary.json`) upon completion.
- **Continuous Optimization Loop**: Factory skills `factory-delegate`, `factory-observe`, and `factory-quick-actions` teaching the global director how to delegate tasks, inspect execution reports, detect repetitive sequences, and compile/register optimized Quick Actions.
- **Global Session Management & Diagnostics**: Factory skill `factory-sessions` teaching the global director how to list, inspect, delete, and analyze session messages, error logs, and execution bottlenecks across repositories, channels, agents, and experiments using standard REST APIs.
- **Self-Improvement Protocol**: Factory skill `factory-self-improvement` providing a structured self-evaluation suite that exercises each capability of the Global Director, followed by an automated analysis phase to generate recommended updates for skill prompts and execution pathways.
- **Rich Monitoring UI**: "Historial" (Executions) logs tab in `AgentsPage.tsx` with collapsable tool detail pre-blocks and real-time Observed status indicators in `ChatArea.tsx`.
- **Multi-Agent Primitives Architecture**: Consolidates 7 legacy orchestration pathways into 4 composeable primitives (`Spawn`, `Delegate`, `Negotiate`, `Arbitrate`):
  - **Spawn / Delegate Primitives**: Unified in `apps/server/src/core/agent-utils.ts` supporting generic result envelope parsing (`parseEnvelope`), WebSocket log event forwarding (`forwardSubagentEvents`), and model fallback resolution.
  - **Negotiation Protocol**: Isolated in `apps/server/src/core/negotiation/negotiation-protocol.ts` wrapping agreement, counter, and rejection state machine checks with clean event hooks (`onAgreement`, `onEscalation`).
  - **Arbitration Protocol**: Isolated in `apps/server/src/core/negotiation/arbitration-protocol.ts` encapsulating binding verification prompts and structured system escalation message templates.
  - **Consolidated Entry Points**: `ChannelOrchestrator` and `ExperimentRunner` compose these primitives directly. Implícit `DELEGATE:` text parsing and legacy setup-autoconsulting setup files have been deleted in favor of native tool calls.
- **Minimalist Welcome Chat Input**: Unified, high-contrast text input component (`WelcomeChatInput`) configured for empty sessions, first-time prompt initializations (auto-creating sessions dynamically based on active contexts), and laboratory team generator view. Implements Dynamic greeting based on user local time/active locale, built-in model dropdown selectors, files attachments lists, and custom suggestions cards. Includes `loadingMessages` shimmer checks in `ChatArea` to eliminate layout transition flickering.

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
| GET/POST/DELETE | /api/sessions | Session CRUD (supports optional `projectName`) |
| POST | /api/sessions/:id/prompt | Send prompt (REST) |
| POST | /api/sessions/:id/model | Set active model |
| GET | /api/sessions/:id/messages | Get session messages |
| POST | /api/sessions/:id/abort | Abort generation |
| GET | /api/models | Available models (dynamic from SDK) |
| GET | /api/providers | List providers with auth status |
| GET | /api/providers/:id/models | Models for a provider |
| POST | /api/providers/:id/key | Set API key |
| DELETE | /api/providers/:id/key | Remove API key |
| GET | /api/preview/state | Get preview build state for a project (`?project=name`) |
| GET | /api/preview/config | Get preview build config (`?project=name`) |
| POST | /api/preview/config | Save preview build config (framework, buildCommand, outputDir) |
| POST | /api/preview/build | Trigger build from config (`?project=name`) |
| POST | /api/preview/build/abort | Cancel running build (`?project=name`) |
| GET | /api/preview/{username}/{projectName}/* | Serve static files from project build dir with SPA fallback (path-based isolation, no token) |
| GET | /api/workspace-projects | List projects in workspace/projects/ |
| POST | /api/workspace-projects | Create empty project or clone from Git URL |
| PATCH/DELETE | /api/workspace-projects/:id | Rename project name or delete project (and sessions) |
| GET/PUT/POST/DELETE/PATCH | /api/workspace/* | Workspace file operations (supports `?project=name`, `?agentId=id`, `?channelId=id` scoping) |
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
| GET | /api/integrations/bindings/:projectName | Get project linkages for active project |
| GET/POST/PATCH/DELETE | /api/agents | Agent registration, listing, updating (restarts server), and deletion (and sessions) |
| GET | /api/agents/:id/observe | SSE event stream of agent actions, thoughts, and tools |
| GET | /api/agents/:id/executions | List saved execution logs for the agent |
| GET | /api/agents/:id/executions/:execId | Retrieve detail logs of a specific agent execution |
| POST | /api/sessions/:id/prompt/stream | Stream prompts (SSE) for standard project-scoped sessions |
| GET | /api/sessions/projects/:projectName/executions | List saved execution logs for the project |
| GET | /api/sessions/projects/:projectName/executions/:execId | Retrieve detail logs of a specific project execution |
| GET/POST/PATCH/DELETE | /api/channels | Channel CRUD, member management (`/members`), context variables (`PUT /:id/context`), abort execution (`POST /:id/abort`), message dispatch (`/send`) |
| GET/POST/PATCH/DELETE | /api/teams | Team CRUD, member management (`/members`), settings updates, and message dispatches (`/send`, `/:id/abort`) |
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
| POST | /api/experiments/:id/export | Export selected completed experiment variant as permanent workspace agents and channel |
| GET/PATCH | /api/settings | Get or update general user settings |
| POST | /api/settings/test-vision | Perform diagnostic vision model test call |
| POST | /api/settings/test-image-gen | Perform diagnostic image generation model test call |
| GET | /api/health | Health check |


## Architecture

```
apps/client/   React 19 + Vite + Tailwind CSS v4 + Framer Motion
apps/server/   Bun + Hono + Zod + Local AI Runner Module (src/ai/)
packages/shared/  Shared Zod schemas and types
```

### Key Server Modules
- `ai/` — Vendored and decoupled core agent runtime, including ModelRegistry, SessionManager (persistence), DefaultResourceLoader, AuthStorage, BashTool, and loadSkills.
- `core/session-manager.ts` — Fachada unificada y singleton que coordina la instanciación y ciclo de vida de sesiones de agentes, exponiendo como propiedades públicas de solo lectura submódulos especializados dentro de `core/session/` (`user-config`, `metadata-store`, `prompt-builder`, `tool-factory`, `session-lister`, `workspace-resolver`, `tool-activation-engine`, `session-event-publisher`, `before-tool-call-hook`, `session-memory-enricher`, `agent-definition-resolver`).
- `core/tools/task-state-manager.ts` — Centralized manager for planning task state. Encapsulates in-memory caching, atomic write operations, strict Zod-based task list validation, and circular dependency checking.
- `core/decompose-tool.ts` — Native task decomposition tool factory that constructs structured plans from objectives.
- `core/update-task-tool.ts` — Native task status update and completion tool definitions maintaining planning state DAGs.
- `routes/files.ts` — Workspace file CRUD API with `?project=name` scoping and `/workspace-projects` endpoints for project management.
- `routes/preview.ts` — Preview file serving, config CRUD (`/config`), and build trigger/abort (`/build`)
- `pi/preview-config.ts` — Auto-detect framework from `package.json`/config files, load/save `.preview.json`
- `pi/preview-builder.ts` — Spawn build via `bash -c`, stream stdout/stderr logs via WS, abort support
- `pi/preview-watcher.ts` — `fs.watch` on build dir, build status detection, broadcast preview_status via WS
- `lib/auth-helpers.ts` — Shared `getUsername()` helper supporting `?token=` query param and `Authorization` header
- `routes/providers.ts` — Dynamic provider configuration API
- `routes/backup.ts` — Backup Hono router for exporting and importing zip archives.
- `routes/models.ts` — Model listing from SDK's modelRegistry.getAvailable()
- `routes/sessions.ts` — Session CRUD, tool permissions, and metadata operations (awaited on critical reads to prevent race conditions during initialization)
- `agents/create-agent-server.ts` — Factory for isolated agent Hono servers. Inherits user authStorage and modelRegistry.
- `agents/agent-registry.ts` — Singleton managing programmatic agent lifecycle and filesystem persistence. `get(id, username?)` enforces ownership when username is provided.
- `channels/channel-store.ts` — Filesystem store for channel definitions and message logs.
- `channels/channel-orchestrator.ts` — Sequential multi-agent message dispatch and recipient resolution.
- `pi/mcp-client.ts` — Stdio and HTTP/SSE JSON-RPC Client for MCP Server integrations with Bun (with 5-second request timeouts).
- `pi/mcp-registry.ts` — Manager for MCP server lifecycle, catalog definitions, connection preflights, and dynamic tool injection (with parallel server startup).
- `routes/mcp.ts` — REST endpoints for MCP catalog, server configs management, manual connections, testing, and status queries.
- `routes/agents.ts` — REST endpoints for programmatic agent management.
- `routes/channels.ts` — REST endpoints for channel CRUD, member administration, and message dispatch.
- `routes/teams.ts` — REST endpoints for team CRUD, member administration, and message dispatch.
- `teams/team-store.ts` — Filesystem store for team definitions, message logs, and negotiation states.
- `teams/team-prompt-runner.ts` — Stateless agent prompt runner executing direct models.
- `teams/team-negotiation-evaluator.ts` — Evaluator module classifying agent votes (agreed, counter, rejected, neutral) and checking multilateral consensus (quorum ratio threshold).
- `teams/team-negotiation.ts` — Consensus checking and arbiter resolution coordinator utilizing TeamNegotiationEvaluator.
- `teams/team-orchestrator.ts` — Parallel execution round and consensus loop orchestrator managing rounds in StatelessDebateLoop.
- `ws/factory.ts` — Factory creating closure-captured WS connection contexts (`crypto.randomUUID()` id, no `ws.wsId` mutation). Handles cookie auth via `auth.api.getSession` + fallback sync lookup, pong tracking, prompt auto-subscribe transactionally, channel join/send, and UI approvals. Uses structured logger.
- `ws/registry.ts` — Singleton registry managing `userSockets`, `sessionSockets`, `channelSockets` Maps and per-connection meta (`missedPings`, `sessionId`, `channelId`) with explicit cleanup, no global counter, no raw object mutation.
- `ws/logger.ts` — Structured logger for WS layer with levelled `info/warn/error/debug` and contextual `wsId/username/sessionId`.
- `ws/handler.ts` — Compatibility shim and broadcast façade (`broadcastToUser/Channel/Session`) backed by registry. Legacy `onOpen/onClose/onMessage` wrappers delegate to factory contexts. Wires `channelOrchestrator` and `eventBroker` broadcasters.
- `lib/event-broker.ts` — Singleton buffering recent global log events per user (up to 150) and broadcasting to user WS sockets via injected `setEventBroadcaster()` (no dynamic require).
- `auth/db.ts` — Pure DB factory, no manual CREATE TABLE; schema owned by Better Auth via `getMigrations` + `runMigrations` in `auth/migrate.ts`.
- `auth/migrate.ts` — Runs Better Auth migrations programmatically on server startup.
- `auth/onboarding.ts` — Programmatic session creation using `randomUUID` id + `base64url` token, compatible with Better Auth schema, no manual table ownership.
- `lib/auth-helpers.ts` — Single source of truth for session validation: `extractToken` without JWT split, `parseExpiresAt/isExpired` shared util, `SESSION_COOKIE_KEYS` with `__Secure-` prefix support, `validateSessionFromHeaders` using `auth.api.getSession` primary + sync DB fallback, `getSessionTokensFromCookieHeader` for WS hot path.
- `middleware/auth.ts` — Better Auth session middleware for REST routes
- `preview-server.ts` — Standalone static file server on port 3001 with path-based isolation for project preview (no auth tokens in URLs)

### Key Client Modules
- `pages/DashboardPage.tsx` — Initial view: lists projects, creates/clones Git projects, accesses global workspace.
- `pages/AgentsPage.tsx` — Management dashboard for programmatic agents.
- `pages/ChannelsPage.tsx` — Management dashboard for multi-agent channels with card actions.
- `pages/MCPMarketplacePage.tsx` — Main MCP Marketplace page with tabbed views (Gallery catalog and Custom configurations).
- `components/mcp/MCPCard.tsx` — Card component representing a server, rendering connection statuses, toggles, errors logs, and discovered tools.
- `components/mcp/MCPCustomForm.tsx` — Form for custom stdio/HTTP server setup, environment variables editing, and connection testers.
- `components/ui/Toast.tsx` — Reusable premium Toast and ToastContainer components with Framer Motion animations.
- `components/channels/ChannelChatArea.tsx` — Dedicated container for channel WS streaming and multi-agent execution.
- `components/channels/ChannelMessageList.tsx` — Multi-agent message list with agent badges, avatars, and RichMarkdown.
- `components/channels/ChannelMembersModal.tsx` — Floating modal for member management and targeted agent selection.
- `components/channels/ChannelContextModal.tsx` — Floating modal for managing key-value channel context variables.
- `components/teams/TeamChatArea.tsx` — Dedicated container for stateless debate teams WS streaming.
- `components/teams/TeamMessages.tsx` — Render messages timeline for teams.
- `components/teams/TeamMessageList.tsx` — Debater and Arbiter messages list rendering.
- `components/teams/TeamCard.tsx` — Preview cards for Teams list screen.
- `components/teams/TeamSettingsModal.tsx` — Modal managing team parameters and regex-based thresholds.
- `components/teams/TeamMembersModal.tsx` — Modal managing team members, roles, and output modes.
- `components/teams/TeamMembersPanel.tsx` — Sliding panel for team members in chat dashboard.
- `components/teams/TeamOrgTab.tsx` — Hierarchy chart canvas visualizer using FlowCanvas wrapper mapped for TeamMembers.
- `pages/TeamsPage.tsx` — Stateless debate teams CRUD dashboard.
- `pages/TeamDetailPage.tsx` — Detailed workspace chat and console panel for teams.
- `pages/TeamOrgPage.tsx` — Container view rendering the team organization flowchart tab.
- `lib/ws-client.ts` — **Singleton WebSocket client** shared across the entire app. Handles cookie-based auth (no localStorage fallback), type-keyed event dispatch, exponential-backoff reconnect, bounded offline queue (max 50, drops oldest with warning, `isConnected()` guard), and `session_subscribe` protocol. Uses singleton for `preview_status`/`preview_build_log` to avoid second WS connection. Replaces the per-hook WS connections that previously caused 3 simultaneous connections.
- `hooks/useWebSocket.ts` — Thin React wrapper over `wsClient`. Sends `session_subscribe` on connect via `useConnectionAwareEffect` with dedup and exposes `send`/`subscribe` + `connected` for offline banner.
- `hooks/useConnectionAware.ts` — Reentrant hook implementing "send now + replay on reconnect" with `useRef` wrapper, dep-key dedup (JSON.stringify), `wasConnected` tracking, and `hasRunForCurrentDeps` guard to prevent duplicate handlers on StrictMode remount.
- `components/preview/PreviewPanel.tsx` — Live preview using dedicated preview server (3001) for origin isolation, now reusing `wsClient` singleton for `preview_status`/`preview_build_log` instead of separate `new WebSocket()`.
- `hooks/useSessionStatusWs.ts` — Pure hook subscribing to `session_status` events via `wsClient`. No module-level mutable state.
- `hooks/useChannel.ts` — Channel data + WS event hook. Uses `wsClient.subscribe("*")` and filters by channelId/sessionId locally.
- `hooks/useTeam.ts` — Team data + WS event hook. Uses `wsClient.subscribe("*")` and filters by teamId/sessionId locally.
- `hooks/useTeams.ts` — CRUD list manager hook for Teams.
- `hooks/useRouter.ts` — Adaptador temporal sobre React Router: conserva el contrato tipado `route`/`navigate` mientras deriva la ruta desde `useLocation` y navega con `useNavigate`, sin evento `popstate` sintético. Su retirada tras migrar consumidores a APIs nativas está planificada en `plans/app-router-refactor.md`.
- `hooks/useLaboratoryController.ts` — Controlador aislado del laboratorio: carga y sincroniza experimentos/runs, procesa eventos `experiment_status`, y encapsula acciones y estado de ejecución, exportación y borrado.
- `hooks/useWorkspaceContext.ts` — Controlador único del contexto de proyecto, agente, canal y equipo. Sincroniza los parámetros de ruta con `localStorage` y expone operaciones de selección homogéneas para toda la interfaz.
- `components/chat/ModelSelector.tsx` — Nested dropdown for provider/model selection. Features reactive validation to automatically resolve fallback models in both frontend (`localStorage`) and backend session states when a selected provider key is disconnected.
- `pages/SettingsPage.tsx` — Shell page delegating to modular tab components under `components/settings/` (`GeneralTab`, `ProvidersTab`, `EnvVarsTab`, `IntegrationsTab`, `McpTab`).
- `components/settings/ProvidersTab.tsx` — Tab view managing API credentials. Features an interactive **Sincronizar** action for dynamic model fetching and an **Info** action displaying a premium capability matrix modal.
- `components/layout/AppRouter.tsx` — Router y composición actual de la aplicación; concentra autenticación, historial de navegación y renderizado de rutas. El laboratorio y el contexto de workspace están desacoplados en controladores propios; continúa el plan de extraer rutas declarativas en `plans/app-router-refactor.md`.
- `components/layout/MainLayout.tsx` — App shell with persistent left Sidebar (Slack-like), breadcrumb navigation in the header, and popover actions.
- `components/chat/ChatArea.tsx` — Single-agent/project message list, streaming state, layout structure with side-by-side right drawer.
- `components/sidebar/SessionSidebar.tsx` — Left sidebar displaying active context, navigation links (Chat, Workspace, Preview), collapsible accordions for Proyectos, Agentes, and Canales, and administration links. Renders customizable avatars using `EntityAvatar` for all categories.
- `components/shared/EntityAvatar.tsx` — Custom visual component rendering initials with unique color gradients, or loaded profile image avatars for agents, channels, projects, and teams.
- `components/sidebar/SessionPopover.tsx` — Floating contextual popover menu for session switching, metadata management, and creation.
- `components/chat/tools/DecomposeResult.tsx` — Premium inline card displaying structured planned objectives and DAG task dependencies inside the chat stream.
- `components/chat/FloatingTasks.tsx` — Floating interactive accordion card rendered as a chat overlay, featuring play/pause controls and list indicators.
- `components/preview/PreviewPanel.tsx` — Full-page iframe preview with build status, toolbar, and responsive mode toggle
- `components/ui/Logo.tsx` — CrewFactory logo component (favicon-based, responsive sizing).
- `components/workspace/WorkspacePanel.tsx` — File explorer scoped to active workspace.
- `pages/LaboratoryPage.tsx` — Multi-variant benchmarking laboratory orchestration view.
- `components/laboratory/` — Dashboard panels including comparative metrics charts, live execution logs, historical sidebar, and step-by-step experiment wizard.
- `pages/PluginsPage.tsx` — Main plugins page listing and managing Engram memory and Exa Search add-ons settings.

## Add-ons & Plugins Architecture

The application implements a decoupled, modular addon system using the **Null Object Pattern** and dynamic registries. These add-ons extend agent capabilities while ensuring zero regression risk and zero runtime overhead when deactivated.

### 1. Persistent Agent Memory (Engram)
- **Engine:** Built upon `@engram-ai-memory/core` using a local SQLite instance and local ONNX embeddings (via `@xenova/transformers`).
- **Isolation:** Managed through the `EngramRegistry` singleton which instantiates isolated `MemoryProvider` containers mapped to unique namespaces (`agent:{id}`, `channel:{id}`, `session:{id}`).
- **Integration:** Pure wrapping injection over the public `session.prompt` interface. Merges relevant memories dynamically at runtime post-recall without modifying the vendored agent core or prompts database.
- **Auto-store:** Conditionally archives assistant responses as episodic memories post-generation, toggleable per-user.

### 2. Exa Neural Search Tool
- **Engine:** Standardized JSON-RPC `exa_search` tool querying Exa AI's semantic endpoint. Implementation uses zero dependencies (native `fetch()` calls).
- **Gating Protocol:** Exposed in the `toolStatus` map from the server's session tools API. Checked reactively in the frontend `ToolsSelector` checkbox list: dims, disables, and alerts the user with warning badges/tooltips if `EXA_API_KEY` is not present in Settings > Env Vars.
- **Cleanup:** Automatically filters active `exa_search` mappings on session reload if the corresponding credential key is removed.

