import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { getUsername } from "../lib/auth-helpers";
import { ChannelBenchmarkStore } from "../laboratory/channel-benchmark-store";
import { ChannelBenchmarkRunner } from "../laboratory/channel-benchmark-runner";
import { ChannelBenchmarkJudge } from "../laboratory/channel-benchmark-judge";

export const channelBenchmarksRouter = new Hono();

channelBenchmarksRouter.use("/*", authMiddleware);

channelBenchmarksRouter.post(
  "/:channelId/benchmarks",
  zValidator(
    "json",
    z.object({
      taskPrompt: z.string().min(1),
      name: z.string().optional(),
      singleAgentId: z.string().optional(),
      criteria: z.array(z.string()).optional(),
      judgeModel: z.string().optional(),
    })
  ),
  async (c) => {
    const username = getUsername(c);
    if (!username) return c.json({ error: "Unauthorized" }, 401);

    const channelId = c.req.param("channelId");
    const body = c.req.valid("json");

    try {
      const { runId } = await ChannelBenchmarkRunner.runBenchmark(username, channelId, body);
      return c.json({ runId, status: "running" }, 201);
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  }
);

channelBenchmarksRouter.get("/:channelId/benchmarks", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const channelId = c.req.param("channelId");
  const runs = ChannelBenchmarkStore.listRuns(username, channelId);
  return c.json({ runs });
});

channelBenchmarksRouter.get("/:channelId/benchmarks/:runId", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const channelId = c.req.param("channelId");
  const runId = c.req.param("runId");
  const run = ChannelBenchmarkStore.getRun(username, channelId, runId);
  if (!run) return c.json({ error: "Run not found" }, 404);
  return c.json({ run });
});

channelBenchmarksRouter.delete("/:channelId/benchmarks/:runId", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const channelId = c.req.param("channelId");
  const runId = c.req.param("runId");
  ChannelBenchmarkStore.deleteRun(username, channelId, runId);
  return c.body(null, 204);
});

channelBenchmarksRouter.post("/:channelId/benchmarks/:runId/re-evaluate", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const channelId = c.req.param("channelId");
  const runId = c.req.param("runId");

  const run = ChannelBenchmarkStore.getRun(username, channelId, runId);
  if (!run) return c.json({ error: "Run not found" }, 404);
  if (run.status !== "completed" || !run.variants.multi.result || !run.variants.single.result) {
    return c.json({ error: "Cannot re-evaluate a non-completed or failed run" }, 400);
  }

  try {
    const judgeResult = await ChannelBenchmarkJudge.evaluateRuns(
      username,
      channelId,
      runId,
      run.taskPrompt,
      run.judge.criteria,
      {
        multi: run.variants.multi.result.finalOutput,
        single: run.variants.single.result.finalOutput
      }
    );

    if (run.variants.multi.result) {
      run.variants.multi.result.scores = {
        taskQuality: judgeResult.criteriaScores.multi[run.judge.criteria[0]] || judgeResult.scores.multi,
        efficiencyScore: 100,
        globalScore: judgeResult.scores.multi,
        judgeReasoning: judgeResult.reasoning,
        criteriaScores: judgeResult.criteriaScores.multi,
      };
    }
    if (run.variants.single.result) {
      run.variants.single.result.scores = {
        taskQuality: judgeResult.criteriaScores.single[run.judge.criteria[0]] || judgeResult.scores.single,
        efficiencyScore: 100,
        globalScore: judgeResult.scores.single,
        judgeReasoning: judgeResult.reasoning,
        criteriaScores: judgeResult.criteriaScores.single,
      };
    }

    run.judge.result = judgeResult;
    ChannelBenchmarkStore.saveRun(username, channelId, run);

    const { broadcastToUser } = await import("../ws/handler");
    broadcastToUser(username, {
      type: "benchmark_complete",
      channelId,
      runId,
      run
    });

    return c.json({ success: true, run });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
