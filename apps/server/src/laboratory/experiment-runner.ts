import { ExperimentStore } from "./experiment-store";
import { calculateVariantScores } from "./scoring";
import { LabJudge } from "./judge";
import { type LabExperiment, type VariantRunResult } from "shared";
import { channelOrchestrator, channelStore } from "../channels";
import { sessionManager } from "../core/session-manager";
import { agentRegistry } from "../agents";
import { resolveModelWithFallback } from "../core/agent-utils";

export class ExperimentRunner {
  private static activeRuns = new Set<string>();
  private static abortControllers = new Map<string, AbortController>();

  static isRunning(experimentId: string): boolean {
    return this.activeRuns.has(experimentId);
  }

  static async stopExperiment(username: string, experimentId: string): Promise<void> {
    const controller = this.abortControllers.get(experimentId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(experimentId);
    }

    const channelIds = [
      `lab_${experimentId}_single`,
      `lab_${experimentId}_multiNoLeader`,
      `lab_${experimentId}_multiWithLeader`
    ];
    for (const channelId of channelIds) {
      try {
        channelOrchestrator.abortDispatch(username, channelId);
      } catch {}
    }

    try {
      const { agentRegistry } = await import("../agents");
      const agents = agentRegistry.list(username);
      for (const ag of agents) {
        if (ag.id.startsWith(`lab_${experimentId}_`)) {
          try { await agentRegistry.stop(ag.id, false); } catch {}
        }
      }
    } catch {}

    this.activeRuns.delete(experimentId);

    const exp = await ExperimentStore.getExperiment(username, experimentId);
    if (exp) {
      exp.status = "failed";
      await ExperimentStore.saveExperiment(username, exp);
      broadcastToUser(username, {
        type: "experiment_status",
        experimentId,
        status: "failed",
        error: "Stopped by user"
      });
    }
  }

  static async runExperiment(username: string, experimentId: string): Promise<void> {
    if (this.isRunning(experimentId)) {
      throw new Error("Experiment is already running");
    }

    const exp = await ExperimentStore.getExperiment(username, experimentId);
    if (!exp) throw new Error("Experiment not found");

    const controller = new AbortController();
    this.abortControllers.set(experimentId, controller);

    this.activeRuns.add(experimentId);
    
    // Limpiar los resultados antiguos antes de marcar el estado como running
    exp.status = "running";
    exp.startedAt = new Date().toISOString();
    exp.completedAt = undefined;
    exp.variants.single.result = undefined;
    exp.variants.single.activeSessionId = undefined;
    exp.variants.multiNoLeader.result = undefined;
    exp.variants.multiNoLeader.activeSessionId = undefined;
    exp.variants.multiWithLeader.result = undefined;
    exp.variants.multiWithLeader.activeSessionId = undefined;
    await ExperimentStore.saveExperiment(username, exp);

    broadcastToUser(username, {
      type: "experiment_status",
      experimentId,
      status: "running",
      activeVariant: "single"
    });

    this.executeAllVariants(username, exp, controller.signal).finally(() => {
      this.activeRuns.delete(experimentId);
      this.abortControllers.delete(experimentId);
    });
  }

