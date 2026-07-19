import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { streamSSE } from "hono/streaming";
import { authMiddleware, getAuthPayload } from "../middleware/auth";
import { sessionManager } from "../core/session-manager";
import { CreateSessionSchema, PromptSchema, ModelSettingsSchema, ToolPermissionsSchema, SessionPrefix, getExecutionMessagesPath } from "shared";

import { broadcastToSession } from "../ws/handler";
import { agentRegistry } from "../agents";
import { delegationRegistry } from "../core/delegation-registry";
import { teamStore } from "../teams/team-store";
import { getTeamWorkspaceDir } from "shared";

const STORAGE_KEY = "crewfactory-sessions";

export const sessionsRouter = new Hono();

sessionsRouter.use("/*", authMiddleware);

sessionsRouter.get("/", async (c) => {
  const { username } = getAuthPayload(c);
  
  const search = c.req.query("search");
  const agentId = c.req.query("agentId");
  const channelId = c.req.query("channelId");
  const projectName = c.req.query("projectName");
  const status = c.req.query("status");
  const from = c.req.query("from");
  const to = c.req.query("to");
  
  const pageQuery = c.req.query("page");
  const perPageQuery = c.req.query("perPage");
  const page = pageQuery ? parseInt(pageQuery, 10) : undefined;
  const perPage = perPageQuery ? parseInt(perPageQuery, 10) : undefined;
  
  const sortBy = c.req.query("sortBy") || "updatedAt";
  const sortDir = c.req.query("sortDir") || "desc";
  
  const isExecutionQuery = c.req.query("isExecution");
  const isExecution = isExecutionQuery !== undefined ? (isExecutionQuery === "true") : undefined;

  const allFilteredSessions = await sessionManager.listSessions(username, {
    search,
    agentId,
    channelId,
    projectName,
    status,
    from,
    to,
    sortBy,
    sortDir,
    isExecution,
  });

  const total = allFilteredSessions.length;

  if (page !== undefined || perPage !== undefined) {
    const p = page || 1;
    const pp = perPage || 50;
    const startIndex = (p - 1) * pp;
    const paginatedSessions = allFilteredSessions.slice(startIndex, startIndex + pp);
    return c.json({
      sessions: paginatedSessions,
      total,
      page: p,
      perPage: pp
    });
  }

  return c.json({ sessions: allFilteredSessions });
});

sessionsRouter.get("/statuses", async (c) => {
  const { username } = getAuthPayload(c);
  const statuses = sessionManager.getLiveStatuses(username);
  return c.json({ statuses });
});

