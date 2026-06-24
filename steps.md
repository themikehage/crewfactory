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

## Phase 16: Context Window Meter
- [x] 16.1 Server: emit `context_usage` via WebSocket after each `message_end`
- [x] 16.2 Server: handle `compact` and `get_context_usage` WebSocket messages
- [x] 16.3 Client: `ContextMeter.tsx` component (progress bar, token count, Compact button)
- [x] 16.4 Client: integrate ContextMeter in ChatArea between messages and InputArea

---

## Phase 15: Integrations Hub (Declarative Infrastructure Operations)
- [x] 15.1 Shared schemas: QuickAction, IntegrationTemplate, SaveTemplates, and RepoBindings
- [x] 15.2 Server router: CRUD endpoints under `/api/integrations/templates` and `/api/integrations/bindings`
- [x] 15.3 Server persistence: User-level storage mapped in `/tmp/pi-web-users/{username}/integrations.json`
- [x] 15.4 Client settings: Tab rendering with status connection indicator, credentials update, and template custom editing
- [x] 15.5 Client workspace: Dual-tab RightDrawer container with sliding toggle integration
- [x] 15.6 Client panel: InfrastructurePanel rendering active bindings form and dynamic Quick Action prompt buttons

