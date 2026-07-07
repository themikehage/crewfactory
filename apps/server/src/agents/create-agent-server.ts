import {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
  DefaultResourceLoader,
  createBashToolDefinition,
  SessionManager,
} from "../ai";
import { Hono } from "hono";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { streamSSE } from "hono/streaming";
import type { AgentDefinition } from "shared";
import type { AgentServer } from "./types";
import { createUiTools } from "../core/ui-tools";
import { ensureWorkspaceSubdirs, sessionManager as coreSessionManager } from "../core/session-manager";
import jwt from "jsonwebtoken";
import { filterSecretsFromOutput } from "../core/bash-output-filter";
import { getEnvironmentContext } from "../core/env-check";
import { engramRegistry } from "../core/engram/registry";
import { createEngramTools } from "../core/engram/engram-tools";

function ensureAgentWorkspace(username: string, id: string): string {
  const dir = `/tmp/crewfactory/${username}/agents/${id}`;
  const subdirs = [
    join(dir, "sessions"),
    join(dir, "workspace"),
  ];
  for (const d of subdirs) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
  // Crear subestructura completa para el workspace del agente
  ensureWorkspaceSubdirs(join(dir, "workspace"));
  return dir;
}

export async function createAgentServer(definition: AgentDefinition, username: string): Promise<AgentServer> {
  const agentDir = ensureAgentWorkspace(username, definition.id);
  const workspaceDir = join(agentDir, "workspace");
  const sessionDir = join(agentDir, "sessions", "main");

  const userSettings = coreSessionManager.getUserSettings(username);
  const engramEnabled = userSettings.engramEnabled ?? false;
  const engramDbPath = join(agentDir, "engram", "engram.db");
  const memory = await engramRegistry.get(`agent:${definition.id}`, engramDbPath, engramEnabled);

  if (!existsSync(sessionDir)) mkdirSync(sessionDir, { recursive: true });

  const { getResolvedSkillPaths } = await import("../core/session-manager");
  const { authStorage, modelRegistry } = coreSessionManager.getUserContext(username);
  modelRegistry.refresh();

  const additionalSkillPaths = [
    // Incluir factory skills globales para el agente
    ...getResolvedSkillPaths(workspaceDir, username),
  ];
  if (definition.skills && definition.skills.length > 0) {
    for (const skill of definition.skills) {
      const candidate = resolve(workspaceDir, ".pi", "skills", skill);
      if (existsSync(candidate) && !additionalSkillPaths.includes(candidate)) {
        additionalSkillPaths.push(candidate);
      }
    }
  }

  const envContext = getEnvironmentContext(workspaceDir);
  const resourceLoader = new DefaultResourceLoader({
    cwd: workspaceDir,
    agentDir,
    additionalSkillPaths,
    appendSystemPrompt: [
      `\n\nRuntime Environment:\n${envContext}`,
      `\n\n${definition.systemPrompt}`,
      `\n\nInteractive UI Components (AG-UI Protocol):\n` +
      `You have native interactive UI tools. Prefer using them over custom scripts or general output formats when suitable:\n` +
      `- render_chart: Use this tool to display bar, line, area, or pie charts to visualize quantitative data, metrics, or analytical trends. Avoid writing Python/matplotlib scripts or generating image files for charts if they can be represented using this tool.\n` +
      `- request_approval: Before executing any critical, destructive, or potentially dangerous actions (such as running build/deploy scripts, deleting files, or executing system commands via bash), you MUST call this tool to request explicit user confirmation.\n` +
      `- ask_question: When you need to ask the user a question to clarify requirements, solicit design feedback, or resolve choices, call this tool to present a clean single/multi-choice form or custom text field.\n` +
      `- render_images: When generating images, drawings, or mockups, use this tool to display them dynamically in a responsive grid in the chat stream.\n` +
      `- render_html: When you produce a complete HTML document (web pages, mockups, dashboards, or any visual HTML output), use this tool to render it directly in the chat as a live interactive preview. Always prefer this over writing HTML to a file and expecting the user to open it manually.\n` +
      `- share_file: When you generate any file artifact that the user should download (PDF reports, Excel spreadsheets, PowerPoint presentations, Word documents, ZIP archives, etc.), use this tool to share it directly in the chat. The user will see a download card and can click to download. Always prefer this over telling the user to manually find the file in the workspace.\n` +
      `- refresh_ui: Call this tool immediately after creating, updating, or deleting a project/repository, agent, channel, custom skill, or experiment to trigger a reactive refresh of the UI sidebar and lists on the user's interface.\n`
    ],
  });
  await resourceLoader.reload();

  const jsonlFiles = existsSync(sessionDir)
    ? readdirSync(sessionDir).filter((f) => f.endsWith(".jsonl")).sort().reverse()
    : [];

  let sessionManager: SessionManager;
  if (jsonlFiles.length > 0) {
    sessionManager = SessionManager.open(
      join(sessionDir, jsonlFiles[0]),
      sessionDir,
      sessionDir
    );
  } else {
    sessionManager = SessionManager.create(sessionDir, sessionDir);
  }

  const customBashTool = createBashToolDefinition(workspaceDir, {
    spawnHook: (context) => {
      const userEnv = coreSessionManager.getUserEnv(username);
      const token = jwt.sign(
        { username },
        process.env.JWT_SECRET!,
        { expiresIn: "7d" }
      );
      return {
        ...context,
        env: {
          ...context.env,
          ...userEnv,
          TOKEN: token,
          JWT_TOKEN: token,
        },
      };
    },
    outputFilter: (output: string) => {
      const userEnv = coreSessionManager.getUserEnv(username);
      const secrets = Object.values(userEnv).filter(Boolean);
      return filterSecretsFromOutput(output, secrets);
    },
  });

  const isLaboratory = definition.id.startsWith("lab_");
  const uiTools = createUiTools(workspaceDir, username, isLaboratory, isLaboratory ? undefined : {
    workspaceDir,
    username,
    parentSessionId: sessionManager.getSessionId(),
    modelRegistry,
    authStorage,
    resourceLoader,
  });

  const engramTools = engramEnabled ? createEngramTools(memory) : [];

  const { session } = await createAgentSession({
    cwd: workspaceDir,
    sessionManager,
    authStorage,
    modelRegistry,
    resourceLoader,
    customTools: [customBashTool as any, ...uiTools as any, ...engramTools as any],
  });
  
  const activeToolNames = [
    "read", "write", "edit", "bash", "grep", "find", "ls",
    "request_approval",
    "ask_question",
    "render_images",
    "render_html",
    "render_chart",
    "share_file",
    "refresh_ui",
    "spawn_subagent",
    "delegate_task"
  ];
  if (engramEnabled) {
    activeToolNames.push("engram_store", "engram_recall", "engram_forget");
  }
  session.setActiveToolsByName(activeToolNames);

  const originalPrompt = session.prompt.bind(session);
  session.prompt = async (message: string) => {
    const memCtx = await memory.buildContext(message);
    const enriched = memCtx ? `${memCtx}\n\n${message}` : message;
    return originalPrompt(enriched);
  };

  const available = modelRegistry.getAvailable();
  if (definition.model) {
    const found = available.find(
      (m) => m.id === definition.model || `${m.provider}/${m.id}` === definition.model
    );
    if (found) {
      try {
        await session.setModel(found);
        console.log(`[AgentServer:${definition.id}] Configured model: ${found.provider}/${found.id}`);
      } catch (e) {
        console.error(`[AgentServer:${definition.id}] Failed to set model ${definition.model}:`, e);
      }
    }
  }
  
  if (!session.model && available.length > 0) {
    try {
      await session.setModel(available[0]);
      console.log(`[AgentServer:${definition.id}] Fallback default model: ${available[0].provider}/${available[0].id}`);
    } catch (e) {
      console.error(`[AgentServer:${definition.id}] Failed to set fallback model:`, e);
    }
  }

  const app = new Hono();
  let activeObservers = 0;

  app.get("/health", (c) =>
    c.json({
      id: definition.id,
      name: definition.name,
      role: definition.role,
      streaming: session.isStreaming,
      activeObservers,
    })
  );

  app.get("/messages", (c) => {
    return c.json({ messages: session.messages });
  });

  app.get("/observe", async (c) => {
    activeObservers++;
    return streamSSE(c, async (sse) => {
      const unsub = session.subscribe((event) => {
        sse.writeSSE({ data: JSON.stringify(event), event: event.type }).catch(() => {});
      });
      c.req.raw.signal.addEventListener("abort", () => {
        activeObservers = Math.max(0, activeObservers - 1);
        unsub();
      });
      while (!c.req.raw.signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    });
  });

  app.get("/executions", (c) => {
    const execsDir = join(agentDir, "executions");
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

  app.get("/executions/:execId", (c) => {
    const execId = c.req.param("execId");
    const execDir = join(agentDir, "executions", execId);
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

  app.post("/prompt", async (c) => {
    const body = await c.req.json<{ message: string; stream?: boolean }>();
    const { message, stream = true } = body;

    if (!message || typeof message !== "string") {
      return c.json({ error: "message is required" }, 400);
    }

    const execId = crypto.randomUUID();
    const execsDir = join(agentDir, "executions");
    if (!existsSync(execsDir)) mkdirSync(execsDir, { recursive: true });
    
    const execDir = join(execsDir, execId);
    mkdirSync(execDir, { recursive: true });
    
    writeFileSync(join(execDir, "prompt.json"), JSON.stringify({ prompt: message, createdAt: new Date().toISOString() }, null, 2));

    const toolCalls: any[] = [];
    const errors: string[] = [];
    const startTime = Date.now();

    const unsubLog = session.subscribe((event: any) => {
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
        errors.push(event.error || "Unknown agent error");
      }
    });

    const finalize = () => {
      unsubLog();
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
        console.error(`[AgentServer:${definition.id}] Failed to save execution log:`, e);
      }
    };

    if (!stream) {
      try {
        await session.prompt(message);
        const msgs = session.messages;
        return c.json({ messages: msgs });
      } catch (err) {
        errors.push(String(err));
        return c.json({ error: String(err) }, 500);
      } finally {
        finalize();
      }
    }

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
  });

  app.post("/abort", async (c) => {
    if (session.isStreaming) {
      await session.abort();
    }
    return c.json({ aborted: true });
  });

  let bunServer: ReturnType<typeof Bun.serve> | null = null;

  const agentServer: AgentServer = {
    definition,
    session,
    app,
    memory,
    getActiveObservers() {
      return activeObservers;
    },
    async start() {
      if (!definition.port) throw new Error("No port defined for standalone start");
      bunServer = Bun.serve({
        port: definition.port,
        fetch: app.fetch,
      });
      console.log(`Agent [${definition.id}] running on port ${definition.port}`);
    },
    async stop() {
      if (session.isStreaming) await session.abort();
      session.dispose();
      await memory.shutdown();
      if (bunServer) {
        bunServer.stop(true);
        bunServer = null;
      }
    },
  };

  return agentServer;
}
