import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { getUsername } from "../lib/auth-helpers";
import { channelStore, channelOrchestrator, TaskLedger } from "../channels";
import { agentRegistry } from "../agents";
import { sessionManager } from "../core/session-manager";
import { runBenchmarkSuite } from "../benchmark/harness";
import { runOptimizationStep } from "../benchmark/optimizer";
import { runBaselineAndCompare, listBenchmarkRuns, getBenchmarkRun, saveJudgeResult } from "../benchmark/baseline-runner";
import { runJudge } from "../benchmark/llm-judge";
import { CreateChannelSchema, UpdateChannelSchema, AddMemberSchema, UpdateMemberSchema, getChannelBenchmarkReportPath, getChannelBenchmarkHistoryPath, getBenchmarkDir } from "shared";
import { eventBroker } from "../lib/event-broker";

export const channelsRouter = new Hono();

channelsRouter.use("/*", authMiddleware);

channelsRouter.get("/", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const channels = channelStore.listChannels(username);
  return c.json({ channels });
});

channelsRouter.post("/", zValidator("json", CreateChannelSchema), (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const data = c.req.valid("json");
  const channel = channelStore.createChannel(username, data);
  return c.json(channel, 201);
});

channelsRouter.get("/:id", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  let channel = channelStore.getChannel(username, id);
  if (!channel && id.startsWith("lab_")) {
    const parts = id.split("_");
    if (parts.length >= 3) {
      const variantKey = parts[parts.length - 1];
      const experimentId = parts.slice(1, parts.length - 1).join("_");
      try {
        const { ExperimentStore } = await import("../laboratory/experiment-store");
        const exp = await ExperimentStore.getExperiment(username, experimentId);
        if (exp) {
          if (variantKey === "single") {
            channel = channelStore.createChannel(username, {
              id: id,
              name: `${exp.name} (Single)`,
              description: "Laboratory single agent run",
              maxChainDepth: 3,
              showThinking: false,
              showTools: false
            } as any);
          } else {
            channel = channelStore.createChannel(username, {
              id: id,
              name: variantKey === "multiNoLeader" ? `${exp.name} (Horizontal)` : `${exp.name} (Jerárquico)`,
              description: `Laboratory multi agent run (${variantKey})`,
              maxChainDepth: 5,
              showThinking: true,
              showTools: true,
              benchmark: {
                enabled: true,
                baselineModelId: ""
              }
            } as any);
          }
        }
      } catch (err) {
        console.error(`[ChannelsRoute] Failed to dynamically recreate channel ${id}:`, err);
      }
    }
  }

  if (!channel) return c.json({ error: "Channel not found" }, 404);
  return c.json(channel);
});

channelsRouter.patch("/:id", zValidator("json", UpdateChannelSchema), (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const data = c.req.valid("json");
  const updated = channelStore.updateChannel(username, id, data);
  if (!updated) return c.json({ error: "Channel not found" }, 404);
  return c.json(updated);
});

channelsRouter.put("/:id/context", zValidator("json", z.object({ context: z.array(z.object({ key: z.string().min(1), value: z.string() })) })), (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const { context } = c.req.valid("json");
  const updated = channelStore.updateChannelContext(username, id, context);
  if (!updated) return c.json({ error: "Channel not found" }, 404);
  return c.json(updated);
});

channelsRouter.delete("/:id", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const channel = channelStore.getChannel(username, id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);

  // Cascading delete: destroy all chat sessions associated with this channel
  const sessions = await sessionManager.listSessions(username).catch(() => []);
  for (const s of sessions) {
    if (s.channelId === id) {
      await sessionManager.destroySession(username, s.id).catch((err) =>
        console.error(`[ChannelsRoute] Failed to destroy session ${s.id}:`, err)
      );
    }
  }

  const deleted = channelStore.deleteChannel(username, id);
  if (!deleted) return c.json({ error: "Channel not found" }, 404);
  return c.body(null, 204);
});

channelsRouter.post("/:id/members", zValidator("json", AddMemberSchema), (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const channel = channelStore.getChannel(username, id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);

  const data = c.req.valid("json");
  const agentEntry = agentRegistry.get(data.agentId);
  if (!agentEntry || agentEntry.username !== username) {
    return c.json({ error: `Agent "${data.agentId}" not registered or not owned by you` }, 400);
  }

  const existingIndex = channel.members.findIndex((m) => m.agentId === data.agentId);
  const updatedMembers = [...channel.members];
  const memberWithRole = {
    ...data,
    role: data.role || "member",
  };

  if (existingIndex >= 0) {
    updatedMembers[existingIndex] = memberWithRole;
  } else {
    updatedMembers.push(memberWithRole);
  }

  const updatedChannel = channelStore.updateMembers(username, id, updatedMembers);
  return c.json(updatedChannel);
});

