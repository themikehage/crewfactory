import {
  createAgentSession,
  SessionManager as VendoredSessionManager,
  DefaultResourceLoader,
  type AgentSession,
  type AgentSessionEvent,
} from "../ai";
import { existsSync, writeFileSync, readdirSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  getUserDir,
  getSessionDir,
  getTeamWorkspaceDir,
  getMemoryDbPath,
  SessionPrefix,
} from "shared";
import { mcpRegistry } from "./mcp-registry";
import { memoryRegistry } from "./memory/registry";
import { userConfigManager } from "./session/user-config";
import { sessionMetadataStore } from "./session/metadata-store";
import { sessionPromptBuilder } from "./session/prompt-builder";
import { sessionToolFactory } from "./session/tool-factory";
import { sessionLister, type SessionListItem, type SessionListQuery } from "./session/session-lister";

import {
  getResolvedSkillPaths,
  ensureWorkspaceStructure,
  resolveSessionWorkspace,
} from "./session/workspace-resolver";
import { resolveAgentDefinition } from "./session/agent-definition-resolver";
import { resolveActiveTools } from "./session/tool-activation-engine";
import { subscribeSessionEvents } from "./session/session-event-publisher";
import { createBeforeToolCallHook } from "./session/before-tool-call-hook";
import { enrichSessionWithMemory } from "./session/session-memory-enricher";
import { buildSubagentRules, evaluateSubagentRules } from "./sandbox";

export {
  getResolvedSkillPaths,
  ensureWorkspaceStructure,
};

interface UserSessionEntry {
  session: AgentSession;
  unsubscribe: () => void;
}

export interface SessionOverrides {
  resourceLoader?: DefaultResourceLoader;
  customTools?: any[];
  workspaceDir?: string;
  skipMcpTools?: boolean;
  skipMemory?: boolean;
}

class SessionManager {
  private sessions = new Map<string, UserSessionEntry>();
  private pendingSessions = new Map<string, Promise<AgentSession>>();

  readonly userConfig = userConfigManager;
  readonly metadataStore = sessionMetadataStore;
  readonly lister = sessionLister;

