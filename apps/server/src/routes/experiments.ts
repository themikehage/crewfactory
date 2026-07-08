import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { getUsername } from "../lib/auth-helpers";
import { ExperimentStore } from "../laboratory/experiment-store";
import { ExperimentRunner } from "../laboratory/experiment-runner";
import { LabJudge } from "../laboratory/judge";
import { calculateVariantScores } from "../laboratory/scoring";
import { sessionManager } from "../core/session-manager";
import { type LabStance, type LabAgent, type LabExperiment, SessionPrefix } from "shared";
import { agentRegistry } from "../agents";
import { channelStore } from "../channels";
import { broadcastToUser } from "../ws/handler";

export const experimentsRouter = new Hono();

experimentsRouter.use("/*", authMiddleware);

// Get all experiments
experimentsRouter.get("/", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const list = await ExperimentStore.listExperiments(username);
  return c.json({ experiments: list });
});

// Get default model for the user
experimentsRouter.get("/default-model", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const model = sessionManager.getUserDefaultModel(username);
  return c.json({ model });
});

// Get blueprints
experimentsRouter.get("/blueprints", async (c) => {
  const blueprints = await ExperimentStore.listBlueprints();
  return c.json({ blueprints });
});

// Get experiment summary for agents
experimentsRouter.get("/:id/summary", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const exp = await ExperimentStore.getExperiment(username, id);
  if (!exp) return c.json({ error: "Experiment not found" }, 404);
  return c.json({
    id: exp.id,
    name: exp.name,
    taskPrompt: exp.taskPrompt,
    criteria: exp.judge.criteria,
    agentsCount: exp.variants.multiWithLeader.agents.length,
    agents: exp.variants.multiWithLeader.agents.map(a => ({
      id: a.id,
      name: a.name,
      role: a.role,
      model: a.model,
      leader: a.leader
    }))
  });
});


// Get experiment detail
experimentsRouter.get("/:id", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const exp = await ExperimentStore.getExperiment(username, id);
  if (!exp) return c.json({ error: "Experiment not found" }, 404);
  return c.json({ experiment: exp });
});

// Create new experiment
experimentsRouter.post("/", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const { name, taskPrompt, blueprintId, autoEvaluate, criteria, positions, variants } = await c.req.json();

  const id = crypto.randomUUID();
  let experiment: LabExperiment;

  const userDefaultModel = sessionManager.getUserDefaultModel(username);
  if (!userDefaultModel) {
    return c.json({ error: "No configured LLM providers or models found. Please configure an API key in settings." }, 400);
  }
  const fallbackModel = userDefaultModel;

  if (blueprintId) {
    const blueprint = await ExperimentStore.getBlueprint(blueprintId);
    if (!blueprint) return c.json({ error: "Blueprint not found" }, 404);

    // Resolve test case
    const testCase = blueprint.testCases.find(tc => tc.name === taskPrompt || tc.description === taskPrompt) || blueprint.testCases[0];
    const actualPrompt = testCase ? testCase.taskPrompt || testCase.description : taskPrompt;

    // Build the stances from blueprint agents
    const labStances: LabStance[] = blueprint.agents.map((ag) => ({
      id: ag.id,
      name: ag.name,
      template: blueprintId,
      position: ag.leader ? "LEADER" : "AGENT",
      briefing: ag.systemPromptTemplate,
      icon: ag.leader ? "Award" : "User",
      color: ag.leader ? "#a855f7" : "#3b82f6"
    }));

    // Build variants agents
    const singleAgents: LabAgent[] = [
      {
        id: "baseline",
        name: "General Agent",
        role: "General Assistant",
        stance: labStances[0] || { id: "general", name: "General", template: "", position: "A", briefing: "", icon: "", color: "" },
        systemPrompt: "Eres un asistente general de IA.",
        model: fallbackModel
      }
    ];

    const multiAgents: LabAgent[] = blueprint.agents.map((ag) => ({
      id: ag.id,
      name: ag.name,
      role: ag.role,
      stance: labStances.find(s => s.id === ag.id)!,
      systemPrompt: ag.systemPromptTemplate,
      model: fallbackModel,
      leader: ag.leader
    }));

    experiment = {
      id,
      name,
      taskPrompt: actualPrompt,
      status: "designing",
      positions: labStances,
      judge: {
        criteria: blueprint.scoringConfig?.metrics.map(m => m.name) || ["Quality", "Completeness", "Accuracy"],
        autoEvaluate: autoEvaluate !== false
      },
      variants: {
        single: { type: "single", agents: singleAgents },
        multiNoLeader: { type: "multi_no_leader", agents: multiAgents.filter(a => !a.leader) },
        multiWithLeader: { type: "multi_with_leader", agents: multiAgents }
      },
      createdAt: new Date().toISOString(),
      blueprintId
    };
  } else {
    // Scratch mode
    experiment = {
      id,
      name,
      taskPrompt,
      status: "designing",
      positions: positions || [],
      judge: {
        criteria: criteria || ["Completitud", "Claridad", "Viabilidad Técnica"],
        autoEvaluate: autoEvaluate !== false
      },
      variants: variants || {
        single: { type: "single", agents: [] },
        multiNoLeader: { type: "multi_no_leader", agents: [] },
        multiWithLeader: { type: "multi_with_leader", agents: [] }
      },
      createdAt: new Date().toISOString()
    };
  }

  await ExperimentStore.saveExperiment(username, experiment);
  return c.json({ experiment }, 201);
});

