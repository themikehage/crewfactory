# AGENTS.md - CrewFactory

## Mandatory Context Files
Before any work, read: `about.md`, `steps.md`, `AGENTS.md` (this file). These are the single source of truth.

## Workflow
1. Read the 3 MDs above
2. Pick next incomplete task from `steps.md`
3. Complete task, validate, commit
4. Update `steps.md` to mark completed
5. Update `about.md` after each new change to keep documentation current (architecture, features, API endpoints, and modules)
6. **Ideas**: When the user shares a feature idea, analyze it, create a plan in `plans/{topic}.md`, link it in `plans/_index.md`, and update `about.md` if needed

## Commands
- `bun run dev` - Start both client and server (from root)
- `bun run build` - Build server (from apps/server)
- `cd apps/client && bun run build` - Build client
- `cd apps/client && bun run dev` - Dev server with hot reload
- `bun scripts/refresh.ts --type <repo|agent|channel|skill|all>` - Trigger a frontend UI refresh after mutating entities from tools

## AI Agent UI Refresh Rule
Whenever you (the AI agent) create, update, or delete a repository/project, agent, channel, or custom skill, you MUST execute the refresh script to notify the user's frontend. 
- Example from root: `bun scripts/refresh.ts --type repo`
- Example from inside a repo workspace subdirectory: `bun ../../scripts/refresh.ts --type agent`

## Code Conventions
- TypeScript strict mode, no `any` types
- Tailwind CSS v4 only, no custom CSS files (except index.css with @theme)
- No comments in production code
- Absolute imports: `@/` alias for `client/src/` only
- Server uses relative imports (Bun build doesn't resolve tsconfig paths)
- Functional components with hooks, no class components
- Mobile-first responsive: 375px, 768px, 1280px breakpoints
- No emojis in code, commits, or UI
- Always use localized literals via translation files (e.g. `.literals.ts`), never hardcode user-facing strings in JSX components

## Stack
- **Backend:** Bun + Hono + Zod + @earendil-works/pi-coding-agent SDK
- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS v4 + Framer Motion
- **Auth:** JWT + bcrypt (credentials in env vars, base64-encoded for Docker safety)
- **Streaming:** WebSocket (Hono/Bun upgrade)
- **Persistence:** localStorage (client), filesystem (server sessions at /tmp/crewfactory)
- **Deployment:** Coolify (Docker)

## Workspace Structure
Each user has an isolated workspace at `/tmp/crewfactory/{username}/workspace/`:
```
workspace/
  repos/           # Git repositories (each is an isolated agent context)
  assets/
    uploads/       # User-uploaded files
    generated/     # Agent-generated outputs (images, diagrams)
  memories/
    repos/         # Per-repo agent notes and context
    sessions/      # Short-term session memories
```

### Agent Instantiation Modes
- **Global mode (root):** Agent CWD = `/workspace`. Used for cross-repo tasks, asset management, and memory administration.
- **Repo mode:** Agent CWD = `/workspace/repos/{repoName}`. Used for focused, isolated development within a single repository. Sessions are bound to the repo via `metadata.json`.

## Design Tokens
- Theme defined in `apps/client/src/index.css` via Tailwind CSS v4 `@theme`
- Palette: `bg=#121212`, `surface=#171717`, `surface-hover=#313131`, `accent=#4ade80` (green), `text-primary=#e2e8f0`, `text-secondary=#a2a2a2`, `success=#4ade80`, `error=#ca3214`, `warning=#fbbf24`
- Typography: `display/body=Outfit`, `mono=JetBrains Mono` (Google Fonts, loaded in index.html)
- **Always use Tailwind design system tokens** (`bg-bg`, `bg-surface`, `text-accent`, etc.). Never use raw hex values or hardcoded inline colors in component code.

## Git Commit Style
`type(scope): description`
- Types: feat, fix, style, chore, refactor, docs
- Scopes: auth, chat, ws, session, ui, deploy, project, workspace, dashboard, repo

### Considerations
- WebSocket streaming requires no sticky sessions
- User session data stored at /tmp/crewfactory/{username} (not persisted across restarts)
- For persistent sessions, add a volume mount for /tmp/crewfactory
- Server serves client static files from ./public directory
- Health check at /api/health

## Agent Visual Guidelines (Live Previews & Image Parsing)
To leverage the UI's built-in parsing and preview capabilities:
- **Live HTML Preview**: When generating web interfaces, pages, mockups, or responsive HTML layouts, format your response as a full HTML document starting with `<!DOCTYPE html>` or `<html>`. The UI will render this content in the Live Visual Preview tab automatically.
- **Images and Charts**: When generating graphs, charts, diagrams, or plots:
  1. Save them into the workspace session files directory.
  2. Output the path or URL using the exact pattern below:
     ```
     === [title] ===
     [file path or URL]
     ```
     Example:
     ```
     === monthly_revenue.png ===
     monthly_revenue.png
     ```
     The UI will automatically extract these paths, fetch them via the session file endpoints, and display them in a visual gallery grid below the tool output.
