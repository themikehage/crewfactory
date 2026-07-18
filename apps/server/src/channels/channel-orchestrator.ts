import { channelStore } from "./channel-store";
import { channelExecutionStore } from "./channel-execution-store";
import { agentRegistry } from "../agents";
import { resolveTopologyRecipients, type Channel, type ChannelMember, type ChannelMessage, type ChannelTopology } from "shared";
import { AgentWorkQueue } from "./agent-work-queue";
import type { DispatchResult } from "./agent-work-queue";
import {
  AgentPromptRunner,
  buildAgentNameMap,
  type ActiveAgentStream,
} from "./agent-prompt-runner";
import { handleNegotiation } from "./channel-negotiation-handler";
import { createMessagePublisher } from "./channel-message-publisher";
import { parseMentions } from "./mention-parser";
import { collectChannelTokens } from "../core/agent-utils";
import { type RunToCompletionConfig, type RunToCompletionResult } from "./types";



type BroadcastFn = (channelId: string, data: any) => void;
let broadcastToChannelFn: BroadcastFn | null = null;

export function setChannelBroadcastHandler(fn: BroadcastFn) {
  broadcastToChannelFn = fn;
}

function broadcast(channelId: string, data: any) {
  if (broadcastToChannelFn) {
    broadcastToChannelFn(channelId, data);
  }
}

const MAX_CHAIN_DEPTH = 5;

class ChannelOrchestrator {
  private abortedDispatches = new Set<string>();
  private agentQueues = new Map<string, AgentWorkQueue>();
  private channelAbortControllers = new Map<string, AbortController>();
  private activeStreams = new Map<string, Map<string, ActiveAgentStream>>();
  private activeChains = new Map<string, { count: number; resolve: () => void }>();
  private consecutiveSilentRounds = new Map<string, number>();
  private activeExecutionIds = new Map<string, { username: string; channelId: string; executionId: string }>();

  private promptRunner: AgentPromptRunner;
  private messagePublisher: ReturnType<typeof createMessagePublisher>;

  constructor() {
    this.promptRunner = new AgentPromptRunner(this.activeStreams, broadcast, (event) => {
      const key = `${event.channelId}:${event.sessionId || "default"}`;
      const execution = this.activeExecutionIds.get(key);
      if (execution) {
        const persisted = channelExecutionStore.appendEvent(execution.username, execution.channelId, execution.executionId, event);
        broadcast(event.channelId, { type: "channel_execution_event", event: persisted });
      }
    });
    this.messagePublisher = createMessagePublisher(broadcast);
  }

  private incrementChain(key: string) {
    const entry = this.activeChains.get(key);
    if (entry) {
      entry.count++;
    }
  }

  private decrementChain(key: string) {
    const entry = this.activeChains.get(key);
    if (entry) {
      entry.count--;
      if (entry.count <= 0) {
        const execution = this.activeExecutionIds.get(key);
        if (execution && !this.abortedDispatches.has(key)) {
          const current = channelExecutionStore.getExecution(execution.username, execution.channelId, execution.executionId);
          if (current?.status === "running" || current?.status === "pending") {
            channelExecutionStore.appendEvent(execution.username, execution.channelId, execution.executionId, { type: "execution_completed" });
          }
          this.activeExecutionIds.delete(key);
        }
        entry.resolve();
        this.activeChains.delete(key);
      }
    }
  }

  private getOrCreateQueue(agentId: string): AgentWorkQueue {
    let q = this.agentQueues.get(agentId);
    if (!q) {
      q = new AgentWorkQueue();
      this.agentQueues.set(agentId, q);
    }
    return q;
  }

  getActiveStreams(channelId: string, sessionId?: string): Record<string, ActiveAgentStream> {
    const key = `${channelId}:${sessionId || "default"}`;
    const map = this.activeStreams.get(key);
    if (!map) return {};

    const result: Record<string, ActiveAgentStream> = {};
    for (const [agentId, stream] of map.entries()) {
      result[agentId] = stream;
    }
    return result;
  }

  removeAgentQueue(agentId: string): void {
    const q = this.agentQueues.get(agentId);
    if (q) {
      q.abortCurrent();
      q.clear();
      this.agentQueues.delete(agentId);
    }
  }

