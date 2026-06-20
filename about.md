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

### Provider Management
- Dynamic provider configuration via web UI (no env vars needed)
- 35 supported providers from pi SDK (Anthropic, OpenAI, Google, DeepSeek, Groq, Mistral, etc.)
- API key management: add/remove keys per provider, persisted to auth.json
- Model selector below chat input: shows only configured providers, nested dropdown for model selection
- Model persistence in localStorage, applied to sessions via SDK's setModel()
- Auth status indicators (configured/not configured per provider)

### Mobile-First Responsive
- Breakpoints: 375px (base), 768px (sm), 1280px (lg)
- Sidebar: hidden by default on mobile, overlay with backdrop when open
- Header: compact on mobile (h-10 vs h-12)
- Responsive padding, font sizes, and button sizing throughout

### Theme
- Supabase dark theme via tailwindcss-tweakcn
- Colors: bg #121212, surface #171717, accent green #4ade80
- Typography: Outfit (display/body), JetBrains Mono (mono)
- Design tokens via Tailwind CSS v4 @theme

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Login, returns JWT |
| GET | /api/auth/me | Current user info |
| GET/POST/DELETE | /api/sessions | Session CRUD |
| POST | /api/sessions/:id/prompt | Send prompt (REST) |
| POST | /api/sessions/:id/model | Set active model |
| GET | /api/sessions/:id/messages | Get session messages |
| POST | /api/sessions/:id/abort | Abort generation |
| GET | /api/models | Available models (dynamic from SDK) |
| GET | /api/providers | List providers with auth status |
| GET | /api/providers/:id/models | Models for a provider |
| POST | /api/providers/:id/key | Set API key |
| DELETE | /api/providers/:id/key | Remove API key |
| WS | /ws | WebSocket for real-time streaming |
| GET | /api/health | Health check |

## Architecture

```
apps/client/   React 19 + Vite + Tailwind CSS v4 + Framer Motion
apps/server/   Bun + Hono + Zod + @earendil-works/pi-coding-agent SDK
packages/shared/  Shared Zod schemas and types
```

### Key Server Modules
- `pi/session-manager.ts` — Singleton managing AgentSession lifecycle, authStorage, and modelRegistry per user
- `routes/providers.ts` — Dynamic provider configuration API
- `routes/models.ts` — Model listing from SDK's modelRegistry.getAvailable()
- `ws/handler.ts` — WebSocket auth via JWT, streaming via session.subscribe()
- `middleware/auth.ts` — JWT verification middleware for REST routes

### Key Client Modules
- `hooks/useWebSocket.ts` — WebSocket client with auto-reconnect, event subscription
- `components/chat/ModelSelector.tsx` — Nested dropdown for provider/model selection
- `pages/SettingsPage.tsx` — Provider management with API key add/remove
- `components/layout/ChatLayout.tsx` — Mobile-first layout with collapsible sidebar
- `components/chat/ChatArea.tsx` — Message list, streaming state, error display