  private static async executeAllVariants(username: string, exp: LabExperiment, signal: AbortSignal): Promise<void> {
    try {
      if (signal.aborted) return;

      // 1. Run Single Variant
      const singleSessionId = `lab_run_${crypto.randomUUID()}`;
      exp.variants.single.activeSessionId = singleSessionId;
      await ExperimentStore.saveExperiment(username, exp);

      broadcastToUser(username, { type: "experiment_status", experimentId: exp.id, status: "running", activeVariant: "single" });
      const singleResult = await this.runSingleVariant(username, exp, singleSessionId, signal);
      exp.variants.single.result = singleResult;
      await ExperimentStore.saveExperiment(username, exp);

      const baselineStats = {
        durationMs: singleResult.durationMs,
        totalTokens: singleResult.tokensIn + singleResult.tokensOut
      };

      // 2. Run Multi-Agent No Leader
      if (signal.aborted) return;
      
      const noLeaderSessionId = `lab_run_${crypto.randomUUID()}`;
      exp.variants.multiNoLeader.activeSessionId = noLeaderSessionId;
      await ExperimentStore.saveExperiment(username, exp);

      broadcastToUser(username, { type: "experiment_status", experimentId: exp.id, status: "running", activeVariant: "multiNoLeader" });
      const noLeaderResult = await this.runMultiVariant(username, exp, "multiNoLeader", noLeaderSessionId, baselineStats, signal);
      exp.variants.multiNoLeader.result = noLeaderResult;
      await ExperimentStore.saveExperiment(username, exp);

      // 3. Run Multi-Agent With Leader
      if (signal.aborted) return;

      const withLeaderSessionId = `lab_run_${crypto.randomUUID()}`;
      exp.variants.multiWithLeader.activeSessionId = withLeaderSessionId;
      await ExperimentStore.saveExperiment(username, exp);

      broadcastToUser(username, { type: "experiment_status", experimentId: exp.id, status: "running", activeVariant: "multiWithLeader" });
      const withLeaderResult = await this.runMultiVariant(username, exp, "multiWithLeader", withLeaderSessionId, baselineStats, signal);
      exp.variants.multiWithLeader.result = withLeaderResult;
      await ExperimentStore.saveExperiment(username, exp);

      // 4. Scoring & Judge Evaluation
      if (exp.judge.autoEvaluate && !signal.aborted) {
        broadcastToUser(username, { type: "experiment_status", experimentId: exp.id, status: "running", activeVariant: "judging" });
        
        // Evaluar con el LLM Judge solo si todas las variantes se completaron exitosamente
        const canJudge = singleResult.status === "completed" &&
                         noLeaderResult.status === "completed" &&
                         withLeaderResult.status === "completed";

        if (canJudge) {
          const judgeResults = await LabJudge.evaluateRuns(username, exp.taskPrompt, exp.judge.criteria, {
            single: singleResult.finalOutput,
            multiNoLeader: noLeaderResult.finalOutput,
            multiWithLeader: withLeaderResult.finalOutput
          });

          // Compute final compound scores
          exp.variants.single.result!.scores = calculateVariantScores(
            "single",
            judgeResults.single.globalScore,
            singleResult.durationMs,
            singleResult.tokensIn,
            singleResult.tokensOut,
            null,
            undefined,
            { reasoning: judgeResults.single.reasoning, criteriaScores: judgeResults.single.scores }
          );

          exp.variants.multiNoLeader.result!.scores = calculateVariantScores(
            "multi_no_leader",
            judgeResults.multiNoLeader.globalScore,
            noLeaderResult.durationMs,
            noLeaderResult.tokensIn,
            noLeaderResult.tokensOut,
            baselineStats,
            {
              agreementReached: noLeaderResult.agreementReached,
              rounds: noLeaderResult.negotiationRounds || 0,
              maxRounds: 5,
              escalationsToLeader: 0
            },
            { reasoning: judgeResults.multiNoLeader.reasoning, criteriaScores: judgeResults.multiNoLeader.scores }
          );

          exp.variants.multiWithLeader.result!.scores = calculateVariantScores(
            "multi_with_leader",
            judgeResults.multiWithLeader.globalScore,
            withLeaderResult.durationMs,
            withLeaderResult.tokensIn,
            withLeaderResult.tokensOut,
            baselineStats,
            {
              agreementReached: withLeaderResult.agreementReached,
              rounds: withLeaderResult.negotiationRounds || 0,
              maxRounds: 5,
              escalationsToLeader: withLeaderResult.escalationsToLeader || 0
            },
            { reasoning: judgeResults.multiWithLeader.reasoning, criteriaScores: judgeResults.multiWithLeader.scores }
          );
        } else {
          console.warn(`[ExperimentRunner] Skipping auto evaluation because one or more variants failed.`);
        }
      }

      exp.status = "completed";
      exp.completedAt = new Date().toISOString();
      await ExperimentStore.saveExperiment(username, exp);

      broadcastToUser(username, {
        type: "experiment_status",
        experimentId: exp.id,
        status: "completed",
        experiment: exp
      });

    } catch (e: any) {
      console.error(`[ExperimentRunner] Experiment ${exp.id} failed:`, e);
      exp.status = "failed";
      await ExperimentStore.saveExperiment(username, exp);
      broadcastToUser(username, {
        type: "experiment_status",
        experimentId: exp.id,
        status: "failed",
        error: e.message
      });
    }
  }