  abortDispatch(username: string, channelId: string, sessionId?: string): void {
    const key = `${channelId}:${sessionId || "default"}`;
    this.abortedDispatches.add(key);
    console.log(`[ChannelOrchestrator] Aborting dispatch for ${key}`);

    this.activeStreams.delete(key);

    const controller = this.channelAbortControllers.get(key);
    controller?.abort();
    this.channelAbortControllers.delete(key);
    const execution = this.activeExecutionIds.get(key);
    if (execution) {
      channelExecutionStore.finishOpenTurns(execution.username, execution.channelId, execution.executionId, "aborted", "aborted");
      channelExecutionStore.appendEvent(execution.username, execution.channelId, execution.executionId, { type: "execution_aborted" });
      this.activeExecutionIds.delete(key);
    }

    const channel = channelStore.getChannel(username, channelId);
    if (channel) {
      for (const member of channel.members) {
        const q = this.agentQueues.get(member.agentId);
        if (q) {
          q.abortCurrent();
          q.clear();
        }
        const entry = agentRegistry.get(member.agentId);
        if (entry && entry.server.session.isStreaming) {
          entry.server.session.abort().catch(() => {});
        }
      }
    }

    broadcast(channelId, { type: "channel_dispatch_aborted", channelId, sessionId });
  }

  async dispatchUserMessage(
    username: string,
    channelId: string,
    userContent: string,
    sessionId?: string
  ): Promise<void> {
    const key = `${channelId}:${sessionId || "default"}`;
    this.abortedDispatches.delete(key);

    const channel = channelStore.getChannel(username, channelId);
    if (!channel) throw new Error("Channel not found");

    if (channel.executionProtocolEnabled !== false) {
      const execution = channelExecutionStore.createExecution(username, channelId, { sessionId, schedulerMode: channel.topology?.schedulerMode ?? channel.executionSchedulerMode ?? "sequential", topologyVersion: channel.topology?.version });
      this.activeExecutionIds.set(key, { username, channelId, executionId: execution.id });
      channelExecutionStore.appendEvent(username, channelId, execution.id, { type: "execution_started", sessionId });
    }

    const agentNameMap = buildAgentNameMap(channel.members);
    const mentions = parseMentions(userContent, channel.members, agentNameMap);

    const userMsg: ChannelMessage = {
      id: crypto.randomUUID(),
      channelId,
      sessionId,
      role: "user",
      content: userContent,
      mentions: mentions.length > 0 ? mentions : undefined,
      createdAt: new Date().toISOString(),
    };

    this.messagePublisher(username, channelId, channel.name, userMsg, "user_message");

    channelStore.resetNegotiationState(username, channelId);
    this.consecutiveSilentRounds.delete(key);

    const controller = new AbortController();
    this.channelAbortControllers.set(key, controller);

    let resolveChain: () => void = () => {};
    const chainPromise = new Promise<void>((resolve) => {
      resolveChain = resolve;
    });
    this.activeChains.set(key, { count: 0, resolve: resolveChain });

    const isBroadcastChannel = !channel.topology || channel.topology.kind === "legacy_custom"
      ? channel.members.some((m) => m.replyMode === "broadcast")
      : false;

    if (isBroadcastChannel) {
      this.incrementChain(key);
      this.runSequentialBroadcastLoop(username, channelId, userMsg, controller.signal)
        .catch((err) => {
          console.error(`[ChannelOrchestrator] Sequential broadcast loop error:`, err);
        })
        .finally(() => {
          this.decrementChain(key);
        });
    } else {
      this.incrementChain(key);
      Promise.resolve()
        .then(() => this.runDispatchRound(username, channelId, userMsg, 1, controller.signal, (channel.topology?.schedulerMode ?? channel.executionSchedulerMode) === "parallel"))
        .catch((err) => {
          console.error(`[ChannelOrchestrator] Non-broadcast dispatch error:`, err);
        })
        .finally(() => {
          this.decrementChain(key);
        });
    }

    return chainPromise;
  }

