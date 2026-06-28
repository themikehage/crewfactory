import { createAgentServer } from "./create-agent-server";
import type { AgentDefinition, AgentInfo, AgentStatus } from "shared";
import type { AgentEntry } from "./types";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

class AgentRegistry {
  private agents = new Map<string, AgentEntry>();
  private baseDir = "/tmp/pi-agents";

  constructor() {
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async init(): Promise<void> {
    if (!existsSync(this.baseDir)) return;
    const entries = readdirSync(this.baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const defPath = join(this.baseDir, entry.name, "definition.json");
        if (existsSync(defPath)) {
          try {
            const def: AgentDefinition = JSON.parse(readFileSync(defPath, "utf-8"));
            if (!this.agents.has(def.id)) {
              await this.register(def, false); // don't re-write file
            }
          } catch (err) {
            console.error(`[AgentRegistry] Failed to load persisted agent ${entry.name}:`, err);
          }
        }
      }
    }
  }

  async register(definition: AgentDefinition, saveToDisk = true): Promise<AgentEntry> {
    if (this.agents.has(definition.id)) {
      throw new Error(`Agent "${definition.id}" is already registered`);
    }

    const entry: AgentEntry = {
      server: null as any,
      status: "starting",
      createdAt: new Date().toISOString(),
    };
    this.agents.set(definition.id, entry);

    try {
      const server = await createAgentServer(definition);
      entry.server = server;
      entry.status = "idle";

      server.session.subscribe((event) => {
        if (event.type === "agent_start") entry.status = "streaming";
        if (event.type === "agent_end") entry.status = "idle";
      });

      if (saveToDisk) {
        const agentDir = join(this.baseDir, definition.id);
        if (!existsSync(agentDir)) mkdirSync(agentDir, { recursive: true });
        writeFileSync(join(agentDir, "definition.json"), JSON.stringify(definition, null, 2), "utf-8");
      }

      return entry;
    } catch (err) {
      entry.status = "error";
      this.agents.delete(definition.id);
      throw err;
    }
  }

  get(id: string): AgentEntry | undefined {
    return this.agents.get(id);
  }

  list(): AgentInfo[] {
    const result: AgentInfo[] = [];
    for (const [id, entry] of this.agents) {
      result.push({
        id,
        name: entry.server.definition.name,
        role: entry.server.definition.role,
        status: entry.status,
        port: entry.server.definition.port,
        createdAt: entry.createdAt,
      });
    }
    return result;
  }

  async stop(id: string, removeDisk = true): Promise<void> {
    const entry = this.agents.get(id);
    if (!entry) return;
    entry.status = "stopped";
    await entry.server.stop();
    this.agents.delete(id);

    if (removeDisk) {
      const agentDir = join(this.baseDir, id);
      if (existsSync(agentDir)) {
        rmSync(agentDir, { recursive: true, force: true });
      }
    }
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
}

export const agentRegistry = new AgentRegistry();
// Auto initialize persisted agents on startup
agentRegistry.init().catch((err) => console.error("[AgentRegistry] Init error:", err));