sessionsRouter.get("/analytics", async (c) => {
  const { username } = getAuthPayload(c);
  const from = c.req.query("from");
  const to = c.req.query("to");
  const agentId = c.req.query("agentId");
  const channelId = c.req.query("channelId");
  const projectName = c.req.query("projectName");

  const sessions = await sessionManager.listSessions(username, {
    from,
    to,
    agentId,
    channelId,
    projectName,
    archived: "false",
  });

  const archivedSessions = await sessionManager.listSessions(username, {
    from,
    to,
    agentId,
    channelId,
    projectName,
    archived: "true",
  });

  const allFiltered = [...sessions, ...archivedSessions];

  let totalSessions = allFiltered.length;
  let totalTokens = 0;
  let totalToolCalls = 0;
  let totalErrors = 0;
  let totalDurationMs = 0;
  let sessionsWithErrors = 0;

  const sessionsByDay: Record<string, { count: number; tokens: number }> = {};
  const toolCounts: Record<string, number> = {};
  const modelCounts: Record<string, number> = {};
  const toolErrors: Record<string, number> = {};

  for (const s of allFiltered) {
    const tokens = s.totalTokens || 0;
    totalTokens += tokens;

    const toolCalls = s.toolCallCount || 0;
    totalToolCalls += toolCalls;

    const errors = s.errorCount || 0;
    totalErrors += errors;
    if (errors > 0) {
      sessionsWithErrors++;
    }

    const duration = s.durationMs || 0;
    totalDurationMs += duration;

    const dateStr = s.createdAt ? s.createdAt.substring(0, 10) : new Date(0).toISOString().substring(0, 10);
    if (!sessionsByDay[dateStr]) {
      sessionsByDay[dateStr] = { count: 0, tokens: 0 };
    }
    sessionsByDay[dateStr].count++;
    sessionsByDay[dateStr].tokens += tokens;

    if (s.modelId) {
      modelCounts[s.modelId] = (modelCounts[s.modelId] || 0) + 1;
    }

    const meta = sessionManager.metadataStore.getSessionMetadata(username, s.id);
    if (meta) {
      if (meta.toolCallsByTool) {
        for (const [tool, count] of Object.entries(meta.toolCallsByTool)) {
          if (typeof count === "number") {
            toolCounts[tool] = (toolCounts[tool] || 0) + count;
          }
        }
      }
      if (meta.errorsByTool) {
        for (const [tool, count] of Object.entries(meta.errorsByTool)) {
          if (typeof count === "number") {
            toolErrors[tool] = (toolErrors[tool] || 0) + count;
          }
        }
      }
    }
  }

  const formattedSessionsByDay = Object.entries(sessionsByDay).map(([date, data]) => ({
    date,
    count: data.count,
    tokens: data.tokens,
  })).sort((a, b) => a.date.localeCompare(b.date));

  const topTools = Object.entries(toolCounts).map(([tool, count]) => ({
    tool,
    count,
  })).sort((a, b) => b.count - a.count);

  const topModels = Object.entries(modelCounts).map(([model, count]) => ({
    model,
    count,
  })).sort((a, b) => b.count - a.count);

  const topErrors = Object.entries(toolErrors).map(([tool, count]) => ({
    tool,
    count,
  })).sort((a, b) => b.count - a.count);

  const avgDurationMs = totalSessions > 0 ? Math.round(totalDurationMs / totalSessions) : 0;
  const avgTokensPerSession = totalSessions > 0 ? Math.round(totalTokens / totalSessions) : 0;
  const errorRate = totalSessions > 0 ? parseFloat((sessionsWithErrors / totalSessions).toFixed(2)) : 0;

  return c.json({
    totalSessions,
    totalTokens,
    totalToolCalls,
    totalErrors,
    totalDurationMs,
    avgDurationMs,
    avgTokensPerSession,
    sessionsByDay: formattedSessionsByDay,
    topTools,
    topModels,
    errorRate,
    topErrors,
  });
});

sessionsRouter.post("/batch", zValidator("json", z.object({
  action: z.enum(["archive", "unarchive", "delete"]),
  sessionIds: z.array(z.string().min(1)),
})), async (c) => {
  const { action, sessionIds } = c.req.valid("json");
  const { username } = getAuthPayload(c);

  for (const sessionId of sessionIds) {
    if (sessionId.startsWith(SessionPrefix.EXEC)) continue;
    if (action === "archive") {
      sessionManager.metadataStore.saveSessionMetadata(username, sessionId, { archived: true, updatedAt: new Date().toISOString() });
    } else if (action === "unarchive") {
      sessionManager.metadataStore.saveSessionMetadata(username, sessionId, { archived: false, updatedAt: new Date().toISOString() });
    } else if (action === "delete") {
      await sessionManager.destroySession(username, sessionId).catch((err) => {
        console.error(`[Batch Delete] Failed for ${sessionId}:`, err);
      });
    }
  }

  return c.json({ success: true, count: sessionIds.length });
});

sessionsRouter.post("/:id/archive", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);
  if (sessionId.startsWith(SessionPrefix.EXEC)) {
    return c.json({ error: "Cannot archive API executions" }, 400);
  }
  sessionManager.metadataStore.saveSessionMetadata(username, sessionId, { archived: true, updatedAt: new Date().toISOString() });
  return c.json({ success: true, archived: true });
});

sessionsRouter.post("/:id/unarchive", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);
  if (sessionId.startsWith(SessionPrefix.EXEC)) {
    return c.json({ error: "Cannot unarchive API executions" }, 400);
  }
  sessionManager.metadataStore.saveSessionMetadata(username, sessionId, { archived: false, updatedAt: new Date().toISOString() });
  return c.json({ success: true, archived: false });
});

