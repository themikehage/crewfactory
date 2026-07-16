import { channelStore, channelOrchestrator } from "../channels";
import { ChannelBenchmarkStore } from "./channel-benchmark-store";
import { ChannelBenchmarkJudge } from "./channel-benchmark-judge";
import { sessionManager } from "../core/session-manager";
import { agentRegistry } from "../agents";
import { broadcastToUser } from "../ws/handler";
import { SessionPrefix } from "shared";
import type { ChannelBenchmarkRun, BenchmarkVariantResult } from "shared";

function getSingleSessionTokens(session: any): { tokensIn: number; tokensOut: number } {
  let tokensIn = 0;
  let tokensOut = 0;
  try {
    const stats = session.getSessionStats();
    if (stats && stats.tokens) {
      tokensIn = stats.tokens.input || 0;
      tokensOut = stats.tokens.output || 0;
    }
  } catch {}
  if (tokensIn === 0 && tokensOut === 0 && session.messages) {
    for (const m of session.messages) {
      const anyM = m as any;
      if (anyM.usage) {
        tokensIn += anyM.usage.input || 0;
        tokensOut += anyM.usage.output || 0;
      }
    }
  }
  return { tokensIn, tokensOut };
}

export class ChannelBenchmarkRunner {
  private static activeRuns = new Map<string, AbortController>();

  static isRunning(channelId: string): boolean {
    return this.activeRuns.has(channelId);
  }

  static async stopBenchmark(username: string, channelId: string): Promise<void> {
    const controller = this.activeRuns.get(channelId);
    if (controller) {
      controller.abort();
      this.activeRuns.delete(channelId);
    }
    
    // Attempt abort on the orchestrator side as well
    try {
      channelOrchestrator.abortDispatch(username, channelId);
    } catch {}
  }

  static async runBenchmark(
    username: string,
    channelId: string,
    opts: {
      taskPrompt: string;
      name?: string;
      singleAgentId?: string;
      criteria?: string[];
      judgeModel?: string;
    }
  ): Promise<{ runId: string }> {
    if (this.isRunning(channelId)) {
      throw new Error("Benchmark is already running on this channel");
    }

    const originalChannel = channelStore.getChannel(username, channelId);
    if (!originalChannel) {
      throw new Error("Channel not found");
    }
    if (originalChannel.members.length < 1) {
      throw new Error("Channel must have at least 1 agent member to benchmark");
    }

    const runId = crypto.randomUUID();
    const controller = new AbortController();
    this.activeRuns.set(channelId, controller);

    // Resolve single agent baseline
    let singleAgentId = opts.singleAgentId;
    if (!singleAgentId) {
      const leadMember = originalChannel.members.find((m) => m.role === "lead");
      singleAgentId = leadMember ? leadMember.agentId : originalChannel.members[0].agentId;
    }

    // Default criteria
    const criteria = opts.criteria && opts.criteria.length > 0
      ? opts.criteria
      : ["Quality", "Completeness", "Accuracy"];

    // Snapshot channel + agents definition
    const agentsSnapshot: any[] = [];
    for (const m of originalChannel.members) {
      const definition = agentRegistry.get(m.agentId);
      if (definition) {
        agentsSnapshot.push({
          id: definition.id,
          name: definition.name,
          role: definition.role,
          systemPrompt: definition.systemPrompt,
          model: definition.model,
          skills: definition.skills,
        });
      }
    }

    const channelSnapshot = {
      channel: {
        id: originalChannel.id,
        name: originalChannel.name,
        description: originalChannel.description,
        members: originalChannel.members,
        context: originalChannel.context,
        maxChainDepth: originalChannel.maxChainDepth,
        showThinking: originalChannel.showThinking,
        showTools: originalChannel.showTools,
        negotiationProtocol: originalChannel.negotiationProtocol,
        delegationPattern: originalChannel.delegationPattern,
      },
      agents: agentsSnapshot,
    };

    // Initialize run record
    const run: ChannelBenchmarkRun = {
      runId,
      channelId,
      channelSnapshot,
      taskPrompt: opts.taskPrompt,
      name: opts.name || `Run ${new Date().toLocaleDateString()}`,
      status: "running",
      variants: {
        multi: {
          channelId: `${SessionPrefix.BENCH_CLONE}${crypto.randomUUID()}`,
        },
        single: {
          agentId: singleAgentId,
        },
      },
      judge: {
        criteria,
        autoEvaluate: true,
      },
      createdAt: new Date().toISOString(),
    };

    // Save initial record to store
    ChannelBenchmarkStore.saveRun(username, channelId, run);

    // Broadcast start event
    broadcastToUser(username, {
      type: "benchmark_started",
      channelId,
      runId,
      status: "running"
    });

    // Execute asynchronously in background
    this.execute(username, channelId, run, controller.signal).catch((err) => {
      console.error(`[ChannelBenchmarkRunner] Async execution failed:`, err);
    });

    return { runId };
  }

