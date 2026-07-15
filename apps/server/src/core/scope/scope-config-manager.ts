import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  type AgentScopeTarget,
  getScopeConfigPath,
  getUserDir,
  CREWFACTORY_DATA_PATH,
  USERS_DIR
} from "shared";
import { type ToolScopeTarget } from "../custom-tools/schemas";

export interface ScopeConfig {
  version: number;
  global: {
    agents: string[];
    tools: string[];
  };
  channels: Record<string, {
    agents: string[];
    tools: string[];
  }>;
  projects: Record<string, {
    agents: string[];
    tools: string[];
  }>;
  agentTools: Record<string, string[]>;
}

export type AgentMembership =
  | { type: "global" }
  | { type: "channel"; id: string }
  | { type: "project"; id: string };

class ScopeConfigManager {
  private cache = new Map<string, ScopeConfig>();
  private locks = new Map<string, Promise<void>>();

  constructor() {}

  private async withLock<T>(username: string, fn: () => Promise<T>): Promise<T> {
    const current = this.locks.get(username) ?? Promise.resolve();
    let resolve!: () => void;
    const next = new Promise<void>(r => { resolve = r; });
    this.locks.set(username, next);

    await current;
    try {
      return await fn();
    } finally {
      resolve();
      if (this.locks.get(username) === next) {
        this.locks.delete(username);
      }
    }
  }

  private scanDiskAgentIds(username: string): string[] {
    const agentsDir = join(getUserDir(username), "agents");
    if (!existsSync(agentsDir)) return [];
    try {
      return readdirSync(agentsDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && existsSync(join(agentsDir, entry.name, "definition.json")))
        .map(entry => entry.name);
    } catch {
      return [];
    }
  }

  private scanDiskToolNames(username: string): string[] {
    const toolsDir = join(getUserDir(username), "custom-tools");
    if (!existsSync(toolsDir)) return [];
    try {
      return readdirSync(toolsDir, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith(".json") && entry.name !== "_index.json")
        .map(entry => entry.name.slice(0, -5));
    } catch {
      return [];
    }
  }

  private ensureLoaded(username: string): void {
    if (this.cache.has(username)) return;

    const path = getScopeConfigPath(username);
    if (!existsSync(path)) {
      const diskAgentIds = this.scanDiskAgentIds(username);
      const diskToolNames = this.scanDiskToolNames(username);

      const config: ScopeConfig = {
        version: 1,
        global: {
          agents: diskAgentIds,
          tools: diskToolNames,
        },
        channels: {},
        projects: {},
        agentTools: {},
      };

      try {
        const userDir = getUserDir(username);
        if (!existsSync(userDir)) {
          mkdirSync(userDir, { recursive: true });
        }
        writeFileSync(path, JSON.stringify(config, null, 2), "utf8");
      } catch (err) {
        console.error(`[ScopeConfigManager] Failed to write initial config for ${username}:`, err);
      }
      this.cache.set(username, config);
      return;
    }

    try {
      const content = readFileSync(path, "utf8");
      let config = JSON.parse(content);
      config = this.validate(username, config);
      this.cache.set(username, config);
    } catch (err) {
      console.error(`[ScopeConfigManager] Failed to read config for ${username}:`, err);
      const diskAgentIds = this.scanDiskAgentIds(username);
      const diskToolNames = this.scanDiskToolNames(username);
      const config: ScopeConfig = {
        version: 1,
        global: {
          agents: diskAgentIds,
          tools: diskToolNames,
        },
        channels: {},
        projects: {},
        agentTools: {},
      };
      this.cache.set(username, config);
    }
  }

