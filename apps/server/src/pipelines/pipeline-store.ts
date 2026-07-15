import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  getPipelinesDir,
  getPipelineDir,
  getPipelineRunsDir,
  getPipelineRunDir,
  type PipelineDefinition,
  type PipelineRun
} from "shared";

export class PipelineStore {
  static ensurePipelineDirs(username: string, pipelineId: string): void {
    const pipelinesDir = getPipelinesDir(username);
    if (!existsSync(pipelinesDir)) {
      mkdirSync(pipelinesDir, { recursive: true });
    }
    const pipelineDir = getPipelineDir(username, pipelineId);
    if (!existsSync(pipelineDir)) {
      mkdirSync(pipelineDir, { recursive: true });
    }
    const scriptsDir = join(pipelineDir, "scripts");
    if (!existsSync(scriptsDir)) {
      mkdirSync(scriptsDir, { recursive: true });
    }
    const runsDir = getPipelineRunsDir(username, pipelineId);
    if (!existsSync(runsDir)) {
      mkdirSync(runsDir, { recursive: true });
    }
  }

  static ensureRunDirs(username: string, pipelineId: string, runId: string): void {
    this.ensurePipelineDirs(username, pipelineId);
    const runDir = getPipelineRunDir(username, pipelineId, runId);
    if (!existsSync(runDir)) {
      mkdirSync(runDir, { recursive: true });
    }
    const artifactsDir = join(runDir, "artifacts");
    if (!existsSync(artifactsDir)) {
      mkdirSync(artifactsDir, { recursive: true });
    }
  }

  static async savePipeline(username: string, pipeline: PipelineDefinition): Promise<void> {
    this.ensurePipelineDirs(username, pipeline.id);
    const filePath = join(getPipelineDir(username, pipeline.id), "definition.json");
    writeFileSync(filePath, JSON.stringify(pipeline, null, 2), "utf-8");
  }

  static async getPipeline(username: string, pipelineId: string): Promise<PipelineDefinition | null> {
    const filePath = join(getPipelineDir(username, pipelineId), "definition.json");
    if (!existsSync(filePath)) return null;
    try {
      const data = readFileSync(filePath, "utf-8");
      return JSON.parse(data) as PipelineDefinition;
    } catch (e) {
      console.error(`Failed to read pipeline ${pipelineId}:`, e);
      return null;
    }
  }

  static async listPipelines(username: string): Promise<PipelineDefinition[]> {
    const dir = getPipelinesDir(username);
    if (!existsSync(dir)) return [];
    try {
      const subdirs = readdirSync(dir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      const list: PipelineDefinition[] = [];
      for (const id of subdirs) {
        const pipe = await this.getPipeline(username, id);
        if (pipe) list.push(pipe);
      }
      return list.sort((a, b) => {
        const dateA = a.createdAt || "";
        const dateB = b.createdAt || "";
        return dateB.localeCompare(dateA);
      });
    } catch (e) {
      console.error("Failed to list pipelines:", e);
      return [];
    }
  }

  static async deletePipeline(username: string, pipelineId: string): Promise<void> {
    const dir = getPipelineDir(username, pipelineId);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  static async saveRun(username: string, pipelineId: string, run: PipelineRun): Promise<void> {
    this.ensureRunDirs(username, pipelineId, run.id);
    const filePath = join(getPipelineRunDir(username, pipelineId, run.id), "run.json");
    writeFileSync(filePath, JSON.stringify(run, null, 2), "utf-8");
  }

  static async getRun(username: string, pipelineId: string, runId: string): Promise<PipelineRun | null> {
    const filePath = join(getPipelineRunDir(username, pipelineId, runId), "run.json");
    if (!existsSync(filePath)) return null;
    try {
      const data = readFileSync(filePath, "utf-8");
      return JSON.parse(data) as PipelineRun;
    } catch (e) {
      console.error(`Failed to read pipeline run ${runId} for pipeline ${pipelineId}:`, e);
      return null;
    }
  }

  static async listRuns(username: string, pipelineId: string): Promise<PipelineRun[]> {
    const dir = getPipelineRunsDir(username, pipelineId);
    if (!existsSync(dir)) return [];
    try {
      const subdirs = readdirSync(dir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      const runs: PipelineRun[] = [];
      for (const runId of subdirs) {
        const run = await this.getRun(username, pipelineId, runId);
        if (run) runs.push(run);
      }
      return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    } catch (e) {
      console.error(`Failed to list runs for pipeline ${pipelineId}:`, e);
      return [];
    }
  }

  static async saveScript(username: string, pipelineId: string, scriptName: string, content: string): Promise<void> {
    this.ensurePipelineDirs(username, pipelineId);
    const scriptsDir = join(getPipelineDir(username, pipelineId), "scripts");
    const filePath = join(scriptsDir, scriptName);
    writeFileSync(filePath, content, "utf-8");
  }

  static async getScript(username: string, pipelineId: string, scriptName: string): Promise<string | null> {
    const filePath = join(getPipelineDir(username, pipelineId), "scripts", scriptName);
    if (!existsSync(filePath)) return null;
    try {
      return readFileSync(filePath, "utf-8");
    } catch (e) {
      console.error(`Failed to read script ${scriptName} for pipeline ${pipelineId}:`, e);
      return null;
    }
  }

  static async listScripts(username: string, pipelineId: string): Promise<string[]> {
    const scriptsDir = join(getPipelineDir(username, pipelineId), "scripts");
    if (!existsSync(scriptsDir)) return [];
    try {
      return readdirSync(scriptsDir).filter((f) => !statSync(join(scriptsDir, f)).isDirectory());
    } catch (e) {
      console.error(`Failed to list scripts for pipeline ${pipelineId}:`, e);
      return [];
    }
  }
}
