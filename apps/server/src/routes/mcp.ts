import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { join } from "node:path";
import { authMiddleware } from "../middleware/auth.js";
import { getUsername } from "../lib/auth-helpers.js";
import { mcpRegistry, MCP_CATALOG } from "../core/mcp-registry.js";
import { McpServerConfigSchema, McpConfigSchema, getWorkspaceDir } from "shared";

export const mcpRouter = new Hono();

mcpRouter.use("/*", authMiddleware);

// --- Backward compatibility routes ---

// GET /api/mcp - Loads whole config
mcpRouter.get("/", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const config = mcpRegistry.loadConfig(username);
  return c.json(config);
});

// POST /api/mcp - Saves whole config
mcpRouter.post("/", zValidator("json", McpConfigSchema), async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  try {
    const config = c.req.valid("json");
    mcpRegistry.saveConfig(username, config);
    return c.json({ success: true, config });
  } catch (e: any) {
    return c.json({ error: e.message || "Failed to save MCP config" }, 500);
  }
});

// --- Marketplace / Advanced routes ---

// GET /api/mcp/catalog - Predefined marketplace collection
mcpRouter.get("/catalog", (c) => {
  return c.json({ catalog: MCP_CATALOG });
});

// GET /api/mcp/servers - User configured servers list
mcpRouter.get("/servers", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const config = mcpRegistry.loadConfig(username);
  return c.json({ servers: Object.values(config.mcpServers) });
});

// POST /api/mcp/servers - Create custom server config
mcpRouter.post("/servers", zValidator("json", McpServerConfigSchema), async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  try {
    const newServer = c.req.valid("json");
    const config = mcpRegistry.loadConfig(username);
    
    config.mcpServers[newServer.id] = {
      ...newServer,
      installed: true,
      status: "disconnected",
    };
    
    mcpRegistry.saveConfig(username, config);
    return c.json({ success: true, server: config.mcpServers[newServer.id] });
  } catch (e: any) {
    return c.json({ error: e.message || "Failed to add custom server" }, 500);
  }
});

// PUT /api/mcp/servers/:id - Update existing server configuration
mcpRouter.put("/servers/:id", zValidator("json", McpServerConfigSchema), async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  
  const id = c.req.param("id");
  try {
    const updatedServer = c.req.valid("json");
    const config = mcpRegistry.loadConfig(username);
    
    if (!config.mcpServers[id]) {
      return c.json({ error: "Server not found" }, 404);
    }
    
    config.mcpServers[id] = {
      ...config.mcpServers[id],
      ...updatedServer,
      id, // Preserve URL/Command key id mapping
    };
    
    mcpRegistry.saveConfig(username, config);
    return c.json({ success: true, server: config.mcpServers[id] });
  } catch (e: any) {
    return c.json({ error: e.message || "Failed to update server configuration" }, 500);
  }
});

// DELETE /api/mcp/servers/:id - Delete or disable server
mcpRouter.delete("/servers/:id", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  
  const id = c.req.param("id");
  const config = mcpRegistry.loadConfig(username);
  
  const server = config.mcpServers[id];
  if (!server) return c.json({ error: "Server not found" }, 404);
  
  if (server.isBuiltin) {
    // Builtin servers remain in dictionary but uninstall/disable them
    server.enabled = false;
    server.installed = false;
    server.status = "disconnected";
  } else {
    delete config.mcpServers[id];
  }
  
  mcpRegistry.disconnectGlobalServer(username, id);
  mcpRegistry.saveConfig(username, config);
  
  return c.json({ success: true });
});

// POST /api/mcp/servers/:id/connect - Trigger manual connection
mcpRouter.post("/servers/:id/connect", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  
  const id = c.req.param("id");
  const config = mcpRegistry.loadConfig(username);
  const srv = config.mcpServers[id];
  if (!srv) return c.json({ error: "Server not found" }, 404);

  srv.status = "connecting";
  mcpRegistry.saveConfig(username, config);

  // Trigger connection asynchronously to prevent gateway timeouts
  mcpRegistry.connectGlobalServer(username, id).catch((err) => {
    console.error(`[MCP Connect Async] Failed for ${id}:`, err);
  });
  
  return c.json({ success: true, server: srv });
});

// POST /api/mcp/servers/:id/disconnect - Disconnect running global client
mcpRouter.post("/servers/:id/disconnect", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  
  const id = c.req.param("id");
  mcpRegistry.disconnectGlobalServer(username, id);
  const config = mcpRegistry.loadConfig(username);
  return c.json({ success: true, server: config.mcpServers[id] });
});

// POST /api/mcp/servers/test-connection - Connection tester endpoint (no persist)
mcpRouter.post("/servers/test-connection", zValidator("json", McpServerConfigSchema), async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  try {
    const testConfig = c.req.valid("json");
    const result = await mcpRegistry.testConnection(username, testConfig);
    return c.json(result);
  } catch (e: any) {
    return c.json({ success: false, tools: [], error: e.message || String(e) });
  }
});

// POST /api/mcp/catalog/:id/install - Catalog single click installation
mcpRouter.post("/catalog/:id/install", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  
  const id = c.req.param("id");
  const catalogItem = MCP_CATALOG.find((x) => x.id === id);
  if (!catalogItem) {
    return c.json({ error: "Catalog item not found" }, 404);
  }
  
  const config = mcpRegistry.loadConfig(username);
  const userWorkspace = getWorkspaceDir(username);
  const processedArgs = catalogItem.args?.map(arg => 
    arg.replace("$WORKSPACE_DIR", userWorkspace)
  ) || [];

  const serverConfig = {
    id: catalogItem.id,
    name: catalogItem.name,
    description: catalogItem.description,
    transport: catalogItem.isHttp ? ("http" as const) : ("stdio" as const),
    command: catalogItem.command,
    args: processedArgs,
    env: catalogItem.env,
    url: catalogItem.url,
    installed: true,
    enabled: true,
    isBuiltin: true,
    category: catalogItem.category,
    icon: catalogItem.icon,
    status: "connecting" as const,
    tools: [],
  };
  
  config.mcpServers[id] = serverConfig;
  mcpRegistry.saveConfig(username, config);
  
  // Connect asynchronously in the background to avoid timeouts
  mcpRegistry.connectGlobalServer(username, id).catch((err) => {
    console.error(`[MCP Install Async] Failed to connect for ${id}:`, err);
  });
  
  return c.json({ success: true, server: serverConfig });
});

// GET /api/mcp/status - Retrieves statuses of all servers
mcpRouter.get("/status", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const config = mcpRegistry.loadConfig(username);
  const statuses = Object.entries(config.mcpServers).map(([id, srv]) => ({
    id,
    status: srv.status,
    error: srv.error,
    tools: srv.tools || [],
  }));
  
  return c.json({ statuses });
});
