import { channelStore } from "./channel-store";
import { agentRegistry } from "../agents";
import { piSessionManager } from "../pi/session-manager";
import { parseMentions } from "./mention-parser";
import type { Channel, ChannelMember, ChannelMessage } from "shared";
import { eventBroker } from "../lib/event-broker";
import { AgentWorkQueue } from "./agent-work-queue";
import type { DispatchResult } from "./agent-work-queue";

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
  private abortedDispatches = new Set<string>(); // `${channelId}:${sessionId || 'default'}`
  private agentQueues = new Map<string, AgentWorkQueue>();
  private channelAbortControllers = new Map<string, AbortController>(); // key = channelId:sessionId

  private getOrCreateQueue(agentId: string): AgentWorkQueue {
    let q = this.agentQueues.get(agentId);
    if (!q) {
      q = new AgentWorkQueue();
      this.agentQueues.set(agentId, q);
    }
    return q;
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

    // Create a new AbortController for this dispatch chain
    const controller = new AbortController();
    this.channelAbortControllers.set(key, controller);

    // Fire-and-forget: do not await — returns immediately
    this.runDispatchRound(username, channelId, userMsg, 1, controller.signal);
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

    channelStore.appendMessage(username, channelId, result.agentMsg);
    broadcast(channelId, { type: "channel_message", channelId, message: result.agentMsg });

    const channel = channelStore.getChannel(username, channelId);
    if (channel) {
      eventBroker.publishEvent(username, {
        sourceType: "channel",
        sourceId: channelId,
        sourceName: channel.name,
        eventType: "agent_message",
        agentName: result.agentMsg.agentName,
        detail: result.agentMsg.content,
      });
    }

    // Chain to next round — also fire-and-forget
    this.runDispatchRound(username, channelId, result.agentMsg, depth + 1, signal);
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
    }

    // Extract full response from session messages if streaming didn't capture it
    if (!fullResponse.trim()) {
      const msgs = agentEntry.server.session.messages;
      const lastMsg = [...msgs].reverse().find((m) => m.role === "assistant");
      if (lastMsg) {
        if (typeof lastMsg.content === "string") fullResponse = lastMsg.content;
        else if (Array.isArray(lastMsg.content)) {
          fullResponse = lastMsg.content.map((c: any) => c.text || "").join("\n");
        }
      }
    }

    const trimmed = fullResponse.trim();
    const isSilent = !trimmed || trimmed.toLowerCase() === "(silent)" || trimmed.toLowerCase() === "(silencioso)";

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
      const msgs = agentEntry.server.session.messages;
      const lastMsg = [...msgs].reverse().find((m) => m.role === "assistant");
      if (lastMsg && Array.isArray(lastMsg.content)) {
        for (const block of lastMsg.content) {
          if (block.type === "thinking" && block.thinking && channel.showThinking) {
            finalThinking += block.thinking;
          }
          if (block.type === "toolCall" && channel.showTools) {
            const matchedResult = msgs.find((m) => m.role === "toolResult" && m.toolCallId === block.id);
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
        lines.push(`- @${name}  (id: ${m.agentId})`);
      }
      let rulesBlock = "";
      if (incomingMsg.role === "user") {
        rulesBlock =
          `COMMUNICATION PROTOCOL (USER MESSAGE):\n` +
          `1. DIRECT ASSISTANCE: You are responding to the user. Answer clearly, professionally, and helpfully to address their request or guide them.\n` +
          `2. TASK DELEGATION: If your response requires delegation, review, or input from a specific teammate (e.g. @Tech Lead, @Senior Dev), formulate your task or scope and explicitly tag them in your message.\n\n`;
      } else {
        rulesBlock =
          `COMMUNICATION PROTOCOL (PEER AGENT MESSAGE):\n` +
          `1. NO COURTESY CHATTER: You are receiving a message from peer agent "${incomingMsg.agentName || incomingMsg.agentId}". Do NOT reply merely to say hello, acknowledge receipt, or state that you are "present" or "on standby".\n` +
          `2. SILENT MODE: If this peer message does not require your specific technical decision, deliverable, or direct action, reply EXACTLY with "(silent)".\n` +
          `3. TASK DELEGATION: Mention other team members using @name or @id ONLY when transferring an explicit task or work deliverable.\n\n`;
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
}

export const channelOrchestrator = new ChannelOrchestrator();
export { ChannelOrchestrator };
