import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { streamSSE } from "hono/streaming";
import { authMiddleware, getAuthPayload } from "../middleware/auth";
import { sessionManager } from "../core/session-manager";
import { CreateSessionSchema, PromptSchema, ModelSettingsSchema, ToolPermissionsSchema } from "shared";
import {
  loadTasksState,
  saveTasksState,
  decomposeObjective,
  startTaskRunner,
  pauseTaskRunner,
  resetTasks,
  broadcastTaskUpdate
} from "../core/task-runner";
import { broadcastToSession } from "../ws/handler";
import { agentRegistry } from "../agents";

const STORAGE_KEY = "crewfactory-sessions";

export const sessionsRouter = new Hono();

sessionsRouter.use("/*", authMiddleware);

sessionsRouter.get("/", async (c) => {
  const { username } = getAuthPayload(c);
  const sessions = await sessionManager.listSessions(username);
  return c.json({ sessions });
});

sessionsRouter.post("/", zValidator("json", CreateSessionSchema), async (c) => {
  const { name, repoName, agentId, channelId } = c.req.valid("json");
  const { username } = getAuthPayload(c);
  const sessionId = crypto.randomUUID();

  const now = new Date().toISOString();
  const session = {
    id: sessionId,
    name,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    repoName,
    agentId,
    channelId,
  };

  // Start session load asynchronously in the background to avoid blocking API response
  sessionManager.getOrCreateSession(username, sessionId, repoName, agentId, channelId).catch(err => {
    console.error(`[Session Start Async] Failed for ${sessionId}:`, err);
  });

  sessionManager.saveSessionMetadata(username, sessionId, {
    name,
    createdAt: now,
    updatedAt: now,
    repoName: repoName || null,
    agentId: agentId || null,
    channelId: channelId || null,
  });

  return c.json(session, 201);
});

sessionsRouter.post("/:id/prompt", zValidator("json", PromptSchema), async (c) => {
  const sessionId = c.req.param("id");
  const { message } = c.req.valid("json");
  const { username } = getAuthPayload(c);

  const session = await sessionManager.getOrCreateSession(username, sessionId);
  const metadata = sessionManager.getSessionMetadata(username, sessionId) || {};
  const repoName = metadata.repoName;

  const execId = crypto.randomUUID();
  let execDir: string | null = null;
  let toolCalls: any[] = [];
  const errors: string[] = [];
  const startTime = Date.now();

  if (repoName) {
    const userDir = sessionManager.ensureUserDir(username);
    const repoExecsDir = join(userDir, "repos", repoName, "executions");
    if (!existsSync(repoExecsDir)) mkdirSync(repoExecsDir, { recursive: true });
    execDir = join(repoExecsDir, execId);
    mkdirSync(execDir, { recursive: true });

    writeFileSync(join(execDir, "prompt.json"), JSON.stringify({ prompt: message, createdAt: new Date().toISOString() }, null, 2));
  }

  const unsubLog = execDir ? session.subscribe((event: any) => {
    if (event.type === "tool_execution_start") {
      toolCalls.push({
        id: event.toolCall.id,
        name: event.toolCall.name,
        args: event.toolCall.arguments,
        startedAt: new Date().toISOString(),
      });
    } else if (event.type === "tool_execution_end") {
      const tc = toolCalls.find((t) => t.id === event.toolCall.id);
      if (tc) {
        tc.result = event.result;
        tc.isError = event.isError;
        tc.endedAt = new Date().toISOString();
      }
    } else if (event.type === "agent_error") {
      errors.push(event.error || "Unknown error");
    }
  }) : () => {};

  const finalize = () => {
    unsubLog();
    if (execDir) {
      const durationMs = Date.now() - startTime;
      try {
        const msgs = session.messages;
        writeFileSync(join(execDir, "messages.jsonl"), msgs.map(m => JSON.stringify(m)).join("\n"));
        writeFileSync(join(execDir, "tool-calls.json"), JSON.stringify(toolCalls, null, 2));
        writeFileSync(join(execDir, "errors.json"), JSON.stringify(errors, null, 2));
        writeFileSync(join(execDir, "summary.json"), JSON.stringify({
          id: execId,
          prompt: message,
          durationMs,
          errors,
          createdAt: new Date().toISOString(),
        }, null, 2));
      } catch (e) {
        console.error(`[SessionsRoute] Failed to save execution log for repo ${repoName}:`, e);
      }
    }
  };

  try {
    await session.prompt(message);
    return c.json({ success: true });
  } catch (error) {
    errors.push(String(error));
    return c.json({ success: false, error: String(error) }, 500);
  } finally {
    finalize();
  }
});

