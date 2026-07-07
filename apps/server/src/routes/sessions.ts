import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { streamSSE } from "hono/streaming";
import { authMiddleware, getAuthPayload } from "../middleware/auth";
import { sessionManager } from "../core/session-manager";
import { CreateSessionSchema, PromptSchema, ModelSettingsSchema, ToolPermissionsSchema } from "shared";

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
  const { name, projectName, agentId, channelId } = c.req.valid("json");
  const { username } = getAuthPayload(c);
  const sessionId = crypto.randomUUID();

  const now = new Date().toISOString();
  const session = {
    id: sessionId,
    name,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    projectName,
    agentId,
    channelId,
  };

  sessionManager.getOrCreateSession(username, sessionId, projectName, agentId, channelId).catch(err => {
    console.error(`[Session Start Async] Failed for ${sessionId}:`, err);
  });

  sessionManager.saveSessionMetadata(username, sessionId, {
    name,
    createdAt: now,
    updatedAt: now,
    projectName: projectName || null,
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
  const projectName = metadata.projectName;

  const execId = crypto.randomUUID();
  let execDir: string | null = null;
  let toolCalls: any[] = [];
  const errors: string[] = [];
  const startTime = Date.now();

  if (projectName) {
    const userDir = sessionManager.ensureUserDir(username);
    const projectExecsDir = join(userDir, "projects", projectName, "executions");
    if (!existsSync(projectExecsDir)) mkdirSync(projectExecsDir, { recursive: true });
    execDir = join(projectExecsDir, execId);
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
        console.error(`[SessionsRoute] Failed to save execution log for project ${projectName}:`, e);
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
    const projectName = metadata.projectName;

    const execId = crypto.randomUUID();
    let execDir: string | null = null;
    let toolCalls: any[] = [];
    const errors: string[] = [];
    const startTime = Date.now();

    if (projectName) {
      const userDir = sessionManager.ensureUserDir(username);
      const projectExecsDir = join(userDir, "projects", projectName, "executions");
      if (!existsSync(projectExecsDir)) mkdirSync(projectExecsDir, { recursive: true });
      execDir = join(projectExecsDir, execId);
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
          console.error(`[SessionsRoute] Failed to save execution log for project ${projectName}:`, e);
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

sessionsRouter.get("/projects/:projectName/executions", async (c) => {
  const { username } = getAuthPayload(c);
  const projectName = c.req.param("projectName");
  
  const userDir = sessionManager.ensureUserDir(username);
  const execsDir = join(userDir, "projects", projectName, "executions");
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

sessionsRouter.get("/projects/:projectName/executions/:execId", async (c) => {
  const { username } = getAuthPayload(c);
  const projectName = c.req.param("projectName");
  const execId = c.req.param("execId");

  const userDir = sessionManager.ensureUserDir(username);
  const execDir = join(userDir, "projects", projectName, "executions", execId);
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
    } else if (tipo === "project") {
      const messagesPath = join("/tmp/crewfactory", username, "projects", entidad, "executions", execId, "messages.jsonl");
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

  const enrichedMessages = activeMessages.map((msg: any, idx: number) => {
    const entry = allEntries.find((e: any) => e.type === "message" && e.message && (e.message.id === msg.id || e.id === msg.id));
    const parentId = entry ? entry.parentId : null;
    const siblings = childrenByParent.get(parentId) ?? [msg.id || entry?.id];

    const isLast = idx === activeMessages.length - 1;
    const isStreaming = isLast && session.isStreaming && msg.role === "assistant";

    return {
      ...msg,
      id: entry?.id || msg.id,
      parentId,
      siblings,
      isStreaming: isStreaming ? true : msg.isStreaming,
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
    const memoryActive = currentActive.filter((tName) => tName.startsWith("memory_"));
    const exaActive = currentActive.filter((tName) => tName === "exa_search");

    session.setActiveToolsByName(
      Array.from(
        new Set([
          ...tools,
          ...mcpActive,
          ...memoryActive,
          ...exaActive,
          "request_approval",
          "ask_question",
          "render_images",
          "render_html",
          "render_chart",
          "share_file",
          "refresh_ui",
          "spawn_subagent",
          "delegate_task",
          "decompose_tasks",
          "update_task_status",
          "complete_task_list",
        ])
      )
    );
    sessionManager.persistSessionTools(username, sessionId, tools);

    return c.json({ success: true, tools });
  }
);

function getGatedToolStatus(username: string): Record<string, "available" | "missing_key"> {
  const env = sessionManager.getUserEnv(username);
  return {
    exa_search: (env.EXA_API_KEY || process.env.EXA_API_KEY) ? "available" : "missing_key",
  };
}

sessionsRouter.get("/:id/tools", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);

  if (sessionId.startsWith("exec_")) {
    return c.json({ tools: [], serialTools: ["request_approval", "ask_question"], toolStatus: getGatedToolStatus(username) });
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

  return c.json({ tools, serialTools, toolStatus: getGatedToolStatus(username) });
});

sessionsRouter.get("/:id/tasks", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);

  const userDir = sessionManager.ensureUserDir(username);
  const sessionDir = join(userDir, "sessions", sessionId);
  const tasksPath = join(sessionDir, "tasks.json");

  if (!existsSync(tasksPath)) {
    return c.json({ tasks: [], currentTaskId: null, status: "idle" });
  }

  try {
    const content = readFileSync(tasksPath, "utf-8");
    return c.json(JSON.parse(content));
  } catch {
    return c.json({ tasks: [], currentTaskId: null, status: "idle" });
  }
});

sessionsRouter.post("/:id/tasks/status", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);
  try {
    const { status } = await c.req.json();
    if (status !== "running" && status !== "paused") {
      return c.json({ error: "Invalid status value. Must be 'running' or 'paused'." }, 400);
    }

    const userDir = sessionManager.ensureUserDir(username);
    const sessionDir = join(userDir, "sessions", sessionId);
    const tasksPath = join(sessionDir, "tasks.json");

    if (!existsSync(tasksPath)) {
      return c.json({ error: "No active task list found" }, 404);
    }

    const state = JSON.parse(readFileSync(tasksPath, "utf-8"));
    state.status = status;
    writeFileSync(tasksPath, JSON.stringify(state, null, 2), "utf-8");

    broadcastToSession(sessionId, {
      type: "tasks_update",
      state,
    });

    return c.json(state);
  } catch (err: any) {
    return c.json({ error: String(err) }, 500);
  }
});

sessionsRouter.get("/:parentId/subagents/:subagentId/messages", async (c) => {
  const parentId = c.req.param("parentId");
  const subagentId = c.req.param("subagentId");
  const { username } = getAuthPayload(c);

  const userDir = sessionManager.ensureUserDir(username);
  const delegateDir = join(userDir, "sessions", `del_${subagentId}`);
  const subFolder = `sub_${subagentId}`;
  const subagentDir = join(userDir, "sessions", parentId, "subagents", subFolder);

  let targetDir = subagentDir;
  if (existsSync(delegateDir)) {
    targetDir = delegateDir;
  } else if (!existsSync(subagentDir)) {
    return c.json({ error: "Subagent or delegation session not found" }, 404);
  }

  const metadataPath = join(targetDir, "metadata.json");

  const jsonlFiles = readdirSync(targetDir)
    .filter((f) => f.endsWith(".jsonl"))
    .sort()
    .reverse();

  let messages: any[] = [];
  if (jsonlFiles.length > 0) {
    try {
      const content = readFileSync(join(targetDir, jsonlFiles[0]), "utf-8");
      messages = content.trim().split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch (e) {
      console.error(`Failed to read subagent log:`, e);
    }
  }

  let metadata = {};
  if (existsSync(metadataPath)) {
    try {
      metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
    } catch {}
  }

  return c.json({ messages, metadata });
});

sessionsRouter.post("/:parentId/subagents/:subagentId/abort", async (c) => {
  const parentId = c.req.param("parentId");
  const subagentId = c.req.param("subagentId");
  const { username } = getAuthPayload(c);

  let subSession = sessionManager.getSession(username, `del_${subagentId}`);
  if (!subSession) {
    subSession = sessionManager.getSession(username, `sub_${subagentId}`);
  }

  if (subSession) {
    await subSession.abort();
    return c.json({ success: true });
  }

  return c.json({ success: true, message: "Session not running" });
});