  private static async execute(
    username: string,
    channelId: string,
    run: ChannelBenchmarkRun,
    signal: AbortSignal
  ): Promise<void> {
    const runId = run.runId;
    let cloneId: string | null = null;
    let singleSessionId: string | null = null;

    try {
      run.startedAt = new Date().toISOString();
      ChannelBenchmarkStore.saveRun(username, channelId, run);

      // --- 1. RUN MULTI-AGENT VARIANT ---
      if (signal.aborted) throw new Error("Benchmark aborted");
      broadcastToUser(username, {
        type: "benchmark_progress",
        channelId,
        runId,
        variant: "multi",
        status: "running"
      });

      const originalChannel = channelStore.getChannel(username, channelId);
      if (!originalChannel) throw new Error("Channel no longer exists");

      // Clone original channel
      cloneId = channelStore.cloneChannelForBenchmark(username, channelId);
      run.variants.multi.channelId = cloneId;

      const multiStartTime = Date.now();
      const multiResult = await channelOrchestrator.runToCompletion(username, {
        channelId: cloneId,
        channelName: `[Benchmark Clone]`,
        description: `Ephemeral clone for running benchmark`,
        members: originalChannel.members,
        maxChainDepth: originalChannel.maxChainDepth,
        showThinking: originalChannel.showThinking,
        showTools: originalChannel.showTools,
        negotiationProtocol: originalChannel.negotiationProtocol,
        contextItems: [
          { key: "TASK_CONTEXT", value: run.taskPrompt },
          ...(originalChannel.context || [])
        ],
        taskPrompt: run.taskPrompt,
        sessionId: `bench_multi_${runId}`,
        sessionName: `Benchmark Run - Multi-Agent`,
        signal,
        preserveChannel: true
      });

      const formattedMultiOutput = multiResult.messages
        .filter((m) => m.role === "agent")
        .map((m) => `[${m.agentName || m.agentId}]: ${m.content}`)
        .join("\n\n");

      const multiVarResult: BenchmarkVariantResult = {
        status: multiResult.status === "completed" ? "completed" : "failed",
        durationMs: Date.now() - multiStartTime,
        tokensIn: multiResult.tokensIn,
        tokensOut: multiResult.tokensOut,
        negotiationRounds: multiResult.negotiationRounds,
        escalationsToLeader: multiResult.escalationsToLeader,
        agreementReached: multiResult.agreementReached,
        finalOutput: formattedMultiOutput || "No output produced by multi-agent team",
        divergenceEventsCount: multiResult.divergenceEventsCount,
        arbitrationRoundsCount: multiResult.arbitrationRoundsCount,
        protocolActivationRate: multiResult.protocolActivationRate,
      };

      run.variants.multi.result = multiVarResult;
      ChannelBenchmarkStore.saveRun(username, channelId, run);

      // --- 2. RUN SINGLE-AGENT VARIANT ---
      if (signal.aborted) throw new Error("Benchmark aborted");
      broadcastToUser(username, {
        type: "benchmark_progress",
        channelId,
        runId,
        variant: "single",
        status: "running"
      });

      const singleAgentId = run.variants.single.agentId;
      singleSessionId = `bench_single_${runId}`;

      const singleStartTime = Date.now();
      const singleSession = await sessionManager.getOrCreateSession(
        username,
        singleSessionId,
        undefined,
        singleAgentId
      );

      sessionManager.metadataStore.saveSessionMetadata(username, singleSessionId, {
        name: `Benchmark Run - Single Agent Baseline`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        agentId: singleAgentId,
        isExecution: true
      });

      await singleSession.prompt(run.taskPrompt);

      const singleMessages = singleSession.messages;
      const finalSingleMsg = [...singleMessages].reverse().find((m) => m.role === "assistant");
      const formattedSingleOutput = typeof finalSingleMsg?.content === "string"
        ? finalSingleMsg.content
        : Array.isArray(finalSingleMsg?.content)
          ? finalSingleMsg.content.map((c: any) => c.text || "").join("\n")
          : "";

      const { tokensIn: sIn, tokensOut: sOut } = getSingleSessionTokens(singleSession);

      const singleVarResult: BenchmarkVariantResult = {
        status: "completed",
        durationMs: Date.now() - singleStartTime,
        tokensIn: sIn,
        tokensOut: sOut,
        agreementReached: false,
        finalOutput: formattedSingleOutput || "No output produced by single agent",
      };

      run.variants.single.result = singleVarResult;
      ChannelBenchmarkStore.saveRun(username, channelId, run);

      // --- 3. RUN LLM JUDGE ---
      if (signal.aborted) throw new Error("Benchmark aborted");
      broadcastToUser(username, {
        type: "benchmark_progress",
        channelId,
        runId,
        variant: "judging",
        status: "running"
      });

      const judgeResult = await ChannelBenchmarkJudge.evaluateRuns(
        username,
        channelId,
        runId,
        run.taskPrompt,
        run.judge.criteria,
        {
          multi: multiVarResult.finalOutput,
          single: singleVarResult.finalOutput
        }
      );

      // Fill compound score values in run variants
      if (run.variants.multi.result) {
        run.variants.multi.result.scores = {
          taskQuality: judgeResult.criteriaScores.multi[run.judge.criteria[0]] || judgeResult.scores.multi,
          efficiencyScore: 100, // normalized placeholder or metric
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
      run.status = "completed";
      run.completedAt = new Date().toISOString();
      ChannelBenchmarkStore.saveRun(username, channelId, run);

      broadcastToUser(username, {
        type: "benchmark_complete",
        channelId,
        runId,
        run
      });

    } catch (err: any) {
      console.error(`[ChannelBenchmarkRunner] Run ${runId} failed:`, err);
      run.status = "failed";
      run.completedAt = new Date().toISOString();
      run.error = err.message || String(err);
      
      // Update variant status if they were running
      if (run.variants.multi.result && run.variants.multi.result.status === "completed") {
        // Multi succeeded, so single failed or judge failed
      } else if (run.variants.multi.result) {
        run.variants.multi.result.status = "failed";
        run.variants.multi.result.finalOutput = `Error: ${run.error}`;
      } else {
        run.variants.multi.result = {
          status: "failed",
          durationMs: 0,
          tokensIn: 0,
          tokensOut: 0,
          agreementReached: false,
          finalOutput: `Error: ${run.error}`
        };
      }

      if (!run.variants.single.result) {
        run.variants.single.result = {
          status: "failed",
          durationMs: 0,
          tokensIn: 0,
          tokensOut: 0,
          agreementReached: false,
          finalOutput: `Error: ${run.error}`
        };
      }

      ChannelBenchmarkStore.saveRun(username, channelId, run);

      broadcastToUser(username, {
        type: "benchmark_failed",
        channelId,
        runId,
        error: run.error
      });

    } finally {
      // CLEANUP clone channel
      if (cloneId) {
        try {
          channelStore.deleteChannel(username, cloneId);
        } catch (e) {
          console.error(`[ChannelBenchmarkRunner] Failed to clean up clone channel ${cloneId}:`, e);
        }
      }

      // CLEANUP single agent session
      if (singleSessionId) {
        try {
          await sessionManager.destroySession(username, singleSessionId);
        } catch (e) {
          console.error(`[ChannelBenchmarkRunner] Failed to clean up single session ${singleSessionId}:`, e);
        }
      }

      this.activeRuns.delete(channelId);
    }
  }
}
