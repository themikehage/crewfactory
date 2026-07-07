import { createAgentServer } from "./create-agent-server";
import { type AgentDefinition, type AgentInfo, type AgentStatus, SessionPrefix } from "shared";
import type { AgentEntry } from "./types";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { channelOrchestrator } from "../channels/channel-orchestrator";

class AgentRegistry {
  private agents = new Map<string, AgentEntry>();

  constructor() {}

  private getBaseDir(username: string): string {
    return join("/tmp/crewfactory", username, "agents");
  }

  private getAgentDir(username: string, id: string): string {
    const dir = join(this.getBaseDir(username), id);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  async init(): Promise<void> {
    const parentDir = "/tmp/crewfactory";
    if (!existsSync(parentDir)) return;
    try {
      const userDirs = readdirSync(parentDir, { withFileTypes: true });
      for (const userDir of userDirs) {
        if (userDir.isDirectory()) {
          const username = userDir.name;
          const agentsDir = join(parentDir, username, "agents");
          if (existsSync(agentsDir)) {
            const entries = readdirSync(agentsDir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isDirectory()) {
                const defPath = join(agentsDir, entry.name, "definition.json");
                if (existsSync(defPath)) {
                  try {
                    const def: AgentDefinition = JSON.parse(readFileSync(defPath, "utf-8"));
                    if (!this.agents.has(def.id)) {
                      await this.register(username, def, false); // don't re-write file
                    }
                  } catch (err) {
                    console.error(`[AgentRegistry] Failed to load persisted agent ${entry.name} for ${username}:`, err);
                  }
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("[AgentRegistry] Error scanning agents during init:", err);
    }
  }

  async register(username: string, definition: AgentDefinition, saveToDisk = true): Promise<AgentEntry> {
    if (this.agents.has(definition.id)) {
      throw new Error(`Agent "${definition.id}" is already registered`);
    }

    const entry: AgentEntry = {
      username,
      server: null as any,
      status: "starting",
      createdAt: new Date().toISOString(),
    };
    this.agents.set(definition.id, entry);

    try {
      const server = await createAgentServer(definition, username);
      entry.server = server;
      entry.status = "idle";

      server.session.subscribe((event) => {
        if (event.type === "agent_start") entry.status = "streaming";
        if (event.type === "agent_end") entry.status = "idle";
      });

      if (saveToDisk) {
        const agentDir = this.getAgentDir(username, definition.id);
        writeFileSync(join(agentDir, "definition.json"), JSON.stringify(definition, null, 2), "utf-8");
      }

      return entry;
    } catch (err) {
      entry.status = "error";
      this.agents.delete(definition.id);
      throw err;
    }
  }

  get(id: string, username?: string): AgentEntry | undefined {
    const entry = this.agents.get(id);
    if (!entry) return undefined;
    if (username !== undefined && entry.username !== username) return undefined;
    return entry;
  }

  list(username: string): AgentInfo[] {
    const result: AgentInfo[] = [];
    for (const [id, entry] of this.agents) {
      if (entry.username === username && !id.startsWith(SessionPrefix.LAB)) {
        result.push({
          id,
          name: entry.server.definition.name,
          role: entry.server.definition.role,
          status: entry.status,
          port: entry.server.definition.port,
          createdAt: entry.createdAt,
          skills: entry.server.definition.skills,
          avatarUrl: entry.server.definition.avatarUrl,
          blueprintId: entry.server.definition.blueprintId,
        });
      }
    }
    return result;
  }

  getAvatarPath(username: string, id: string): string | null {
    const agentDir = this.getAgentDir(username, id);
    try {
      const files = readdirSync(agentDir);
      const avatarFile = files.find((f) => f.startsWith("avatar."));
      if (avatarFile) return join(agentDir, avatarFile);
    } catch {}
    return null;
  }

  setAvatarUrl(username: string, id: string, avatarUrl: string | null): void {
    const entry = this.agents.get(id);
    if (!entry || entry.username !== username) return;
    entry.server.definition.avatarUrl = avatarUrl || undefined;
    const agentDir = this.getAgentDir(username, id);
    const defPath = join(agentDir, "definition.json");
    writeFileSync(defPath, JSON.stringify(entry.server.definition, null, 2), "utf-8");
  }

  async stop(id: string, removeDisk = true): Promise<void> {
    const entry = this.agents.get(id);
    if (!entry) return;
    entry.status = "stopped";
    channelOrchestrator.removeAgentQueue(id);
    await entry.server.stop();
    this.agents.delete(id);

    if (removeDisk) {
      const agentDir = this.getAgentDir(entry.username, id);
      if (existsSync(agentDir)) {
        rmSync(agentDir, { recursive: true, force: true });
      }
    }
  }

  async update(username: string, id: string, updates: Partial<Omit<AgentDefinition, "id">>): Promise<AgentEntry> {
    const entry = this.agents.get(id);
    if (!entry || entry.username !== username) {
      throw new Error(`Agent "${id}" not found`);
    }

    const oldCreatedAt = entry.createdAt;
    const newDefinition = {
      ...entry.server.definition,
      ...updates,
    };

    // Stop active instance without removing disk
    await this.stop(id, false);

    // Save updated definition to disk and re-register
    const newEntry = await this.register(username, newDefinition, true);
    newEntry.createdAt = oldCreatedAt;

    return newEntry;
  }

  async stopAll(): Promise<void> {
    for (const id of [...this.agents.keys()]) {
      await this.stop(id, false);
    }
  }

  setStatus(id: string, status: AgentStatus): void {
    const entry = this.agents.get(id);
    if (entry) entry.status = status;
  }

  async reloadUserAgents(username: string): Promise<void> {
    for (const [id, entry] of this.agents.entries()) {
      if (entry.username === username) {
        await this.stop(id, false);
      }
    }
    const agentsDir = this.getBaseDir(username);
    if (existsSync(agentsDir)) {
      try {
        const entries = readdirSync(agentsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const defPath = join(agentsDir, entry.name, "definition.json");
            if (existsSync(defPath)) {
              try {
                const def = JSON.parse(readFileSync(defPath, "utf-8"));
                if (!this.agents.has(def.id)) {
                  await this.register(username, def, false);
                }
              } catch (err) {
                console.error(`[AgentRegistry] Failed to load agent ${entry.name}:`, err);
              }
            }
          }
        }
      } catch (err) {
        console.error(`[AgentRegistry] Failed to scan directory ${agentsDir}:`, err);
      }
    }
  }
}

export const agentRegistry = new AgentRegistry();
// Auto initialize persisted agents on startup
agentRegistry.init().catch((err) => console.error("[AgentRegistry] Init error:", err));
