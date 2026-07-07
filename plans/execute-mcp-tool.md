# Execute MCP Tool - Implementation Plan

**Status:** Pending Implementation
**Estimated effort:** 4-6 hours of agent work

---

## Goal

Create a unified `mcp` tool that encapsulates all MCP-related logic, replacing the current fragmented approach where MCP tools are loaded asynchronously and injected as pseudo-built-in tools with `mcp_<server>_<tool>` naming. The new tool provides a single entry point for the agent to interact with any configured MCP server.

---

## Problem Statement

Currently MCP tools are:

1. **Loaded asynchronously** after session creation via `mcpRegistry.getSessionMcpTools()`
2. **Injected as individual pseudo-tools** with names like `mcp_enram_mem_save`, polluting the tool namespace
3. **Not visible in the tool selector UI** since they're dynamic and not in `AVAILABLE_TOOLS`
4. **Hard to debug** — if an MCP server fails, its tools silently don't appear
5. **Fragile injection mechanism** — pushing to `_customTools` and calling `_refreshToolRegistry()` is error-prone

## Proposed Architecture

### Single `mcp` Tool

```typescript
{
  name: "mcp",
  description: "Execute a tool on a configured MCP (Model Context Protocol) server. Use this to interact with external services like databases, search APIs, or product integrations.",
  parameters: {
    type: "object",
    properties: {
      server: { type: "string", description: "MCP server ID (e.g. 'github', 'postgres', 'linear')" },
      tool: { type: "string", description: "Tool name exposed by the server (e.g. 'search_issues', 'query')" },
      arguments: { type: "object", description: "Arguments to pass to the MCP tool" }
    },
    required: ["server", "tool", "arguments"]
  },
  execute: async (toolCallId, params) => {
    const client = mcpRegistry.getClient(params.server);
    const result = await client.callTool(params.tool, params.arguments);
    return formatResult(result);
  }
}
```

### Benefits

| Aspect | Current | Proposed |
|--------|---------|-----------|
| **Tool namespace** | N tools (`mcp_filesystem_*`, `mcp_github_*`, etc.) | 1 tool (`mcp`) |
| **UI visibility** | Dynamic tools invisible to selector | Single tool always in `AVAILABLE_TOOLS` |
| **Discovery** | Agent must guess tool names | Agent can list servers/tools via tool args |
| **Error handling** | Each tool fails independently | Centralized error handling with server status |
| **System prompt** | Long tool descriptions per MCP tool | Concise: `mcp` tool with server list |

---

## Implementation Steps

### 1. Create `mcp-tool.ts` (server-side)

File: `apps/server/src/core/mcp-tool.ts`

- Create `createMcpTool(username: string): AgentTool`
- The tool accepts `{ server, tool, arguments }`
- Looks up the server client from `mcpRegistry`
- Calls `client.callTool(tool, arguments)`
- Formats result into standard tool result format
- Handles errors: server not found, tool not found, connection errors

### 2. Add `mcp` to system prompts

Update `session-manager.ts` and `create-agent-server.ts` append prompts:

```
MCP (Model Context Protocol) Tool:
You have a unified `mcp` tool to interact with configured external services.
- mcp(server, tool, arguments): Execute a tool on any configured MCP server.
  * server: The MCP server ID (e.g. "github", "postgres", "linear")
  * tool: The specific tool to call on that server
  * arguments: JSON object with the tool's required parameters

Available MCP servers: <list of enabled servers with their tools>
```

### 3. Add `mcp` to `AVAILABLE_TOOLS`

File: `packages/shared/src/schemas.ts`

Add `"mcp"` to the `AVAILABLE_TOOLS` array.

### 4. Add `mcp` to always-on tools

File: `apps/server/src/core/session-manager.ts`

Add `"mcp"` to the `alwaysOnTools` array (line ~539).

### 5. Wire into session creation

Both in `session-manager.ts` and `create-agent-server.ts`:

- Add `createMcpTool(username)` to the `customTools` array
- The existing MCP async loader (background injection) becomes **obsolete** and can be removed

### 6. Update ToolCallRow UI (client-side)

File: `apps/client/src/components/chat/tools/ToolCallRow.tsx`

- Add `mcp` case to `getArgSummary` — show `[server] tool(args)`
- Add `mcp` case to `getResultSummary` — show result summary
- Add `mcp` case to `ToolBody` — render MCP server + tool name + result
- Add `mcp` to `TOOL_META` with icon and color

### 7. Add `mcp` to ToolsSelector (client-side)

File: `apps/client/src/components/chat/ToolsSelector.tsx`

- Add `mcp` to the tool list if not already present from `AVAILABLE_TOOLS`

### 8. Clean up old injection code

- Remove the `_customTools.push(...mcpTools)` and `_refreshToolRegistry()` calls from session-manager.ts (background MCP loader)
- Remove the equivalent code from create-agent-server.ts
- The `_customTools` and `_refreshToolRegistry()` can remain (useful for future extensions)

### 9. Add server/tool discovery support

The `mcp` tool should support discovery modes:

```
// List enabled MCP servers and their tools
mcp(server: undefined, tool: undefined, arguments: {})

// Returns:
{
  servers: {
    "github": { status: "connected", tools: ["search_repos", "create_issue", ...] },
    "postgres": { status: "connected", tools: ["query", "list_tables", ...] },
    "linear": { status: "error", error: "API key not configured" }
  }
}
```

### 10. Add `mcp` to ToolCallRow.literals.ts

File: `apps/client/src/components/chat/tools/ToolCallRow.literals.ts`

Add labels for the mcp tool:
```typescript
labelMcp: "mcp"
argMcpServer: "MCP server"
argMcpTool: "MCP tool"
resMcpSuccess: "completed"
resMcpError: "error"
```

---

## Migration Path

1. Implement the `mcp` tool alongside the existing injection mechanism
2. Update system prompts to document the `mcp` tool
3. Let both mechanisms coexist for one release
4. Remove the old async MCP injection in a follow-up

---

## Related Files

| File | Change |
|------|--------|
| `apps/server/src/core/mcp-tool.ts` | **NEW** — Main tool implementation |
| `apps/server/src/core/session-manager.ts` | Add to customTools, alwaysOnTools, remove old loader |
| `apps/server/src/agents/create-agent-server.ts` | Add to customTools, remove old loader |
| `packages/shared/src/schemas.ts` | Add `"mcp"` to `AVAILABLE_TOOLS` |
| `apps/client/src/components/chat/tools/ToolCallRow.tsx` | UI rendering for mcp tool |
| `apps/client/src/components/chat/tools/ToolCallRow.literals.ts` | UI labels |
| `apps/client/src/components/chat/ToolsSelector.tsx` | Tool selector entry |
