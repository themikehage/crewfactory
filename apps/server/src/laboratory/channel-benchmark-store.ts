import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getChannelsDir, type ChannelBenchmarkRun } from "shared";

export interface RunSummary {
  runId: string;
  name?: string;
  status: "running" | "completed" | "failed";
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  winner?: "multi" | "single" | "tie";
  scores?: {
    multi: number;
    single: number;
  };
}

export class ChannelBenchmarkStore {
  private static getChannelBenchmarksDir(username: string, channelId: string): string {
    const dir = join(getChannelsDir(username), channelId, "benchmarks");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private static getRunsDir(username: string, channelId: string): string {
    const dir = join(this.getChannelBenchmarksDir(username, channelId), "runs");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private static getIndexPath(username: string, channelId: string): string {
    return join(this.getChannelBenchmarksDir(username, channelId), "_index.json");
  }

  private static readIndex(username: string, channelId: string): RunSummary[] {
    const path = this.getIndexPath(username, channelId);
    if (!existsSync(path)) return [];
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8"));
      return Array.isArray(parsed) ? parsed : (parsed.runs || []);
    } catch {
      return [];
    }
  }

  private static writeIndex(username: string, channelId: string, runs: RunSummary[]): void {
    const path = this.getIndexPath(username, channelId);
    writeFileSync(path, JSON.stringify({ runs }, null, 2), "utf-8");
  }

  static saveRun(username: string, channelId: string, run: ChannelBenchmarkRun): void {
    const runsDir = this.getRunsDir(username, channelId);
    const runPath = join(runsDir, `${run.runId}.json`);
    writeFileSync(runPath, JSON.stringify(run, null, 2), "utf-8");

    // Update index
    const runs = this.readIndex(username, channelId);
    const summary: RunSummary = {
      runId: run.runId,
      name: run.name,
      status: run.status,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      winner: run.judge.result?.winner,
      scores: run.judge.result?.scores,
    };

    const existingIndex = runs.findIndex((r) => r.runId === run.runId);
    if (existingIndex >= 0) {
      runs[existingIndex] = summary;
    } else {
      runs.unshift(summary);
    }
    this.writeIndex(username, channelId, runs);
  }

  static listRuns(username: string, channelId: string): RunSummary[] {
    const runs = this.readIndex(username, channelId);
    return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  static getRun(username: string, channelId: string, runId: string): ChannelBenchmarkRun | null {
    const runsDir = this.getRunsDir(username, channelId);
    const runPath = join(runsDir, `${runId}.json`);
    if (!existsSync(runPath)) return null;
    try {
      return JSON.parse(readFileSync(runPath, "utf-8")) as ChannelBenchmarkRun;
    } catch {
      return null;
    }
  }

  static deleteRun(username: string, channelId: string, runId: string): void {
    const runsDir = this.getRunsDir(username, channelId);
    const runPath = join(runsDir, `${runId}.json`);
    if (existsSync(runPath)) {
      rmSync(runPath, { force: true });
    }

    const runs = this.readIndex(username, channelId);
    const filtered = runs.filter((r) => r.runId !== runId);
    this.writeIndex(username, channelId, filtered);
  }

  static deleteAll(username: string, channelId: string): void {
    const dir = join(getChannelsDir(username), channelId, "benchmarks");
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