sessionsRouter.post("/", zValidator("json", CreateSessionSchema), async (c) => {
  const { name, projectName, agentId, channelId, teamId, experimentId } = c.req.valid("json");
  const { username } = getAuthPayload(c);
  const sessionId = crypto.randomUUID();

  const team = teamId ? teamStore.getTeam(username, teamId) : null;
  const isOrchestration = team?.teamType === "Orchestration";
  const leader = isOrchestration
    ? team.members.find((member) => member.role === "lead")
    : null;
  if (teamId && isOrchestration && !leader) {
    return c.json({ error: "Orchestration team requires a leader" }, 400);
  }
  const ownerAgentId = leader?.agentId || agentId;

  const now = new Date().toISOString();
  const session = {
    id: sessionId,
    name,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    projectName,
    agentId: ownerAgentId,
    channelId,
    teamId,
    experimentId,
  };

  const isNegotiation = team && team.teamType === "Negotiation";

  sessionManager.metadataStore.saveSessionMetadata(username, sessionId, {
    name,
    createdAt: now,
    updatedAt: now,
    projectName: projectName || null,
    agentId: ownerAgentId || null,
    channelId: channelId || null,
    teamId: teamId || null,
    experimentId: experimentId || null,
    ...(isNegotiation ? {
      executionMode: "readonly",
      tools: ["read", "grep", "find", "ls"]
    } : {})
  });

  if (!teamId || isOrchestration) {
    sessionManager.getOrCreateSession(username, sessionId, projectName, ownerAgentId, channelId, teamId ? {
      workspaceDir: getTeamWorkspaceDir(username, teamId),
    } : undefined).catch(err => {
      console.error(`[Session Start Async] Failed for ${sessionId}:`, err);
    });
  }

  return c.json(session, 201);
});

