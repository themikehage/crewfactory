import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { type LabExperiment, type LabBlueprint, LabBlueprintSchema, CREWFACTORY_DATA_PATH } from "shared";

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
}