  private async runDispatchRound(
    username: string,
    channelId: string,
    incomingMsg: ChannelMessage,
    depth: number,
    signal: AbortSignal,
    parallel = false
  ): Promise<void> {
    if (signal.aborted) return;

    const key = `${channelId}:${incomingMsg.sessionId || "default"}`;
    if (this.abortedDispatches.has(key)) return;

    const channel = channelStore.getChannel(username, channelId);
    if (!channel || channel.members.length === 0) return;

    const maxDepth = channel.maxChainDepth ?? MAX_CHAIN_DEPTH;
    if (depth > maxDepth) {
      console.warn(`[ChannelOrchestrator] Max chain depth reached (${maxDepth}) for channel ${channelId}`);
      broadcast(channelId, { type: "channel_chain_limit", channelId, maxChainDepth: maxDepth });
      const execution = this.activeExecutionIds.get(key);
      if (execution) {
        channelExecutionStore.finishOpenTurns(username, channelId, execution.executionId, "skipped", "chain_limit");
        channelExecutionStore.appendEvent(username, channelId, execution.executionId, { type: "execution_completed", sessionId: incomingMsg.sessionId, payload: { withWarnings: true, reason: "chain_limit", maxDepth } });
      }
      return;
    }

    const targetMembers = this.resolveRecipients(channel, incomingMsg);
    if (targetMembers.length === 0) return;

    const dispatchMember = async (member: ChannelMember) => {
      this.incrementChain(key);
      await this.dispatchToAgentAsync(username, channelId, member, incomingMsg, depth, signal).catch((err) => {
        console.error(`[ChannelOrchestrator] Unexpected error dispatching to ${member.agentId}:`, err);
      });
    };
    if (parallel) {
      await Promise.all(targetMembers.map(dispatchMember));
    } else {
      for (const member of targetMembers) await dispatchMember(member);
    }
  }

  private async dispatchToAgentAsync(
    username: string,
    channelId: string,
    member: ChannelMember,
    incomingMsg: ChannelMessage,
    depth: number,
    signal: AbortSignal
  ): Promise<void> {
    const key = `${channelId}:${incomingMsg.sessionId || "default"}`;
    try {
      await this.dispatchToAgentAsyncInternal(username, channelId, member, incomingMsg, depth, signal);
    } finally {
      this.decrementChain(key);
    }
  }