channelsRouter.patch("/:id/members/:agentId", zValidator("json", UpdateMemberSchema), (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const agentId = c.req.param("agentId");
  const channel = channelStore.getChannel(username, id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);

  const data = c.req.valid("json");
  const index = channel.members.findIndex((m) => m.agentId === agentId);
  if (index === -1) return c.json({ error: "Member not found in channel" }, 404);

  const updatedMembers = [...channel.members];
  updatedMembers[index] = {
    ...updatedMembers[index],
    ...(data.replyMode !== undefined && { replyMode: data.replyMode }),
    ...(data.targetAgentIds !== undefined && { targetAgentIds: data.targetAgentIds }),
    ...(data.role !== undefined && { role: data.role }),
  };

  const updatedChannel = channelStore.updateMembers(username, id, updatedMembers);
  return c.json(updatedChannel);
});

channelsRouter.delete("/:id/members/:agentId", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const agentId = c.req.param("agentId");
  const channel = channelStore.getChannel(username, id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);

  const updatedMembers = channel.members.filter((m) => m.agentId !== agentId);
  const updatedChannel = channelStore.updateMembers(username, id, updatedMembers);
  return c.json(updatedChannel);
});

channelsRouter.get("/:id/messages", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const limit = c.req.query("limit") ? parseInt(c.req.query("limit")!) : 100;
  const sessionId = c.req.query("sessionId");
  const channel = channelStore.getChannel(username, id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);

  const messages = channelStore.getMessages(username, id, limit, sessionId);
  return c.json({ messages });
});

channelsRouter.get("/:id/active-streamings", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const sessionId = c.req.query("sessionId");
  const channel = channelStore.getChannel(username, id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);

  const streams = channelOrchestrator.getActiveStreams(id, sessionId);
  return c.json({ streamingAgents: streams });
});

channelsRouter.get("/:id/ledger", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const channel = channelStore.getChannel(username, id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);

  const ledgerPath = channelStore.getTaskLedgerPath(username, id);
  const ledger = new TaskLedger(ledgerPath);
  return c.json({ tasks: ledger.list() });
});


channelsRouter.post("/:id/send", zValidator("json", z.object({ message: z.string().min(1), sessionId: z.string().optional() })), async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const { message, sessionId } = c.req.valid("json");
  const channel = channelStore.getChannel(username, id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);

  // Trigger dispatch asynchronously
  channelOrchestrator.dispatchUserMessage(username, id, message, sessionId).catch((err) => {
    console.error(`[ChannelsRoute] Error dispatching message for channel ${id}:`, err);
  });

  // Trigger baseline benchmark if enabled
  if (channel.benchmark?.enabled) {
    const userDefaultModel = sessionManager.getUserDefaultModel(username);
    const baselineModel = channel.benchmark.baselineModelId || userDefaultModel;
    if (baselineModel) {
      runBaselineAndCompare(username, id, message, baselineModel, sessionId || `chan_${id}`).catch((err) => {
        console.error(`[ChannelsRoute] Error running baseline benchmark for channel ${id}:`, err);
      });
    } else {
      console.warn(`[ChannelsRoute] Cannot run baseline benchmark for channel ${id} because no default model is configured for user ${username}.`);
    }
  }

  return c.json({ success: true });
});

channelsRouter.post("/:id/abort", zValidator("json", z.object({ sessionId: z.string().optional() }).optional()), async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const body = c.req.valid("json");
  channelOrchestrator.abortDispatch(username, id, body?.sessionId);
  return c.json({ success: true });
});

channelsRouter.get("/:id/benchmark", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const { existsSync, readFileSync } = require("node:fs");
  const { join } = require("node:path");
  const latestPath = getChannelBenchmarkReportPath(username, id);

  if (!existsSync(latestPath)) {
    return c.json({ exists: false });
  }

  try {
    const reportMd = readFileSync(latestPath, "utf-8");
    return c.json({ exists: true, reportMd });
  } catch {
    return c.json({ exists: false });
  }
});

channelsRouter.post("/:id/benchmark", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const channel = channelStore.getChannel(username, id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);

  // Trigger suite execution asynchronously
  const run = async () => {
    try {
      eventBroker.publishEvent(username, {
        sourceType: "channel",
        sourceId: id,
        sourceName: channel.name,
        eventType: "text_delta",
        detail: "Starting benchmark execution suite..."
      });

      await runBenchmarkSuite(username, id, (progressMsg) => {
        eventBroker.publishEvent(username, {
          sourceType: "channel",
          sourceId: id,
          sourceName: channel.name,
          eventType: "text_delta",
          detail: `[Benchmark Progress] ${progressMsg}`
        });
      });

      eventBroker.publishEvent(username, {
        sourceType: "channel",
        sourceId: id,
        sourceName: channel.name,
        eventType: "text_delta",
        detail: `Benchmark completed! Latest report generated.`
      });
    } catch (e: any) {
      console.error("[BenchmarkRoute] Background run failed:", e);
    }
  };

  run().catch(console.error);

  return c.json({ success: true, message: "Benchmark suite started in background" });
});

