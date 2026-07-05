import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { getUsername } from "../lib/auth-helpers";
import { ExperimentStore } from "../laboratory/experiment-store";
import { ExperimentRunner } from "../laboratory/experiment-runner";
import { LabJudge } from "../laboratory/judge";
import { calculateVariantScores } from "../laboratory/scoring";
import { piSessionManager } from "../pi/session-manager";
import { type LabStance, type LabAgent, type LabExperiment } from "shared";
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
  const model = piSessionManager.getUserDefaultModel(username);
  return c.json({ model });
});

// Get blueprints
experimentsRouter.get("/blueprints", async (c) => {
  const blueprints = await ExperimentStore.listBlueprints();
  return c.json({ blueprints });
});

// Generate agents and channel with AI
experimentsRouter.post("/generate", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const { prompt, model } = await c.req.json();
  if (!prompt) return c.json({ error: "Prompt is required" }, 400);

  const userDefaultModel = piSessionManager.getUserDefaultModel(username);
  const selectedModel = model || userDefaultModel || "anthropic/claude-3-5-sonnet";

  const tempSessionId = `generate_${crypto.randomUUID()}`;
  console.log(`[Experiments /generate] Running AI generator on tempSessionId=${tempSessionId} with model=${selectedModel}`);

  try {
    const session = await piSessionManager.getOrCreateSession(username, tempSessionId);

    // Resolve model in modelRegistry
    const { modelRegistry } = piSessionManager.getUserContext(username);
    let resolvedModel: any = null;
    if (selectedModel.includes("/")) {
      const [providerId, modelId] = selectedModel.split("/");
      resolvedModel = modelRegistry.find(providerId, modelId);
    } else {
      resolvedModel = modelRegistry.getAvailable().find(m => m.id === selectedModel);
    }

    if (resolvedModel) {
      await session.setModel(resolvedModel);
    } else {
      const available = modelRegistry.getAvailable();
      if (available.length > 0) {
        await session.setModel(available[0]);
      }
    }

    const systemPrompt = `You are an expert AI Architect. Your task is to analyze the user's description and generate a complete Hierarchical Multi-Agent Crew team configuration.
You must output a JSON object representing:
1. An array of Agents.
2. A Channel configuration containing those agents as members, with structured targeted routing links.

DESIGN PRINCIPLES FOR HIERARCHICAL TEAMS:
- EXACTLY ONE agent must be the leader (role: "lead").
- The leader coordinates the debate. In their systemPrompt (which must be written in Spanish), instruct them to define the initial strategy, delegate tasks to specific team members using the format "DELEGATE: @agent-id — task description", collect inputs, and write "ACUERDO ALCANZADO." to finalize the work.
- The leader's replyMode must be "user-only".
- The other agents (role: "member" or "senior") must act as specialists. In their systemPrompt (which must be written in Spanish), instruct them to focus exclusively on their assigned task, reply directly to the leader, explicitly mention the leader (e.g. "@leader-agent-id") at the end of their messages to invoke them, and return exactly "(silent)" if they have no tasks assigned or if consensus has been reached.
- The other agents' replyMode must be "targeted", and their targetAgentIds array MUST contain ONLY the leader's agentId.

Each agent in the agents array must conform to this schema:
- id: string (kebab-case identifier using lowercase alphanumeric characters and dashes, e.g., "creative-director")
- name: string (Human-readable name, e.g., "Creative Director")
- role: string (Role description, e.g., "Coordinates campaign strategy")
- systemPrompt: string (System instructions for this agent, detailed and specific following the design principles above. System prompts must be written in Spanish.)
- model: string (The model ID provided: "${selectedModel}")
- skills: array of strings (empty by default: [])

The channel must conform to this schema:
- name: string (Name of the channel, e.g., "Creative Team")
- description: string (Description of the channel's purpose)
- members: array of objects containing:
  - agentId: string (Matching the id of the agent, e.g., "creative-director")
  - replyMode: "targeted" | "user-only"
  - targetAgentIds: array of strings (If the agent is a member, this must be [leaderAgentId]. If the agent is the leader, this can be ["__user__", and the other agent ids])
  - role: "lead" | "senior" | "member" (make sure exactly one is "lead")
- maxChainDepth: number (1-20, default 15)

Output ONLY a valid JSON object matching this format:
{
  "agents": [
    { "id": "creative-director", "name": "Creative Director", "role": "...", "systemPrompt": "...", "model": "...", "skills": [] }
  ],
  "channel": {
    "name": "...",
    "description": "...",
    "members": [
      { "agentId": "creative-director", "replyMode": "user-only", "targetAgentIds": ["__user__", "copywriter"], "role": "lead" },
      { "agentId": "copywriter", "replyMode": "targeted", "targetAgentIds": ["creative-director"], "role": "member" }
    ],
    "maxChainDepth": 15
  }
}
No explanations, code blocks, or markdown fences. Just the raw JSON.`;

    await session.prompt(`${systemPrompt}\n\nUser Request:\n"${prompt}"`);

    // Extract raw JSON
    const msgs = [...session.messages].reverse();
    const lastMsg = msgs.find((m: any) => m.role === "assistant") as any;
    let rawResult = "";
    if (lastMsg) {
      if (typeof lastMsg.content === "string") rawResult = lastMsg.content;
      else if (Array.isArray(lastMsg.content)) {
        rawResult = lastMsg.content.map((cl: any) => cl.text || "").join("\n");
      }
    }

    rawResult = rawResult.trim();
    if (rawResult.startsWith("```")) {
      rawResult = rawResult.replace(/^```[a-zA-Z-]*\n/, "").replace(/\n```$/, "");
    }

    const parsed = JSON.parse(rawResult);
    return c.json(parsed);
  } catch (e: any) {
    console.error("[Experiments /generate] Generation failed:", e);
    return c.json({ error: String(e) }, 500);
  } finally {
    await piSessionManager.destroySession(username, tempSessionId);
  }
});

