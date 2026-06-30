import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { getUsername } from "../lib/auth-helpers";
import { agentRegistry } from "../agents";
import { AgentDefinitionSchema } from "shared";

export const agentsRouter = new Hono();

agentsRouter.use("/*", authMiddleware);

agentsRouter.get("/", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ agents: agentRegistry.list(username) });
});

agentsRouter.post(
  "/",
  zValidator("json", AgentDefinitionSchema),
  async (c) => {
    const username = getUsername(c);
    if (!username) return c.json({ error: "Unauthorized" }, 401);
    const definition = c.req.valid("json");

    if (agentRegistry.get(definition.id)) {
      return c.json({ error: `Agent "${definition.id}" already exists` }, 409);
    }

    try {
      const entry = await agentRegistry.register(username, definition);
      return c.json(
        {
          id: definition.id,
          name: definition.name,
          role: definition.role,
          status: entry.status,
          createdAt: entry.createdAt,
        },
        201
      );
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  }
);

agentsRouter.get("/:id", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const entry = agentRegistry.get(id);
  if (!entry || entry.username !== username) return c.json({ error: "Agent not found" }, 404);

  return c.json({
    id,
    name: entry.server.definition.name,
    role: entry.server.definition.role,
    status: entry.status,
    streaming: entry.server.session.isStreaming,
    port: entry.server.definition.port,
    createdAt: entry.createdAt,
    definition: entry.server.definition,
  });
});

agentsRouter.delete("/:id", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const entry = agentRegistry.get(id);
  if (!entry || entry.username !== username) return c.json({ error: "Agent not found" }, 404);

  await agentRegistry.stop(id);
  return c.body(null, 204);
});

agentsRouter.post(
  "/:id/prompt",
  zValidator("json", z.object({ message: z.string().min(1), stream: z.boolean().optional() })),
  async (c) => {
    const username = getUsername(c);
    if (!username) return c.json({ error: "Unauthorized" }, 401);
    const id = c.req.param("id");
    const { message, stream = true } = c.req.valid("json");

    const entry = agentRegistry.get(id);
    if (!entry || entry.username !== username) return c.json({ error: "Agent not found" }, 404);
    if (entry.status === "stopped") return c.json({ error: "Agent is stopped" }, 409);

    return entry.server.app.fetch(
      new Request(`http://internal/prompt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, stream }),
      }),
      c.env
    );
  }
);

agentsRouter.get("/:id/messages", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const entry = agentRegistry.get(id);
  if (!entry || entry.username !== username) return c.json({ error: "Agent not found" }, 404);

  return c.json({ messages: entry.server.session.messages });
});

agentsRouter.post("/:id/abort", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const entry = agentRegistry.get(id);
  if (!entry || entry.username !== username) return c.json({ error: "Agent not found" }, 404);

  if (entry.server.session.isStreaming) {
    await entry.server.session.abort();
  }
  return c.json({ aborted: true });
});
