import { channelStore } from "./channel-store";
import { agentRegistry } from "../agents";
import { piSessionManager } from "../pi/session-manager";
import { parseMentions } from "./mention-parser";
import type { Channel, ChannelMember, ChannelMessage } from "shared";
import { eventBroker } from "../lib/event-broker";

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
  private activeDispatches = new Set<string>(); // channelId currently processing
  private abortedDispatches = new Set<string>(); // `${channelId}:${sessionId || 'default'}`

  abortDispatch(username: string, channelId: string, sessionId?: string): void {
    const key = `${channelId}:${sessionId || "default"}`;
    this.abortedDispatches.add(key);
    console.log(`[ChannelOrchestrator] Aborting dispatch for ${key}`);

    const channel = channelStore.getChannel(username, channelId);
    if (channel) {
      for (const member of channel.members) {
        const entry = agentRegistry.get(member.agentId);
        if (entry && entry.server.session.isStreaming) {
          entry.server.session.abort().catch(() => {});
        }
      }
    }
    broadcast(channelId, { type: "channel_dispatch_aborted", channelId, sessionId });
  }

  /** Build a name map agentId -> displayName for the current channel members */
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

    // Start processing round
    await this.runDispatchRound(username, channelId, userMsg, 1);
  }

  private async runDispatchRound(
    username: string,
    channelId: string,
    incomingMsg: ChannelMessage,
    depth: number
  ): Promise<void> {
    const channel = channelStore.getChannel(username, channelId);
    if (!channel || channel.members.length === 0) return;

    const maxDepth = channel.maxChainDepth ?? 10;
    if (depth > maxDepth) {
      console.warn(`[ChannelOrchestrator] Max chain depth reached (${maxDepth}) for channel ${channelId}`);
      broadcast(channelId, { type: "channel_chain_limit", channelId, maxChainDepth: maxDepth });
      return;
    }

    // Determine which members should receive this incoming message
    const targetMembers = this.resolveRecipients(channel, incomingMsg);
    if (targetMembers.length === 0) return;

    const key = `${channelId}:${incomingMsg.sessionId || "default"}`;
    if (this.abortedDispatches.has(key)) {
      console.log(`[ChannelOrchestrator] Stopping dispatch for ${key} due to abort`);
      return;
    }

    // Execute agent responses in series to preserve chronological order and avoid race conditions
    for (const member of targetMembers) {
      if (this.abortedDispatches.has(key)) {
        console.log(`[ChannelOrchestrator] Stopping loop for ${key} due to abort`);
        break;
      }
      const agentEntry = agentRegistry.get(member.agentId);
      if (!agentEntry || agentEntry.status === "stopped") {
        broadcast(channelId, {
          type: "channel_agent_error",
          channelId,
          agentId: member.agentId,
          error: `Agent "${member.agentId}" is not available`,
        });
        continue;
      }

      const agentName = agentEntry.server.definition.name;

      // Ensure model is set on session before prompting
      if (!agentEntry.server.session.model) {
        const { modelRegistry } = piSessionManager.getUserContext(username);
        modelRegistry.refresh();
        const available = modelRegistry.getAvailable();
        if (available.length > 0) {
          try {
            await agentEntry.server.session.setModel(available[0]);
            console.log(`[ChannelOrchestrator] Dynamic model assigned to ${member.agentId}: ${available[0].provider}/${available[0].id}`);
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
        continue;
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

      try {
        // Build prompt with channel context and member roster
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

        // Subscribe to agent streaming events to forward tokens via WS
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
          // Reset internal agent runtime state so prior sessions/channels do not bleed into this channel dispatch
          if ((agentEntry.server.session as any).agent?.reset) {
            (agentEntry.server.session as any).agent.reset();
          }
          await agentEntry.server.session.prompt(promptText);
        } finally {
          unsub();
        }

        // Extract final response from session messages if streaming didn't capture full content
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

        const agentNameMap2 = this.buildAgentNameMap(channel.members);
        const agentMentions = parseMentions(fullResponse, channel.members, agentNameMap2);

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
          console.log(`[ChannelOrchestrator] Agent ${member.agentId} produced silent response, suppressing message`);
          continue;
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
                const matchedResult = msgs.find(m => m.role === "toolResult" && m.toolCallId === block.id);
                finalToolCalls.push({
                  id: block.id,
                  name: block.name,
                  arguments: block.arguments,
                  result: matchedResult ? {
                    toolName: matchedResult.toolName ?? block.name,
                    content: Array.isArray(matchedResult.content)
                      ? matchedResult.content
                      : [{ type: "text", text: String(matchedResult.content) }],
                    isError: matchedResult.isError ?? false,
                    details: (matchedResult as any).details
                  } : null
                });
              }
            }
          }
        }

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

        channelStore.appendMessage(username, channelId, agentMsg);

        broadcast(channelId, {
          type: "channel_message",
          channelId,
          message: agentMsg,
        });

        eventBroker.publishEvent(username, {
          sourceType: "channel",
          sourceId: channelId,
          sourceName: channel.name,
          eventType: "agent_message",
          agentName,
          detail: fullResponse,
        });

        if (!this.abortedDispatches.has(key)) {
          // Propagate agent messages to next depth round
          await this.runDispatchRound(username, channelId, agentMsg, depth + 1);
        }
      } catch (err: any) {
        console.error(`[ChannelOrchestrator] Error prompt agent ${member.agentId}:`, err);
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
    }
  }

  private resolveRecipients(channel: Channel, incomingMsg: ChannelMessage): ChannelMember[] {
    const mentioned = incomingMsg.mentions ?? [];
    const recipientSet = new Set<string>();
    const result: ChannelMember[] = [];

    for (const member of channel.members) {
      // Never route a message back to the agent that sent it
      if (incomingMsg.role === "agent" && incomingMsg.agentId === member.agentId) {
        continue;
      }

      const isMentioned = mentioned.includes(member.agentId);
      let addedByMode = false;

      if (member.replyMode === "mention-only") {
        // Only responds when explicitly @mentioned — skip all other routing
        if (isMentioned) addedByMode = true;
      } else if (incomingMsg.role === "user") {
        // Receiver-side: which members listen to user messages?
        if (member.replyMode === "user-only" || member.replyMode === "broadcast") {
          addedByMode = true;
        } else if (member.replyMode === "targeted" && member.targetAgentIds?.includes("__user__")) {
          addedByMode = true;
        }
      } else if (incomingMsg.role === "agent") {
        const senderId = incomingMsg.agentId!;
        // Receiver-side: which members listen to this specific agent?
        if (member.replyMode === "broadcast") {
          addedByMode = true;
        } else if (member.replyMode === "targeted" && member.targetAgentIds?.includes(senderId)) {
          addedByMode = true;
        }
      }

      // Mention overlay: explicitly mentioned members always get added (except self)
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
    // Channel member roster — lets agents know how and when to @mention peers
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
      incomingMsg.role === "user"
        ? "User"
        : incomingMsg.agentName || incomingMsg.agentId;

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