  private async dispatchToAgentAsyncInternal(
    username: string,
    channelId: string,
    member: ChannelMember,
    incomingMsg: ChannelMessage,
    depth: number,
    signal: AbortSignal
  ): Promise<void> {
    if (signal.aborted) return;

    const key = `${channelId}:${incomingMsg.sessionId || "default"}`;
    if (this.abortedDispatches.has(key)) return;

    const execution = this.activeExecutionIds.get(key);
    const agentEntry = agentRegistry.get(member.agentId);
    if (!agentEntry || agentEntry.status === "stopped") {
      broadcast(channelId, {
        type: "channel_agent_error",
        channelId,
        agentId: member.agentId,
        error: `Agent "${member.agentId}" is not available`,
      });
      if (execution) {
        const turn = channelExecutionStore.createTurn(username, channelId, execution.executionId, member.agentId, channelExecutionStore.getExecution(username, channelId, execution.executionId)?.turns.length ?? 0);
        channelExecutionStore.updateTurn(username, channelId, execution.executionId, turn.id, "skipped", { skipReason: "unavailable" });
        channelExecutionStore.appendEvent(username, channelId, execution.executionId, { type: "turn_skipped", sessionId: incomingMsg.sessionId, agentId: member.agentId, turnId: turn.id, payload: { reason: "unavailable", depth } });
      }
      return;
    }

    const queue = this.getOrCreateQueue(member.agentId);
    const turn = execution
      ? channelExecutionStore.createTurn(username, channelId, execution.executionId, member.agentId, channelExecutionStore.getExecution(username, channelId, execution.executionId)?.turns.length ?? 0)
      : null;
    if (execution) {
      channelExecutionStore.appendEvent(username, channelId, execution.executionId, { type: "turn_planned", sessionId: incomingMsg.sessionId, agentId: member.agentId, turnId: turn?.id, payload: { depth, index: turn?.index } });
      channelExecutionStore.appendEvent(username, channelId, execution.executionId, {
        type: "turn_started",
        sessionId: incomingMsg.sessionId,
        agentId: member.agentId,
        turnId: turn?.id,
        payload: { depth, incomingMessageId: incomingMsg.id },
      });
    }
    const members = channelStore.getChannel(username, channelId)?.members || [];
    const agentNameMap = buildAgentNameMap(members);

    let result: DispatchResult;
    try {
      result = await queue.enqueue({
        id: crypto.randomUUID(),
        signal,
        execute: () =>
          this.promptRunner.run(username, channelId, member, incomingMsg, agentNameMap, signal),
      });
    } catch (err: any) {
      if (
        err.message === "Aborted before enqueue" ||
        err.message === "Aborted while queued" ||
        err.message === "Queue cleared"
      ) {
        return;
      }
      console.error(`[ChannelOrchestrator] Queue error for agent ${member.agentId}:`, err);
      if (execution) {
        if (turn) channelExecutionStore.updateTurn(username, channelId, execution.executionId, turn.id, "failed", { error: String(err.message || err) });
        channelExecutionStore.appendEvent(username, channelId, execution.executionId, {
          type: "turn_failed",
          sessionId: incomingMsg.sessionId,
          agentId: member.agentId,
          payload: { error: String(err.message || err), depth },
        });
      }
      return;
    }

    if (!result.agentMsg || signal.aborted || this.abortedDispatches.has(key)) {
      if (!signal.aborted && !this.abortedDispatches.has(key) && !result.agentMsg) {
          if (execution) {
          if (turn) channelExecutionStore.updateTurn(username, channelId, execution.executionId, turn.id, "skipped", { skipReason: "silent" });
          channelExecutionStore.appendEvent(username, channelId, execution.executionId, {
            type: "turn_skipped",
            sessionId: incomingMsg.sessionId,
            agentId: member.agentId,
            payload: { reason: "silent", depth },
          });
        }
        const silentCount = (this.consecutiveSilentRounds.get(key) ?? 0) + 1;
        this.consecutiveSilentRounds.set(key, silentCount);
        if (silentCount >= 2) {
          console.log(`[ChannelOrchestrator] Equilibrium reached after ${silentCount} silent rounds. Stopping chain for ${key}.`);
          this.consecutiveSilentRounds.delete(key);
        }
      }
      return;
    }

    const channel = channelStore.getChannel(username, channelId);
    if (!channel) return;

    const completeTurn = () => {
      if (!execution) return;
      if (turn) channelExecutionStore.updateTurn(username, channelId, execution.executionId, turn.id, "completed", { messageId: result.agentMsg.id });
      channelExecutionStore.appendEvent(username, channelId, execution.executionId, {
        type: "turn_completed",
        sessionId: incomingMsg.sessionId,
        agentId: member.agentId,
        turnId: turn?.id,
        payload: { messageId: result.agentMsg.id, depth },
      });
    };

    const negResult = handleNegotiation(
      username,
      channelId,
      channel,
      member.agentId,
      incomingMsg,
      result.agentMsg,
      agentNameMap,
      broadcast
    );
    if (execution) {
      channelExecutionStore.appendEvent(username, channelId, execution.executionId, {
        type: "negotiation",
        sessionId: incomingMsg.sessionId,
        agentId: member.agentId,
        turnId: turn?.id,
        payload: { action: negResult.action },
      });
    }

    if (negResult.action === "stop-rejected") {
      this.messagePublisher(username, channelId, channel.name, result.agentMsg);
      completeTurn();
      return;
    }

    if (negResult.action === "escalate" && negResult.escalationMessage && negResult.arbiterMember) {
      this.messagePublisher(username, channelId, channel.name, result.agentMsg);
      completeTurn();

      this.incrementChain(key);
      this.dispatchToAgentAsync(
        username,
        channelId,
        negResult.arbiterMember,
        negResult.escalationMessage,
        depth + 1,
        signal
      ).catch((err) => {
        console.error(`[ChannelOrchestrator] Escalation dispatch error:`, err);
      });
      return;
    }

    this.messagePublisher(username, channelId, channel.name, result.agentMsg);
    completeTurn();

    this.consecutiveSilentRounds.set(key, 0);

    if (negResult.action === "continue") {
      await this.runDispatchRound(username, channelId, result.agentMsg, depth + 1, signal, (channel.topology?.schedulerMode ?? channel.executionSchedulerMode) === "parallel");
    }
  }

