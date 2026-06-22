import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { authMiddleware, getAuthPayload } from "../middleware/auth";
import { piSessionManager } from "../pi/session-manager";
import { CreateSessionSchema, PromptSchema, ModelSettingsSchema, ToolPermissionsSchema } from "shared";
import {
  loadTasksState,
  saveTasksState,
  decomposeObjective,
  startTaskRunner,
  pauseTaskRunner,
  resetTasks,
  broadcastTaskUpdate
} from "../pi/task-runner";

const STORAGE_KEY = "pi-web-sessions";

export const sessionsRouter = new Hono();

sessionsRouter.use("/*", authMiddleware);

sessionsRouter.get("/", (c) => {
  return c.json({ sessions: [] });
});

sessionsRouter.post("/", zValidator("json", CreateSessionSchema), async (c) => {
  const { name, repoName } = c.req.valid("json");
  const { username } = getAuthPayload(c);
  const sessionId = crypto.randomUUID();

  const session = {
    id: sessionId,
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0,
    repoName,
  };

  await piSessionManager.getOrCreateSession(username, sessionId, repoName);

  return c.json(session, 201);
});

sessionsRouter.post("/:id/prompt", zValidator("json", PromptSchema), async (c) => {
  const sessionId = c.req.param("id");
  const { message } = c.req.valid("json");
  const { username } = getAuthPayload(c);

  const session = await piSessionManager.getOrCreateSession(username, sessionId);

  try {
    await session.prompt(message);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

sessionsRouter.get("/:id/messages", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);

  const session = piSessionManager.getSession(username, sessionId);
  if (!session) {
    return c.json({ messages: [] });
  }

  const activeMessages = session.messages;
  const allEntries = session.sessionManager.getEntries();

  const childrenByParent = new Map<string | null, string[]>();
  for (const entry of allEntries) {
    const parentId = entry.parentId;
    if (!childrenByParent.has(parentId)) {
      childrenByParent.set(parentId, []);
    }
    if (entry.type === "message") {
      childrenByParent.get(parentId)!.push(entry.id);
    }
  }

  const enrichedMessages = activeMessages.map((msg: any) => {
    const entry = allEntries.find((e: any) => e.type === "message" && e.message && (e.message.id === msg.id || e.id === msg.id));
    const parentId = entry ? entry.parentId : null;
    const siblings = childrenByParent.get(parentId) ?? [msg.id || entry?.id];

    return {
      ...msg,
      id: entry?.id || msg.id,
      parentId,
      siblings,
    };
  });

  return c.json({ messages: enrichedMessages });
});

sessionsRouter.post(
  "/:id/navigate",
  zValidator("json", z.object({ targetId: z.string() })),
  async (c) => {
    const sessionId = c.req.param("id");
    const { targetId } = c.req.valid("json");
    const { username } = getAuthPayload(c);

    const session = piSessionManager.getSession(username, sessionId);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    try {
      const result = await session.navigateTree(targetId, { summarize: false });
      return c.json({ success: true, editorText: result.editorText });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  }
);

sessionsRouter.post("/:id/abort", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);

  const session = piSessionManager.getSession(username, sessionId);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  await session.abort();

  return c.json({ success: true });
});

sessionsRouter.delete("/:id", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);

  await piSessionManager.destroySession(username, sessionId);

  return c.json({ success: true });
});

sessionsRouter.post(
  "/:id/model",
  zValidator("json", ModelSettingsSchema),
  async (c) => {
    const sessionId = c.req.param("id");
    const { provider, modelId, thinkingLevel } = c.req.valid("json");
    const { username } = getAuthPayload(c);
    const { modelRegistry } = piSessionManager.getUserContext(username);

    const model = modelRegistry.find(provider, modelId);
    if (!model) {
      return c.json({ error: "Model not found" }, 404);
    }

    const session = piSessionManager.getSession(username, sessionId);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    await session.setModel(model);
    if (thinkingLevel) {
      session.setThinkingLevel(thinkingLevel);
    }

    return c.json({ success: true, model: { id: model.id, name: model.name, provider: model.provider as string } });
  }
);

sessionsRouter.get("/:id/skills", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);

  try {
    const session = await piSessionManager.getOrCreateSession(username, sessionId);
    await session.resourceLoader.reload();
    const { skills, diagnostics } = session.resourceLoader.getSkills();

    const skillsWithContent = skills.map((skill) => {
      let content = "";
      if (existsSync(skill.filePath)) {
        try {
          content = readFileSync(skill.filePath, "utf-8");
        } catch (e) {
          console.error(`Failed to read skill file ${skill.filePath}:`, e);
        }
      }
      return {
        name: skill.name,
        description: skill.description,
        filePath: skill.filePath,
        disableModelInvocation: skill.disableModelInvocation,
        scope: skill.sourceInfo?.scope || "project",
        content,
      };
    });

    return c.json({ skills: skillsWithContent, diagnostics });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

sessionsRouter.post(
  "/:id/tools",
  zValidator("json", ToolPermissionsSchema),
  async (c) => {
    const sessionId = c.req.param("id");
    const { tools } = c.req.valid("json");
    const { username } = getAuthPayload(c);

    const session = piSessionManager.getSession(username, sessionId);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    session.setActiveToolsByName(tools);
    piSessionManager.persistSessionTools(username, sessionId, tools);

    return c.json({ success: true, tools });
  }
);

sessionsRouter.get("/:id/tools", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);

  const tools = piSessionManager.getSessionTools(username, sessionId);
  return c.json({ tools });
});

sessionsRouter.get("/:id/tasks", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);
  const state = loadTasksState(username, sessionId);
  return c.json(state);
});

sessionsRouter.post("/:id/tasks", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);
  try {
    const { tasks } = await c.req.json();
    const state = loadTasksState(username, sessionId);
    state.tasks = tasks || [];
    state.status = "idle";
    state.currentTaskId = null;
    state.error = undefined;
    saveTasksState(username, sessionId, state);
    broadcastTaskUpdate(sessionId, state);
    return c.json(state);
  } catch (err: any) {
    return c.json({ error: String(err) }, 400);
  }
});

sessionsRouter.post("/:id/tasks/decompose", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);
  try {
    const { objective } = await c.req.json();
    if (!objective || typeof objective !== "string") {
      return c.json({ error: "Objective is required" }, 400);
    }
    await decomposeObjective(username, sessionId, objective);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: String(err) }, 500);
  }
});

sessionsRouter.post("/:id/tasks/run", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);
  try {
    await startTaskRunner(username, sessionId);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: String(err) }, 500);
  }
});

sessionsRouter.post("/:id/tasks/pause", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);
  try {
    await pauseTaskRunner(username, sessionId);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: String(err) }, 500);
  }
});

sessionsRouter.post("/:id/tasks/reset", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);
  try {
    resetTasks(username, sessionId);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: String(err) }, 500);
  }
});

