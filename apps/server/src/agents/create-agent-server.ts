import {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
  DefaultResourceLoader,
  createBashToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { Hono } from "hono";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { streamSSE } from "hono/streaming";
import type { AgentDefinition } from "shared";
import type { AgentServer } from "./types";
import { ensureWorkspaceSubdirs } from "../pi/session-manager";

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

  if (!existsSync(sessionDir)) mkdirSync(sessionDir, { recursive: true });

  const { piSessionManager, getResolvedSkillPaths } = await import("../pi/session-manager");
  const { authStorage, modelRegistry } = piSessionManager.getUserContext(username);
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

  const resourceLoader = new DefaultResourceLoader({
    cwd: workspaceDir,
    agentDir,
    additionalSkillPaths,
    appendSystemPrompt: [`\n\n${definition.systemPrompt}`],
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

  const customBashTool = createBashToolDefinition(workspaceDir);

  const { session } = await createAgentSession({
    cwd: workspaceDir,
    sessionManager,
    authStorage,
    modelRegistry,
    resourceLoader,
    customTools: [customBashTool as any],
  });

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

  app.get("/health", (c) =>
    c.json({
      id: definition.id,
      name: definition.name,
      role: definition.role,
      streaming: session.isStreaming,
    })
  );

  app.get("/messages", (c) => {
    return c.json({ messages: session.messages });
  });

  app.post("/prompt", async (c) => {
    const body = await c.req.json<{ message: string; stream?: boolean }>();
    const { message, stream = true } = body;

    if (!message || typeof message !== "string") {
      return c.json({ error: "message is required" }, 400);
    }

    if (!stream) {
      try {
        await session.prompt(message);
        const msgs = session.messages;
        return c.json({ messages: msgs });
      } catch (err) {
        return c.json({ error: String(err) }, 500);
      }
    }

    return streamSSE(c, async (sse) => {
      const unsub = session.subscribe((event) => {
        sse.writeSSE({ data: JSON.stringify(event), event: event.type }).catch(() => {});
      });

      try {
        await session.prompt(message);
      } catch (err) {
        await sse.writeSSE({ data: JSON.stringify({ type: "agent_error", error: String(err) }), event: "agent_error" });
      } finally {
        unsub();
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
      if (bunServer) {
        bunServer.stop(true);
        bunServer = null;
      }
    },
  };

  return agentServer;
}
