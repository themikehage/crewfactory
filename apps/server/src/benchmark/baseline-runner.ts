import { sessionManager } from "../core/session-manager.js";
import { eventBroker } from "../lib/event-broker.js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface BaselineResult {
  runId: string;
  prompt: string;
  output: string;
  durationMs: number;
  tokensInput: number;
  tokensOutput: number;
  costEstimate: number;
  error?: string;
}

export interface AutomaticMetrics {
  runId: string;
  channel: {
    output: string;
    durationMs: number;
    tokensInput: number;
    tokensOutput: number;
    costEstimate: number;
    roundsCount: number;
  };
  baseline: BaselineResult;
}

import { CREWFACTORY_DATA_PATH } from "shared";

const BENCHMARKS_DIR = CREWFACTORY_DATA_PATH();

function getBenchDir(username: string, channelId: string): string {
  const dir = join(BENCHMARKS_DIR, username, "benchmarks", channelId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function listBenchmarkRuns(username: string, channelId: string): { runId: string; timestamp: string }[] {
  const historyDir = join(getBenchDir(username, channelId), "history");
  if (!existsSync(historyDir)) return [];
  const { readdirSync, statSync } = require("node:fs");
  return readdirSync(historyDir, { withFileTypes: true })
    .filter((d: any) => d.isDirectory())
    .map((d: any) => ({
      runId: d.name,
      timestamp: statSync(join(historyDir, d.name)).mtime.toISOString(),
    }))
    .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function getBenchmarkRun(username: string, channelId: string, runId: string): AutomaticMetrics | null {
  const path = join(getBenchDir(username, channelId), "history", runId, "metrics.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

export function saveJudgeResult(username: string, channelId: string, runId: string, result: { channel: any; baseline: any }): void {
  const dir = join(getBenchDir(username, channelId), "history", runId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "judge.json"), JSON.stringify(result, null, 2), "utf-8");
}

export function getJudgeResult(username: string, channelId: string, runId: string): any | null {
  const path = join(getBenchDir(username, channelId), "history", runId, "judge.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function saveMetrics(username: string, channelId: string, metrics: AutomaticMetrics): void {
  const dir = join(getBenchDir(username, channelId), "history", metrics.runId);
  mkdirSync(dir, { recursive: true });

  writeFileSync(join(dir, "metrics.json"), JSON.stringify(metrics, null, 2), "utf-8");
  writeFileSync(join(dir, "userPrompt.txt"), metrics.channel.output ? `Prompt:\n${metrics.baseline.prompt}` : metrics.baseline.prompt, "utf-8");
  writeFileSync(join(dir, "baselineOutput.txt"), metrics.baseline.output, "utf-8");

  const indexRaw = existsSync(join(getBenchDir(username, channelId), "history", "_index.json"))
    ? JSON.parse(readFileSync(join(getBenchDir(username, channelId), "history", "_index.json"), "utf-8"))
    : [];
  indexRaw.unshift({
    runId: metrics.runId,
    timestamp: new Date().toISOString(),
    promptPreview: metrics.baseline.prompt.slice(0, 120),
  });
  if (indexRaw.length > 50) indexRaw.length = 50;
  writeFileSync(join(getBenchDir(username, channelId), "history", "_index.json"), JSON.stringify(indexRaw, null, 2), "utf-8");
}

export async function runBaselineAndCompare(
  username: string,
  channelId: string,
  userMessage: string,
  baselineModelId: string,
  channelSessionId: string
): Promise<AutomaticMetrics> {
  const runId = `run_${Date.now()}`;
  const baselineStart = Date.now();

  eventBroker.publishEvent(username, {
    sourceType: "channel",
    sourceId: channelId,
    sourceName: channelId,
    eventType: "benchmark_start",
    detail: { runId },
  });

  let baselineOutput = "";
  let baselineError: string | undefined;

  const sessionId = `baseline_${runId}`;
  const session = await sessionManager.getOrCreateSession(username, sessionId);

  try {
    if (baselineModelId) {
      const { modelRegistry } = sessionManager.getUserContext(username);
      const available = modelRegistry.getAvailable();
      const found = available.find(
        (m: any) => m.id === baselineModelId || `${m.provider}/${m.id}` === baselineModelId
      );
      if (found) {
        await session.setModel(found);
      }
    }

    let streamBuffer = "";
    await session.prompt(userMessage, {
      onText: (text: string) => {
        streamBuffer += text;
        eventBroker.publishEvent(username, {
          sourceType: "channel",
          sourceId: channelId,
          sourceName: channelId,
          eventType: "benchmark_token",
          detail: { runId, token: text },
        });
      },
    } as any);

    const msgs = session.messages;
    const lastMsg = [...msgs].reverse().find((m: any) => m.role === "assistant") as any;
    if (lastMsg) {
      if (typeof lastMsg.content === "string") baselineOutput = lastMsg.content;
      else if (Array.isArray(lastMsg.content)) {
        baselineOutput = lastMsg.content.map((c: any) => c.text || "").join("\n");
      }
    }
    if (!baselineOutput && streamBuffer) {
      baselineOutput = streamBuffer;
    }
  } catch (err: any) {
    baselineError = err.message;
    baselineOutput = `Error: ${err.message}`;
    eventBroker.publishEvent(username, {
      sourceType: "channel",
      sourceId: channelId,
      sourceName: channelId,
      eventType: "benchmark_error",
      detail: { runId, error: err.message },
    });
  }

  const baselineDuration = Date.now() - baselineStart;
  const baselineStats = session.getSessionStats();
  const baselineTokensIn = baselineStats ? baselineStats.tokens.input : 0;
  const baselineTokensOut = baselineStats ? baselineStats.tokens.output : 0;

  try {
    await sessionManager.destroySession(username, sessionId);
  } catch {}

  const channelStats = channelSessionId ? await getChannelSessionStats(username, channelId, channelSessionId) : null;

  const metrics: AutomaticMetrics = {
    runId,
    channel: {
      output: "",
      durationMs: 0,
      tokensInput: channelStats?.tokensInput ?? 0,
      tokensOutput: channelStats?.tokensOutput ?? 0,
      costEstimate: ((channelStats?.tokensInput ?? 0) + (channelStats?.tokensOutput ?? 0)) * 0.000002,
      roundsCount: channelStats?.roundsCount ?? 0,
    },
    baseline: {
      runId,
      prompt: userMessage,
      output: baselineOutput,
      durationMs: baselineDuration,
      tokensInput: baselineTokensIn,
      tokensOutput: baselineTokensOut,
      costEstimate: (baselineTokensIn + baselineTokensOut) * 0.000002,
      error: baselineError,
    },
  };

  saveMetrics(username, channelId, metrics);

  eventBroker.publishEvent(username, {
    sourceType: "channel",
    sourceId: channelId,
    sourceName: channelId,
    eventType: "benchmark_complete",
    detail: { runId, metrics },
  });

  return metrics;
}

async function getChannelSessionStats(
  username: string,
  channelId: string,
  sessionId: string
): Promise<{ tokensInput: number; tokensOutput: number; roundsCount: number } | null> {
  try {
    let tokensInput = 0;
    let tokensOutput = 0;
    let roundsCount = 0;

    const { channelStore } = await import("../channels/index.js");
    const messages = channelStore.getMessages(username, channelId, 100, sessionId);
    for (const msg of messages) {
      if (msg.role === "agent") {
        tokensInput += (msg as any).tokensIn || 0;
        tokensOutput += (msg as any).tokensOut || 0;
      }
    }

    // Fallback: Query channel members from registry directly
    if (tokensInput === 0 && tokensOutput === 0) {
      try {
        const { agentRegistry } = await import("../agents/index.js");
        const channel = channelStore.getChannel(username, channelId);
        if (channel) {
          for (const member of channel.members) {
            try {
              const entry = agentRegistry.get(member.agentId);
              if (entry && entry.server && entry.server.session) {
                const stats = entry.server.session.getSessionStats();
                if (stats && stats.tokens) {
                  tokensInput += stats.tokens.input || 0;
                  tokensOutput += stats.tokens.output || 0;
                }
              }
            } catch {}
          }
        }
      } catch {}
    }

    return { tokensInput, tokensOutput, roundsCount };
  } catch {
    return null;
  }
}