sessionsRouter.post(
  "/:id/prompt/stream",
  zValidator("json", PromptSchema),
  async (c) => {
    const sessionId = c.req.param("id");
    const { message } = c.req.valid("json");
    const { username } = getAuthPayload(c);

    const session = await sessionManager.getOrCreateSession(username, sessionId);
    const metadata = sessionManager.getSessionMetadata(username, sessionId) || {};
    const repoName = metadata.repoName;

    const execId = crypto.randomUUID();
    let execDir: string | null = null;
    let toolCalls: any[] = [];
    const errors: string[] = [];
    const startTime = Date.now();

    if (repoName) {
      const userDir = sessionManager.ensureUserDir(username);
      const repoExecsDir = join(userDir, "repos", repoName, "executions");
      if (!existsSync(repoExecsDir)) mkdirSync(repoExecsDir, { recursive: true });
      execDir = join(repoExecsDir, execId);
      mkdirSync(execDir, { recursive: true });

      writeFileSync(join(execDir, "prompt.json"), JSON.stringify({ prompt: message, createdAt: new Date().toISOString() }, null, 2));
    }

    const unsubLog = execDir ? session.subscribe((event: any) => {
      if (event.type === "tool_execution_start") {
        toolCalls.push({
          id: event.toolCall.id,
          name: event.toolCall.name,
          args: event.toolCall.arguments,
          startedAt: new Date().toISOString(),
        });
      } else if (event.type === "tool_execution_end") {
        const tc = toolCalls.find((t) => t.id === event.toolCall.id);
        if (tc) {
          tc.result = event.result;
          tc.isError = event.isError;
          tc.endedAt = new Date().toISOString();
        }
      } else if (event.type === "agent_error") {
        errors.push(event.error || "Unknown error");
      }
    }) : () => {};

    const finalize = () => {
      unsubLog();
      if (execDir) {
        const durationMs = Date.now() - startTime;
        try {
          const msgs = session.messages;
          writeFileSync(join(execDir, "messages.jsonl"), msgs.map(m => JSON.stringify(m)).join("\n"));
          writeFileSync(join(execDir, "tool-calls.json"), JSON.stringify(toolCalls, null, 2));
          writeFileSync(join(execDir, "errors.json"), JSON.stringify(errors, null, 2));
          writeFileSync(join(execDir, "summary.json"), JSON.stringify({
            id: execId,
            prompt: message,
            durationMs,
            errors,
            createdAt: new Date().toISOString(),
          }, null, 2));
        } catch (e) {
          console.error(`[SessionsRoute] Failed to save execution log for repo ${repoName}:`, e);
        }
      }
    };

    return streamSSE(c, async (sse) => {
      const unsub = session.subscribe((event) => {
        sse.writeSSE({ data: JSON.stringify(event), event: event.type }).catch(() => {});
      });

      try {
        await session.prompt(message);
      } catch (err) {
        errors.push(String(err));
        await sse.writeSSE({ data: JSON.stringify({ type: "agent_error", error: String(err) }), event: "agent_error" });
      } finally {
        unsub();
        finalize();
        await sse.writeSSE({ data: "{}", event: "done" });
      }
    });
  }
);

sessionsRouter.get("/repos/:repoName/executions", async (c) => {
  const { username } = getAuthPayload(c);
  const repoName = c.req.param("repoName");
  
  const userDir = sessionManager.ensureUserDir(username);
  const execsDir = join(userDir, "repos", repoName, "executions");
  if (!existsSync(execsDir)) return c.json({ executions: [] });

  const folders = readdirSync(execsDir);
  const executions: any[] = [];
  for (const f of folders) {
    try {
      const summaryPath = join(execsDir, f, "summary.json");
      if (existsSync(summaryPath)) {
        executions.push(JSON.parse(readFileSync(summaryPath, "utf-8")));
      }
    } catch {}
  }
  executions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return c.json({ executions });
});

