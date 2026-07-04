import { channelStore } from "./channel-store";
import { agentRegistry } from "../agents";
import { piSessionManager } from "../pi/session-manager";
import { parseMentions } from "./mention-parser";
import type { Channel, ChannelMember, ChannelMessage } from "shared";
import { eventBroker } from "../lib/event-broker";
import { AgentWorkQueue } from "./agent-work-queue";
import type { DispatchResult } from "./agent-work-queue";
import { NegotiationStateMachine } from "./negotiation-state";
import { TaskLedger } from "./task-ledger";

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

export interface ActiveAgentStream {
  agentId: string;
  agentName: string;
  text: string;
  thinking: string;
  toolCalls: Record<string, {
    toolName: string;
    args: any;
    result: any | null;
    isError: boolean;
  }>;
}

class ChannelOrchestrator {
  private abortedDispatches = new Set<string>(); // `${channelId}:${sessionId || 'default'}`
  private agentQueues = new Map<string, AgentWorkQueue>();
  private channelAbortControllers = new Map<string, AbortController>(); // key = channelId:sessionId
  private activeStreams = new Map<string, Map<string, ActiveAgentStream>>();

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

    // Remove active stream snapshots
    this.activeStreams.delete(key);

    // Signal the AbortController for this dispatch
    const controller = this.channelAbortControllers.get(key);
    controller?.abort();
    this.channelAbortControllers.delete(key);

    // Abort in-flight prompts and clear queues for all channel members
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


  private buildAgentNameMap(members: ChannelMember[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const member of members) {
      const entry = agentRegistry.get(member.agentId);
      if (entry) map.set(member.agentId, entry.server.definition.name);
    }
    return map;
  }

  async dispatchUserMessage(username: string, channelId: string, userContent: string, sessionId?: string): Promise<void> {
    const key = `${channelId}:${sessionId || "default"}`;
    this.abortedDispatches.delete(key);

    const channel = channelStore.getChannel(username, channelId);
    if (!channel) throw new Error("Channel not found");

    const agentNameMap = this.buildAgentNameMap(channel.members);
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

    channelStore.appendMessage(username, channelId, userMsg);
    broadcast(channelId, { type: "channel_message", channelId, message: userMsg });

    eventBroker.publishEvent(username, {
      sourceType: "channel",
      sourceId: channelId,
      sourceName: channel.name,
      eventType: "user_message",
      detail: userContent,
    });

    // Reset negotiation state and task ledger at start of chain
    channelStore.resetNegotiationState(username, channelId);
    const ledgerPath = channelStore.getTaskLedgerPath(username, channelId);
    const ledger = new TaskLedger(ledgerPath);
    ledger.reset();

    // Create a new AbortController for this dispatch chain
    const controller = new AbortController();
    this.channelAbortControllers.set(key, controller);

    // Check if this channel uses broadcast (cooperative/leaderless) reply mode
    const isBroadcastChannel = channel.members.some(m => m.replyMode === "broadcast");

    if (isBroadcastChannel) {
      this.runSequentialBroadcastLoop(username, channelId, userMsg, controller.signal).catch((err) => {
        console.error(`[ChannelOrchestrator] Sequential broadcast loop error:`, err);
      });
    } else {
      // Fire-and-forget: do not await — returns immediately
      this.runDispatchRound(username, channelId, userMsg, 1, controller.signal);
    }
  }