  private validate(username: string, config: ScopeConfig): ScopeConfig {
    const diskAgentIds = new Set(this.scanDiskAgentIds(username));
    const diskToolNames = new Set(this.scanDiskToolNames(username));
    let dirty = false;

    if (!config.global) {
      config.global = { agents: [], tools: [] };
      dirty = true;
    }

    const oldGlobalAgentsLength = config.global.agents.length;
    config.global.agents = config.global.agents.filter(id => diskAgentIds.has(id));
    if (config.global.agents.length !== oldGlobalAgentsLength) dirty = true;

    if (config.channels) {
      for (const [channelId, chan] of Object.entries(config.channels)) {
        const oldLen = chan.agents.length;
        chan.agents = chan.agents.filter(id => diskAgentIds.has(id));
        if (chan.agents.length !== oldLen) dirty = true;
      }
    } else {
      config.channels = {};
      dirty = true;
    }

    if (config.projects) {
      for (const [projectId, proj] of Object.entries(config.projects)) {
        const oldLen = proj.agents.length;
        proj.agents = proj.agents.filter(id => diskAgentIds.has(id));
        if (proj.agents.length !== oldLen) dirty = true;
      }
    } else {
      config.projects = {};
      dirty = true;
    }

    const allConfigAgents = new Set<string>();
    config.global.agents.forEach(id => allConfigAgents.add(id));
    Object.values(config.channels).forEach(chan => chan.agents.forEach(id => allConfigAgents.add(id)));
    Object.values(config.projects).forEach(proj => proj.agents.forEach(id => allConfigAgents.add(id)));

    for (const agentId of diskAgentIds) {
      if (!allConfigAgents.has(agentId)) {
        config.global.agents.push(agentId);
        dirty = true;
        console.warn(`[ScopeConfigManager] Agent ${agentId} on disk was not in config. Automatically moved to global.`);
      }
    }

    if (config.global.tools) {
      const oldLen = config.global.tools.length;
      config.global.tools = config.global.tools.filter(t => diskToolNames.has(t));
      if (config.global.tools.length !== oldLen) dirty = true;
    } else {
      config.global.tools = [];
      dirty = true;
    }

    for (const chan of Object.values(config.channels)) {
      if (chan.tools) {
        const oldLen = chan.tools.length;
        chan.tools = chan.tools.filter(t => diskToolNames.has(t));
        if (chan.tools.length !== oldLen) dirty = true;
      } else {
        chan.tools = [];
        dirty = true;
      }
    }

    for (const proj of Object.values(config.projects)) {
      if (proj.tools) {
        const oldLen = proj.tools.length;
        proj.tools = proj.tools.filter(t => diskToolNames.has(t));
        if (proj.tools.length !== oldLen) dirty = true;
      } else {
        proj.tools = [];
        dirty = true;
      }
    }

    if (!config.agentTools) {
      config.agentTools = {};
      dirty = true;
    } else {
      for (const [agentId, tools] of Object.entries(config.agentTools)) {
        if (!diskAgentIds.has(agentId)) {
          delete config.agentTools[agentId];
          dirty = true;
        } else {
          const oldLen = tools.length;
          const cleaned = tools.filter(t => diskToolNames.has(t));
          if (cleaned.length !== oldLen) {
            config.agentTools[agentId] = cleaned;
            dirty = true;
          }
        }
      }
    }

    if (dirty) {
      try {
        const path = getScopeConfigPath(username);
        writeFileSync(path, JSON.stringify(config, null, 2), "utf8");
      } catch (err) {
        console.error(`[ScopeConfigManager] Failed to auto-repair config for ${username}:`, err);
      }
    }

    return config;
  }

  private persist(username: string, config: ScopeConfig): void {
    const path = getScopeConfigPath(username);
    const tmp = `${path}.tmp`;
    try {
      writeFileSync(tmp, JSON.stringify(config, null, 2), "utf8");
      const { renameSync, unlinkSync } = require("node:fs");
      try {
        renameSync(tmp, path);
      } catch (err) {
        writeFileSync(path, JSON.stringify(config, null, 2), "utf8");
        try { unlinkSync(tmp); } catch {}
      }
    } catch (err) {
      console.error(`[ScopeConfigManager] Failed to persist config for ${username}:`, err);
      writeFileSync(path, JSON.stringify(config, null, 2), "utf8");
    }
    this.cache.set(username, config);
  }

  // ── Queries ──

  getGlobalAgentIds(username: string): string[] {
    this.ensureLoaded(username);
    return this.cache.get(username)?.global.agents ?? [];
  }

  getScopedAgentIds(username: string, parentType: "channels" | "projects", parentId: string): string[] {
    this.ensureLoaded(username);
    const config = this.cache.get(username);
    if (!config) return [];
    if (parentType === "channels") {
      return config.channels[parentId]?.agents ?? [];
    } else {
      return config.projects[parentId]?.agents ?? [];
    }
  }

  getAgentMembership(username: string, agentId: string): AgentMembership | null {
    this.ensureLoaded(username);
    const config = this.cache.get(username);
    if (!config) return null;

    if (config.global.agents.includes(agentId)) {
      return { type: "global" };
    }

    for (const [channelId, chan] of Object.entries(config.channels)) {
      if (chan.agents.includes(agentId)) {
        return { type: "channel", id: channelId };
      }
    }

    for (const [projectId, proj] of Object.entries(config.projects)) {
      if (proj.agents.includes(agentId)) {
        return { type: "project", id: projectId };
      }
    }

    return null;
  }

  resolveToolsForAgent(username: string, agentId: string): string[] {
    this.ensureLoaded(username);
    const config = this.cache.get(username);
    if (!config) return [];

    const tools = new Set<string>(config.global.tools);

    const membership = this.getAgentMembership(username, agentId);
    if (membership) {
      if (membership.type === "channel") {
        const chan = config.channels[membership.id];
        if (chan && chan.tools) {
          chan.tools.forEach(t => tools.add(t));
        }
      } else if (membership.type === "project") {
        const proj = config.projects[membership.id];
        if (proj && proj.tools) {
          proj.tools.forEach(t => tools.add(t));
        }
      }
    }

    const agentSpecific = config.agentTools[agentId];
    if (agentSpecific) {
      agentSpecific.forEach(t => tools.add(t));
    }

    return Array.from(tools);
  }