sessionsRouter.get("/repos/:repoName/executions/:execId", async (c) => {
  const { username } = getAuthPayload(c);
  const repoName = c.req.param("repoName");
  const execId = c.req.param("execId");

  const userDir = sessionManager.ensureUserDir(username);
  const execDir = join(userDir, "repos", repoName, "executions", execId);
  if (!existsSync(execDir)) return c.json({ error: "Execution not found" }, 404);

  try {
    const prompt = JSON.parse(readFileSync(join(execDir, "prompt.json"), "utf-8")).prompt;
    
    let messages: any[] = [];
    const msgFile = join(execDir, "messages.jsonl");
    if (existsSync(msgFile)) {
      messages = readFileSync(msgFile, "utf-8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    }

    const toolCalls = existsSync(join(execDir, "tool-calls.json"))
      ? JSON.parse(readFileSync(join(execDir, "tool-calls.json"), "utf-8"))
      : [];

    const errors = existsSync(join(execDir, "errors.json"))
      ? JSON.parse(readFileSync(join(execDir, "errors.json"), "utf-8"))
      : [];

    const summary = existsSync(join(execDir, "summary.json"))
      ? JSON.parse(readFileSync(join(execDir, "summary.json"), "utf-8"))
      : {};

    return c.json({
      id: execId,
      prompt,
      messages,
      toolCalls,
      errors,
      ...summary
    });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

sessionsRouter.get("/:id/messages", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);

  if (sessionId.startsWith("exec_")) {
    const parts = sessionId.split("_");
    const tipo = parts[1];
    const entidad = parts[2];
    const execId = parts.slice(3).join("_");

    if (tipo === "agent") {
      const messagesPath = join("/tmp/crewfactory", username, "agents", entidad, "executions", execId, "messages.jsonl");
      if (!existsSync(messagesPath)) {
        return c.json({ messages: [] });
      }
      try {
        const content = readFileSync(messagesPath, "utf-8");
        const messages = content.trim().split("\n").filter(Boolean).map(line => {
          const parsed = JSON.parse(line);
          // Asegurar campos básicos esperados en UI
          if (parsed.message) {
            return {
              id: parsed.id || parsed.message.id || crypto.randomUUID(),
              role: parsed.message.role,
              content: parsed.message.content,
              timestamp: parsed.timestamp || new Date().toISOString(),
            };
          }
          return parsed;
        });
        return c.json({ messages });
      } catch (err) {
        return c.json({ messages: [] });
      }
    } else if (tipo === "repo") {
      const messagesPath = join("/tmp/crewfactory", username, "repos", entidad, "executions", execId, "messages.jsonl");
      if (!existsSync(messagesPath)) {
        return c.json({ messages: [] });
      }
      try {
        const content = readFileSync(messagesPath, "utf-8");
        const messages = content.trim().split("\n").filter(Boolean).map(line => {
          const parsed = JSON.parse(line);
          if (parsed.message) {
            return {
              id: parsed.id || parsed.message.id || crypto.randomUUID(),
              role: parsed.message.role,
              content: parsed.message.content,
              timestamp: parsed.timestamp || new Date().toISOString(),
            };
          }
          return parsed;
        });
        return c.json({ messages });
      } catch (err) {
        return c.json({ messages: [] });
      }
    } else if (tipo === "channel") {
      try {
        const { channelStore } = await import("../channels");
        const messages = channelStore.getMessages(username, entidad, 100, execId);
        const mapped = messages.map((m: any) => ({
          id: m.id || crypto.randomUUID(),
          role: m.role === "agent" ? "assistant" : m.role,
          content: m.content,
          agentName: m.agentName,
          timestamp: m.timestamp,
        }));
        return c.json({ messages: mapped });
      } catch (err) {
        return c.json({ messages: [] });
      }
    }

    return c.json({ messages: [] });
  }

  const session = await sessionManager.getOrCreateSession(username, sessionId);
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

    const session = await sessionManager.getOrCreateSession(username, sessionId);
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

  if (sessionId.startsWith("exec_")) {
    return c.json({ success: true });
  }

  const session = sessionManager.getSession(username, sessionId);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  await session.abort();

  return c.json({ success: true });
});

sessionsRouter.delete("/:id", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);

  if (sessionId.startsWith("exec_")) {
    return c.json({ error: "Cannot delete API executions from UI" }, 400);
  }

  await sessionManager.destroySession(username, sessionId);

  return c.json({ success: true });
});

sessionsRouter.patch("/:id", zValidator("json", z.object({ name: z.string().min(1).max(100) })), async (c) => {
  const sessionId = c.req.param("id");
  const { name } = c.req.valid("json");
  const { username } = getAuthPayload(c);

  if (sessionId.startsWith("exec_")) {
    return c.json({ error: "Cannot rename API executions" }, 400);
  }

  sessionManager.saveSessionMetadata(username, sessionId, { name });

  return c.json({ success: true });
});

sessionsRouter.post(
  "/:id/model",
  zValidator("json", ModelSettingsSchema),
  async (c) => {
    const sessionId = c.req.param("id");
    const { provider, modelId, thinkingLevel } = c.req.valid("json");
    const { username } = getAuthPayload(c);

    if (sessionId.startsWith("exec_")) {
      return c.json({ error: "Cannot modify model settings for execution logs" }, 400);
    }

    const { modelRegistry } = sessionManager.getUserContext(username);

    const model = modelRegistry.find(provider, modelId);
    if (!model) {
      return c.json({ error: "Model not found" }, 404);
    }

    const session = await sessionManager.getOrCreateSession(username, sessionId);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    await session.setModel(model);
    if (thinkingLevel) {
      session.setThinkingLevel(thinkingLevel);
    }

    try {
      const contextUsage = session.getContextUsage();
      const sessionStats = session.getSessionStats();
      if (contextUsage || sessionStats) {
        broadcastToSession(sessionId, { type: "context_usage", sessionId, contextUsage, sessionStats });
      }
    } catch {}

    return c.json({ success: true, model: { id: model.id, name: model.name, provider: model.provider as string } });
  }
);

sessionsRouter.get("/:id/context", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);

  if (sessionId.startsWith("exec_")) {
    return c.json({ contextUsage: null, sessionStats: null });
  }

  const session = await sessionManager.getOrCreateSession(username, sessionId);
  if (!session) {
    return c.json({ contextUsage: null, sessionStats: null });
  }
  try {
    const contextUsage = session.getContextUsage();
    const sessionStats = session.getSessionStats();
    return c.json({ contextUsage, sessionStats });
  } catch {
    return c.json({ contextUsage: null, sessionStats: null });
  }
});