  /**
   * Fire-and-forget dispatch round.
   * Enqueues each eligible agent independently — does NOT await their completion.
   * Each agent posts to the channel on its own timeline.
   */
  private runDispatchRound(
    username: string,
    channelId: string,
    incomingMsg: ChannelMessage,
    depth: number,
    signal: AbortSignal
  ): void {
    if (signal.aborted) return;

    const key = `${channelId}:${incomingMsg.sessionId || "default"}`;
    if (this.abortedDispatches.has(key)) return;

    const channel = channelStore.getChannel(username, channelId);
    if (!channel || channel.members.length === 0) return;

    const maxDepth = channel.maxChainDepth ?? MAX_CHAIN_DEPTH;
    if (depth > maxDepth) {
      console.warn(`[ChannelOrchestrator] Max chain depth reached (${maxDepth}) for channel ${channelId}`);
      broadcast(channelId, { type: "channel_chain_limit", channelId, maxChainDepth: maxDepth });
      return;
    }

    const targetMembers = this.resolveRecipients(channel, incomingMsg);
    if (targetMembers.length === 0) return;

    // Dispatch each agent independently — fire-and-forget
    for (const member of targetMembers) {
      this.dispatchToAgentAsync(username, channelId, member, incomingMsg, depth, signal).catch((err) => {
        console.error(`[ChannelOrchestrator] Unexpected error dispatching to ${member.agentId}:`, err);
      });
    }
  }

