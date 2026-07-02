import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { getUsername } from "../lib/auth-helpers.js";
import { mcpRegistry } from "../pi/mcp-registry.js";

export const mcpRouter = new Hono();

mcpRouter.use("/*", authMiddleware);

mcpRouter.get("/", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const config = mcpRegistry.loadConfig(username);
  return c.json(config);
});

mcpRouter.post("/", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  try {
    const config = await c.req.json();
    if (!config || typeof config !== "object" || !config.mcpServers) {
      return c.json({ error: "Invalid MCP config format" }, 400);
    }
    mcpRegistry.saveConfig(username, config);
    return c.json({ success: true, config });
  } catch (e: any) {
    return c.json({ error: e.message || "Failed to save MCP config" }, 500);
  }
});