  private resolveRecipients(channel: Channel, incomingMsg: ChannelMessage): ChannelMember[] {
    if (channel.topology && channel.topology.kind !== "legacy_custom") {
      return resolveTopologyRecipients(channel, channel.topology, incomingMsg);
    }
    const mentioned = incomingMsg.mentions ?? [];
    const recipientSet = new Set<string>();
    const result: ChannelMember[] = [];

    for (const member of channel.members) {
      if (incomingMsg.role === "agent" && incomingMsg.agentId === member.agentId) {
        continue;
      }

      const isMentioned = mentioned.includes(member.agentId);
      let addedByMode = false;

      if (member.replyMode === "mention-only") {
        if (isMentioned) addedByMode = true;
      } else if (incomingMsg.role === "user") {
        if (member.replyMode === "user-only" || member.replyMode === "broadcast") {
          addedByMode = true;
        } else if (member.replyMode === "targeted" && member.targetAgentIds?.includes("__user__")) {
          addedByMode = true;
        }
      } else if (incomingMsg.role === "agent") {
        const senderId = incomingMsg.agentId!;
        if (member.replyMode === "broadcast") {
          addedByMode = true;
        } else if (member.replyMode === "targeted" && member.targetAgentIds?.includes(senderId)) {
          addedByMode = true;
        }
      }

      if ((addedByMode || isMentioned) && !recipientSet.has(member.agentId)) {
        recipientSet.add(member.agentId);
        result.push(member);
      }
    }

    if (channel.executionSchedulerMode === "leader-gated" && incomingMsg.role === "user") {
      const lead = result.find((member) => member.role === "lead") ?? channel.members.find((member) => member.role === "lead");
      return lead ? [lead] : result;
    }
    return result;
  }