  /**
   * Runs a single agent dispatch through the per-agent queue.
   * Awaits completion of this specific agent, then posts and chains.
   */
  private async dispatchToAgentAsync(
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

    const agentEntry = agentRegistry.get(member.agentId);
    if (!agentEntry || agentEntry.status === "stopped") {
      broadcast(channelId, {
        type: "channel_agent_error",
        channelId,
        agentId: member.agentId,
        error: `Agent "${member.agentId}" is not available`,
      });
      return;
    }

    const queue = this.getOrCreateQueue(member.agentId);

    let result: DispatchResult;
    try {
      result = await queue.enqueue({
        id: crypto.randomUUID(),
        signal,
        execute: () => this.runAgentPrompt(username, channelId, member, incomingMsg, signal),
      });
    } catch (err: any) {
      // Aborted or cleared — no broadcast needed
      if (err.message === "Aborted before enqueue" || err.message === "Aborted while queued" || err.message === "Queue cleared") {
        return;
      }
      console.error(`[ChannelOrchestrator] Queue error for agent ${member.agentId}:`, err);
      return;
    }

    if (!result.agentMsg || signal.aborted || this.abortedDispatches.has(key)) return;

    const channel = channelStore.getChannel(username, channelId);
    if (!channel) return;

    // F1: Negotiation Protocol
    let isAgreed = false;
    let isRejected = false;
    if (channel.negotiationProtocol) {
      const negotiationState = channelStore.getNegotiationState(username, channelId);
      const sm = new NegotiationStateMachine(channel.negotiationProtocol, negotiationState);
      const receiverId = incomingMsg.role === "user" ? "user" : incomingMsg.agentId || "user";
      const senderId = member.agentId;
      const ingestResult = sm.ingest(senderId, receiverId, result.agentMsg.content);

      channelStore.saveNegotiationState(username, channelId, sm.getState());

      broadcast(channelId, {
        type: "channel_negotiation_round",
        channelId,
        sessionId: incomingMsg.sessionId,
        agentId: senderId,
        receiverId,
        rounds: ingestResult.rounds,
        status: sm.getState()[ingestResult.pairKey]?.status || "open",
      });

      if (ingestResult.matched === "agreed") {
        isAgreed = true;
        broadcast(channelId, {
          type: "channel_negotiation_agreement",
          channelId,
          sessionId: incomingMsg.sessionId,
          agentId: senderId,
          receiverId,
          content: result.agentMsg.content,
        });
      } else if (ingestResult.matched === "rejected") {
        isRejected = true;
        broadcast(channelId, {
          type: "channel_negotiation_rejected",
          channelId,
          sessionId: incomingMsg.sessionId,
          agentId: senderId,
          receiverId,
        });
      } else if (ingestResult.shouldEscalate && channel.negotiationProtocol.arbiterAgentId) {
        const arbiterId = channel.negotiationProtocol.arbiterAgentId;
        const arbiterEntry = agentRegistry.get(arbiterId);
        const arbiterName = arbiterEntry?.server.definition.name || arbiterId;

        broadcast(channelId, {
          type: "channel_negotiation_escalation",
          channelId,
          sessionId: incomingMsg.sessionId,
          arbiterId,
          arbiterName,
          rounds: ingestResult.rounds,
        });

        // Trigger arbiter dispatch
        const agentName = agentEntry?.server.definition.name || senderId;
        const targetName = receiverId === "user" ? "user" : agentRegistry.get(receiverId)?.server.definition.name || receiverId;
        const escalationMsg: ChannelMessage = {
          id: crypto.randomUUID(),
          channelId,
          sessionId: incomingMsg.sessionId,
          role: "user", // treated as system escalation prompt
          content: `Bloqueo detectado tras ${ingestResult.rounds} rondas entre @${agentName} y @${targetName}. Emite veredicto vinculante.`,
          createdAt: new Date().toISOString(),
        };

        const arbiterMember = channel.members.find((m) => m.agentId === arbiterId);
        if (arbiterMember) {
          channelStore.appendMessage(username, channelId, result.agentMsg);
          broadcast(channelId, { type: "channel_message", channelId, message: result.agentMsg });
          eventBroker.publishEvent(username, {
            sourceType: "channel",
            sourceId: channelId,
            sourceName: channel.name,
            eventType: "agent_message",
            agentName: result.agentMsg.agentName,
            detail: result.agentMsg.content,
          });
          this.dispatchToAgentAsync(username, channelId, arbiterMember, escalationMsg, depth + 1, signal).catch((err) => {
            console.error(`[ChannelOrchestrator] Escalation dispatch error:`, err);
          });
        }
        return;
      }
    }

    if (isRejected) {
      // Append the rejection message and stop the chain
      channelStore.appendMessage(username, channelId, result.agentMsg);
      broadcast(channelId, { type: "channel_message", channelId, message: result.agentMsg });
      eventBroker.publishEvent(username, {
        sourceType: "channel",
        sourceId: channelId,
        sourceName: channel.name,
        eventType: "agent_message",
        agentName: result.agentMsg.agentName,
        detail: result.agentMsg.content,
      });
      return;
    }

    // F3: Task Decomposition
    const delegationPattern = channel.delegationPattern || { token: "DELEGATE: @(\\w+) — (.+)", applyToRole: "lead" };
    const senderRole = member.role || "member";
    const isLeadRole = delegationPattern.applyToRole ? senderRole === delegationPattern.applyToRole : senderRole === "lead";

    const ledgerPath = channelStore.getTaskLedgerPath(username, channelId);
    const ledger = new TaskLedger(ledgerPath);

    // If this agent is resolving any tasks, mark them as done
    const openTasks = ledger.getOpenTasksFor(member.agentId);
    for (const ot of openTasks) {
      ledger.updateStatus(ot.id, "done");
      broadcast(channelId, {
        type: "channel_task_updated",
        channelId,
        sessionId: incomingMsg.sessionId,
        task: ot,
        status: "done",
      });
    }

    let subDispatches: { member: ChannelMember; taskMsg: ChannelMessage }[] = [];

    if (isLeadRole) {
      const tokenRegex = new RegExp(delegationPattern.token || "DELEGATE: @(\\w+) — (.+)", "gi");
      let match;
      const content = result.agentMsg.content;
      const agentName = agentEntry?.server.definition.name || member.agentId;

      while ((match = tokenRegex.exec(content)) !== null) {
        const targetName = match[1];
        const taskDetail = match[2];

        // Resolve target agent by name
        const targetMember = channel.members.find((m) => {
          const entry = agentRegistry.get(m.agentId);
          return entry && entry.server.definition.name.toLowerCase() === targetName.toLowerCase();
        });

        if (targetMember) {
          const targetEntry = agentRegistry.get(targetMember.agentId);
          const targetNameResolved = targetEntry?.server.definition.name || targetMember.agentId;

          const ledgerTask = ledger.record({
            assignedBy: member.agentId,
            assignedByName: agentName,
            assignedTo: targetMember.agentId,
            assignedToName: targetNameResolved,
            role: targetMember.role || "member",
            task: taskDetail,
          });

          broadcast(channelId, {
            type: "channel_task_created",
            channelId,
            sessionId: incomingMsg.sessionId,
            task: ledgerTask,
          });

          const taskMsg: ChannelMessage = {
            id: crypto.randomUUID(),
            channelId,
            sessionId: incomingMsg.sessionId,
            role: "agent",
            agentId: member.agentId,
            agentName: agentName,
            content: `Tarea asignada por @${agentName}: ${taskDetail}`,
            createdAt: new Date().toISOString(),
          };

          subDispatches.push({ member: targetMember, taskMsg });
        }
      }
    }

    channelStore.appendMessage(username, channelId, result.agentMsg);
    broadcast(channelId, { type: "channel_message", channelId, message: result.agentMsg });

    eventBroker.publishEvent(username, {
      sourceType: "channel",
      sourceId: channelId,
      sourceName: channel.name,
      eventType: "agent_message",
      agentName: result.agentMsg.agentName,
      detail: result.agentMsg.content,
    });

    if (subDispatches.length > 0) {
      for (const sd of subDispatches) {
        this.dispatchToAgentAsync(username, channelId, sd.member, sd.taskMsg, depth + 1, signal).catch((err) => {
          console.error(`[ChannelOrchestrator] Delegation dispatch error:`, err);
        });
      }
      return;
    }

    // Chain to next round if not agreed
    if (!isAgreed) {
      this.runDispatchRound(username, channelId, result.agentMsg, depth + 1, signal);
    }
  }

