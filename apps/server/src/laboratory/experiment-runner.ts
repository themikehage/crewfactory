import { ExperimentStore } from "./experiment-store";
import { calculateVariantScores } from "./scoring";
import { LabJudge } from "./judge";
import { type LabExperiment, type VariantRunResult, type LabAgent, type TeamMember } from "shared";
import { sessionManager } from "../core/session-manager";
import { agentRegistry } from "../agents";
import { resolveModelWithFallback } from "../core/agent-utils";
import { broadcastToUser } from "../ws/handler";
import { type VariantConfig } from "./types";
import { LabNegotiationRunner } from "./lab-negotiation-runner";


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

    // The abort controller signal will propagate to stop active runs.

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
    const runId = crypto.randomUUID();
    exp.activeRunId = runId;
    exp.activeVariant = "single";
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

      const depth = exp.maxChainDepth;
      const VARIANT_CONFIGS: VariantConfig[] = [
        { variantKey: "single",         replyMode: "user-only",  maxChainDepth: depth?.single ?? 3,  hasNegotiationProtocol: false, minAgents: 1, sessionNameSuffix: "Baseline" },
        { variantKey: "multiWithLeader",replyMode: "targeted",   maxChainDepth: depth?.multiWithLeader ?? 15, hasNegotiationProtocol: true,  minAgents: 3, sessionNameSuffix: "Jerárquico" },
      ];

      let baselineStats: { durationMs: number; totalTokens: number } | null = null;
      let singleResult: VariantRunResult | undefined;
      let noLeaderResult: VariantRunResult | undefined = {
        status: "completed",
        durationMs: 0,
        tokensIn: 0,
        tokensOut: 0,
        negotiationRounds: 0,
        escalationsToLeader: 0,
        agreementReached: false,
        finalOutput: "Variante deshabilitada",
        scores: {
          taskQuality: 0,
          efficiencyScore: 0,
          globalScore: 0
        }
      };
      let withLeaderResult: VariantRunResult | undefined;

      for (const config of VARIANT_CONFIGS) {
        if (signal.aborted) return;

        const sessionId = `lab_run_${crypto.randomUUID()}`;
        exp.variants[config.variantKey].activeSessionId = sessionId;
        exp.activeVariant = config.variantKey;
        await ExperimentStore.saveExperiment(username, exp);

        broadcastToUser(username, {
          type: "experiment_status",
          experimentId: exp.id,
          status: "running",
          activeVariant: config.variantKey
        });

        const result = await this.runVariant(username, exp, config, sessionId, signal);
        exp.variants[config.variantKey].result = result;
        await ExperimentStore.saveExperiment(username, exp);

        broadcastToUser(username, {
          type: "experiment_status",
          experimentId: exp.id,
          status: "running",
          activeVariant: config.variantKey,
          experiment: exp
        });

        if (config.variantKey === "single") {
          singleResult = result;
          baselineStats = { durationMs: result.durationMs, totalTokens: result.tokensIn + result.tokensOut };
        } else if (config.variantKey === "multiWithLeader") {
          withLeaderResult = result;
        }
      }

      // 4. Scoring & Judge Evaluation
      if (exp.judge.autoEvaluate && !signal.aborted && singleResult && withLeaderResult) {
        exp.activeVariant = "judging";
        await ExperimentStore.saveExperiment(username, exp);

        broadcastToUser(username, { type: "experiment_status", experimentId: exp.id, status: "running", activeVariant: "judging" });
        
        // Evaluar con el LLM Judge solo si todas las variantes se completaron exitosamente
        const canJudge = singleResult.status === "completed" &&
                         withLeaderResult.status === "completed";

        if (canJudge && baselineStats) {
          let judgeModelToUse: string | undefined;
          try {
            const sessions = await sessionManager.listSessions(username);
            const labSession = sessions.find(s => s.agentId === "lab-architect" && s.experimentId === exp.id);
            if (labSession) {
              const activeSession = sessionManager.getSession(username, labSession.id);
              if (activeSession?.model) {
                judgeModelToUse = `${activeSession.model.provider}/${activeSession.model.id}`;
              } else {
                const { join } = require("node:path");
                const sessionDir = join(sessionManager.userConfig.ensureUserDir(username), "sessions", labSession.id);
                const { readdirSync, readFileSync } = require("node:fs");
                const jsonlFiles = readdirSync(sessionDir)
                  .filter((f: string) => f.endsWith(".jsonl"))
                  .sort()
                  .reverse();
                if (jsonlFiles.length > 0) {
                  const context = JSON.parse(readFileSync(join(sessionDir, jsonlFiles[0]), "utf-8").split("\n").filter(Boolean)[0]);
                  if (context?.model) {
                    judgeModelToUse = `${context.model.provider}/${context.model.modelId}`;
                  }
                }
              }
            }
          } catch (err) {
            console.error("Failed to resolve fallback lab session model for auto judge:", err);
          }

          const judgeResults = await LabJudge.evaluateRuns(username, exp.taskPrompt, exp.judge.criteria, {
            single: singleResult.finalOutput,
            multiWithLeader: withLeaderResult.finalOutput
          }, judgeModelToUse, exp.id);

          // Compute final compound scores
          exp.variants.single.result!.scores = calculateVariantScores(
            "single",
            judgeResults.single.globalScore,
            singleResult.durationMs,
            singleResult.tokensIn,
            singleResult.tokensOut,
            null,
            exp.variants.single.agents.length || 1,
            1,
            undefined,
            { reasoning: judgeResults.single.reasoning, criteriaScores: judgeResults.single.scores }
          );

          exp.variants.multiNoLeader.result = noLeaderResult;
          exp.variants.multiNoLeader.result.scores = calculateVariantScores(
            "multi_no_leader",
            judgeResults.multiNoLeader.globalScore,
            0,
            0,
            0,
            baselineStats,
            exp.variants.multiNoLeader.agents.length || 1,
            0,
            {
              agreementReached: false,
              rounds: 0,
              maxRounds: 5,
              escalationsToLeader: 0,
              divergenceEventsCount: 0,
              arbitrationRoundsCount: 0,
              protocolActivationRate: 0
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
            exp.variants.multiWithLeader.agents.length || 1,
            withLeaderResult.negotiationRounds || 0,
            {
              agreementReached: withLeaderResult.agreementReached,
              rounds: withLeaderResult.negotiationRounds || 0,
              maxRounds: 5,
              escalationsToLeader: withLeaderResult.escalationsToLeader || 0,
              divergenceEventsCount: withLeaderResult.divergenceEventsCount,
              arbitrationRoundsCount: withLeaderResult.arbitrationRoundsCount,
              protocolActivationRate: withLeaderResult.protocolActivationRate
            },
            { reasoning: judgeResults.multiWithLeader.reasoning, criteriaScores: judgeResults.multiWithLeader.scores }
          );
        } else {
          console.warn(`[ExperimentRunner] Skipping auto evaluation because one or more variants failed.`);
        }
      }

      exp.status = "completed";
      exp.completedAt = new Date().toISOString();
      exp.activeVariant = undefined;
      exp.activeRunId = undefined;
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
      exp.activeVariant = undefined;
      exp.activeRunId = undefined;
      await ExperimentStore.saveExperiment(username, exp);
      broadcastToUser(username, {
        type: "experiment_status",
        experimentId: exp.id,
        status: "failed",
        error: e.message
      });
    }
  }

  private static buildMembers(
    agents: LabAgent[],
    expId: string,
    variantKey: string,
    config: VariantConfig
  ): TeamMember[] {
    return agents.map((ag) => {
      const regId = `lab_${expId}_${variantKey}_${ag.id}`;
      return {
        agentId: regId,
        role: ag.leader ? "lead" : "member",
        outputMode: "normal"
      };
    });
  }

  private static async runVariant(
    username: string,
    exp: LabExperiment,
    config: VariantConfig,
    sessionId: string,
    signal: AbortSignal
  ): Promise<VariantRunResult> {
    const startTime = Date.now();
    const { variantKey, minAgents, replyMode, maxChainDepth, hasNegotiationProtocol, sessionNameSuffix } = config;
    const run = exp.variants[variantKey];
    const registeredIds: string[] = [];

    // Business rule validation
    const agentsCount = run.agents?.length || 0;
    if (agentsCount < minAgents) {
      return {
        status: "failed",
        durationMs: 0,
        tokensIn: 0,
        tokensOut: 0,
        negotiationRounds: 0,
        escalationsToLeader: 0,
        agreementReached: false,
        finalOutput: `Regla de negocio: Se requieren al menos ${minAgents} agentes para iniciar el modo ${variantKey}.`,
        scores: {
          taskQuality: 0,
          efficiencyScore: 0,
          globalScore: 0
        }
      };
    }

    try {
      // 1. Temporary register agents
      const { modelRegistry } = sessionManager.userConfig.getUserContext(username);
      for (const ag of run.agents) {
        const regId = `lab_${exp.id}_${variantKey}_${ag.id}`;
        if (agentRegistry.get(regId)) {
          try { await agentRegistry.stop(regId, false); } catch {}
        }
        const resolvedModel = resolveModelWithFallback(ag.model, modelRegistry);
        await agentRegistry.register(username, {
          id: regId,
          name: ag.name,
          role: ag.role,
          systemPrompt: ag.systemPrompt || "Eres un asistente general de IA. Responde en español.",
          model: resolvedModel,
          skills: []
        }, false); // saveToDisk = false to isolate
        registeredIds.push(regId);
      }

      // 2. Resolve blueprint configs if template-based
      let negotiationProtocol: any = undefined;
      let contextItems = [
        { key: "TASK_CONTEXT", value: exp.taskPrompt }
      ];

      if (hasNegotiationProtocol && exp.blueprintId) {
        const blueprint = await ExperimentStore.getBlueprint(exp.blueprintId);
        if (blueprint && blueprint.channelConfig) {
          if (blueprint.channelConfig.negotiationProtocol) {
            const proto = blueprint.channelConfig.negotiationProtocol;
            negotiationProtocol = {
              agreementPattern: proto.agreementPattern || "(ACUERDO ALCANZADO:|ACEPTO)",
              maxRounds: proto.maxRounds || 3,
              arbiterAgentId: proto.arbiterAgentId
                ? `lab_${exp.id}_${variantKey}_${proto.arbiterAgentId}`
                : undefined
            };
          }
          if (blueprint.channelConfig.context) {
            contextItems = [...contextItems, ...blueprint.channelConfig.context];
          }
        }
      } else if (hasNegotiationProtocol) {
        negotiationProtocol = {
          agreementPattern: "(ACUERDO ALCANZADO:|ACEPTO)",
          maxRounds: 3
        };
      }

      // 3. Build members
      const members = this.buildMembers(run.agents, exp.id, variantKey, config);

      // 4. Run to completion via LabNegotiationRunner
      const result = await LabNegotiationRunner.run({
        username,
        experimentId: exp.id,
        variantKey,
        agents: run.agents,
        maxChainDepth,
        negotiationProtocol,
        taskPrompt: exp.taskPrompt,
        sessionId,
        sessionName: `${exp.name} - ${sessionNameSuffix}`,
        signal
      });

      // 5. Gather output
      const agentMessages = result.messages.filter((m) => m.role === "agent");
      const rawOutput = agentMessages.map((m) =>
        replyMode === "user-only" ? m.content : `[${m.agentName}]: ${m.content}`
      ).join("\n\n");

      return {
        status: (result.status === "completed" && rawOutput) ? "completed" : "failed",
        durationMs: Date.now() - startTime,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        negotiationRounds: result.negotiationRounds,
        escalationsToLeader: result.escalationsToLeader,
        agreementReached: result.agreementReached,
        divergenceEventsCount: result.divergenceEventsCount,
        arbitrationRoundsCount: result.arbitrationRoundsCount,
        protocolActivationRate: result.protocolActivationRate,
        finalOutput: result.status === "aborted" ? "Cancelado por el usuario" : (rawOutput || `Ejecución finalizada con estado: ${result.status}`),
        scores: {
          taskQuality: 0,
          efficiencyScore: 100,
          globalScore: 0
        }
      };
    } catch (err: any) {
      console.error(`[ExperimentRunner] Error running variant ${variantKey}:`, err);
      return {
        status: "failed",
        durationMs: Date.now() - startTime,
        tokensIn: 0,
        tokensOut: 0,
        negotiationRounds: 0,
        escalationsToLeader: 0,
        agreementReached: false,
        finalOutput: `Error de ejecución: ${err.message || String(err)}`,
        scores: {
          taskQuality: 0,
          efficiencyScore: 0,
          globalScore: 0
        }
      };
    } finally {
      // 6. Stop agents
      for (const regId of registeredIds) {
        try {
          await agentRegistry.stop(regId, false);
        } catch {}
      }
    }
  }
}