sessionsRouter.get("/:id/skills", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);

  if (sessionId.startsWith("exec_")) {
    return c.json({ skills: [], diagnostics: [] });
  }

  try {
    const session = await sessionManager.getOrCreateSession(username, sessionId);
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

    if (sessionId.startsWith("exec_")) {
      return c.json({ error: "Cannot modify tool permissions for execution logs" }, 400);
    }

    const session = await sessionManager.getOrCreateSession(username, sessionId);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const currentActive = session.getActiveToolNames();
    const mcpActive = currentActive.filter((tName) => tName.startsWith("mcp_"));
    session.setActiveToolsByName(
      Array.from(
        new Set([
          ...tools,
          ...mcpActive,
          "request_approval",
          "ask_question",
          "render_images",
          "render_html",
          "render_chart",
          "share_file",
          "refresh_ui",
        ])
      )
    );
    sessionManager.persistSessionTools(username, sessionId, tools);

    return c.json({ success: true, tools });
  }
);

sessionsRouter.get("/:id/tools", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);

  if (sessionId.startsWith("exec_")) {
    return c.json({ tools: [], serialTools: ["request_approval", "ask_question"] });
  }

  const tools = sessionManager.getSessionTools(username, sessionId);
  const metadata = sessionManager.getSessionMetadata(username, sessionId) || {};
  let serialTools = ["request_approval", "ask_question"];

  if (metadata.agentId) {
    const agentEntry = agentRegistry.get(metadata.agentId, username);
    if (agentEntry?.server?.definition?.serialTools) {
      serialTools = agentEntry.server.definition.serialTools;
    }
  }

  return c.json({ tools, serialTools });
});

sessionsRouter.get("/:id/tasks", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);

  if (sessionId.startsWith("exec_")) {
    return c.json({ tasks: [], status: "idle", currentStepIndex: 0, logs: {} });
  }

  const state = loadTasksState(username, sessionId);
  return c.json(state);
});

sessionsRouter.post("/:id/tasks", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);

  if (sessionId.startsWith("exec_")) {
    return c.json({ error: "Cannot modify tasks for execution logs" }, 400);
  }

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

  if (sessionId.startsWith("exec_")) {
    return c.json({ error: "Cannot run tasks for execution logs" }, 400);
  }

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

  if (sessionId.startsWith("exec_")) {
    return c.json({ error: "Cannot run tasks for execution logs" }, 400);
  }

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

  if (sessionId.startsWith("exec_")) {
    return c.json({ error: "Cannot pause tasks for execution logs" }, 400);
  }

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

  if (sessionId.startsWith("exec_")) {
    return c.json({ error: "Cannot reset tasks for execution logs" }, 400);
  }

  try {
    resetTasks(username, sessionId);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: String(err) }, 500);
  }
});

