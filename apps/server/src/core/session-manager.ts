import {
  createAgentSession,
  SessionManager as VendoredSessionManager,
  DefaultResourceLoader,
  type AgentSession,
  type AgentSessionEvent,
} from "../ai";
import { existsSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import {
  getUserDir,
  getWorkspaceDir,
  getWorkspaceSkillsDir,
  getProjectsDir,
  getSessionsDir,
  getSessionDir,
  getProjectWorkspaceDir,
  getChannelWorkspaceDir,
  getAgentWorkspaceDir,
  getMemoryDbPath,
  SessionPrefix,
} from "shared";
import { DEFAULT_AGENTS_MD, DEFAULT_FACTORY_SKILLS } from "./default-factory-skills";
import { eventBroker } from "../lib/event-broker";
import { mcpRegistry } from "./mcp-registry";
import { memoryRegistry } from "./memory/registry";
import { userConfigManager, type UserContext } from "./session/user-config";
import { sessionMetadataStore } from "./session/metadata-store";
import { sessionPromptBuilder } from "./session/prompt-builder";
import { sessionToolFactory } from "./session/tool-factory";
import { sessionLister, type SessionListItem } from "./session/session-lister";
import { permissionEngine } from "./sandbox";
import { uiApprovalRegistry } from "./ui-approval-registry";

export function getResolvedSkillPaths(cwd: string, username?: string): string[] {
  const paths: string[] = [];

  if (username) {
    const factorySkillsDir = getWorkspaceSkillsDir(username);
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
    join(workspaceDir, "memories", "projects"),
    join(workspaceDir, "memories", "sessions"),
  ];

  for (const dir of subdirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

export function ensureWorkspaceStructure(username: string): string {
  const workspaceDir = getWorkspaceDir(username);
  const skillsBaseDir = join(workspaceDir, ".agents", "skills");

  ensureWorkspaceSubdirs(workspaceDir);
  mkdirSync(getProjectsDir(username), { recursive: true });

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

class SessionManager {
  private sessions = new Map<string, UserSessionEntry>();
  private pendingSessions = new Map<string, Promise<AgentSession>>();

  private getSessionKey(username: string, sessionId: string): string {
    return `${username}:${sessionId}`;
  }

  ensureUserDir(username: string): string {
    return userConfigManager.ensureUserDir(username);
  }

  getUserEnv(username: string): Record<string, string> {
    return userConfigManager.getUserEnv(username);
  }

  setUserEnv(username: string, key: string, value: string): void {
    userConfigManager.setUserEnv(username, key, value);
  }

  setUserEnvMap(username: string, env: Record<string, string>): void {
    userConfigManager.setUserEnvMap(username, env);
  }

  deleteUserEnv(username: string, key: string): void {
    userConfigManager.deleteUserEnv(username, key);
  }

  getUserSettings(username: string): Record<string, any> {
    return userConfigManager.getUserSettings(username);
  }

  saveUserSettings(username: string, settings: Record<string, any>): void {
    userConfigManager.saveUserSettings(username, settings);
  }

  getUserContext(username: string): UserContext {
    return userConfigManager.getUserContext(username);
  }

  clearUserContext(username: string): void {
    userConfigManager.clearUserContext(username);
  }

  getUserDefaultModel(username: string): string | null {
    return userConfigManager.getUserDefaultModel(username);
  }

  saveSessionMetadata(username: string, sessionId: string, data: Record<string, unknown>): void {
    sessionMetadataStore.saveSessionMetadata(username, sessionId, data);
  }

  getSessionMetadata(username: string, sessionId: string): Record<string, any> | null {
    return sessionMetadataStore.getSessionMetadata(username, sessionId);
  }

  persistSessionTools(username: string, sessionId: string, tools: string[]): void {
    sessionMetadataStore.persistSessionTools(username, sessionId, tools);
  }

  getSessionTools(username: string, sessionId: string): string[] {
    return sessionMetadataStore.getSessionTools(username, sessionId);
  }

  getUserPasswordHash(username: string): string | null {
    return userConfigManager.getUserPasswordHash(username);
  }

  setUserPasswordHash(username: string, hashB64: string): void {
    userConfigManager.setUserPasswordHash(username, hashB64);
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
    if (!entry) return () => { };

    return entry.session.subscribe(listener);
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
    this.pendingSessions.delete(key);
    mcpRegistry.stopSessionMcpTools(username, sessionId);
    await memoryRegistry.shutdown(`session:${sessionId}`);
    const sessionDir = getSessionDir(username, sessionId);
    const { rmSync } = await import("node:fs");
    if (existsSync(sessionDir)) {
      rmSync(sessionDir, { recursive: true, force: true });
    }
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

  async listSessions(username: string): Promise<SessionListItem[]> {
    return sessionLister.listSessions(username, {
      ensureUserDir: (u) => this.ensureUserDir(u),
      isSessionActive: (sId) => {
        const session = this.sessions.get(this.getSessionKey(username, sId));
        if (session) {
          return session.session.isStreaming ? "streaming" : "active";
        }
        return "sleeping";
      },
    });
  }

  async getOrCreateSession(
    username: string,
    sessionId: string,
    projectName?: string,
    agentId?: string,
    channelId?: string
  ): Promise<AgentSession> {
    const key = this.getSessionKey(username, sessionId);
    const existing = this.sessions.get(key);
    if (existing) return existing.session;

    const pending = this.pendingSessions.get(key);
    if (pending) return pending;

    const initPromise = (async () => {
      try {
        let sessionDir = getSessionDir(username, sessionId);
        if (sessionId.startsWith(SessionPrefix.SUBAGENT)) {
          const userDir = this.ensureUserDir(username);
          const sessionsDir = join(userDir, "sessions");
          if (existsSync(sessionsDir)) {
            const sessionFolders = readdirSync(sessionsDir);
            for (const parentId of sessionFolders) {
              const candidateDir = join(sessionsDir, parentId, "subagents", sessionId);
              if (existsSync(candidateDir)) {
                sessionDir = candidateDir;
                break;
              }
            }
          }
        }
        if (!existsSync(sessionDir)) {
          mkdirSync(sessionDir, { recursive: true });
        }

        const metadataPath = join(sessionDir, "metadata.json");
        let resolvedProjectName = projectName;
        let resolvedAgentId = agentId;
        let resolvedChannelId = channelId;
        let persistedTools: string[] | undefined;

        const existingMeta = existsSync(metadataPath)
          ? (() => { try { return JSON.parse(require("node:fs").readFileSync(metadataPath, "utf-8")); } catch { return {}; } })()
          : {};
        const updatedMeta = { ...existingMeta };

        if (projectName || agentId || channelId) {
          if (projectName !== undefined) updatedMeta.projectName = projectName;
          if (agentId !== undefined) updatedMeta.agentId = agentId;
          if (channelId !== undefined) updatedMeta.channelId = channelId;
          writeFileSync(metadataPath, JSON.stringify(updatedMeta, null, 2), "utf-8");
          resolvedProjectName = updatedMeta.projectName;
          resolvedAgentId = updatedMeta.agentId;
          resolvedChannelId = updatedMeta.channelId;
        } else {
          resolvedProjectName = existingMeta.projectName;
          resolvedAgentId = existingMeta.agentId;
          resolvedChannelId = existingMeta.channelId;
          persistedTools = Array.isArray(existingMeta.tools) ? existingMeta.tools : undefined;
        }

        ensureWorkspaceStructure(username);

        const workspaceBase = getWorkspaceDir(username);
        let workspaceDir = workspaceBase;
        if (resolvedChannelId) {
          workspaceDir = getChannelWorkspaceDir(username, resolvedChannelId);
        } else if (resolvedAgentId) {
          workspaceDir = getAgentWorkspaceDir(username, resolvedAgentId);
        } else if (resolvedProjectName) {
          workspaceDir = getProjectWorkspaceDir(username, resolvedProjectName);
        }

        if (!existsSync(workspaceDir)) {
          mkdirSync(workspaceDir, { recursive: true });
        }

        if (resolvedChannelId || resolvedAgentId || resolvedProjectName) {
          ensureWorkspaceSubdirs(workspaceDir);
        }

        const { authStorage, modelRegistry } = this.getUserContext(username);

        let agentDef;
        if (resolvedAgentId) {
          const { agentRegistry } = await import("../agents");
          if (resolvedAgentId === "lab-architect") {
            try {
              if (!agentRegistry.get("lab-architect")) {
                const { LAB_ARCHITECT_DEFINITION } = await import("./prompts/lab-architect");
                const userDefaultModel = this.getUserDefaultModel(username);
                const modelId = userDefaultModel || "";
                await agentRegistry.register(username, {
                  ...LAB_ARCHITECT_DEFINITION,
                  model: modelId,
                  skills: []
                }, false);
              }
            } catch (e) {
              console.error("Failed to register lab-architect:", e);
            }
          }
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

        const mcpConfig = mcpRegistry.loadConfig(username);
        const cachedMcpToolNames: string[] = [];
        for (const srv of Object.values(mcpConfig.mcpServers)) {
          if (srv.enabled && Array.isArray(srv.tools)) {
            for (const tName of srv.tools) {
              cachedMcpToolNames.push(`mcp_${srv.id}_${tName}`);
            }
          }
        }

        const appendPrompts = await sessionPromptBuilder.buildSystemPrompts({
          username,
          sessionId,
          workspaceDir,
          sessionDir,
          resolvedAgentId,
          agentDef,
          cachedMcpToolNames,
          experimentId: updatedMeta.experimentId || (existingMeta ? (existingMeta as any).experimentId : undefined),
        });

        const resourceLoader = new DefaultResourceLoader({
          cwd: workspaceDir,
          agentDir: getUserDir(username),
          additionalSkillPaths: skillPaths,
          appendSystemPrompt: appendPrompts,
        });
        await resourceLoader.reload();

        const jsonlFiles = readdirSync(sessionDir)
          .filter((f: string) => f.endsWith(".jsonl"))
          .sort()
          .reverse();

        let sessionManager: VendoredSessionManager;
        if (jsonlFiles.length > 0) {
          sessionManager = VendoredSessionManager.open(
            join(sessionDir, jsonlFiles[0]),
            sessionDir,
            sessionDir
          );
        } else {
          sessionManager = VendoredSessionManager.create(sessionDir, sessionDir);
        }

        const userSettings = this.getUserSettings(username);
        const memoryEnabled = userSettings.memoryEnabled ?? true;
        const memoryDbPath = getMemoryDbPath(username, sessionId);
        const memory = await memoryRegistry.get(`session:${sessionId}`, memoryDbPath, memoryEnabled);

        const { customTools, hasExaKey } = sessionToolFactory.createSessionTools({
          username,
          sessionId,
          workspaceDir,
          memoryEnabled,
          memory,
          modelRegistry,
          authStorage,
          resourceLoader,
        });

        const { session } = await createAgentSession({
          cwd: workspaceDir,
          sessionManager,
          authStorage,
          modelRegistry,
          resourceLoader,
          customTools,
          beforeToolCall: async (context, signal) => {
            const { toolCall, args } = context;
            const toolName = toolCall.name;

            const verdict = permissionEngine.evaluate(toolName, args as Record<string, unknown>);
            if (verdict.allow === false) {
              return { block: true, reason: `[Permission Denied] ${verdict.reason}` };
            }

            if (verdict.allow === "ask") {
              const toolCallId = toolCall.id;
              const approvalPromise = uiApprovalRegistry.register(toolCallId);

              const onAbort = () => {
                uiApprovalRegistry.resolve(toolCallId, { action: "deny" });
              };
              if (signal) {
                if (signal.aborted) {
                  onAbort();
                } else {
                  signal.addEventListener("abort", onAbort);
                }
              }

              try {
                const { broadcastToSession } = await import("../ws/handler");
                broadcastToSession(sessionId, {
                  type: "tool_approval_request",
                  toolCallId,
                  toolName,
                  args,
                  reason: verdict.reason,
                });
              } catch (e) {
                console.error("Failed to broadcast tool approval request:", e);
              }

              try {
                const result = await approvalPromise;
                if (result.action === "deny") {
                  return { block: true, reason: `[Permission Denied] Rejected by user` };
                }
                return undefined; // Approved
              } finally {
                if (signal) {
                  signal.removeEventListener("abort", onAbort);
                }
              }
            }

            return undefined; // Allowed
          },
        });

        const systemTools = this.getSessionTools(username, sessionId);
        let activeTools = persistedTools || systemTools;

        if (!hasExaKey) {
          activeTools = activeTools.filter(t => t !== "exa_search");
        }

        const alwaysOnTools = [
          "request_approval",
          "ask_question",
          "render_images",
          "render_html",
          "render_chart",
          "share_file",
          "refresh_ui",
          "decompose_tasks",
          "update_task_status",
          "complete_task_list",
          "vision",
          "generate_image",
          "manage_factory",
        ];
        if (resolvedAgentId === "lab-architect") {
          alwaysOnTools.push("create_experiment");
        } else {
          alwaysOnTools.push("spawn_subagent", "delegate_task");
        }

        const definedToolNames = new Set([
          ...systemTools,
          "bash",
          "exa_search",
          ...alwaysOnTools,
        ]);
        if (memoryEnabled) {
          definedToolNames.add("memory_store");
          definedToolNames.add("memory_recall");
          definedToolNames.add("memory_forget");
        }

        const combinedTools = Array.from(new Set([
          ...activeTools,
          ...alwaysOnTools,
          ...(memoryEnabled ? ["memory_store", "memory_recall", "memory_forget"] : []),
        ]))
          .filter(tName => definedToolNames.has(tName));

        session.setActiveToolsByName(combinedTools);

        const originalPrompt = session.prompt.bind(session);
        session.prompt = async (message: string) => {
          const memCtx = await memory.buildContext(message);
          const enriched = memCtx ? `${memCtx}\n\n${message}` : message;
          return originalPrompt(enriched);
        };

        (async () => {
          try {
            const mcpTools = await mcpRegistry.getSessionMcpTools(username, sessionId);
            if (mcpTools.length > 0) {
              const sessionAny = session as any;
              if (sessionAny._customTools) {
                sessionAny._customTools.push(...mcpTools);
                if (typeof sessionAny._refreshToolRegistry === "function") {
                  sessionAny._refreshToolRegistry();
                }
              }
              console.log(`[MCP Dynamic Load] Successfully loaded ${mcpTools.length} tools for session ${sessionId}`);
            }
          } catch (err) {
            console.error(`[MCP Dynamic Load] Failed to load MCP tools for session ${sessionId}:`, err);
          }
        })();

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
            } catch { }
          }
          const getSessionName = () => {
            try {
              const meta = this.getSessionMetadata(username, sessionId);
              if (meta) return meta.name || sessionId;
            } catch { }
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

        const unsubscribe = session.subscribe(() => { });

        const entry: UserSessionEntry = {
          session,
          unsubscribe: () => {
            unsubscribe();
            globalLogUnsub();
          },
        };
        this.sessions.set(key, entry);
        return session;
      } finally {
        this.pendingSessions.delete(key);
      }
    })();

    this.pendingSessions.set(key, initPromise);
    return initPromise;
  }
}

export const sessionManager = new SessionManager();