// Run experiment
experimentsRouter.post("/:id/run", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  try {
    await ExperimentRunner.runExperiment(username, id);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// Stop experiment
experimentsRouter.post("/:id/stop", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");

  const exp = await ExperimentStore.getExperiment(username, id);
  if (!exp) return c.json({ error: "Experiment not found" }, 404);

  const isRunningInMemory = ExperimentRunner.isRunning(id);
  const isRunningInDb = exp.status === "running";

  if (!isRunningInMemory && !isRunningInDb) {
    return c.json({ error: "Experiment is not running" }, 400);
  }

  await ExperimentRunner.stopExperiment(username, id);
  return c.json({ success: true });
});

// Update experiment
experimentsRouter.patch("/:id", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const exp = await ExperimentStore.getExperiment(username, id);
  if (!exp) return c.json({ error: "Experiment not found" }, 404);
  if (exp.status === "running") return c.json({ error: "Cannot edit a running experiment" }, 409);

  const body = await c.req.json();
  const updatableFields = ["name", "taskPrompt", "criteria", "positions", "variants", "judge"];
  for (const field of updatableFields) {
    if (body[field] !== undefined) {
      (exp as any)[field] = body[field];
    }
  }
  if (body.autoEvaluate !== undefined) {
    exp.judge.autoEvaluate = body.autoEvaluate;
  }

  exp.status = "designing";
  await ExperimentStore.saveExperiment(username, exp);
  return c.json({ experiment: exp });
});