  async load(username: string): Promise<ScopeConfig> {
    this.ensureLoaded(username);
    return this.cache.get(username)!;
  }

  // ── Mutations ──

  async registerAgent(username: string, agentId: string, scope?: AgentScopeTarget): Promise<void> {
    await this.withLock(username, async () => {
      const config = await this.load(username);

      config.global.agents = config.global.agents.filter(id => id !== agentId);
      for (const cid of Object.keys(config.channels)) {
        config.channels[cid].agents = config.channels[cid].agents.filter(id => id !== agentId);
      }
      for (const pid of Object.keys(config.projects)) {
        config.projects[pid].agents = config.projects[pid].agents.filter(id => id !== agentId);
      }

      if (!scope || scope.type === "global") {
        if (!config.global.agents.includes(agentId)) {
          config.global.agents.push(agentId);
        }
      } else if (scope.type === "channel") {
        if (!config.channels[scope.id]) {
          config.channels[scope.id] = { agents: [], tools: [] };
        }
        if (!config.channels[scope.id].agents.includes(agentId)) {
          config.channels[scope.id].agents.push(agentId);
        }
      } else if (scope.type === "project") {
        if (!config.projects[scope.id]) {
          config.projects[scope.id] = { agents: [], tools: [] };
        }
        if (!config.projects[scope.id].agents.includes(agentId)) {
          config.projects[scope.id].agents.push(agentId);
        }
      }

      this.persist(username, config);
    });
  }

  async setAgentScope(username: string, agentId: string, scope: AgentScopeTarget): Promise<void> {
    await this.registerAgent(username, agentId, scope);
  }

  async setScopeTools(username: string, target: ToolScopeTarget, tools: string[]): Promise<void> {
    await this.withLock(username, async () => {
      const config = await this.load(username);

      if (target.type === "global") {
        config.global.tools = tools;
      } else if (target.type === "channel") {
        if (!config.channels[target.id]) {
          config.channels[target.id] = { agents: [], tools: [] };
        }
        config.channels[target.id].tools = tools;
      } else if (target.type === "project") {
        if (!config.projects[target.id]) {
          config.projects[target.id] = { agents: [], tools: [] };
        }
        config.projects[target.id].tools = tools;
      } else if (target.type === "agent") {
        config.agentTools[target.id] = tools;
      }

      this.persist(username, config);
    });
  }

  async removeChannelScope(username: string, channelId: string): Promise<void> {
    await this.withLock(username, async () => {
      const config = await this.load(username);
      const entry = config.channels[channelId];
      if (entry) {
        for (const agentId of entry.agents) {
          if (!config.global.agents.includes(agentId)) {
            config.global.agents.push(agentId);
          }
        }
        delete config.channels[channelId];
        this.persist(username, config);
      }
    });
  }

  async removeProjectScope(username: string, projectId: string): Promise<void> {
    await this.withLock(username, async () => {
      const config = await this.load(username);
      const entry = config.projects[projectId];
      if (entry) {
        for (const agentId of entry.agents) {
          if (!config.global.agents.includes(agentId)) {
            config.global.agents.push(agentId);
          }
        }
        delete config.projects[projectId];
        this.persist(username, config);
      }
    });
  }

  async removeAgentFromScope(username: string, agentId: string): Promise<void> {
    await this.withLock(username, async () => {
      const config = await this.load(username);

      config.global.agents = config.global.agents.filter(id => id !== agentId);

      for (const channelId of Object.keys(config.channels)) {
        config.channels[channelId].agents = config.channels[channelId].agents.filter(id => id !== agentId);
      }

      for (const projectId of Object.keys(config.projects)) {
        config.projects[projectId].agents = config.projects[projectId].agents.filter(id => id !== agentId);
      }

      delete config.agentTools[agentId];

      this.persist(username, config);
    });
  }

  async init(): Promise<void> {
    const usersParentDir = join(CREWFACTORY_DATA_PATH(), USERS_DIR);
    if (!existsSync(usersParentDir)) return;
    try {
      const userDirs = readdirSync(usersParentDir, { withFileTypes: true });
      for (const userDir of userDirs) {
        if (userDir.isDirectory()) {
          const username = userDir.name;
          await this.load(username);
        }
      }
    } catch (err) {
      console.error("[ScopeConfigManager] Error scanning users during init:", err);
    }
  }
}

export const scopeConfigManager = new ScopeConfigManager();

process.nextTick(() => {
  scopeConfigManager.init().catch((err) =>
    console.error("[ScopeConfigManager] Init error:", err)
  );
});
