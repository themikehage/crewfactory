import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  getUserDir,
  getSessionsDir,
  getProjectsDir,
  getProjectDir,
  getAgentDir,
  SessionPrefix,
} from "shared";

export type SessionListItem = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  status?: "active" | "streaming" | "task-running" | "sleeping";
  projectName?: string;
  agentId?: string;
  channelId?: string;
  teamId?: string;
  experimentId?: string;
  isExecution?: boolean;
  totalTokens?: number;
  toolCallCount?: number;
  durationMs?: number;
  modelId?: string;
  errorCount?: number;
  executionId?: string;
  turnCount?: number;
  schedulingMode?: string;
  archived?: boolean;
};

export interface SessionListQuery {
  search?: string;
  agentId?: string;
  channelId?: string;
  teamId?: string;
  projectName?: string;
  status?: string;
  from?: string;
  to?: string;
  sortBy?: string;
  sortDir?: string;
  isExecution?: boolean;
  archived?: boolean | string;
}

export interface SessionListerDeps {
  isSessionActive: (sessionId: string) => "active" | "streaming" | "sleeping";
  ensureUserDir: (username: string) => string;
}

export class SessionLister {
  async listSessions(username: string, deps: SessionListerDeps, query?: SessionListQuery): Promise<SessionListItem[]> {
    const userDir = deps.ensureUserDir(username);
    const sessionsDir = getSessionsDir(username);
    if (!existsSync(sessionsDir)) return [];

    try {
      const entries = await readdir(sessionsDir, { withFileTypes: true });
      const sessionPromises = entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("plan_") && !entry.name.startsWith(SessionPrefix.SUBAGENT) && !entry.name.startsWith(SessionPrefix.LAB))
        .map(async (entry): Promise<SessionListItem> => {
          const sessionId = entry.name;
          const sessionSubdir = join(sessionsDir, sessionId);
          const metadataPath = join(sessionSubdir, "metadata.json");

          let metadata: Record<string, unknown> = {};
          if (existsSync(metadataPath)) {
            try {
              const metaContent = await readFile(metadataPath, "utf-8");
              metadata = JSON.parse(metaContent);
            } catch { }
          }

          let messageCount = typeof metadata.messageCount === "number" ? metadata.messageCount : -1;
          if (messageCount === -1) {
            messageCount = 0;
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
                } catch { }
              }
            } catch { }
          }

          const status = deps.isSessionActive(sessionId);

