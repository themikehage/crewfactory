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
- [ ] 8.4 Keyboard shortcuts
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