  private static async runSingleVariant(username: string, exp: LabExperiment, sessionId: string, signal: AbortSignal): Promise<VariantRunResult> {
    const startTime = Date.now();
    const run = exp.variants.single;
    const channelId = `lab_${exp.id}_single`;
    let rawOutput = "";
    let runError = "";

    // 1. Temporary register agent
    const ag = run.agents[0] || {
      id: "baseline",
      name: "General Agent",
      role: "General Assistant",
      systemPrompt: "Eres un asistente general de IA. Responde en español.",
      model: "anthropic/claude-3-5-sonnet"
    };

    const regId = `lab_${exp.id}_single_${ag.id}`;

    try {
      if (agentRegistry.get(regId)) {
        try { await agentRegistry.stop(regId, false); } catch {}
      }

      // Resolve model using agent-utils helper
      const { modelRegistry } = sessionManager.getUserContext(username);
      const resolvedModel = resolveModelWithFallback(ag.model, modelRegistry);

      await agentRegistry.register(username, {
        id: regId,
        name: ag.name,
        role: ag.role,
        systemPrompt: ag.systemPrompt || "Eres un asistente general de IA. Responde en español.",
        model: resolvedModel,
        skills: []
      }, false);

      // Clean up channel directory if exists
      try { channelStore.deleteChannel(username, channelId); } catch {}

      // Create the channel
      const channel = channelStore.createChannel(username, {
        id: channelId,
        name: `${exp.name} (Single)`,
        description: "Laboratory single agent run",
        maxChainDepth: 3,
        showThinking: false,
        showTools: false
      } as any);

      // Add member
      channelStore.updateMembers(username, channelId, [
        {
          agentId: regId,
          replyMode: "user-only",
          role: "member"
        }
      ]);

      // Initialize session and save metadata to disk
      await sessionManager.getOrCreateSession(username, sessionId, undefined, undefined, channelId);
      sessionManager.saveSessionMetadata(username, sessionId, {
        name: `${exp.name} - Baseline`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        channelId: channelId,
        isExecution: true
      });

      // 2. Dispatch prompt and await settle
      await channelOrchestrator.dispatchUserMessage(username, channelId, exp.taskPrompt, sessionId);

      // 4. Gather output
      const messages = channelStore.getMessages(username, channelId, 50, sessionId);
      const agentMessages = messages.filter((m) => m.role === "agent");
      rawOutput = agentMessages.map((m) => m.content).join("\n\n");
    } catch (e: any) {
      console.error(`[ExperimentRunner] Single variant failed:`, e);
      runError = e.message || String(e);
    } finally {
      // 5. Gather tokens and clean up sessions
      let tokensIn = 0;
      let tokensOut = 0;

      // Sum up tokens from channel messages for this sessionId
      try {
        const messages = channelStore.getMessages(username, channelId, 100, sessionId);
        for (const msg of messages) {
          if (msg.role === "agent") {
            tokensIn += (msg as any).tokensIn || 0;
            tokensOut += (msg as any).tokensOut || 0;
          }
        }
      } catch (err) {
        console.error(`[ExperimentRunner] Failed to sum tokens from channel messages:`, err);
      }

      // Fallback: Query temporary agent session stats directly
      if (tokensIn === 0 && tokensOut === 0) {
        try {
          const entry = agentRegistry.get(regId);
          if (entry && entry.server && entry.server.session) {
            const stats = entry.server.session.getSessionStats();
            if (stats && stats.tokens) {
              tokensIn = stats.tokens.input || 0;
              tokensOut = stats.tokens.output || 0;
            }
            if (tokensIn === 0 && tokensOut === 0 && entry.server.session.messages) {
              for (const m of entry.server.session.messages) {
                const anyM = m as any;
                if (anyM.usage) {
                  tokensIn += anyM.usage.input || 0;
                  tokensOut += anyM.usage.output || 0;
                }
              }
            }
          }
        } catch (err) {
          console.error(`[ExperimentRunner] Fallback stats lookup failed for single agent ${regId}:`, err);
        }
      }



      // 6. Stop agent
      try { await agentRegistry.stop(regId, false); } catch {}

      return {
        status: (rawOutput && !runError) ? "completed" : "failed",
        durationMs: Date.now() - startTime,
        tokensIn,
        tokensOut,
        agreementReached: true,
        finalOutput: runError ? `Error de ejecución: ${runError}` : rawOutput,
        scores: {
          taskQuality: 0,
          efficiencyScore: 100,
          globalScore: 0
        }
      };
    }
  }