          return {
            id: sessionId,
            name: (metadata.name as string) || sessionId,
            createdAt: (metadata.createdAt as string) || new Date(0).toISOString(),
            updatedAt: (metadata.updatedAt as string) || new Date(0).toISOString(),
            messageCount,
            status,
            projectName: metadata.projectName as string | undefined,
            agentId: metadata.agentId as string | undefined,
            channelId: metadata.channelId as string | undefined,
            teamId: metadata.teamId as string | undefined,
            experimentId: metadata.experimentId as string | undefined,
            totalTokens: typeof metadata.totalTokens === "number" ? metadata.totalTokens : undefined,
            toolCallCount: typeof metadata.toolCallCount === "number" ? metadata.toolCallCount : undefined,
            durationMs: typeof metadata.durationMs === "number" ? metadata.durationMs : undefined,
            modelId: typeof metadata.modelId === "string" ? metadata.modelId : undefined,
            errorCount: typeof metadata.errorCount === "number" ? metadata.errorCount : undefined,
            executionId: typeof metadata.executionId === "string" ? metadata.executionId : undefined,
            turnCount: typeof metadata.turnCount === "number" ? metadata.turnCount : undefined,
            schedulingMode: typeof metadata.schedulingMode === "string" ? metadata.schedulingMode : undefined,
            archived: metadata.archived === true,
          };
        });

      const userSessions = await Promise.all(sessionPromises);
      const virtualSessions: SessionListItem[] = [];

      // 1. Agent Executions
      try {
        const { agentRegistry } = await import("../../agents");
        const agentsList = agentRegistry.list(username);
        for (const agent of agentsList) {
          const execsDir = join(getAgentDir(username, agent.id), "executions");
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
                    isExecution: true,
                    durationMs: typeof summary.durationMs === "number" ? summary.durationMs : undefined,
                    errorCount: Array.isArray(summary.errors) ? summary.errors.length : 0,
                    executionId: f,
                    turnCount: 0,
                    archived: false,
                  });
                }
              } catch { }
            }
          }
        }
      } catch (e) {
        console.error("Failed to list virtual agent sessions:", e);
      }

      // 2. Project Executions
      try {
        const projectsDir = getProjectsDir(username);
        if (existsSync(projectsDir)) {
          const projectFolders = readdirSync(projectsDir, { withFileTypes: true });
          for (const entry of projectFolders) {
            if (entry.isDirectory()) {
              const execsDir = join(getProjectDir(username, entry.name), "executions");
              if (existsSync(execsDir)) {
                const execFolders = readdirSync(execsDir);
                for (const f of execFolders) {
                  try {
                    const summaryPath = join(execsDir, f, "summary.json");
                    if (existsSync(summaryPath)) {
                      const summary = JSON.parse(readFileSync(summaryPath, "utf-8"));
                      virtualSessions.push({
                        id: `exec_project_${entry.name}_${f}`,
                        name: `API: ${summary.prompt ? summary.prompt.slice(0, 30) + (summary.prompt.length > 30 ? "..." : "") : f}`,
                        createdAt: summary.createdAt || new Date().toISOString(),
                        updatedAt: summary.createdAt || new Date().toISOString(),
                        messageCount: 0,
                        status: "sleeping",
                        projectName: entry.name,
                        isExecution: true,
                        durationMs: typeof summary.durationMs === "number" ? summary.durationMs : undefined,
                        errorCount: Array.isArray(summary.errors) ? summary.errors.length : 0,
                        executionId: f,
                        turnCount: 0,
                        archived: false,
                      });
                    }
                  } catch { }
                }
              }
            }
          }
        }
      } catch (e) {
        console.error("Failed to list virtual project sessions:", e);
      }

      let filtered = [...userSessions, ...virtualSessions];

      const showArchived = query?.archived === "true" || query?.archived === true;
      filtered = filtered.filter((s) => {
        const isArchived = s.archived === true;
        return showArchived ? isArchived : !isArchived;
      });

      if (query) {
        if (query.search) {
          const term = query.search.toLowerCase();
          filtered = filtered.filter((s) => s.name?.toLowerCase().includes(term));
        }

        if (query.agentId) {
          filtered = filtered.filter((s) => s.agentId === query.agentId);
        }



        if (query.teamId) {
          filtered = filtered.filter((s) => s.teamId === query.teamId);
        }

        if (query.projectName) {
          filtered = filtered.filter((s) => s.projectName === query.projectName);
        }

        if (query.status) {
          filtered = filtered.filter((s) => s.status === query.status);
        }

        if (query.from) {
          const fromTime = new Date(query.from).getTime();
          filtered = filtered.filter((s) => new Date(s.updatedAt).getTime() >= fromTime);
        }

        if (query.to) {
          const toTime = new Date(query.to).getTime();
          filtered = filtered.filter((s) => new Date(s.updatedAt).getTime() <= toTime);
        }

        if (query.isExecution !== undefined) {
          filtered = filtered.filter((s) => !!s.isExecution === !!query.isExecution);
        }

        const sortBy = query.sortBy || "updatedAt";
        const sortDir = query.sortDir === "asc" ? 1 : -1;

        filtered.sort((a: any, b: any) => {
          const valA = a[sortBy];
          const valB = b[sortBy];

          if (sortBy === "updatedAt" || sortBy === "createdAt") {
            const timeA = valA ? new Date(valA).getTime() : 0;
            const timeB = valB ? new Date(valB).getTime() : 0;
            return (timeA - timeB) * sortDir;
          }

          if (typeof valA === "string" && typeof valB === "string") {
            return valA.localeCompare(valB) * sortDir;
          }

          if (typeof valA === "number" && typeof valB === "number") {
            return (valA - valB) * sortDir;
          }

          return 0;
        });
      } else {
        filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      }

      return filtered;
    } catch (e) {
      console.error(`Failed to list sessions for ${username}:`, e);
      return [];
    }
  }
}

export const sessionLister = new SessionLister();