  /**
   * Runs a single agent prompt. Called inside the AgentWorkQueue executor.
   * This is the only place that awaits session.prompt().
   */
  private async runAgentPrompt(
    username: string,
    channelId: string,
    member: ChannelMember,
    incomingMsg: ChannelMessage,
    signal: AbortSignal
  ): Promise<DispatchResult> {
    if (signal.aborted) return { agentMsg: null };

    const channel = channelStore.getChannel(username, channelId);
    if (!channel) return { agentMsg: null };

    const agentEntry = agentRegistry.get(member.agentId);
    if (!agentEntry || agentEntry.status === "stopped") {
      broadcast(channelId, {
        type: "channel_agent_error",
        channelId,
        agentId: member.agentId,
        error: `Agent "${member.agentId}" is not available`,
      });
      return { agentMsg: null };
    }

    const agentName = agentEntry.server.definition.name;

    // Ensure model is set
    if (!agentEntry.server.session.model) {
      const { modelRegistry } = piSessionManager.getUserContext(username);
      modelRegistry.refresh();
      const available = modelRegistry.getAvailable();
      if (available.length > 0) {
        try {
          await agentEntry.server.session.setModel(available[0]);
        } catch (e) {
          console.error(`[ChannelOrchestrator] Failed to assign model to ${member.agentId}:`, e);
        }
      }
    }

    if (!agentEntry.server.session.model) {
      broadcast(channelId, {
        type: "channel_agent_error",
        channelId,
        agentId: member.agentId,
        error: `No LLM providers or models available for agent "${agentName}". Please configure API keys in Settings.`,
      });
      return { agentMsg: null };
    }

    const streamKey = `${channelId}:${incomingMsg.sessionId || "default"}`;
    let channelStreams = this.activeStreams.get(streamKey);
    if (!channelStreams) {
      channelStreams = new Map();
      this.activeStreams.set(streamKey, channelStreams);
    }
    channelStreams.set(member.agentId, {
      agentId: member.agentId,
      agentName,
      text: "",
      thinking: "",
      toolCalls: {},
    });

    broadcast(channelId, {
      type: "channel_agent_start",
      channelId,
      sessionId: incomingMsg.sessionId,
      agentId: member.agentId,
      agentName,
    });

    eventBroker.publishEvent(username, {
      sourceType: "channel",
      sourceId: channelId,
      sourceName: channel.name,
      eventType: "agent_start",
      agentName,
    });

    const recentMessages = channelStore.getMessages(username, channelId, 20, incomingMsg.sessionId);
    const agentNameMap = this.buildAgentNameMap(channel.members);
    const promptText = this.buildAgentPrompt(
      agentEntry.server.definition,
      incomingMsg,
      recentMessages,
      channel.context || [],
      channel.members,
      agentNameMap
    );

    let fullResponse = "";

    const unsub = agentEntry.server.session.subscribe((evt) => {
      const ev = evt as any;
      if (evt.type === "message_update") {
        if (ev.assistantMessageEvent?.type === "text_delta") {
          const delta = ev.assistantMessageEvent.delta;
          if (delta) {
            fullResponse += delta;
            const stream = this.activeStreams.get(streamKey)?.get(member.agentId);
            if (stream) {
              stream.text += delta;
            }
            broadcast(channelId, {
              type: "channel_agent_token",
              channelId,
              sessionId: incomingMsg.sessionId,
              agentId: member.agentId,
              token: delta,
            });
            eventBroker.publishEvent(username, {
              sourceType: "channel",
              sourceId: channelId,
              sourceName: channel.name,
              eventType: "text_delta",
              agentName,
              detail: delta,
            });
          }
        } else if (ev.assistantMessageEvent?.type === "thinking_delta" && channel.showThinking) {
          const delta = ev.assistantMessageEvent.delta;
          if (delta) {
            const stream = this.activeStreams.get(streamKey)?.get(member.agentId);
            if (stream) {
              stream.thinking += delta;
            }
            broadcast(channelId, {
              type: "channel_agent_thinking",
              channelId,
              sessionId: incomingMsg.sessionId,
              agentId: member.agentId,
              token: delta,
            });
            eventBroker.publishEvent(username, {
              sourceType: "channel",
              sourceId: channelId,
              sourceName: channel.name,
              eventType: "thinking_delta",
              agentName,
              detail: delta,
            });
          }
        }
      } else if (evt.type === "tool_execution_start" && channel.showTools) {
        const stream = this.activeStreams.get(streamKey)?.get(member.agentId);
        if (stream) {
          stream.toolCalls[ev.toolCallId] = {
            toolName: ev.toolName,
            args: ev.args,
            result: null,
            isError: false,
          };
        }
        broadcast(channelId, {
          type: "channel_agent_tool_start",
          channelId,
          sessionId: incomingMsg.sessionId,
          agentId: member.agentId,
          toolName: ev.toolName,
          args: ev.args,
          toolCallId: ev.toolCallId,
        });
        eventBroker.publishEvent(username, {
          sourceType: "channel",
          sourceId: channelId,
          sourceName: channel.name,
          eventType: "tool_start",
          agentName,
          detail: { toolName: ev.toolName, args: ev.args, toolCallId: ev.toolCallId },
        });
      } else if (evt.type === "tool_execution_end" && channel.showTools) {
        const stream = this.activeStreams.get(streamKey)?.get(member.agentId);
        if (stream && stream.toolCalls[ev.toolCallId]) {
          stream.toolCalls[ev.toolCallId].result = ev.result;
          stream.toolCalls[ev.toolCallId].isError = ev.isError;
        }
        broadcast(channelId, {
          type: "channel_agent_tool_end",
          channelId,
          sessionId: incomingMsg.sessionId,
          agentId: member.agentId,
          toolName: ev.toolName,
          result: ev.result,
          isError: ev.isError,
          toolCallId: ev.toolCallId,
        });
        eventBroker.publishEvent(username, {
          sourceType: "channel",
          sourceId: channelId,
          sourceName: channel.name,
          eventType: "tool_end",
          agentName,
          detail: { toolName: ev.toolName, result: ev.result, isError: ev.isError, toolCallId: ev.toolCallId },
        });
      }
    });

    try {
      // Reset internal agent runtime state before each prompt
      if ((agentEntry.server.session as any).agent?.reset) {
        (agentEntry.server.session as any).agent.reset();
      }
      await agentEntry.server.session.prompt(promptText);
    } catch (err: any) {
      unsub();
      const isAbort = signal.aborted || err.message?.includes("abort") || err.message?.includes("cancel");
      if (!isAbort) {
        console.error(`[ChannelOrchestrator] Error prompting agent ${member.agentId}:`, err);
        broadcast(channelId, {
          type: "channel_agent_error",
          channelId,
          sessionId: incomingMsg.sessionId,
          agentId: member.agentId,
          error: String(err.message || err),
        });
        eventBroker.publishEvent(username, {
          sourceType: "channel",
          sourceId: channelId,
          sourceName: channel.name,
          eventType: "error",
          agentName,
          detail: String(err.message || err),
        });
      }
      broadcast(channelId, {
        type: "channel_agent_end",
        channelId,
        sessionId: incomingMsg.sessionId,
        agentId: member.agentId,
      });
      return { agentMsg: null };
    } finally {
      unsub();
      const activeStreamsMap = this.activeStreams.get(streamKey);
      if (activeStreamsMap) {
        activeStreamsMap.delete(member.agentId);
        if (activeStreamsMap.size === 0) {
          this.activeStreams.delete(streamKey);
        }
      }
    }


    let messageTokensIn = 0;
    let messageTokensOut = 0;

    // Extract full response and token usage from session messages if streaming didn't capture it
    const msgs = agentEntry.server.session.messages;
    const lastMsg = [...msgs].reverse().find((m) => m.role === "assistant") as any;
    if (lastMsg) {
      if (!fullResponse.trim()) {
        if (typeof lastMsg.content === "string") fullResponse = lastMsg.content;
        else if (Array.isArray(lastMsg.content)) {
          fullResponse = lastMsg.content.map((c: any) => c.text || "").join("\n");
        }
      }
      if (lastMsg.usage) {
        messageTokensIn = lastMsg.usage.input || 0;
        messageTokensOut = lastMsg.usage.output || 0;
      }
    }

    const trimmed = fullResponse.trim();
    const isSilent = this.isSilentContent(trimmed);

    broadcast(channelId, {
      type: "channel_agent_end",
      channelId,
      sessionId: incomingMsg.sessionId,
      agentId: member.agentId,
    });

    eventBroker.publishEvent(username, {
      sourceType: "channel",
      sourceId: channelId,
      sourceName: channel.name,
      eventType: "agent_end",
      agentName,
    });

    if (isSilent) {
      console.log(`[ChannelOrchestrator] Agent ${member.agentId} produced silent response`);
      return { agentMsg: null };
    }

    let finalThinking = "";
    let finalToolCalls: any[] = [];

    if (channel.showThinking || channel.showTools) {
      const msgsForParsing = agentEntry.server.session.messages;
      const lastMsgForParsing = [...msgsForParsing].reverse().find((m) => m.role === "assistant");
      if (lastMsgForParsing && Array.isArray(lastMsgForParsing.content)) {
        for (const block of lastMsgForParsing.content) {
          if (block.type === "thinking" && block.thinking && channel.showThinking) {
            finalThinking += block.thinking;
          }
          if (block.type === "toolCall" && channel.showTools) {
            const matchedResult = msgsForParsing.find((m) => m.role === "toolResult" && (m as any).toolCallId === block.id) as any;
            finalToolCalls.push({
              id: block.id,
              name: block.name,
              arguments: block.arguments,
              result: matchedResult
                ? {
                    toolName: matchedResult.toolName ?? block.name,
                    content: Array.isArray(matchedResult.content)
                      ? matchedResult.content
                      : [{ type: "text", text: String(matchedResult.content) }],
                    isError: matchedResult.isError ?? false,
                    details: (matchedResult as any).details,
                  }
                : null,
            });
          }
        }
      }
    }

    const agentNameMap2 = this.buildAgentNameMap(channel.members);
    const agentMentions = parseMentions(fullResponse, channel.members, agentNameMap2);

    const agentMsg: ChannelMessage = {
      id: crypto.randomUUID(),
      channelId,
      sessionId: incomingMsg.sessionId,
      role: "agent",
      agentId: member.agentId,
      agentName,
      content: fullResponse,
      thinking: finalThinking || undefined,
      toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
      mentions: agentMentions.length > 0 ? agentMentions : undefined,
      tokensIn: messageTokensIn || undefined,
      tokensOut: messageTokensOut || undefined,
      createdAt: new Date().toISOString(),
    };

    return { agentMsg };
  }

