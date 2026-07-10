import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  getUserDir,
  getSessionsDir,
  getProjectsDir,
  getProjectDir,
  getAgentDir,
  getChannelMessagesPath,
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
  experimentId?: string;
  isExecution?: boolean;
};

export interface SessionListerDeps {
  isSessionActive: (sessionId: string) => "active" | "streaming" | "sleeping";
  ensureUserDir: (username: string) => string;
}

export class SessionLister {
  async listSessions(username: string, deps: SessionListerDeps): Promise<SessionListItem[]> {
    const userDir = deps.ensureUserDir(username);
    const sessionsDir = getSessionsDir(username);
    if (!existsSync(sessionsDir)) return [];

    try {
      const entries = await readdir(sessionsDir, { withFileTypes: true });
      const sessionPromises = entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("plan_") && !entry.name.startsWith(SessionPrefix.SUBAGENT))
        .map(async (entry) => {
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
              } catch { }
            }
          } catch { }

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
            experimentId: metadata.experimentId as string | undefined,
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

      // 3. Channel Executions (CLI)
      try {
        const { channelStore } = await import("../../channels");
        const channelsList = channelStore.listChannels(username);
        for (const channel of channelsList) {
          const msgsPath = getChannelMessagesPath(username, channel.id);
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
                    const ent = channelSessions.get(sId)!;
                    ent.lastMsgTime = time;
                    if (!ent.firstPrompt && parsed.role === "user" && text) {
                      ent.firstPrompt = text;
                    }
                  } else {
                    channelSessions.set(sId, {
                      firstMsgTime: time,
                      lastMsgTime: time,
                      firstPrompt: parsed.role === "user" ? text : "",
                    });
                  }
                }
              } catch { }
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
                isExecution: true,
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
}

export const sessionLister = new SessionLister();
