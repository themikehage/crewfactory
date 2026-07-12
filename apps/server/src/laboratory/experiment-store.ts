import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { type LabExperiment, type LabBlueprint, LabBlueprintSchema, CREWFACTORY_DATA_PATH, type AgentDefinition, type ChannelMember } from "shared";
import { sessionManager } from "../core/session-manager";

const BASE_DIR = CREWFACTORY_DATA_PATH();

export class ExperimentStore {
  static getExperimentsDir(username: string): string {
    const dir = join(BASE_DIR, username, "experiments");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  static getExperimentDir(username: string, experimentId: string): string {
    const dir = join(this.getExperimentsDir(username), experimentId);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  static async saveExperiment(username: string, experiment: LabExperiment): Promise<void> {
    const dir = this.getExperimentDir(username, experiment.id);
    const filePath = join(dir, "experiment.json");
    writeFileSync(filePath, JSON.stringify(experiment, null, 2), "utf-8");

    if (experiment.activeRunId) {
      const runsDir = join(dir, "runs");
      if (!existsSync(runsDir)) {
        mkdirSync(runsDir, { recursive: true });
      }
      writeFileSync(join(runsDir, `${experiment.activeRunId}.json`), JSON.stringify(experiment, null, 2), "utf-8");
    }
  }

  static getRunsDir(username: string, experimentId: string): string {
    const dir = join(this.getExperimentDir(username, experimentId), "runs");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  static async listRuns(username: string, experimentId: string): Promise<LabExperiment[]> {
    const dir = this.getRunsDir(username, experimentId);
    try {
      const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
      const runs: LabExperiment[] = [];
      for (const file of files) {
        const filePath = join(dir, file);
        const data = readFileSync(filePath, "utf-8");
        runs.push(JSON.parse(data) as LabExperiment);
      }
      return runs.sort((a, b) => (b.completedAt || b.startedAt || "").localeCompare(a.completedAt || a.startedAt || ""));
    } catch {
      return [];
    }
  }

  static async getRun(username: string, experimentId: string, runId: string): Promise<LabExperiment | null> {
    const filePath = join(this.getRunsDir(username, experimentId), `${runId}.json`);
    if (!existsSync(filePath)) return null;
    try {
      const data = readFileSync(filePath, "utf-8");
      return JSON.parse(data) as LabExperiment;
    } catch {
      return null;
    }
  }

  static async getExperiment(username: string, experimentId: string): Promise<LabExperiment | null> {
    const filePath = join(this.getExperimentsDir(username), experimentId, "experiment.json");
    if (!existsSync(filePath)) return null;
    try {
      const data = readFileSync(filePath, "utf-8");
      return JSON.parse(data) as LabExperiment;
    } catch {
      return null;
    }
  }

  static async listExperiments(username: string): Promise<LabExperiment[]> {
    const dir = this.getExperimentsDir(username);
    const subdirs = readdirSync(dir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    const experiments: LabExperiment[] = [];
    for (const id of subdirs) {
      const exp = await this.getExperiment(username, id);
      if (exp) experiments.push(exp);
    }
    return experiments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  static async deleteExperiment(username: string, experimentId: string): Promise<void> {
    const dir = join(this.getExperimentsDir(username), experimentId);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  static async listBlueprints(): Promise<LabBlueprint[]> {
    const blueprintsDir = join(__dirname, "blueprints");
    if (!existsSync(blueprintsDir)) return [];
    try {
      const files = readdirSync(blueprintsDir).filter((f) => f.endsWith(".json"));
      const blueprints: LabBlueprint[] = [];
      for (const file of files) {
        const filePath = join(blueprintsDir, file);
        const data = readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(data);
        const validated = LabBlueprintSchema.parse(parsed);
        blueprints.push(validated);
      }
      return blueprints;
    } catch (e) {
      console.error("[ExperimentStore] Failed to list blueprints:", e);
      return [];
    }
  }

  static async getBlueprint(blueprintId: string): Promise<LabBlueprint | null> {
    const blueprintsDir = join(__dirname, "blueprints");
    const filePath = join(blueprintsDir, `${blueprintId}.json`);
    if (!existsSync(filePath)) return null;
    try {
      const data = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(data);
      return LabBlueprintSchema.parse(parsed);
    } catch (e) {
      console.error(`[ExperimentStore] Failed to read blueprint ${blueprintId}:`, e);
      return null;
    }
  }

  static async exportVariant(
    username: string,
    experimentId: string,
    variantKey: "single" | "multiNoLeader" | "multiWithLeader",
    options?: { channelName?: string }
  ): Promise<any> {
    const experiment = await this.getExperiment(username, experimentId);
    if (!experiment) {
      throw new Error("Experiment not found");
    }
    if (experiment.status !== "completed") {
      throw new Error("Experiment is not completed");
    }

    const variant = experiment.variants[variantKey];
    if (!variant || !variant.agents || variant.agents.length === 0) {
      throw new Error(`Variant ${variantKey} not found or has no agents`);
    }

    const { agentRegistry } = await import("../agents");
    const { channelStore } = await import("../channels");

    const exportedAgents: { id: string; name: string; created: boolean }[] = [];

    // 1. Export agents
    for (const labAgent of variant.agents) {
      const existing = agentRegistry.get(labAgent.id, username);
      if (existing) {
        exportedAgents.push({
          id: labAgent.id,
          name: labAgent.name,
          created: false
        });
      } else {
        const definition: AgentDefinition = {
          id: labAgent.id,
          name: labAgent.name,
          role: labAgent.role,
          systemPrompt: labAgent.systemPrompt,
          model: labAgent.model || sessionManager.userConfig.getUserDefaultModel(username) || "",
          skills: [],
        };
        await agentRegistry.register(username, definition, true);
        exportedAgents.push({
          id: labAgent.id,
          name: labAgent.name,
          created: true
        });
      }
    }

    // 2. Export channel if multi
    if (variantKey === "single") {
      return {
        variantKey,
        agents: exportedAgents
      };
    }

    const defaultChannelName =
      options?.channelName ||
      (variantKey === "multiNoLeader"
        ? `${experiment.name} (Horizontal)`
        : `${experiment.name} (Jerárquico)`);

    const channel = channelStore.createChannel(username, {
      name: defaultChannelName,
      description: `Canal exportado del experimento: ${experiment.name}`,
      context: [
        {
          key: "TASK_CONTEXT",
          value: experiment.taskPrompt
        }
      ]
    });

    const members: ChannelMember[] = [];
    if (variantKey === "multiWithLeader") {
      const leader = variant.agents.find((a) => a.leader);
      const leaderId = leader?.id;
      for (const a of variant.agents) {
        if (a.leader) {
          members.push({
            agentId: a.id,
            replyMode: "user-only",
            role: "lead"
          });
        } else {
          members.push({
            agentId: a.id,
            replyMode: "targeted",
            targetAgentIds: leaderId ? [leaderId] : [],
            role: "member"
          });
        }
      }
    } else {
      for (const a of variant.agents) {
        members.push({
          agentId: a.id,
          replyMode: "broadcast",
          role: "member"
        });
      }
    }

    channelStore.updateMembers(username, channel.id, members);

    return {
      variantKey,
      channel: {
        id: channel.id,
        name: channel.name
      },
      agents: exportedAgents
    };
  }
}