sessionsRouter.post("/:id/prompt", zValidator("json", PromptSchema), async (c) => {
  const sessionId = c.req.param("id");
  const { message } = c.req.valid("json");
  const { username } = getAuthPayload(c);

  const session = await sessionManager.getOrCreateSession(username, sessionId);
  const metadata = sessionManager.metadataStore.getSessionMetadata(username, sessionId) || {};
  const projectName = metadata.projectName;

  const execId = crypto.randomUUID();
  let execDir: string | null = null;
  let toolCalls: any[] = [];
  const errors: string[] = [];
  const startTime = Date.now();

  if (projectName) {
    const userDir = sessionManager.userConfig.ensureUserDir(username);
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
    const metadata = sessionManager.metadataStore.getSessionMetadata(username, sessionId) || {};
    const projectName = metadata.projectName;

    const execId = crypto.randomUUID();
    let execDir: string | null = null;
    let toolCalls: any[] = [];
    const errors: string[] = [];
    const startTime = Date.now();

    if (projectName) {
      const userDir = sessionManager.userConfig.ensureUserDir(username);
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
  
  const userDir = sessionManager.userConfig.ensureUserDir(username);
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

  const userDir = sessionManager.userConfig.ensureUserDir(username);
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

  if (sessionId.startsWith(SessionPrefix.EXEC)) {
    const parts = sessionId.split("_");
    const tipo = parts[1];
    const entidad = parts[2];
    const execId = parts.slice(3).join("_");

    if (tipo === "agent") {
      const messagesPath = getExecutionMessagesPath(username, "agents", entidad, execId);
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
      const messagesPath = getExecutionMessagesPath(username, "projects", entidad, execId);
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

  const metadata = sessionManager.metadataStore.getSessionMetadata(username, sessionId) || {};
  return c.json({ messages: enrichedMessages, metadata });
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

  if (sessionId.startsWith(SessionPrefix.EXEC)) {
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

  if (sessionId.startsWith(SessionPrefix.EXEC)) {
    return c.json({ error: "Cannot delete API executions from UI" }, 400);
  }

  await sessionManager.destroySession(username, sessionId);

  return c.json({ success: true });
});

sessionsRouter.patch("/:id", zValidator("json", z.object({ name: z.string().min(1).max(100) })), async (c) => {
  const sessionId = c.req.param("id");
  const { name } = c.req.valid("json");
  const { username } = getAuthPayload(c);

  if (sessionId.startsWith(SessionPrefix.EXEC)) {
    return c.json({ error: "Cannot rename API executions" }, 400);
  }

  sessionManager.metadataStore.saveSessionMetadata(username, sessionId, { name });

  return c.json({ success: true });
});

sessionsRouter.post(
  "/:id/model",
  zValidator("json", ModelSettingsSchema),
  async (c) => {
    const sessionId = c.req.param("id");
    const { provider, modelId, thinkingLevel } = c.req.valid("json");
    const { username } = getAuthPayload(c);

    if (sessionId.startsWith(SessionPrefix.EXEC)) {
      return c.json({ error: "Cannot modify model settings for execution logs" }, 400);
    }

    const { modelRegistry } = sessionManager.userConfig.getUserContext(username);

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

  if (sessionId.startsWith(SessionPrefix.EXEC)) {
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

  if (sessionId.startsWith(SessionPrefix.EXEC)) {
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
    const { tools, executionMode } = c.req.valid("json");
    const { username } = getAuthPayload(c);

    if (sessionId.startsWith(SessionPrefix.EXEC)) {
      return c.json({ error: "Cannot modify tool permissions for execution logs" }, 400);
    }

    const session = await sessionManager.getOrCreateSession(username, sessionId);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const currentActive = session.getActiveToolNames();

    const ALWAYS_ON = [
      "request_approval",
      "ask_question",
      "render_images",
      "render_chart",
      "share_file",
      "refresh_ui",
      "spawn_subagent",
      "delegate_task",
      "decompose_tasks",
      "update_task_status",
      "complete_task_list",
      "vision",
      "generate_image",
      "manage_factory",
      "manage_custom_tools",
    ] as const;
    const BUILTIN_AND_ALWAYS = new Set<string>([
      "read",
      "write",
      "edit",
      "bash",
      "grep",
      "find",
      "ls",
      "exa_search",
      "web_fetch",
      "render_html",
      ...ALWAYS_ON,
      "memory_store",
      "memory_recall",
      "memory_forget",
      "create_experiment",
    ]);

    const mcpActive = currentActive.filter((tName) => tName.startsWith("mcp_"));
    const memoryActive = currentActive.filter((tName) => tName.startsWith("memory_"));
    const exaActive = currentActive.filter((tName) => tName === "exa_search");
    const webFetchActive = currentActive.filter((tName) => tName === "web_fetch");
    const customActive = currentActive.filter(
      (tName) => !tName.startsWith("mcp_") && !tName.startsWith("memory_") && !BUILTIN_AND_ALWAYS.has(tName)
    );

    let enabledCustomFromStorage: string[] = [];
    try {
      const { customToolStorage } = await import("../core/custom-tools/storage");
      enabledCustomFromStorage = customToolStorage
        .loadAll(username)
        .filter((d: any) => d.enabled !== false)
        .map((d: any) => d.name);
    } catch {}

    const mergedCustom = Array.from(new Set([...customActive, ...enabledCustomFromStorage]));

    session.setActiveToolsByName(
      Array.from(
        new Set([
          ...tools,
          ...mcpActive,
          ...memoryActive,
          ...exaActive,
          ...webFetchActive,
          ...mergedCustom,
          ...ALWAYS_ON,
        ])
      )
    );
    sessionManager.metadataStore.persistSessionTools(username, sessionId, tools);
    if (executionMode) {
      sessionManager.metadataStore.setExecutionMode(username, sessionId, executionMode);
    }

    return c.json({ success: true, tools, executionMode });
  }
);

function getGatedToolStatus(username: string): Record<string, "available" | "missing_key"> {
  const env = sessionManager.userConfig.getUserEnv(username);
  return {
    exa_search: (env.EXA_API_KEY || process.env.EXA_API_KEY) ? "available" : "missing_key",
    web_fetch: "available",
  };
}

sessionsRouter.get("/:id/tools", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);

  if (sessionId.startsWith(SessionPrefix.EXEC)) {
    return c.json({ tools: [], serialTools: ["request_approval", "ask_question"], toolStatus: getGatedToolStatus(username) });
  }

  const tools = sessionManager.metadataStore.getSessionTools(username, sessionId);
  const metadata = sessionManager.metadataStore.getSessionMetadata(username, sessionId) || {};
  let serialTools = ["request_approval", "ask_question"];

  if (metadata.agentId) {
    const agentEntry = agentRegistry.get(metadata.agentId, username);
    if (agentEntry?.server?.definition?.serialTools) {
      serialTools = agentEntry.server.definition.serialTools;
    }
  }
  const executionMode = sessionManager.metadataStore.getExecutionMode(username, sessionId);

  return c.json({ tools, serialTools, toolStatus: getGatedToolStatus(username), executionMode });
});

sessionsRouter.get("/:id/export", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);
  const format = c.req.query("format") || "json";

  if (format !== "json" && format !== "jsonl" && format !== "markdown") {
    return c.json({ error: "Invalid export format. Supported formats: json, jsonl, markdown." }, 400);
  }

  // 1. Size Limit Check (10MB)
  if (!sessionId.startsWith(SessionPrefix.EXEC)) {
    const userDir = sessionManager.userConfig.ensureUserDir(username);
    const sessionDir = join(userDir, "sessions", sessionId);
    if (existsSync(sessionDir)) {
      try {
        const files = readdirSync(sessionDir);
        const jsonlFiles = files.filter(f => f.endsWith(".jsonl"));
        let totalSize = 0;
        for (const file of jsonlFiles) {
          const stats = statSync(join(sessionDir, file));
          totalSize += stats.size;
        }
        if (totalSize > 10 * 1024 * 1024) {
          return c.json({ error: "Session size exceeds 10MB limit. Export is not allowed." }, 422);
        }
      } catch {}
    }
  }

  // 2. Retrieve session messages and metadata
  let messages: any[] = [];
  let metadata: Record<string, any> = {};

  try {
    if (sessionId.startsWith(SessionPrefix.EXEC)) {
      const parts = sessionId.split("_");
      const tipo = parts[1];
      const entidad = parts[2];
      const execId = parts.slice(3).join("_");

      if (tipo === "agent") {
        const messagesPath = getExecutionMessagesPath(username, "agents", entidad, execId);
        if (existsSync(messagesPath)) {
          const content = readFileSync(messagesPath, "utf-8");
          messages = content.trim().split("\n").filter(Boolean).map(line => {
            const parsed = JSON.parse(line);
            if (parsed.message) {
              return {
                id: parsed.id || parsed.message.id || crypto.randomUUID(),
                role: parsed.message.role,
                content: parsed.message.content,
                timestamp: parsed.timestamp || new Date().toISOString(),
                usage: parsed.message.usage || parsed.usage,
              };
            }
            return parsed;
          });
        }
        try {
          const summaryPath = join(sessionManager.userConfig.ensureUserDir(username), "agents", entidad, "executions", execId, "summary.json");
          if (existsSync(summaryPath)) {
            metadata = JSON.parse(readFileSync(summaryPath, "utf-8"));
          }
        } catch {}
      } else if (tipo === "project") {
        const messagesPath = getExecutionMessagesPath(username, "projects", entidad, execId);
        if (existsSync(messagesPath)) {
          const content = readFileSync(messagesPath, "utf-8");
          messages = content.trim().split("\n").filter(Boolean).map(line => {
            const parsed = JSON.parse(line);
            if (parsed.message) {
              return {
                id: parsed.id || parsed.message.id || crypto.randomUUID(),
                role: parsed.message.role,
                content: parsed.message.content,
                timestamp: parsed.timestamp || new Date().toISOString(),
                usage: parsed.message.usage || parsed.usage,
              };
            }
            return parsed;
          });
        }
        try {
          const summaryPath = join(sessionManager.userConfig.ensureUserDir(username), "projects", entidad, "executions", execId, "summary.json");
          if (existsSync(summaryPath)) {
            metadata = JSON.parse(readFileSync(summaryPath, "utf-8"));
          }
        } catch {}
      } else if (tipo === "channel") {
        try {
          const { channelStore } = await import("../channels");
          const rawMessages = channelStore.getMessages(username, entidad, 100, execId);
          messages = rawMessages.map((m: any) => ({
            id: m.id || crypto.randomUUID(),
            role: m.role === "agent" ? "assistant" : m.role,
            content: m.content,
            agentName: m.agentName,
            timestamp: m.timestamp,
            isError: m.isError,
          }));
        } catch {}
      }
    } else {
      const session = await sessionManager.getOrCreateSession(username, sessionId);
      if (session) {
        messages = session.messages;
      }
      metadata = sessionManager.metadataStore.getSessionMetadata(username, sessionId) || {};
    }
  } catch (err) {
    return c.json({ error: "Failed to load session data: " + String(err) }, 500);
  }

  // 3. Format response
  if (format === "json") {
    c.header("Content-Disposition", `attachment; filename="session-${sessionId}.json"`);
    c.header("Content-Type", "application/json");
    return c.json({ metadata, messages });
  }

  if (format === "jsonl") {
    const jsonlContent = messages.map(m => JSON.stringify(m)).join("\n");
    c.header("Content-Disposition", `attachment; filename="session-${sessionId}.jsonl"`);
    c.header("Content-Type", "application/x-jsonlines");
    return c.text(jsonlContent);
  }

  if (format === "markdown") {
    const title = metadata.name || `Session: ${sessionId}`;
    const model = metadata.modelId || "unknown";
    const totalTokensIn = metadata.totalTokensIn || 0;
    const totalTokensOut = metadata.totalTokensOut || 0;
    const totalTokens = metadata.totalTokens || (totalTokensIn + totalTokensOut);
    const durationMsVal = metadata.durationMs;
    const durationSec = durationMsVal ? Math.floor(durationMsVal / 1000) : 0;
    const durMin = Math.floor(durationSec / 60);
    const durSec = durationSec % 60;
    const durationStr = durMin > 0 ? `${durMin}m ${durSec}s` : `${durSec}s`;
    const toolCallCount = metadata.toolCallCount || 0;
    const errors = metadata.errorCount || 0;

    let markdown = `# ${title}\n`;
    markdown += `**Model:** ${model}\n`;
    markdown += `**Duration:** ${durationStr} | **Tokens:** ${totalTokensIn.toLocaleString()} in / ${totalTokensOut.toLocaleString()} out (Total: ${totalTokens.toLocaleString()})\n`;
    markdown += `**Tool Calls:** ${toolCallCount} | **Errors:** ${errors}\n`;

    if (metadata.toolCallsByTool && Object.keys(metadata.toolCallsByTool).length > 0) {
      const toolList = Object.entries(metadata.toolCallsByTool)
        .map(([t, count]) => `${t}: ${count}`)
        .join(", ");
      markdown += `**Tools Used:** ${toolList}\n`;
    }

    markdown += `\n---\n\n`;

    for (const msg of messages) {
      const timeStr = msg.timestamp ? new Date(msg.timestamp).toISOString().replace("T", " ").substring(0, 19) : "unknown time";
      const roleLabel = msg.role === "user" ? "User" : msg.role === "assistant" ? (msg.agentName ? `Assistant (${msg.agentName})` : "Assistant") : msg.role;

      markdown += `## ${roleLabel} (${timeStr})\n`;

      if (typeof msg.content === "string") {
        markdown += `${msg.content}\n\n`;
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "text" && block.text) {
            markdown += `${block.text}\n\n`;
          } else if (block.type === "thinking" && block.thinking) {
            markdown += `<details>\n<summary>Thinking Process</summary>\n\n${block.thinking}\n\n</details>\n\n`;
          } else if (block.type === "toolCall") {
            markdown += `[Tool Call: ${block.name} (${block.id})]\n`;
            if (block.arguments) {
              markdown += "```json\n" + JSON.stringify(block.arguments, null, 2) + "\n```\n\n";
            }
          }
        }
      }

      if (msg.role === "toolResult") {
        markdown += `[Tool Result: ${msg.toolName} (${msg.toolCallId})]\n`;
        if (msg.isError) {
          markdown += `**Status:** ERROR\n`;
        }
        if (msg.content) {
          markdown += "```\n" + (typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content, null, 2)) + "\n```\n\n";
        }
      }
    }

    c.header("Content-Disposition", `attachment; filename="session-${sessionId}.md"`);
    c.header("Content-Type", "text/markdown");
    return c.text(markdown);
  }
});

sessionsRouter.get("/:id/tasks", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);

  const userDir = sessionManager.userConfig.ensureUserDir(username);
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

    const userDir = sessionManager.userConfig.ensureUserDir(username);
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

  const userDir = sessionManager.userConfig.ensureUserDir(username);
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

sessionsRouter.get("/:id/delegations", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);
  const list = delegationRegistry.getAll(username, sessionId);
  return c.json({ delegations: list });
});

sessionsRouter.get("/:id/delegations/:toolCallId", async (c) => {
  const sessionId = c.req.param("id");
  const toolCallId = c.req.param("toolCallId");
  const { username } = getAuthPayload(c);
  const delegation = delegationRegistry.getByToolCallId(username, sessionId, toolCallId);
  if (!delegation) {
    return c.json({ error: "Delegation not found" }, 404);
  }
  return c.json({ delegation });
});


