COMPLETED ✅
# Implementation Plan - MCP Marketplace & Gallery for CrewFactory

This plan outlines the design and implementation steps to construct a robust Model Context Protocol (MCP) Marketplace and Gallery inside CrewFactory. It allows users to browse a collection of predefined MCP servers (Filesystem, GitHub, PostgreSQL, Puppeteer, etc.), install them with one click, connect custom servers (via local command-line execution or HTTP/SSE connection), configure environment variables, and expose dynamic tools automatically to running agent sessions.

---

## User Review Required

Documented design choices and technical options requiring verification:

> [IMPORTANT]
> **MCP Client Architecture Choice (Native Custom Client vs. SDK Dependency)**
> CrewFactory currently uses a lightweight custom Stdio JSON-RPC client (`McpClient` in [mcp-client.ts](file:///c:/Users/themi/AgentWorkspace/crewfactory/apps/server/src/core/mcp-client.ts)) which uses `Bun.spawn` to bypass heavy dependencies. 
> - **We propose extending this native client** to support `http` (SSE + POST) transports natively instead of pulling the official `@modelcontextprotocol/sdk` package. Bun's native HTTP/fetch streaming APIs make this highly performant, lightweight, and zero-dependency.
> - If you prefer using the official Anthropic SDK, please let us know. However, the custom implementation is less prone to dependency version mismatch issues with the Bun runtime.

> [WARNING]
> **Production Node/NPX & Python Availability in Docker**
> Many standard stdio MCP servers rely on `npx` (Node.js) or `uvx`/`pipx` (Python). Since CrewFactory runs inside a Docker container (deployed to Coolify), we need to ensure that:
> 1. `node` and `npm`/`npx` are installed and available in the production Docker image.
> 2. The standard `@modelcontextprotocol/server-filesystem` mounts only the isolated user workspace directory `/tmp/crewfactory/{username}/workspace` for multi-user security isolation.

---

## Proposed Changes

We will group changes logically across components:

### 1. Shared Types & Validation Schemas

We will define new schema validations to keep TypeScript safety strict across Hono REST payloads and client requests.

#### [MODIFY] [schemas.ts](file:///c:/Users/themi/AgentWorkspace/crewfactory/packages/shared/src/schemas.ts)
- Add `McpTransportTypeSchema = z.enum(["stdio", "http"])`
- Add `McpServerConfigSchema` covering:
  - `id`: unique ID (e.g. "github", "custom-1")
  - `name`: string
  - `description`: string (optional)
  - `transport`: `stdio` | `http`
  - `command`: string (for stdio, e.g. "npx")
  - `args`: array of strings
  - `env`: record of strings (optional, for token env variables)
  - `url`: string (for HTTP transport)
  - `enabled`: boolean
  - `isBuiltin`: boolean
  - `category`: string (optional)
  - `icon`: string (optional)
  - `status`: enum ("disconnected", "connecting", "connected", "error")
  - `error`: string (optional)
- Add `McpCatalogItemSchema` representing the marketplace listing.
- Export all generated TypeScript types (`McpServerConfig`, `McpCatalogItem`, etc.).

---

### 2. Backend (Server)

We will upgrade the MCP connections engine to support HTTP endpoints, expand the registry, and expose marketplace API routes.

#### [MODIFY] [mcp-client.ts](file:///c:/Users/themi/AgentWorkspace/crewfactory/apps/server/src/core/mcp-client.ts)
- Refactor `McpClient` to become a base class or implement an interface, separating Stdio execution and HTTP execution.
- Create `McpHttpClient` subclass supporting MCP HTTP/SSE transport specification:
  - Initiate a Server-Sent Events (SSE) stream via `fetch` to read events from the remote server.
  - Parse the initial `connect` event containing the endpoint URL for POST messages.
  - Implement JSON-RPC 2.0 requests over HTTP POST payloads.
- Handle timeouts, auto-reconnection on process crashes or network issues, and capture stderr logs for diagnostic outputs.

#### [MODIFY] [mcp-registry.ts](file:///c:/Users/themi/AgentWorkspace/crewfactory/apps/server/src/core/mcp-registry.ts)
- Update default configurations to use the standardized directory paths.
- Define a comprehensive `MCP_CATALOG` array (e.g., Filesystem, GitHub, PostgreSQL, Puppeteer, Memory Graph, Brave Search, Slack, Notion, Linear, Exa Search).
- Refactor config storage: persist configured servers to `/tmp/crewfactory/{username}/mcp-servers.json` (separating user configurations cleanly).
- Implement connection pools mapping dynamic clients per user workspace.
- Inject dynamic tools with a clean namespaced name format: `mcp_${serverId}_${toolName}`.

#### [MODIFY] [routes/mcp.ts](file:///c:/Users/themi/AgentWorkspace/crewfactory/apps/server/src/routes/mcp.ts)
- Expand Hono REST endpoints:
  - `GET /api/mcp/servers` - List all configured servers for the user.
  - `POST /api/mcp/servers` - Add a custom server (stdio/http).
  - `PUT /api/mcp/servers/:id` - Update server config (e.g., edit credentials/env vars).
  - `DELETE /api/mcp/servers/:id` - Remove a custom server configuration.
  - `POST /api/mcp/servers/:id/connect` - Manually trigger server connection check.
  - `POST /api/mcp/servers/:id/disconnect` - Stop connection / kill stdio subprocess.
  - `GET /api/mcp/servers/:id/tools` - List discovered tools for the server.
  - `GET /api/mcp/catalog` - Retrieve the official marketplace list.
  - `POST /api/mcp/catalog/:id/install` - Install a pre-configured server from the catalog.

#### [MODIFY] [session-manager.ts](file:///c:/Users/themi/AgentWorkspace/crewfactory/apps/server/src/core/session-manager.ts)
- Ensure all enabled user MCP servers are connected asynchronously when starting/restoring an `AgentSession`.
- Expose and register discovered MCP tools in the session custom tools stack, avoiding duplication.

---

### 3. Frontend (Client UI)

We will build a high-fidelity visual interface matching the Dark OKLCH theme and Slack-like navigation hierarchy.

#### [NEW] [MCPMarketplacePage.tsx](file:///c:/Users/themi/AgentWorkspace/crewfactory/apps/client/src/pages/MCPMarketplacePage.tsx)
- Build a dual-tab dashboard:
  - **Marketplace Gallery**: Displays a beautiful grid of cards for each catalog item. Filters by category and displays clear badges (Installed, Enabled, Error).
  - **Custom Servers**: An interactive panel to add dynamic stdio or HTTP servers. Contains a "Test Connection" button that shows immediate success outputs or error stacks.

#### [NEW] [MCPCard.tsx](file:///c:/Users/themi/AgentWorkspace/crewfactory/apps/client/src/components/mcp/MCPCard.tsx)
- A reusable component representing a single MCP Server card.
- Displays icons, category pills, name, status indicator dot (Green = connected, Red = error, Gray = inactive), toggle switch, and collapsible section revealing discovered tools.

#### [NEW] [MCPCustomForm.tsx](file:///c:/Users/themi/AgentWorkspace/crewfactory/apps/client/src/components/mcp/MCPCustomForm.tsx)
- Form inputs: Server Name, Transport type (stdio vs. http), command & arguments (with JSON validation helper for array format), and HTTP URL.
- Environment variables section: Dynamic key-value row generator (e.g., adding `GITHUB_PERSONAL_ACCESS_TOKEN` dynamically).

#### [MODIFY] [AppRouter.tsx](file:///c:/Users/themi/AgentWorkspace/crewfactory/apps/client/src/components/layout/AppRouter.tsx)
- Add route path `/mcps` rendering `<MCPMarketplacePage />`.

#### [MODIFY] [SessionSidebar.tsx](file:///c:/Users/themi/AgentWorkspace/crewfactory/apps/client/src/components/sidebar/SessionSidebar.tsx)
- Add a new navigation tab or link for "Marketplace" under the administration section (styled in line with the Slack aesthetic).

---

## Verification Plan

We will perform automated and manual validation checks before deployment:

### Automated Tests
- Validate that the monorepo builds cleanly:
  ```bash
  bun run build
  ```
- Write a lightweight test script `scripts/test-mcp-http.ts` to mock an MCP HTTP Server and verify that the `McpHttpClient` processes JSON-RPC requests correctly.

### Manual Verification
1. Open the **Marketplace** page, find the **Filesystem** card, click **Install**, and verify that the status changes to **Connected** with tool lists (`read_file`, `write_file`, etc.) appearing in the card expansion.
2. In the custom tab, add a mock HTTP MCP server (e.g. hosting a simple JSON tool), test the connection, toggle it on, start a chat session, and confirm that the agent utilizes the tool when requested.
3. Verify that killing/stopping the Hono server or deleting the chat session cleans up standard stdio background processes cleanly.
