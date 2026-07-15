import {
  createAgentSession,
  SessionManager as VendoredSessionManager,
  DefaultResourceLoader,
  type AgentSession,
  type AgentSessionEvent,
} from "../ai";
import { existsSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  getUserDir,
  getSessionDir,
  getMemoryDbPath,
} from "shared";
import { mcpRegistry } from "./mcp-registry";
import { memoryRegistry } from "./memory/registry";
import { userConfigManager } from "./session/user-config";
import { sessionMetadataStore } from "./session/metadata-store";
import { sessionPromptBuilder } from "./session/prompt-builder";
import { sessionToolFactory } from "./session/tool-factory";
import { sessionLister, type SessionListItem } from "./session/session-lister";

import {
  getResolvedSkillPaths,
  ensureWorkspaceSubdirs,
  ensureWorkspaceStructure,
  resolveSessionWorkspace,
} from "./session/workspace-resolver";
import { resolveAgentDefinition } from "./session/agent-definition-resolver";
import { resolveActiveTools } from "./session/tool-activation-engine";
import { subscribeSessionEvents } from "./session/session-event-publisher";
import { createBeforeToolCallHook } from "./session/before-tool-call-hook";
import { enrichSessionWithMemory } from "./session/session-memory-enricher";

export {
  getResolvedSkillPaths,
  ensureWorkspaceSubdirs,
  ensureWorkspaceStructure,
};

interface UserSessionEntry {
  session: AgentSession;
  unsubscribe: () => void;
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
      ensureUserDir: (u) => userConfigManager.ensureUserDir(u),
      isSessionActive: (sId) => {
        const session = this.sessions.get(this.getSessionKey(username, sId));
        if (session) {
          return session.session.isStreaming ? "streaming" : "active";
        }
        return "sleeping";
      },
    });
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
    channelId?: string
  ): Promise<AgentSession> {
    const key = this.getSessionKey(username, sessionId);
    const existing = this.sessions.get(key);
    if (existing) return existing.session;

    const pending = this.pendingSessions.get(key);
    if (pending) return pending;

    const initPromise = (async () => {
      try {
        const { sessionDir, workspaceDir } = resolveSessionWorkspace(
          username,
          sessionId,
          projectName,
          agentId,
          channelId
        );

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

        const { authStorage, modelRegistry } = userConfigManager.getUserContext(username);

        const { agentDef } = await resolveAgentDefinition({
          username,
          resolvedAgentId,
          getDefaultModel: () => userConfigManager.getUserDefaultModel(username),
        });

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

        const userSettings = userConfigManager.getUserSettings(username);
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
          contextAgentId: resolvedAgentId,
        });

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

        const beforeToolCall = createBeforeToolCallHook({ sessionId });

        const { session } = await createAgentSession({
          cwd: workspaceDir,
          sessionManager,
          authStorage,
          modelRegistry,
          resourceLoader,
          customTools,
          beforeToolCall,
        });

        const systemTools = sessionMetadataStore.getSessionTools(username, sessionId);
        const combinedTools = resolveActiveTools({
          sessionTools: systemTools,
          persistedTools,
          hasExaKey,
          memoryEnabled,
          resolvedAgentId,
          customToolNames,
        });

        session.setActiveToolsByName(combinedTools);

        enrichSessionWithMemory(session, memory);

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
}

export const sessionManager = new SessionManager();