  private resolveRecipients(channel: Channel, incomingMsg: ChannelMessage): ChannelMember[] {
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

    return result;
  }

  private buildAgentPrompt(
    agentDef: any,
    incomingMsg: ChannelMessage,
    recentHistory: ChannelMessage[],
    contextItems: { key: string; value: string }[] = [],
    members: ChannelMember[] = [],
    agentNameMap: Map<string, string> = new Map()
  ): string {
    let rosterBlock = "";
    if (members.length > 0) {
      const lines = ["- @user (the human user)"];
      for (const m of members) {
        const name = agentNameMap.get(m.agentId) || m.agentId;
        lines.push(`- @${name}  (id: ${m.agentId}, role: ${m.role ?? "member"})`);
      }
      let rulesBlock = "";
      if (incomingMsg.role === "user") {
        rulesBlock =
          `COMMUNICATION PROTOCOL (USER MESSAGE):\n` +
          `1. DIRECT ASSISTANCE: You are responding to the user. Answer clearly, professionally, and helpfully to address their request or guide them.\n` +
          `2. CONCISENESS & STYLE: Be concise. Avoid large markdown tables, bulleted breakdowns, or lengthy lists unless explicitly requested. Write like a human in a team chat.\n` +
          `3. TASK DELEGATION: If your response requires delegation, review, or input from a specific teammate (e.g. @Tech Lead, @Senior Dev), formulate your task or scope and explicitly tag them in your message.\n\n`;
      } else {
        rulesBlock =
          `COMMUNICATION PROTOCOL (PEER AGENT MESSAGE):\n` +
          `1. NO COURTESY CHATTER: You are receiving a message from peer agent "${incomingMsg.agentName || incomingMsg.agentId}". Do NOT reply merely to say hello, acknowledge receipt, or state that you are "present" or "on standby".\n` +
          `2. CHRONOLOGY CHECK: Check the conversation history. If an agreement has already been reached or a decision has already been finalized (e.g., in a message saying "ACUERDO ALCANZADO" or "ACEPTO"), do NOT propose alternative versions, contra-proposals, or re-open the negotiation. Maintain alignment with the latest messages.\n` +
          `3. CONCISENESS & STYLE: Be extremely concise and direct. Do NOT repeat tables, desgloses, or previous messages. Explain your reasoning in 1-2 sentences.\n` +
          `4. SILENT MODE: If this peer message does not require your specific technical decision, deliverable, or direct action, reply EXACTLY with "(silent)".\n` +
          `5. TASK DELEGATION: Mention other team members using @name or @id ONLY when transferring an explicit task or work deliverable.\n\n`;
      }

      rosterBlock =
        `Channel Participants & Tagging Protocol:\n` +
        `The following participants are in this channel. Explicitly mentioning them using @name or @id in your message will trigger them to respond:\n` +
        `${lines.join("\n")}\n\n` +
        rulesBlock;
    }

    let historyText = "";
    for (const msg of recentHistory) {
      if (msg.role === "user") {
        historyText += `[User]: ${msg.content}\n`;
      } else {
        historyText += `[${msg.agentName || msg.agentId}]: ${msg.content}\n`;
      }
    }

    let contextBlock = "";
    if (contextItems.length > 0) {
      contextBlock =
        `Channel Environmental Context Variables:\n` +
        contextItems.map((item) => `- ${item.key}: ${item.value}`).join("\n") +
        "\n\n";
    }

    const senderLabel =
      incomingMsg.role === "user" ? "User" : incomingMsg.agentName || incomingMsg.agentId;

    return (
      rosterBlock +
      contextBlock +
      `Conversation so far:\n${historyText}\n` +
      `--- New message from ${senderLabel} ---\n` +
      `${incomingMsg.content}`
    );
  }