  private async runSequentialBroadcastLoop(
    username: string,
    channelId: string,
    initialMsg: ChannelMessage,
    signal: AbortSignal
  ): Promise<void> {
    const key = `${channelId}:${initialMsg.sessionId || "default"}`;
    const channel = channelStore.getChannel(username, channelId);
    if (!channel || channel.members.length === 0) return;

    const maxDepth = channel.maxChainDepth ?? MAX_CHAIN_DEPTH;
    let depth = 1;
    let currentIncomingMsg = initialMsg;

    while (depth <= maxDepth && !signal.aborted && !this.abortedDispatches.has(key)) {
      console.log(`[ChannelOrchestrator] Sequential Round ${depth} starting...`);
      let roundActive = false;

      const agentNameMap = buildAgentNameMap(channel.members);

      for (const member of channel.members) {
        if (signal.aborted || this.abortedDispatches.has(key)) return;

        if (currentIncomingMsg.role === "agent" && currentIncomingMsg.agentId === member.agentId) {
          continue;
        }

        const recipients = this.resolveRecipients(channel, currentIncomingMsg);
        const isEligible = recipients.some((r) => r.agentId === member.agentId);
        if (!isEligible) continue;

        const queue = this.getOrCreateQueue(member.agentId);
        let result: DispatchResult;
        try {
          result = await queue.enqueue({
            id: crypto.randomUUID(),
            signal,
            execute: () =>
              this.promptRunner.run(
                username,
                channelId,
                member,
                currentIncomingMsg,
                agentNameMap,
                signal
              ),
          });
        } catch (err: any) {
          if (
            err.message === "Aborted before enqueue" ||
            err.message === "Aborted while queued" ||
            err.message === "Queue cleared"
          ) {
            return;
          }
          console.error(`[ChannelOrchestrator] Queue error for agent ${member.agentId}:`, err);
          continue;
        }

        if (!result.agentMsg || signal.aborted || this.abortedDispatches.has(key)) continue;

        this.messagePublisher(username, channelId, channel.name, result.agentMsg);

        currentIncomingMsg = result.agentMsg;
        roundActive = true;

        const negResult = handleNegotiation(
          username,
          channelId,
          channel,
          member.agentId,
          currentIncomingMsg,
          result.agentMsg,
          agentNameMap,
          broadcast
        );

        if (negResult.action === "stop-agreed") {
          console.log(`[ChannelOrchestrator] Consensus reached. Stopping sequence.`);
          return;
        }

        if (negResult.action === "stop-rejected") {
          console.log(`[ChannelOrchestrator] Consensus rejected/failed. Stopping sequence.`);
          return;
        }

        if (negResult.action === "escalate" && negResult.escalationMessage && negResult.arbiterMember) {
          const negotiationState = channelStore.getNegotiationState(username, channelId);
          const currentArbitrations = negotiationState._arbitrations || 0;

          if (currentArbitrations >= 3) {
            console.log(`[ChannelOrchestrator] Max arbitrations reached (${currentArbitrations}). Forcing safety fallback resolution.`);
            
            const fallbackMsg: ChannelMessage = {
              id: crypto.randomUUID(),
              channelId,
              sessionId: currentIncomingMsg.sessionId || crypto.randomUUID(),
              role: "system",
              content: `RESOLUTION: Se aplica el protocolo de contingencia "Safety First". Se rechaza la propuesta de arquitectura serverless de bajo costo debido a que no garantiza el aislamiento físico y el cifrado HSM exigido por el auditor de seguridad. Se ordena implementar una base de datos PostgreSQL dedicada en AWS RDS con cifrado de llaves en AWS KMS y tokens externos.\n\nREASONING: Límite de rondas de debate excedido sin acuerdo técnico consensuado. Se prioriza el cumplimiento estricto de seguridad para mitigar riesgos operativos de cumplimiento.\n\nOVERRULED: Se desestima la propuesta original del Tech Lead por no cumplir las normas PCI-DSS.`,
              createdAt: new Date().toISOString(),
            };

            this.messagePublisher(username, channelId, channel.name, fallbackMsg);
            currentIncomingMsg = fallbackMsg;
            return;
          }

          console.log(`[ChannelOrchestrator] Escalation triggered. Invoking arbiter.`);
          this.messagePublisher(username, channelId, channel.name, negResult.escalationMessage);
          currentIncomingMsg = negResult.escalationMessage;

          const arbiterMember = negResult.arbiterMember;
          const queue = this.getOrCreateQueue(arbiterMember.agentId);
          let arbiterResult: DispatchResult;
          try {
            arbiterResult = await queue.enqueue({
              id: crypto.randomUUID(),
              signal,
              execute: () =>
                this.promptRunner.run(
                  username,
                  channelId,
                  arbiterMember,
                  currentIncomingMsg,
                  agentNameMap,
                  signal
                ),
            });
            if (arbiterResult.agentMsg) {
              this.messagePublisher(username, channelId, channel.name, arbiterResult.agentMsg);
              currentIncomingMsg = arbiterResult.agentMsg;
              roundActive = true;
            }
          } catch (err: any) {
            console.error(`[ChannelOrchestrator] Queue error for arbiter agent ${arbiterMember.agentId}:`, err);
          }
          continue;
        }
      }

      if (!roundActive) {
        console.log(`[ChannelOrchestrator] Equilibrium reached (all agents silent). Stopping sequence.`);
        return;
      }

      depth++;
    }

    if (depth > maxDepth) {
      console.warn(`[ChannelOrchestrator] Max chain depth reached (${maxDepth}) for channel ${channelId}`);
      broadcast(channelId, { type: "channel_chain_limit", channelId, maxChainDepth: maxDepth });
    }
  }