  private static async runMultiVariant(
    username: string,
    exp: LabExperiment,
    variantKey: "multiNoLeader" | "multiWithLeader",
    sessionId: string,
    baseline: { durationMs: number; totalTokens: number },
    signal: AbortSignal
  ): Promise<VariantRunResult> {
    const startTime = Date.now();
    const run = exp.variants[variantKey];
    const channelId = `lab_${exp.id}_${variantKey}`;

    const agentsCount = run.agents?.length || 0;

    // Validación de reglas de negocio
    if (variantKey === "multiNoLeader" && agentsCount < 2) {
      return {
        status: "failed",
        durationMs: 0,
        tokensIn: 0,
        tokensOut: 0,
        negotiationRounds: 0,
        escalationsToLeader: 0,
        agreementReached: false,
        finalOutput: "Regla de negocio: Se requieren al menos 2 agentes para iniciar el modo colaborativo horizontal.",
        scores: {
          taskQuality: 0,
          efficiencyScore: 0,
          globalScore: 0
        }
      };
    }

    if (variantKey === "multiWithLeader" && agentsCount < 3) {
      return {
        status: "failed",
        durationMs: 0,
        tokensIn: 0,
        tokensOut: 0,
        negotiationRounds: 0,
        escalationsToLeader: 0,
        agreementReached: false,
        finalOutput: "Regla de negocio: Se requieren al menos 3 agentes para iniciar el modo colaborativo con arbitraje (jerárquico).",
        scores: {
          taskQuality: 0,
          efficiencyScore: 0,
          globalScore: 0
        }
      };
    }

    // 1. Temporary register agents
    const registeredIds: string[] = [];
    const { modelRegistry } = sessionManager.getUserContext(username);
    const configuredModels = modelRegistry.getAvailable();

    let rawOutput = "";
    let agreementReached = false;
    let negotiationRounds = 0;
    let escalationsToLeader = 0;
    let runError = "";

    try {
      for (const ag of run.agents) {
        const regId = `lab_${exp.id}_${variantKey}_${ag.id}`;
        // Clean up previous registration if any
        if (agentRegistry.get(regId)) {
          try { await agentRegistry.stop(regId, false); } catch {}
        }

        // Resolve model using agent-utils helper
        const resolvedModel = resolveModelWithFallback(ag.model, modelRegistry);

        await agentRegistry.register(username, {
          id: regId,
          name: ag.name,
          role: ag.role,
          systemPrompt: ag.systemPrompt,
          model: resolvedModel,
          skills: []
        }, false); // saveToDisk = false to isolate
        registeredIds.push(regId);
      }

      // Load blueprint configurations if template-based
      let agreementPattern = "(ACUERDO ALCANZADO:|ACEPTO)";
      let maxRounds = 3;
      let arbiterAgentId: string | undefined = undefined;
      let contextItems = [
        { key: "TASK_CONTEXT", value: exp.taskPrompt }
      ];

      if (exp.blueprintId) {
        const blueprint = await ExperimentStore.getBlueprint(exp.blueprintId);
        if (blueprint && blueprint.channelConfig) {
          if (blueprint.channelConfig.negotiationProtocol) {
            agreementPattern = blueprint.channelConfig.negotiationProtocol.agreementPattern;
            maxRounds = blueprint.channelConfig.negotiationProtocol.maxRounds;
            if (blueprint.channelConfig.negotiationProtocol.arbiterAgentId) {
              arbiterAgentId = `lab_${exp.id}_${variantKey}_${blueprint.channelConfig.negotiationProtocol.arbiterAgentId}`;
            }
          }
          if (blueprint.channelConfig.context) {
            contextItems = [...contextItems, ...blueprint.channelConfig.context];
          }
        }
      }

      // 2. Create dynamic channel members mapping
      const members = run.agents.map((ag) => {
        const regId = `lab_${exp.id}_${variantKey}_${ag.id}`;
        let targets: string[] | undefined = undefined;
        // Resolve targeted member IDs
        if (variantKey === "multiWithLeader") {
          if (ag.id === "ceo" || ag.leader) {
            // Leader listens to user and other estimators
            targets = ["__user__", ...run.agents.filter(a => a.id !== ag.id).map(a => `lab_${exp.id}_${variantKey}_${a.id}`)];
          } else if (ag.id === "marketing") {
            // marketing listens to CEO/Leader
            const leaderAg = run.agents.find(a => a.id === "ceo" || a.leader);
            targets = leaderAg ? [`lab_${exp.id}_${variantKey}_${leaderAg.id}`] : [];
          } else {
            // Devs listen to Tech Lead/Leader
            const leaderAg = run.agents.find(a => a.id === "tech_lead" || a.id === "ceo" || a.leader);
            targets = leaderAg ? [`lab_${exp.id}_${variantKey}_${leaderAg.id}`] : [];
          }
        }

        return {
          agentId: regId,
          replyMode: variantKey === "multiWithLeader" ? "targeted" : "broadcast",
          targetAgentIds: targets,
          role: ag.leader ? "lead" : (ag.id === "senior_dev" ? "senior" : "member")
        };
      });

      // Clean up channel directory if exists
      try {
        channelStore.deleteChannel(username, channelId);
      } catch {}

      // Create the channel
      const channel = channelStore.createChannel(username, {
        id: channelId,
        name: `${exp.name} (${variantKey})`,
        description: "Laboratory execution run",
        context: contextItems,
        maxChainDepth: variantKey === "multiWithLeader" ? 15 : 8,
        showThinking: false,
        showTools: false,
        negotiationProtocol: variantKey === "multiWithLeader" ? {
          agreementPattern,
          maxRounds,
          arbiterAgentId
        } : undefined
      } as any);

      // Add members
      channelStore.updateMembers(username, channelId, members as any);

      // Initialize session and save metadata to disk
      await sessionManager.getOrCreateSession(username, sessionId, undefined, undefined, channelId);
      sessionManager.saveSessionMetadata(username, sessionId, {
        name: `${exp.name} - ${variantKey === "multiNoLeader" ? "Horizontal" : "Jerárquico"}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        channelId: channelId,
        isExecution: true
      });

      // 3. Dispatch user message task prompt and await settle
      await channelOrchestrator.dispatchUserMessage(username, channelId, exp.taskPrompt, sessionId);

      // 5. Gather output
      const messages = channelStore.getMessages(username, channelId, 50, sessionId);
      const agentMessages = messages.filter((m) => m.role === "agent");
      rawOutput = agentMessages.map((m) => `[${m.agentName}]: ${m.content}`).join("\n\n");

      // Extract agreement from messages
      agreementReached = agentMessages.some(m => 
        m.content.includes("ACUERDO ALCANZADO") || 
        m.content.includes("ACEPTO la propuesta") || 
        m.content.includes("ACEPTO")
      );

      // Read round/escalation counters if negotiation state is logged
      const negState = channelStore.getNegotiationState(username, channelId);
      for (const key of Object.keys(negState)) {
        negotiationRounds = Math.max(negotiationRounds, negState[key].rounds || 0);
        if (negState[key].status === "escalated") {
          escalationsToLeader++;
        }
      }
    } catch (err: any) {
      console.error(`[ExperimentRunner] Error running multi variant ${variantKey}:`, err);
      runError = err.message || String(err);
    } finally {
      // 6. Gather tokens and clean up sessions
      let tokensIn = 0;
      let tokensOut = 0;

      // Sum up tokens from channel messages for this sessionId
      try {
        const messages = channelStore.getMessages(username, channelId, 100, sessionId);
        for (const msg of messages) {
          if (msg.role === "agent") {
            tokensIn += (msg as any).tokensIn || 0;
            tokensOut += (msg as any).tokensOut || 0;
          }
        }
      } catch (err) {
        console.error(`[ExperimentRunner] Failed to sum tokens from channel messages:`, err);
      }

      // Fallback: Query temporary agent session stats directly
      if (tokensIn === 0 && tokensOut === 0) {
        for (const regId of registeredIds) {
          try {
            const entry = agentRegistry.get(regId);
            if (entry && entry.server && entry.server.session) {
              const stats = entry.server.session.getSessionStats();
              if (stats && stats.tokens) {
                tokensIn += stats.tokens.input || 0;
                tokensOut += stats.tokens.output || 0;
              }
                for (const m of entry.server.session.messages) {
                  const anyM = m as any;
                  if (anyM.usage) {
                    tokensIn += anyM.usage.input || 0;
                    tokensOut += anyM.usage.output || 0;
                  }
                }
            }
          } catch (err) {
            console.error(`[ExperimentRunner] Fallback stats lookup failed for agent ${regId}:`, err);
          }
        }
      }



      // 7. Stop agents
      for (const regId of registeredIds) {
        try {
          await agentRegistry.stop(regId, false);
        } catch {}
      }

      return {
        status: (rawOutput && !runError) ? "completed" : "failed",
        durationMs: Date.now() - startTime,
        tokensIn,
        tokensOut,
        negotiationRounds,
        escalationsToLeader,
        agreementReached,
        finalOutput: runError ? `Error de ejecución: ${runError}` : rawOutput,
        scores: {
          taskQuality: 0,
          efficiencyScore: 100,
          globalScore: 0
        }
      };
    }
  }
}
