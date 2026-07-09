import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { getUsername } from "../lib/auth-helpers";
import { agentRegistry } from "../agents";
import { AgentDefinitionSchema, UpdateAgentDefinitionSchema, getAgentDir } from "shared";
import { sessionManager } from "../core/session-manager";
import { join } from "node:path";
import { existsSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";

export const agentsRouter = new Hono();

// Avatar GET must be before authMiddleware so browser <img> tags can authenticate
// via ?token= query param (supported by getUsername())
agentsRouter.get("/:id/avatar", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const entry = agentRegistry.get(id, username);
  if (!entry) return c.json({ error: "Agent not found" }, 404);

  const agentDir = getAgentDir(username, id);
  if (!existsSync(agentDir)) return c.notFound();

  const files = readdirSync(agentDir);
  const avatarFile = files.find((f) => f.startsWith("avatar."));
  if (!avatarFile) return c.notFound();

  const file = Bun.file(join(agentDir, avatarFile));
  return c.body(file.stream());
});

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
  const entry = agentRegistry.get(id, username);
  if (!entry) return c.json({ error: "Agent not found" }, 404);

  return c.json({
    id,
    name: entry.server.definition.name,
    role: entry.server.definition.role,
    status: entry.status,
    streaming: entry.server.session.isStreaming,
    port: entry.server.definition.port,
    createdAt: entry.createdAt,
    definition: entry.server.definition,
    activeObservers: entry.server.getActiveObservers ? entry.server.getActiveObservers() : 0,
  });
});

agentsRouter.delete("/:id", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const entry = agentRegistry.get(id, username);
  if (!entry) return c.json({ error: "Agent not found" }, 404);

  // Cascading delete: destroy all chat sessions associated with this agent
  const sessions = await sessionManager.listSessions(username).catch(() => []);
  for (const s of sessions) {
    if (s.agentId === id) {
      await sessionManager.destroySession(username, s.id).catch((err) =>
        console.error(`[AgentsRoute] Failed to destroy session ${s.id}:`, err)
      );
    }
  }

  await agentRegistry.stop(id);
  return c.body(null, 204);
});

agentsRouter.patch(
  "/:id",
  zValidator("json", UpdateAgentDefinitionSchema),
  async (c) => {
    const username = getUsername(c);
    if (!username) return c.json({ error: "Unauthorized" }, 401);
    const id = c.req.param("id");
    const updates = c.req.valid("json");

    const entry = agentRegistry.get(id, username);
    if (!entry) return c.json({ error: "Agent not found" }, 404);

    try {
      const updatedEntry = await agentRegistry.update(username, id, updates);
      return c.json({
        id,
        name: updatedEntry.server.definition.name,
        role: updatedEntry.server.definition.role,
        status: updatedEntry.status,
        createdAt: updatedEntry.createdAt,
      });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  }
);

agentsRouter.post(
  "/:id/prompt",
  zValidator("json", z.object({ message: z.string().min(1), stream: z.boolean().optional() })),
  async (c) => {
    const username = getUsername(c);
    if (!username) return c.json({ error: "Unauthorized" }, 401);
    const id = c.req.param("id");
    const { message, stream = true } = c.req.valid("json");

    const entry = agentRegistry.get(id, username);
    if (!entry) return c.json({ error: "Agent not found" }, 404);
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
  const entry = agentRegistry.get(id, username);
  if (!entry) return c.json({ error: "Agent not found" }, 404);

  return c.json({ messages: entry.server.session.messages });
});

agentsRouter.post("/:id/abort", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const entry = agentRegistry.get(id, username);
  if (!entry) return c.json({ error: "Agent not found" }, 404);

  if (entry.server.session.isStreaming) {
    await entry.server.session.abort();
  }
  return c.json({ aborted: true });
});

agentsRouter.get("/:id/observe", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const entry = agentRegistry.get(id, username);
  if (!entry) return c.json({ error: "Agent not found" }, 404);

  return entry.server.app.fetch(
    new Request(`http://internal/observe`, {
      method: "GET",
    }),
    c.env
  );
});

agentsRouter.get("/:id/executions", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const entry = agentRegistry.get(id, username);
  if (!entry) return c.json({ error: "Agent not found" }, 404);

  return entry.server.app.fetch(
    new Request(`http://internal/executions`, {
      method: "GET",
    }),
    c.env
  );
});

agentsRouter.get("/:id/executions/:execId", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const execId = c.req.param("execId");
  const entry = agentRegistry.get(id, username);
  if (!entry) return c.json({ error: "Agent not found" }, 404);

  return entry.server.app.fetch(
    new Request(`http://internal/executions/${execId}`, {
      method: "GET",
    }),
    c.env
  );
});

agentsRouter.post("/:id/avatar", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const entry = agentRegistry.get(id, username);
  if (!entry) return c.json({ error: "Agent not found" }, 404);

  const body = await c.req.parseBody();
  const file = body.file as File | undefined;
  if (!file) return c.json({ error: "No file provided" }, 400);

  const agentDir = getAgentDir(username, id);
  if (!existsSync(agentDir)) {
    // @ts-ignore
    const { mkdirSync } = await import("node:fs");
    mkdirSync(agentDir, { recursive: true });
  }

  try {
    const files = readdirSync(agentDir);
    for (const f of files) {
      if (f.startsWith("avatar.")) {
        unlinkSync(join(agentDir, f));
      }
    }
  } catch {}

  const ext = file.name.split(".").pop() || "png";
  const avatarPath = join(agentDir, `avatar.${ext}`);
  const buffer = await file.arrayBuffer();
  writeFileSync(avatarPath, Buffer.from(buffer));

  const avatarUrl = `/api/agents/${id}/avatar`;
  agentRegistry.setAvatarUrl(username, id, avatarUrl);

  return c.json({ avatarUrl });
});

agentsRouter.delete("/:id/avatar", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const entry = agentRegistry.get(id, username);
  if (!entry) return c.json({ error: "Agent not found" }, 404);

  const agentDir = getAgentDir(username, id);
  if (existsSync(agentDir)) {
    try {
      const files = readdirSync(agentDir);
      for (const f of files) {
        if (f.startsWith("avatar.")) {
          unlinkSync(join(agentDir, f));
        }
      }
    } catch {}
  }

  agentRegistry.setAvatarUrl(username, id, null);
  return c.body(null, 204);
});