channelsRouter.get("/:id/optimize", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const { existsSync, readFileSync } = require("node:fs");
  const { join } = require("node:path");
  const historyPath = getChannelBenchmarkHistoryPath(username, id);

  if (!existsSync(historyPath)) {
    return c.json({ exists: false, history: [] });
  }

  try {
    const history = JSON.parse(readFileSync(historyPath, "utf-8"));
    return c.json({ exists: true, history });
  } catch {
    return c.json({ exists: false, history: [] });
  }
});

channelsRouter.post("/:id/optimize", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const channel = channelStore.getChannel(username, id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);

  const { writeFileSync, existsSync, readFileSync, mkdirSync } = require("node:fs");
  const { join } = require("node:path");
  const historyDir = getBenchmarkDir(username, id);

  const run = async () => {
    try {
      eventBroker.publishEvent(username, {
        sourceType: "channel",
        sourceId: id,
        sourceName: channel.name,
        eventType: "text_delta",
        detail: "Starting Prompt Optimization Loop (3 iterations)..."
      });

      const history: any[] = [];
      const historyPath = join(historyDir, "optimization-history.json");

      for (let i = 1; i <= 3; i++) {
        eventBroker.publishEvent(username, {
          sourceType: "channel",
          sourceId: id,
          sourceName: channel.name,
          eventType: "text_delta",
          detail: `Starting Iteration ${i} of 3...`
        });

        const stepResult = await runOptimizationStep(username, id, i, (msg) => {
          eventBroker.publishEvent(username, {
            sourceType: "channel",
            sourceId: id,
            sourceName: channel.name,
            eventType: "text_delta",
            detail: `[Optimization Progress] ${msg}`
          });
        });

        history.push({
          iteration: stepResult.iteration,
          avgScore: stepResult.avgScore,
          prompts: stepResult.prompts,
          timestamp: new Date().toISOString()
        });

        if (!existsSync(historyDir)) {
          mkdirSync(historyDir, { recursive: true });
        }
        writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf-8");

        eventBroker.publishEvent(username, {
          sourceType: "channel",
          sourceId: id,
          sourceName: channel.name,
          eventType: "text_delta",
          detail: `Completed Iteration ${i} (Score: ${stepResult.avgScore}%)`
        });
      }

      eventBroker.publishEvent(username, {
        sourceType: "channel",
        sourceId: id,
        sourceName: channel.name,
        eventType: "text_delta",
        detail: "Prompt Optimization loop completed successfully!"
      });
    } catch (e: any) {
      console.error("[OptimizeRoute] Optimization loop run failed:", e);
      eventBroker.publishEvent(username, {
        sourceType: "channel",
        sourceId: id,
        sourceName: channel.name,
        eventType: "text_delta",
        detail: `[Error] Optimization Loop failed: ${e.message}`
      });
    }
  };

  run().catch(console.error);

  return c.json({ success: true, message: "Optimization Loop started in background" });
});

channelsRouter.get("/:id/benchmark/history", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const runs = listBenchmarkRuns(username, id);
  return c.json({ runs });
});

channelsRouter.get("/:id/benchmark/history/:runId", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const runId = c.req.param("runId");
  const run = getBenchmarkRun(username, id, runId);
  if (!run) return c.json({ error: "Benchmark run not found" }, 404);
  return c.json(run);
});

channelsRouter.post("/:id/benchmark/history/:runId/judge", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const runId = c.req.param("runId");
  const metrics = getBenchmarkRun(username, id, runId);
  if (!metrics) return c.json({ error: "Benchmark run not found" }, 404);

  eventBroker.publishEvent(username, {
    sourceType: "channel",
    sourceId: id,
    sourceName: id,
    eventType: "judge_start",
    detail: { runId },
  });

  try {
    const result = await runJudge(
      username,
      metrics.baseline.prompt,
      metrics.channel.output,
      metrics.baseline.output
    );

    saveJudgeResult(username, id, runId, result);

    eventBroker.publishEvent(username, {
      sourceType: "channel",
      sourceId: id,
      sourceName: id,
      eventType: "judge_complete",
      detail: { runId, result },
    });

    return c.json({ success: true, result });
  } catch (err: any) {
    eventBroker.publishEvent(username, {
      sourceType: "channel",
      sourceId: id,
      sourceName: id,
      eventType: "judge_error",
      detail: { runId, error: err.message },
    });
    return c.json({ error: err.message }, 500);
  }
});