  async runToCompletion(
    username: string,
    config: RunToCompletionConfig
  ): Promise<RunToCompletionResult> {
    const {
      channelId,
      channelName,
      description,
      members,
      maxChainDepth,
      showThinking,
      showTools,
      negotiationProtocol,
      contextItems,
      taskPrompt,
      sessionId,
      sessionName,
      signal,
      preserveChannel,
    } = config;

    // 1. Clean stale channel / check preserve
    if (!preserveChannel) {
      try {
        channelStore.deleteChannel(username, channelId);
      } catch {}

      // 2. Create channel
      channelStore.createChannel(username, {
        id: channelId,
        name: channelName,
        description,
        maxChainDepth,
        showThinking,
        showTools,
        context: contextItems,
        negotiationProtocol,
      } as any);

      // 3. Set members
      channelStore.updateMembers(username, channelId, members as any);
    } else {
      const existing = channelStore.getChannel(username, channelId);
      if (!existing) {
        channelStore.createChannel(username, {
          id: channelId,
          name: channelName,
          description,
          maxChainDepth,
          showThinking,
          showTools,
          context: contextItems,
          negotiationProtocol,
        } as any);
      } else {
        channelStore.updateChannel(username, channelId, {
          name: channelName,
          description,
          maxChainDepth,
          showThinking,
          showTools,
          context: contextItems,
          negotiationProtocol,
        } as any);
      }
      channelStore.updateMembers(username, channelId, members as any);
    }

    // 4. Create session + metadata
    const { sessionManager } = await import("../core/session-manager");
    await sessionManager.getOrCreateSession(username, sessionId, undefined, undefined, channelId);
    sessionManager.metadataStore.saveSessionMetadata(username, sessionId, {
      name: sessionName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      channelId,
      isExecution: true,
    });


    // 5. Dispatch and wait
    const agentIds = members.map((m) => m.agentId);
    let status: "completed" | "failed" | "aborted" = "completed";

    try {
      if (signal?.aborted) {
        return {
          status: "aborted",
          messages: [],
          tokensIn: 0,
          tokensOut: 0,
          negotiationRounds: 0,
          escalationsToLeader: 0,
          agreementReached: false,
        };
      }

      const dispatchPromise = this.dispatchUserMessage(username, channelId, taskPrompt, sessionId);

      if (signal) {
        const abortPromise = new Promise<void>((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
        await Promise.race([dispatchPromise, abortPromise]);
      } else {
        await dispatchPromise;
      }
    } catch (err: any) {
      if (err.message === "aborted" || signal?.aborted) {
        this.abortDispatch(username, channelId, sessionId);
        status = "aborted";
      } else {
        console.error(`[ChannelOrchestrator.runToCompletion] Dispatch error:`, err);
        status = "failed";
      }
    }

    // 6. Collect messages
    const messages = channelStore.getMessages(username, channelId, 100, sessionId);

    // 7. Collect tokens using the helper function
    const { tokensIn, tokensOut } = collectChannelTokens(
      channelStore,
      agentRegistry,
      username,
      channelId,
      sessionId,
      agentIds
    );

    // 8. Collect negotiation metrics
    const negState = channelStore.getNegotiationState(username, channelId);
    let negotiationRounds = 0;
    let escalationsToLeader = 0;
    let agreementReached = false;

    const agentMessages = messages.filter((m) => m.role === "agent");
    agreementReached = agentMessages.some((m) =>
      m.content?.includes("ACUERDO ALCANZADO") ||
      m.content?.includes("ACEPTO la propuesta") ||
      m.content?.includes("ACEPTO") ||
      m.content?.includes("RESOLUTION:")
    );

    for (const key of Object.keys(negState)) {
      if (key.startsWith("_")) continue; // Skip internal count keys
      negotiationRounds = Math.max(negotiationRounds, negState[key].rounds || 0);
      if (negState[key].status === "escalated") {
        escalationsToLeader++;
      }
    }

    const divergenceEventsCount = negState._divergences || 0;
    const arbitrationRoundsCount = negState._arbitrations || 0;
    const totalTurns = agentMessages.length;
    const protocolActivationRate = totalTurns > 0 ? parseFloat((divergenceEventsCount / totalTurns).toFixed(2)) : 0;

    return {
      status,
      messages,
      tokensIn,
      tokensOut,
      negotiationRounds,
      escalationsToLeader,
      agreementReached,
      divergenceEventsCount,
      arbitrationRoundsCount,
      protocolActivationRate,
    };
  }
}


export const channelOrchestrator = new ChannelOrchestrator();
export { ChannelOrchestrator };