  private isSilentContent(content: string): boolean {
    if (!content) return true;
    const SILENT_REGEX = /^\s*[\(\[\*]*\s*silent(ioso)?\s*[\)\]\*]*[\s\.]*$/i;
    return SILENT_REGEX.test(content.trim());
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

      for (const member of channel.members) {
        if (signal.aborted || this.abortedDispatches.has(key)) return;

        // Skip if the member is the author of the last message
        if (currentIncomingMsg.role === "agent" && currentIncomingMsg.agentId === member.agentId) {
          continue;
        }

        // Check if the member is eligible to respond to currentIncomingMsg
        const recipients = this.resolveRecipients(channel, currentIncomingMsg);
        const isEligible = recipients.some(r => r.agentId === member.agentId);
        if (!isEligible) continue;

        // Process task ledger updates (mark tasks as done)
        const ledgerPath = channelStore.getTaskLedgerPath(username, channelId);
        const ledger = new TaskLedger(ledgerPath);
        const openTasks = ledger.getOpenTasksFor(member.agentId);
        for (const ot of openTasks) {
          ledger.updateStatus(ot.id, "done");
          broadcast(channelId, {
            type: "channel_task_updated",
            channelId,
            sessionId: currentIncomingMsg.sessionId,
            task: ot,
            status: "done",
          });
        }

        const queue = this.getOrCreateQueue(member.agentId);
        let result: DispatchResult;
        try {
          result = await queue.enqueue({
            id: crypto.randomUUID(),
            signal,
            execute: () => this.runAgentPrompt(username, channelId, member, currentIncomingMsg, signal),
          });
        } catch (err: any) {
          if (err.message === "Aborted before enqueue" || err.message === "Aborted while queued" || err.message === "Queue cleared") {
            return;
          }
          console.error(`[ChannelOrchestrator] Queue error for agent ${member.agentId}:`, err);
          continue;
        }

        if (!result.agentMsg || signal.aborted || this.abortedDispatches.has(key)) continue;

        // Append to store, broadcast, and update current message
        channelStore.appendMessage(username, channelId, result.agentMsg);
        broadcast(channelId, { type: "channel_message", channelId, message: result.agentMsg });

        eventBroker.publishEvent(username, {
          sourceType: "channel",
          sourceId: channelId,
          sourceName: channel.name,
          eventType: "agent_message",
          agentName: result.agentMsg.agentName,
          detail: result.agentMsg.content,
        });

        currentIncomingMsg = result.agentMsg;
        roundActive = true;

        // Check agreement
        let isAgreed = false;
        if (channel.negotiationProtocol) {
          const negotiationState = channelStore.getNegotiationState(username, channelId);
          const sm = new NegotiationStateMachine(channel.negotiationProtocol, negotiationState);
          const receiverId = currentIncomingMsg.role === "user" ? "user" : currentIncomingMsg.agentId || "user";
          const senderId = member.agentId;
          const ingestResult = sm.ingest(senderId, receiverId, currentIncomingMsg.content);

          channelStore.saveNegotiationState(username, channelId, sm.getState());

          broadcast(channelId, {
            type: "channel_negotiation_round",
            channelId,
            sessionId: currentIncomingMsg.sessionId,
            agentId: senderId,
            receiverId,
            rounds: ingestResult.rounds,
            status: sm.getState()[ingestResult.pairKey]?.status || "open",
          });

          if (ingestResult.matched === "agreed") {
            isAgreed = true;
            broadcast(channelId, {
              type: "channel_negotiation_agreement",
              channelId,
              sessionId: currentIncomingMsg.sessionId,
              agentId: senderId,
              receiverId,
              content: currentIncomingMsg.content,
            });
          }
        }

        if (isAgreed) {
          console.log(`[ChannelOrchestrator] Consensus reached. Stopping sequence.`);
          return;
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
}

export const channelOrchestrator = new ChannelOrchestrator();
export { ChannelOrchestrator };