  private getSessionKey(username: string, sessionId: string): string {
    return `${username}:${sessionId}`;
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
    // 1. Cancelar TODAS las delegaciones del árbol (BFS)
    try {
      const { delegationRegistry } = await import("./delegation-registry");
      delegationRegistry.abortAllRecursive(sessionId);
    } catch (err) {
      console.error("[SessionManager.destroySession] Failed to propagate recursive abort:", err);
    }

    // 2. Encontrar y destruir sesiones hijas recursivamente
    const children = this.findChildSessions(username, sessionId);
    for (const childId of children) {
      await this.destroySession(username, childId);
    }

    // 3. Destruir la sesión actual
    const key = this.getSessionKey(username, sessionId);
    const entry = this.sessions.get(key);
    if (entry) {
      entry.unsubscribe();
      await entry.session.dispose();
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

  private findChildSessions(username: string, parentSessionId: string): string[] {
    const children: string[] = [];
    const prefix = `${username}:`;

    // 1. En memoria
    for (const [key, entry] of this.sessions.entries()) {
      if (!key.startsWith(prefix)) continue;
      const sId = key.slice(prefix.length);
      const metadata = this.metadataStore.getSessionMetadata(username, sId);
      if (metadata?.parentSessionId === parentSessionId) {
        children.push(sId);
      }
    }

    // 2. Subagentes en disco bajo la carpeta del padre
    const parentSessionDir = getSessionDir(username, parentSessionId);
    const subagentsDir = join(parentSessionDir, "subagents");
    if (existsSync(subagentsDir)) {
      try {
        for (const dir of readdirSync(subagentsDir)) {
          if (!children.includes(dir)) {
            children.push(dir);
          }
        }
      } catch {}
    }

    // 3. Sesiones de tipo delegate (guardadas directamente en userDir/sessions/)
    const sessionsDir = join(getUserDir(username), "sessions");
    if (existsSync(sessionsDir)) {
      try {
        for (const dir of readdirSync(sessionsDir)) {
          if (dir.startsWith(SessionPrefix.DELEGATE)) {
            const metaPath = join(sessionsDir, dir, "metadata.json");
            if (existsSync(metaPath)) {
              try {
                const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
                if (meta.parentSessionId === parentSessionId && !children.includes(dir)) {
                  children.push(dir);
                }
              } catch {}
            }
          }
        }
      } catch {}
    }

    return children;
  }

  async destroyAllSessions(username: string): Promise<void> {
    const prefix = `${username}:`;
    const toDestroy = Array.from(this.sessions.entries()).filter(([key]) => key.startsWith(prefix));
    for (const [key, entry] of toDestroy) {
      entry.unsubscribe();
      await entry.session.dispose();
      this.sessions.delete(key);
    }
  }

  async listSessions(username: string, query?: SessionListQuery): Promise<SessionListItem[]> {
    return sessionLister.listSessions(username, {
      ensureUserDir: (u) => userConfigManager.ensureUserDir(u),
      isSessionActive: (sId) => {
        const session = this.sessions.get(this.getSessionKey(username, sId));
        if (session) {
          return session.session.isStreaming ? "streaming" : "active";
        }
        return "sleeping";
      },
    }, query);
  }

  getLiveStatuses(username: string): Record<string, "streaming" | "active" | "sleeping"> {
    const result: Record<string, "streaming" | "active" | "sleeping"> = {};
    const prefix = `${username}:`;
    for (const [key, entry] of this.sessions) {
      if (!key.startsWith(prefix)) continue;
      const sessionId = key.slice(prefix.length);
      result[sessionId] = entry.session.isStreaming ? "streaming" : "active";
    }
    return result;
  }

  async getOrCreateSession(
    username: string,
    sessionId: string,
    projectName?: string,
    agentId?: string,
    channelId?: string,
    overrides?: SessionOverrides
  ): Promise<AgentSession> {
    const key = this.getSessionKey(username, sessionId);
    const existing = this.sessions.get(key);
    if (existing) {
      if (!existing.session.model) {
        const context = existing.session.sessionManager.buildSessionContext();
        if (context.model) {
          const { modelRegistry } = this.userConfig.getUserContext(username);
          const found = modelRegistry.find(context.model.provider, context.model.modelId);
          if (found) {
            existing.session.model = found;
          }
        }
      }
      return existing.session;
    }

    const pending = this.pendingSessions.get(key);
    if (pending) return pending;

    const initPromise = (async () => {
      try {
        let { sessionDir, workspaceDir } = resolveSessionWorkspace(
          username,
          sessionId,
          projectName,
          agentId,
          channelId
        );

        if (overrides?.workspaceDir) {
          workspaceDir = overrides.workspaceDir;
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

        if (existingMeta.teamId) {
          workspaceDir = getTeamWorkspaceDir(username, existingMeta.teamId);
          if (!existsSync(workspaceDir)) {
            mkdirSync(workspaceDir, { recursive: true });
          }
        }

        const { authStorage, modelRegistry } = userConfigManager.getUserContext(username);

        const { agentDef } = await resolveAgentDefinition({
          username,
          resolvedAgentId,
          getDefaultModel: () => userConfigManager.getUserDefaultModel(username),
        });

        let resourceLoader: DefaultResourceLoader;
        if (overrides?.resourceLoader) {
          resourceLoader = overrides.resourceLoader;
        } else {
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

          resourceLoader = new DefaultResourceLoader({
            cwd: workspaceDir,
            agentDir: getUserDir(username),
            additionalSkillPaths: skillPaths,
            appendSystemPrompt: appendPrompts,
          });
          await resourceLoader.reload();
        }

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

        const userSettings = userConfigManager.getUserSettings(username);
        const memoryEnabled = overrides?.skipMemory ? false : (userSettings.memoryEnabled ?? true);
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
          contextAgentId: resolvedAgentId,
        });

        let finalCustomTools = customTools;
        if (overrides?.customTools) {
          const overrideNames = new Set(overrides.customTools.map(t => t.name));
          finalCustomTools = [
            ...overrides.customTools,
            ...customTools.filter(t => !overrideNames.has(t.name))
          ];
        }

        let customToolNames: string[] = [];
        try {
          const { customToolStorage } = await import("./custom-tools/storage");
          const all = customToolStorage.loadAll(username);
          const resolvedNames = resolvedAgentId
            ? new Set(require("./scope").scopeConfigManager.resolveToolsForAgent(username, resolvedAgentId))
            : null;
          customToolNames = all
            .filter((d: any) => d.enabled !== false && (resolvedNames === null || resolvedNames.has(d.name)))
            .map((d: any) => d.name);
        } catch (e) {
          console.error("[SessionManager] Failed to load custom tool names:", e);
        }

        const isSubagent = sessionId.startsWith(SessionPrefix.SUBAGENT) || sessionId.startsWith(SessionPrefix.DELEGATE);
        const beforeToolCall = createBeforeToolCallHook({
          sessionId,
          isSubagent,
          parentSessionId: existingMeta ? (existingMeta as any).parentSessionId : undefined,
          username,
          executionMode: existingMeta ? (existingMeta as any).executionMode : undefined,
        });

        const { session } = await createAgentSession({
          cwd: workspaceDir,
          sessionManager,
          authStorage,
          modelRegistry,
          resourceLoader,
          customTools: finalCustomTools,
          beforeToolCall,
        });

        const context = sessionManager.buildSessionContext();
        if (!context.model) {
          let resolvedModel: any = undefined;
          if (agentDef?.model) {
            const available = modelRegistry.getAvailable();
            resolvedModel = available.find(
              (m) => m.id === agentDef.model || `${m.provider}/${m.id}` === agentDef.model
            );
          }
          if (!resolvedModel) {
            const defaultModelId = userConfigManager.getUserDefaultModel(username);
            if (defaultModelId) {
              const available = modelRegistry.getAvailable();
              resolvedModel = available.find(
                (m) => m.id === defaultModelId || `${m.provider}/${m.id}` === defaultModelId
              );
            }
          }
          if (resolvedModel) {
            try {
              await session.setModel(resolvedModel);
              console.log(`[SessionManager:${sessionId}] Initialized session model: ${resolvedModel.provider}/${resolvedModel.id}`);
            } catch (e) {
              console.error(`[SessionManager:${sessionId}] Failed to set initial model:`, e);
            }
          }
        } else {
          const found = modelRegistry.find(context.model.provider, context.model.modelId);
          if (found) {
            session.model = found;
          } else {
            let resolvedModel: any = undefined;
            if (agentDef?.model) {
              const available = modelRegistry.getAvailable();
              resolvedModel = available.find(
                (m) => m.id === agentDef.model || `${m.provider}/${m.id}` === agentDef.model
              );
            }
            if (!resolvedModel) {
              const defaultModelId = userConfigManager.getUserDefaultModel(username);
              if (defaultModelId) {
                const available = modelRegistry.getAvailable();
                resolvedModel = available.find(
                  (m) => m.id === defaultModelId || `${m.provider}/${m.id}` === defaultModelId
                );
              }
            }
            if (resolvedModel) {
              session.model = resolvedModel;
            }
          }
        }

        const systemTools = sessionMetadataStore.getSessionTools(username, sessionId);
        const combinedTools = resolveActiveTools({
          sessionTools: systemTools,
          persistedTools,
          hasExaKey,
          memoryEnabled,
          resolvedAgentId,
          customToolNames,
        });

        let finalTools = combinedTools;
        if (isSubagent) {
          const effectiveRules = buildSubagentRules(
            username,
            sessionId,
            existingMeta ? (existingMeta as any).parentSessionId : undefined,
            existingMeta ? (existingMeta as any).subagentType : undefined
          );
          finalTools = combinedTools.filter(toolName => {
            const verdict = evaluateSubagentRules(toolName, {}, effectiveRules);
            return !(verdict && verdict.allow === false);
          });
        }

        session.setActiveToolsByName(finalTools);

        if (!overrides?.skipMemory) {
          enrichSessionWithMemory(session, memory);
        }

        if (!overrides?.skipMcpTools) {
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
        }

        const globalLogUnsub = subscribeSessionEvents({
          session,
          username,
          sessionId,
          metadataStore: sessionMetadataStore,
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

  async autoCleanupSessions(username: string): Promise<void> {
    const retentionDaysStr = process.env.CREWFACTORY_SESSION_RETENTION_DAYS;
    const maxCountStr = process.env.CREWFACTORY_SESSION_MAX_COUNT;
    if (!retentionDaysStr && !maxCountStr) return;

    try {
      const sessions = await this.listSessions(username, { archived: "true" });
      const activeSessions = await this.listSessions(username, { archived: "false" });
      const allSessions = [...sessions, ...activeSessions];
      
      const regularSessions = allSessions.filter(s => !s.isExecution);

      const toDelete = new Set<string>();

      if (retentionDaysStr) {
        const days = parseInt(retentionDaysStr, 10);
        if (!isNaN(days) && days > 0) {
          const cutOffTime = Date.now() - days * 24 * 60 * 60 * 1000;
          for (const s of regularSessions) {
            const updateTime = new Date(s.updatedAt).getTime();
            if (updateTime < cutOffTime) {
              toDelete.add(s.id);
            }
          }
        }
      }

      if (maxCountStr) {
        const maxCount = parseInt(maxCountStr, 10);
        if (!isNaN(maxCount) && maxCount > 0) {
          const sorted = [...regularSessions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          if (sorted.length > maxCount) {
            const extra = sorted.slice(maxCount);
            for (const s of extra) {
              toDelete.add(s.id);
            }
          }
        }
      }

      for (const sessionId of toDelete) {
        console.log(`[Auto Cleanup] Destroying session ${sessionId} for user ${username}`);
        await this.destroySession(username, sessionId).catch((err) => {
          console.error(`[Auto Cleanup] Failed to destroy session ${sessionId}:`, err);
        });
      }
    } catch (e) {
      console.error(`[Auto Cleanup] Failed for user ${username}:`, e);
    }
  }
}

export const sessionManager = new SessionManager();
