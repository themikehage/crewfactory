import jwt from "jsonwebtoken";
import {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
  SessionManager,
  DefaultResourceLoader,
  getAgentDir,
  createBashToolDefinition,
  type AgentSession,
  type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { AVAILABLE_TOOLS } from "shared";
import { DEFAULT_AGENTS_MD, DEFAULT_FACTORY_SKILLS } from "./default-factory-skills";
import { eventBroker } from "../lib/event-broker";
import { join, resolve, dirname } from "node:path";
import { registerQwenProvider } from "./qwen-provider";
import { mcpRegistry } from "./mcp-registry";

export function getResolvedSkillPaths(cwd: string, username?: string): string[] {
  const paths: string[] = [];
  try {
    const realAgentDir = getAgentDir();
    const globalSkillsDir = resolve(realAgentDir, "skills");
    if (existsSync(globalSkillsDir)) {
      paths.push(globalSkillsDir);
    }
  } catch (e) {
  }

  // Todas las entidades (proyectos, agentes, canales) ven las factory skills globales
  if (username) {
    const factorySkillsDir = resolve(`/tmp/crewfactory/${username}`, "workspace", ".agents", "skills");
    if (existsSync(factorySkillsDir) && !paths.includes(factorySkillsDir)) {
      paths.push(factorySkillsDir);
    }
  }

  let current = resolve(cwd);
  let workspaceRoot = current;
  while (true) {
    if (existsSync(resolve(current, "package.json")) || existsSync(resolve(current, "bun.lock"))) {
      workspaceRoot = current;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  const localCandidates = [
    resolve(workspaceRoot, ".pi/skills"),
    resolve(workspaceRoot, ".agents/skills"),
    resolve(workspaceRoot, "pi/.pi/skills"),
    resolve(workspaceRoot, "pi/.agents/skills"),
  ];
  for (const candidate of localCandidates) {
    if (existsSync(candidate) && !paths.includes(candidate)) {
      paths.push(candidate);
    }
  }
  return paths;
}

export function ensureWorkspaceSubdirs(workspaceDir: string): void {
  const subdirs = [
    join(workspaceDir, ".agents", "skills"),
    join(workspaceDir, "assets", "uploads"),
    join(workspaceDir, "assets", "generated"),
    join(workspaceDir, "memories", "repos"),
    join(workspaceDir, "memories", "sessions"),
  ];
  for (const dir of subdirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

export function ensureWorkspaceStructure(username: string): string {
  const userDir = `/tmp/crewfactory/${username}`;
  const workspaceDir = join(userDir, "workspace");
  const skillsBaseDir = join(workspaceDir, ".agents", "skills");

  ensureWorkspaceSubdirs(workspaceDir);
  mkdirSync(join(userDir, "repos"), { recursive: true });

  const agentsMdPath = join(workspaceDir, "AGENTS.md");
  if (!existsSync(agentsMdPath)) {
    try {
      writeFileSync(agentsMdPath, DEFAULT_AGENTS_MD, "utf-8");
    } catch (e) {
      console.error("Failed to write AGENTS.md:", e);
    }
  }

  for (const [skillKey, skillDef] of Object.entries(DEFAULT_FACTORY_SKILLS)) {
    const skillDir = join(skillsBaseDir, skillKey);
    if (!existsSync(skillDir)) {
      mkdirSync(skillDir, { recursive: true });
    }
    const skillFilePath = join(skillDir, "SKILL.md");
    if (!existsSync(skillFilePath)) {
      try {
        writeFileSync(skillFilePath, skillDef.content, "utf-8");
      } catch (e) {
        console.error(`Failed to write skill ${skillKey}:`, e);
      }
    }
  }

  return workspaceDir;
}


interface UserSessionEntry {
  session: AgentSession;
  unsubscribe: () => void;
}

interface UserContext {
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
}

type SessionListItem = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  status?: "active" | "streaming" | "task-running" | "sleeping";
  repoName?: string;
  agentId?: string;
  channelId?: string;
  isExecution?: boolean;
};

class PiSessionManager {
  private sessions = new Map<string, UserSessionEntry>();
  private users = new Map<string, UserContext>();

  private getSessionKey(username: string, sessionId: string): string {
    return `${username}:${sessionId}`;
  }

  ensureUserDir(username: string): string {
    const dir = `/tmp/crewfactory/${username}`;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  getUserEnv(username: string): Record<string, string> {
    const userDir = this.ensureUserDir(username);
    const envPath = join(userDir, "env.json");
    if (!existsSync(envPath)) return {};
    try {
      return JSON.parse(readFileSync(envPath, "utf-8"));
    } catch (e) {
      console.error(`Failed to read env.json for ${username}:`, e);
      return {};
    }
  }

  setUserEnv(username: string, key: string, value: string): void {
    const userDir = this.ensureUserDir(username);
    const envPath = join(userDir, "env.json");
    const env = this.getUserEnv(username);
    env[key] = value;
    writeFileSync(envPath, JSON.stringify(env, null, 2), "utf-8");
  }

  setUserEnvMap(username: string, env: Record<string, string>): void {
    const userDir = this.ensureUserDir(username);
    const envPath = join(userDir, "env.json");
    writeFileSync(envPath, JSON.stringify(env, null, 2), "utf-8");
  }

  deleteUserEnv(username: string, key: string): void {
    const userDir = this.ensureUserDir(username);
    const envPath = join(userDir, "env.json");
    const env = this.getUserEnv(username);
    delete env[key];
    writeFileSync(envPath, JSON.stringify(env, null, 2), "utf-8");
  }

  getUserContext(username: string): UserContext {
    const existing = this.users.get(username);
    if (existing) return existing;

    const userDir = this.ensureUserDir(username);
    const authStorage = AuthStorage.create(`${userDir}/auth.json`);
    const modelRegistry = ModelRegistry.create(authStorage);

    modelRegistry.refresh();
    registerQwenProvider(modelRegistry);

    const ctx: UserContext = { authStorage, modelRegistry };
    this.users.set(username, ctx);
    return ctx;
  }

  clearUserContext(username: string): void {
    this.users.delete(username);
  }

  getUserDefaultModel(username: string): string | null {
    const { modelRegistry } = this.getUserContext(username);
    const available = modelRegistry.getAvailable();
    if (available.length > 0) {
      return `${available[0].provider}/${available[0].id}`;
    }
    return null;
  }


  async getOrCreateSession(
    username: string,
    sessionId: string,
    repoName?: string,
    agentId?: string,
    channelId?: string
  ): Promise<AgentSession> {
    const key = this.getSessionKey(username, sessionId);
    const existing = this.sessions.get(key);
    if (existing) return existing.session;

    const userDir = this.ensureUserDir(username);
    const sessionDir = `${userDir}/sessions/${sessionId}`;

    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }

    // Persistir metadatos de sesión (guardar y leer metadata.json con repoName, agentId y channelId)
    const metadataPath = join(sessionDir, "metadata.json");
    let resolvedRepoName = repoName;
    let resolvedAgentId = agentId;
    let resolvedChannelId = channelId;
    let persistedTools: string[] | undefined;

    if (repoName || agentId || channelId) {
      const existingMeta = existsSync(metadataPath)
        ? (() => { try { return JSON.parse(readFileSync(metadataPath, "utf-8")); } catch { return {}; } })()
        : {};
      const updatedMeta = { ...existingMeta };
      if (repoName !== undefined) updatedMeta.repoName = repoName;
      if (agentId !== undefined) updatedMeta.agentId = agentId;
      if (channelId !== undefined) updatedMeta.channelId = channelId;
      writeFileSync(metadataPath, JSON.stringify(updatedMeta, null, 2), "utf-8");
      resolvedRepoName = updatedMeta.repoName;
      resolvedAgentId = updatedMeta.agentId;
      resolvedChannelId = updatedMeta.channelId;
    } else if (existsSync(metadataPath)) {
      try {
        const metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
        resolvedRepoName = metadata.repoName;
        resolvedAgentId = metadata.agentId;
        resolvedChannelId = metadata.channelId;
        persistedTools = Array.isArray(metadata.tools) ? metadata.tools : undefined;
      } catch (e) {
        console.error(`Failed to read metadata.json for session ${sessionId}:`, e);
      }
    }

    // Asegurar estructura de carpetas
    ensureWorkspaceStructure(username);

    // Asignar cwd dinámicamente según el contexto (Repo vs Agent vs Channel vs Global)
    const workspaceBase = join(userDir, "workspace");
    let workspaceDir = workspaceBase;
    if (resolvedChannelId) {
      workspaceDir = join(userDir, "channels", resolvedChannelId, "workspace");
    } else if (resolvedAgentId) {
      workspaceDir = join(userDir, "agents", resolvedAgentId, "workspace");
    } else if (resolvedRepoName) {
      workspaceDir = resolve(userDir, "repos", resolvedRepoName, "workspace");
    }

    if (!existsSync(workspaceDir)) {
      mkdirSync(workspaceDir, { recursive: true });
    }

    // Crear subestructura completa para workspaces no-globales (skills, assets, memorias)
    if (resolvedChannelId || resolvedAgentId || resolvedRepoName) {
      ensureWorkspaceSubdirs(workspaceDir);
    }

    const { authStorage, modelRegistry } = this.getUserContext(username);

    let agentDef;
    if (resolvedAgentId) {
      const { agentRegistry } = await import("../agents");
      const agentEntry = agentRegistry.get(resolvedAgentId);
      agentDef = agentEntry?.server.definition;
    }

    const skillPaths = getResolvedSkillPaths(workspaceDir, username);
    if (agentDef?.skills && agentDef.skills.length > 0) {
      for (const sk of agentDef.skills) {
        const candidate = resolve(workspaceDir, ".pi", "skills", sk);
        if (existsSync(candidate) && !skillPaths.includes(candidate)) {
          skillPaths.push(candidate);
        }
      }
    }

    const appendPrompts = [
      `\n\nAdditional Instructions for HTML Visual Preview and Image Rendering:\n` +
      `- When generating web pages, HTML layouts, mockups, or visual documents, always output them as complete HTML files starting with "<!DOCTYPE html>" or "<html>" to enable a live browser-based preview.\n` +
      `- When generating plots, charts, diagrams, or images, save them to a file and output their file paths or URLs on a separate line using this exact format:\n` +
      `=== [title] ===\n` +
      `[file path or URL]\n` +
      `Example: === output.png ===\n` +
      `assets/output.png\n` +
      `This enables the UI to automatically parse and render them in a gallery grid.\n`
    ];

    if (agentDef?.systemPrompt) {
      appendPrompts.push(`\n\nAgent Instructions (${agentDef.name} - ${agentDef.role}):\n${agentDef.systemPrompt}`);
    }

    const resourceLoader = new DefaultResourceLoader({
      cwd: workspaceDir,
      agentDir: userDir,
      additionalSkillPaths: skillPaths,
      appendSystemPrompt: appendPrompts,
    });
    await resourceLoader.reload();

    const jsonlFiles = readdirSync(sessionDir)
      .filter((f) => f.endsWith(".jsonl"))
      .sort()
      .reverse();

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
        const userEnv = this.getUserEnv(username);
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
    });


    const mcpTools = await mcpRegistry.getSessionMcpTools(username, sessionId);

    const { session } = await createAgentSession({
      cwd: workspaceDir,
      sessionManager,
      authStorage,
      modelRegistry,
      resourceLoader,
      customTools: [customBashTool as any, ...mcpTools],
    });

    if (persistedTools) {
      session.setActiveToolsByName(persistedTools);
    }

    // Subscribe to global logs forwarding
    const globalLogUnsub = session.subscribe((evt: any) => {
      const ev = evt as any;

      if (
        evt.type === "agent_start" ||
        evt.type === "agent_end" ||
        evt.type === "tool_execution_start" ||
        evt.type === "tool_execution_end" ||
        evt.type === "agent_error"
      ) {
        try {
          this.saveSessionMetadata(username, sessionId, {
            updatedAt: new Date().toISOString(),
          });
        } catch {}
      }
      const getSessionName = () => {
        try {
          const metaPath = join(sessionDir, "metadata.json");
          if (existsSync(metaPath)) {
            return JSON.parse(readFileSync(metaPath, "utf-8")).name || sessionId;
          }
        } catch {}
        return sessionId;
      };

      if (evt.type === "agent_start") {
        eventBroker.publishEvent(username, {
          sourceType: "session",
          sourceId: sessionId,
          sourceName: getSessionName(),
          eventType: "agent_start",
        });
      } else if (evt.type === "agent_end") {
        eventBroker.publishEvent(username, {
          sourceType: "session",
          sourceId: sessionId,
          sourceName: getSessionName(),
          eventType: "agent_end",
        });
      } else if (evt.type === "message_update") {
        if (ev.assistantMessageEvent?.type === "text_delta" && ev.assistantMessageEvent.delta) {
          eventBroker.publishEvent(username, {
            sourceType: "session",
            sourceId: sessionId,
            sourceName: getSessionName(),
            eventType: "text_delta",
            detail: ev.assistantMessageEvent.delta,
          });
        } else if (ev.assistantMessageEvent?.type === "thinking_delta" && ev.assistantMessageEvent.delta) {
          eventBroker.publishEvent(username, {
            sourceType: "session",
            sourceId: sessionId,
            sourceName: getSessionName(),
            eventType: "thinking_delta",
            detail: ev.assistantMessageEvent.delta,
          });
        }
      } else if (evt.type === "tool_execution_start") {
        eventBroker.publishEvent(username, {
          sourceType: "session",
          sourceId: sessionId,
          sourceName: getSessionName(),
          eventType: "tool_start",
          detail: { toolName: ev.toolName, args: ev.args, toolCallId: ev.toolCallId },
        });
      } else if (evt.type === "tool_execution_end") {
        eventBroker.publishEvent(username, {
          sourceType: "session",
          sourceId: sessionId,
          sourceName: getSessionName(),
          eventType: "tool_end",
          detail: { toolName: ev.toolName, result: ev.result, isError: ev.isError, toolCallId: ev.toolCallId },
        });
      } else if (evt.type === "agent_error") {
        eventBroker.publishEvent(username, {
          sourceType: "session",
          sourceId: sessionId,
          sourceName: getSessionName(),
          eventType: "error",
          detail: ev.error,
        });
      }
    });

    const unsubscribe = session.subscribe(() => {});

    this.sessions.set(key, {
      session,
      unsubscribe: () => {
        unsubscribe();
        globalLogUnsub();
      },
    });

    return session;
  }

  getSession(username: string, sessionId: string): AgentSession | null {
    const key = this.getSessionKey(username, sessionId);
    return this.sessions.get(key)?.session ?? null;
  }

  subscribeToSession(
    username: string,
    sessionId: string,
    listener: (event: AgentSessionEvent) => void
  ): () => void {
    const key = this.getSessionKey(username, sessionId);
    const entry = this.sessions.get(key);
    if (!entry) return () => {};

    const unsubscribe = entry.session.subscribe(listener);
    return unsubscribe;
  }

  subscribeOnce(
    username: string,
    sessionId: string,
    listener: (event: AgentSessionEvent) => void
  ): void {
    const key = this.getSessionKey(username, sessionId);
    const entry = this.sessions.get(key);
    if (!entry) return;

    let called = false;
    let unsubscribe: (() => void) | null = null;

    unsubscribe = entry.session.subscribe((event) => {
      if (!called) {
        called = true;
        unsubscribe?.();
        listener(event);
      }
    });
  }

  async destroySession(username: string, sessionId: string): Promise<void> {
    const key = this.getSessionKey(username, sessionId);
    const entry = this.sessions.get(key);
    if (entry) {
      entry.unsubscribe();
      entry.session.dispose();
      this.sessions.delete(key);
    }
    mcpRegistry.stopSessionMcpTools(username, sessionId);
    const userDir = this.ensureUserDir(username);
    const sessionDir = join(userDir, "sessions", sessionId);
    if (existsSync(sessionDir)) {
      rmSync(sessionDir, { recursive: true, force: true });
    }
  }

  saveSessionMetadata(username: string, sessionId: string, data: Record<string, unknown>): void {
    const userDir = this.ensureUserDir(username);
    const metadataPath = join(userDir, "sessions", sessionId, "metadata.json");
    let metadata: Record<string, unknown> = {};
    if (existsSync(metadataPath)) {
      try { metadata = JSON.parse(readFileSync(metadataPath, "utf-8")); } catch {}
    }
    Object.assign(metadata, data);
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
  }

  getSessionMetadata(username: string, sessionId: string): Record<string, any> | null {
    const userDir = this.ensureUserDir(username);
    const metadataPath = join(userDir, "sessions", sessionId, "metadata.json");
    if (existsSync(metadataPath)) {
      try {
        return JSON.parse(readFileSync(metadataPath, "utf-8"));
      } catch {}
    }
    return null;
  }


  async listSessions(username: string): Promise<SessionListItem[]> {
    const userDir = this.ensureUserDir(username);
    const sessionsDir = join(userDir, "sessions");
    if (!existsSync(sessionsDir)) return [];

    try {
      const entries = await readdir(sessionsDir, { withFileTypes: true });
      const sessionPromises = entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const sessionId = entry.name;
          const sessionSubdir = join(sessionsDir, sessionId);
          const metadataPath = join(sessionSubdir, "metadata.json");
          
          let metadata: Record<string, unknown> = {};
          if (existsSync(metadataPath)) {
            try {
              const metaContent = await readFile(metadataPath, "utf-8");
              metadata = JSON.parse(metaContent);
            } catch {}
          }

          let messageCount = 0;
          try {
            const files = await readdir(sessionSubdir);
            const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
            for (const file of jsonlFiles) {
              try {
                const content = await readFile(join(sessionSubdir, file), "utf-8");
                const lines = content.trim().split("\n");
                const limit = Math.min(lines.length, 500);
                for (let i = 0; i < limit; i++) {
                  const line = lines[i].trim();
                  if (!line) continue;
                  const parsed = JSON.parse(line);
                  if (parsed.type === "message" && parsed.message?.role === "user") {
                    messageCount++;
                  }
                }
              } catch {}
            }
          } catch {}

          const session = this.sessions.get(this.getSessionKey(username, sessionId));
          let status: "active" | "streaming" | "task-running" | "sleeping" | undefined;
          if (session) {
            if (session.session.isStreaming) {
              status = "streaming";
            } else {
              status = "active";
            }
          } else {
            status = "sleeping";
          }
          if (status === "active" || status === "sleeping") {
            try {
              const { isTaskRunnerActive } = await import("../pi/task-runner");
              if (isTaskRunnerActive(sessionId)) {
                status = "task-running";
              }
            } catch {}
          }

          return {
            id: sessionId,
            name: (metadata.name as string) || sessionId,
            createdAt: (metadata.createdAt as string) || new Date(0).toISOString(),
            updatedAt: (metadata.updatedAt as string) || new Date(0).toISOString(),
            messageCount,
            status,
            repoName: metadata.repoName as string | undefined,
            agentId: metadata.agentId as string | undefined,
            channelId: metadata.channelId as string | undefined,
          };
        });

      const userSessions = await Promise.all(sessionPromises);
      const virtualSessions: SessionListItem[] = [];

      // 1. Ejecuciones de Agentes
      try {
        const { agentRegistry } = await import("../agents");
        const agentsList = agentRegistry.list(username);
        for (const agent of agentsList) {
          const execsDir = join(userDir, "agents", agent.id, "executions");
          if (existsSync(execsDir)) {
            const execFolders = readdirSync(execsDir);
            for (const f of execFolders) {
              try {
                const summaryPath = join(execsDir, f, "summary.json");
                if (existsSync(summaryPath)) {
                  const summary = JSON.parse(readFileSync(summaryPath, "utf-8"));
                  virtualSessions.push({
                    id: `exec_agent_${agent.id}_${f}`,
                    name: `API: ${summary.prompt ? summary.prompt.slice(0, 30) + (summary.prompt.length > 30 ? "..." : "") : f}`,
                    createdAt: summary.createdAt || new Date().toISOString(),
                    updatedAt: summary.createdAt || new Date().toISOString(),
                    messageCount: 0,
                    status: "sleeping",
                    agentId: agent.id,
                    isExecution: true as any,
                  });
                }
              } catch {}
            }
          }
        }
      } catch (e) {
        console.error("Failed to list virtual agent sessions:", e);
      }

      // 2. Ejecuciones de Repositorios (Proyectos)
      try {
        const reposDir = join(userDir, "repos");
        if (existsSync(reposDir)) {
          const repoFolders = readdirSync(reposDir, { withFileTypes: true });
          for (const entry of repoFolders) {
            if (entry.isDirectory()) {
              const execsDir = join(reposDir, entry.name, "executions");
              if (existsSync(execsDir)) {
                const execFolders = readdirSync(execsDir);
                for (const f of execFolders) {
                  try {
                    const summaryPath = join(execsDir, f, "summary.json");
                    if (existsSync(summaryPath)) {
                      const summary = JSON.parse(readFileSync(summaryPath, "utf-8"));
                      virtualSessions.push({
                        id: `exec_repo_${entry.name}_${f}`,
                        name: `API: ${summary.prompt ? summary.prompt.slice(0, 30) + (summary.prompt.length > 30 ? "..." : "") : f}`,
                        createdAt: summary.createdAt || new Date().toISOString(),
                        updatedAt: summary.createdAt || new Date().toISOString(),
                        messageCount: 0,
                        status: "sleeping",
                        repoName: entry.name,
                        isExecution: true as any,
                      });
                    }
                  } catch {}
                }
              }
            }
          }
        }
      } catch (e) {
        console.error("Failed to list virtual repo sessions:", e);
      }

      // 3. Ejecuciones de Canales (CLI)
      try {
        const { channelStore } = await import("../channels");
        const channelsList = channelStore.listChannels(username);
        for (const channel of channelsList) {
          const msgsPath = join(userDir, "channels", channel.id, "messages.jsonl");
          if (existsSync(msgsPath)) {
            const fileContent = readFileSync(msgsPath, "utf-8");
            const lines = fileContent.trim().split("\n");
            const channelSessions = new Map<string, { firstMsgTime: string, lastMsgTime: string, firstPrompt: string }>();
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const parsed = JSON.parse(line);
                const sId = parsed.sessionId;
                if (sId && sId.startsWith("cli-channel-")) {
                  const time = parsed.timestamp || new Date().toISOString();
                  let text = parsed.content || "";
                  if (typeof text !== "string" && parsed.message?.content) {
                    text = parsed.message.content;
                  }
                  if (channelSessions.has(sId)) {
                    const entry = channelSessions.get(sId)!;
                    entry.lastMsgTime = time;
                    if (!entry.firstPrompt && parsed.role === "user" && text) {
                      entry.firstPrompt = text;
                    }
                  } else {
                    channelSessions.set(sId, {
                      firstMsgTime: time,
                      lastMsgTime: time,
                      firstPrompt: parsed.role === "user" ? text : "",
                    });
                  }
                }
              } catch {}
            }
            
            for (const [sId, info] of channelSessions.entries()) {
              virtualSessions.push({
                id: `exec_channel_${channel.id}_${sId}`,
                name: `CLI: ${info.firstPrompt ? info.firstPrompt.slice(0, 30) + (info.firstPrompt.length > 30 ? "..." : "") : sId}`,
                createdAt: info.firstMsgTime,
                updatedAt: info.lastMsgTime,
                messageCount: 0,
                status: "sleeping",
                channelId: channel.id,
                isExecution: true as any,
              });
            }
          }
        }
      } catch (e) {
        console.error("Failed to list virtual channel sessions:", e);
      }

      const allSessions = [...userSessions, ...virtualSessions];
      allSessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return allSessions;
    } catch (e) {
      console.error(`Failed to list sessions for ${username}:`, e);
      return [];
    }
  }

  persistSessionTools(username: string, sessionId: string, tools: string[]): void {
    const userDir = this.ensureUserDir(username);
    const metadataPath = join(userDir, "sessions", sessionId, "metadata.json");
    let metadata: Record<string, unknown> = {};
    if (existsSync(metadataPath)) {
      try { metadata = JSON.parse(readFileSync(metadataPath, "utf-8")); } catch {}
    }
    metadata.tools = tools;
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
  }

  getSessionTools(username: string, sessionId: string): string[] {
    const userDir = this.ensureUserDir(username);
    const metadataPath = join(userDir, "sessions", sessionId, "metadata.json");
    if (!existsSync(metadataPath)) return [...AVAILABLE_TOOLS];
    try {
      const metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
      return Array.isArray(metadata.tools) ? metadata.tools : [...AVAILABLE_TOOLS];
    } catch {
      return [...AVAILABLE_TOOLS];
    }
  }


  getUserPasswordHash(username: string): string | null {
    const userDir = this.ensureUserDir(username);
    const credPath = join(userDir, "credentials.json");
    if (!existsSync(credPath)) return null;
    try {
      const data = JSON.parse(readFileSync(credPath, "utf-8"));
      return data.passwordHash ?? null;
    } catch {
      return null;
    }
  }

  setUserPasswordHash(username: string, hashB64: string): void {
    const userDir = this.ensureUserDir(username);
    const credPath = join(userDir, "credentials.json");
    writeFileSync(credPath, JSON.stringify({ passwordHash: hashB64 }, null, 2), "utf-8");
  }

  async destroyAllSessions(username: string): Promise<void> {
    const prefix = `${username}:`;
    for (const [key, entry] of this.sessions) {
      if (key.startsWith(prefix)) {
        entry.unsubscribe();
        entry.session.dispose();
        this.sessions.delete(key);
      }
    }
  }
}

export const piSessionManager = new PiSessionManager();
