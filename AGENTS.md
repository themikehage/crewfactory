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

## Code Conventions
- TypeScript strict mode, no `any` types
- Tailwind CSS v4 only, no custom CSS files (except index.css with @theme)
- No comments in production code
- Absolute imports: `@/` alias for `client/src/` only
- Server uses relative imports (Bun build doesn't resolve tsconfig paths)
- Functional components with hooks, no class components
- Mobile-first responsive: 375px, 768px, 1280px breakpoints
- No emojis in code, commits, or UI

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
- **Always use Tailwind tokens** (`bg-bg`, `bg-surface`, `text-accent`, etc.). Never use raw hex values in component code.

## Git Commit Style
`type(scope): description`
- Types: feat, fix, style, chore, refactor, docs
- Scopes: auth, chat, ws, session, ui, deploy, project, workspace, dashboard, repo

## Deploy

### Platform
- **Service:** Coolify
- **URL:** https://crewfactory.pages.therry.dev

### Resources
- **Server UUID:** usfaz8tzw85ctz03i4kl8okf
- **Project UUID:** aitet5hutg1byuy5hcjbhuyp
- **Application UUID:** nb0ee5mtnrx195nrw9aa3oor
- **Repository:** https://github.com/themikehage/crewfactory (public)
- **Build Pack:** dockerfile
- **Port:** 3000
- **Base URL for API:** https://pages.therry.dev/api/v1

### Auth
- **Environment Variables (Coolify):**
  - JWT_SECRET - JWT signing secret (base64 random)
  - AUTH_USERNAME - Login username (e.g. "admin")
  - AUTH_PASSWORD_HASH - Base64-encoded bcrypt hash of password. Generate with:
    ```
    bun -e "import bcrypt from 'bcryptjs'; const h = await bcrypt.hash('password', 10); console.log(Buffer.from(h).toString('base64'));"
    ```
  - ANTHROPIC_API_KEY - Anthropic API key (optional, for LLM access)
- **Important:** AUTH_PASSWORD_HASH must be base64-encoded! Docker/Coolify env var handling expands `$` characters in bcrypt hashes. The server decodes from base64 at runtime.

### Deployment Commands
```bash
# Redeploy
curl -X POST "$COOLIFY_URL/api/v1/applications/nb0ee5mtnrx195nrw9aa3oor/start" \
  -H "Authorization: Bearer $COOLIFY_API_KEY"

# Check status
curl -s "$COOLIFY_URL/api/v1/deployments?application_uuid=nb0ee5mtnrx195nrw9aa3oor&per_page=1" \
  -H "Authorization: Bearer $COOLIFY_API_KEY"
```

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