// On-demand judge evaluation
experimentsRouter.post("/:id/judge", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");

  const exp = await ExperimentStore.getExperiment(username, id);
  if (!exp) return c.json({ error: "Experiment not found" }, 404);
  if (exp.status !== "completed") return c.json({ error: "Experiment must be completed first" }, 409);
  if (ExperimentRunner.isRunning(id)) return c.json({ error: "Experiment is still running" }, 409);

  const single = exp.variants.single.result;
  const noLeader = exp.variants.multiNoLeader.result;
  const withLeader = exp.variants.multiWithLeader.result;

  if (!single || !noLeader || !withLeader) {
    return c.json({ error: "All variants must have results before judging" }, 409);
  }

  const { judgeModel } = await c.req.json().catch(() => ({}));
  let finalJudgeModel = judgeModel;

  if (!finalJudgeModel) {
    try {
      const sessions = await sessionManager.listSessions(username);
      const labSession = sessions.find(s => s.agentId === "lab-architect" && s.experimentId === id);
      if (labSession) {
        const activeSession = sessionManager.getSession(username, labSession.id);
        if (activeSession?.model) {
          finalJudgeModel = `${activeSession.model.provider}/${activeSession.model.id}`;
        } else {
          const { join } = require("node:path");
          const sessionDir = join(sessionManager.ensureUserDir(username), "sessions", labSession.id);
          const { readdirSync, readFileSync } = require("node:fs");
          const jsonlFiles = readdirSync(sessionDir)
            .filter((f: string) => f.endsWith(".jsonl"))
            .sort()
            .reverse();
          if (jsonlFiles.length > 0) {
            const context = JSON.parse(readFileSync(join(sessionDir, jsonlFiles[0]), "utf-8").split("\n").filter(Boolean)[0]);
            if (context?.model) {
              finalJudgeModel = `${context.model.provider}/${context.model.modelId}`;
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to resolve fallback lab session model for judge:", err);
    }
  }

  try {
    exp.activeVariant = "judging";
    await ExperimentStore.saveExperiment(username, exp);

    broadcastToUser(username, { type: "experiment_status", experimentId: id, status: exp.status, activeVariant: "judging" });

    const judgeResults = await LabJudge.evaluateRuns(username, exp.taskPrompt, exp.judge.criteria, {
      single: single.finalOutput,
      multiNoLeader: noLeader.finalOutput,
      multiWithLeader: withLeader.finalOutput,
    }, finalJudgeModel, id);

    const baselineStats = {
      durationMs: single.durationMs,
      totalTokens: single.tokensIn + single.tokensOut,
    };

    exp.variants.single.result!.scores = calculateVariantScores(
      "single",
      judgeResults.single.globalScore,
      single.durationMs, single.tokensIn, single.tokensOut,
      null, undefined,
      { reasoning: judgeResults.single.reasoning, criteriaScores: judgeResults.single.scores }
    );
    exp.variants.multiNoLeader.result!.scores = calculateVariantScores(
      "multi_no_leader",
      judgeResults.multiNoLeader.globalScore,
      noLeader.durationMs, noLeader.tokensIn, noLeader.tokensOut,
      baselineStats,
      { agreementReached: noLeader.agreementReached, rounds: noLeader.negotiationRounds || 0, maxRounds: 5, escalationsToLeader: 0 },
      { reasoning: judgeResults.multiNoLeader.reasoning, criteriaScores: judgeResults.multiNoLeader.scores }
    );
    exp.variants.multiWithLeader.result!.scores = calculateVariantScores(
      "multi_with_leader",
      judgeResults.multiWithLeader.globalScore,
      withLeader.durationMs, withLeader.tokensIn, withLeader.tokensOut,
      baselineStats,
      { agreementReached: withLeader.agreementReached, rounds: withLeader.negotiationRounds || 0, maxRounds: 5, escalationsToLeader: withLeader.escalationsToLeader || 0 },
      { reasoning: judgeResults.multiWithLeader.reasoning, criteriaScores: judgeResults.multiWithLeader.scores }
    );

    exp.activeVariant = undefined;
    await ExperimentStore.saveExperiment(username, exp);
    broadcastToUser(username, { type: "experiment_status", experimentId: id, status: "completed", experiment: exp });
    return c.json({ experiment: exp });
  } catch (e: any) {
    exp.activeVariant = undefined;
    await ExperimentStore.saveExperiment(username, exp);
    broadcastToUser(username, { type: "experiment_status", experimentId: id, status: exp.status, experiment: exp });
    return c.json({ error: e.message || "Judge evaluation failed" }, 500);
  }
});

// Get all historical runs of an experiment
experimentsRouter.get("/:id/runs", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const runs = await ExperimentStore.listRuns(username, id);
  return c.json({ runs });
});

// Get a specific historical run
experimentsRouter.get("/:id/runs/:runId", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const runId = c.req.param("runId");
  const run = await ExperimentStore.getRun(username, id, runId);
  if (!run) return c.json({ error: "Run not found" }, 404);
  return c.json({ experiment: run });
});

// Delete experiment
experimentsRouter.delete("/:id", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  if (ExperimentRunner.isRunning(id)) {
    return c.json({ error: "Cannot delete a running experiment" }, 409);
  }

  // Clean up associated temporary channel directories
  const channelIds = [
    `lab_${id}_single`,
    `lab_${id}_multiNoLeader`,
    `lab_${id}_multiWithLeader`
  ];
  for (const channelId of channelIds) {
    try {
      channelStore.deleteChannel(username, channelId);
    } catch {}
  }

  // Cascading delete: destroy all saved sessions associated with these channels
  try {
    const sessions = await sessionManager.listSessions(username);
    for (const s of sessions) {
      if (s.channelId && s.channelId.startsWith(`lab_${id}_`)) {
        await sessionManager.destroySession(username, s.id);
      }
    }
  } catch (err) {
    console.error(`[Experiments Router] Failed cascading session deletion for experiment ${id}:`, err);
  }

  await ExperimentStore.deleteExperiment(username, id);
  return c.json({ success: true });
});

// Export experiment variant
experimentsRouter.post("/:id/export", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const { variantKey, channelName } = await c.req.json();

  if (!variantKey || !["single", "multiNoLeader", "multiWithLeader"].includes(variantKey)) {
    return c.json({ error: "Invalid variantKey" }, 400);
  }

  try {
    const result = await ExperimentStore.exportVariant(username, id, variantKey, { channelName });
    if (!result) return c.json({ error: "Experiment or variant not found" }, 404);

    // Broadcast UI refresh
    broadcastToUser(username, { type: "entity-updated", entityType: "all" });

    return c.json(result);
  } catch (e: any) {
    return c.json({ error: e.message || "Export failed" }, 500);
  }
});