// Instantiate a generated team (Agents + Channel)
experimentsRouter.post("/instantiate", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const { agents, channel } = await c.req.json();
  if (!agents || !channel) return c.json({ error: "Agents and channel configurations are required" }, 400);

  const registeredAgentIds: string[] = [];

  try {
    // 1. Register each agent
    for (const ag of agents) {
      // Check if already registered
      if (agentRegistry.get(ag.id)) {
        console.log(`[Experiments /instantiate] Agent ${ag.id} already exists. Skipping registration.`);
        registeredAgentIds.push(ag.id);
        continue;
      }

      await agentRegistry.register(username, {
        id: ag.id,
        name: ag.name,
        role: ag.role,
        systemPrompt: ag.systemPrompt,
        model: ag.model || "anthropic/claude-3-5-sonnet",
        skills: ag.skills || []
      }, true); // save to disk

      registeredAgentIds.push(ag.id);
      console.log(`[Experiments /instantiate] Registered agent: ${ag.id}`);
    }

    // 2. Create the channel
    const newChannel = channelStore.createChannel(username, {
      name: channel.name,
      description: channel.description || "Canal instanciado desde el Laboratorio",
      maxChainDepth: channel.maxChainDepth || 5,
      showThinking: false,
      showTools: false,
      context: channel.context || []
    } as any);

    // 3. Map members with registered IDs
    const members = channel.members.map((m: any) => ({
      agentId: m.agentId,
      replyMode: m.role === "lead" ? "user-only" : (m.replyMode || "mention-only"),
      role: m.role || "member",
      targetAgentIds: m.targetAgentIds || []
    }));

    channelStore.updateMembers(username, newChannel.id, members);
    console.log(`[Experiments /instantiate] Created channel: ${newChannel.id} with ${members.length} members`);

    return c.json({ success: true, channelId: newChannel.id });
  } catch (err: any) {
    console.error("[Experiments /instantiate] Instantiation failed:", err);
    return c.json({ error: `Failed to instantiate team: ${err.message}` }, 500);
  }
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

  const userDefaultModel = piSessionManager.getUserDefaultModel(username);
  const fallbackModel = userDefaultModel || "anthropic/claude-3-5-sonnet";

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

  try {
    broadcastToUser(username, { type: "experiment_status", experimentId: id, status: "running", activeVariant: "judging" });

    const judgeResults = await LabJudge.evaluateRuns(username, exp.taskPrompt, exp.judge.criteria, {
      single: single.finalOutput,
      multiNoLeader: noLeader.finalOutput,
      multiWithLeader: withLeader.finalOutput,
    });

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

    await ExperimentStore.saveExperiment(username, exp);
    broadcastToUser(username, { type: "experiment_status", experimentId: id, status: "completed", experiment: exp });
    return c.json({ experiment: exp });
  } catch (e: any) {
    broadcastToUser(username, { type: "experiment_status", experimentId: id, status: "completed" });
    return c.json({ error: e.message || "Judge evaluation failed" }, 500);
  }
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
    const sessions = await piSessionManager.listSessions(username);
    for (const s of sessions) {
      if (s.channelId && s.channelId.startsWith(`lab_${id}_`)) {
        await piSessionManager.destroySession(username, s.id);
      }
    }
  } catch (err) {
    console.error(`[Experiments Router] Failed cascading session deletion for experiment ${id}:`, err);
  }

  await ExperimentStore.deleteExperiment(username, id);
  return c.json({ success: true });
});
