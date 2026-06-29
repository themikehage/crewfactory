import { channelStore } from "./channel-store";
import { agentRegistry } from "../agents";
import { piSessionManager } from "../pi/session-manager";
import type { Channel, ChannelMember, ChannelMessage, ReplyMode } from "shared";

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

  async dispatchUserMessage(channelId: string, userContent: string): Promise<void> {
    const channel = channelStore.getChannel(channelId);
    if (!channel) throw new Error("Channel not found");

    const userMsg: ChannelMessage = {
      id: crypto.randomUUID(),
      channelId,
      role: "user",
      content: userContent,
      createdAt: new Date().toISOString(),
    };

    channelStore.appendMessage(channelId, userMsg);
    broadcast(channelId, { type: "channel_message", channelId, message: userMsg });

    // Start processing round
    await this.runDispatchRound(channelId, userMsg, 1);
  }

  private async runDispatchRound(
    channelId: string,
    incomingMsg: ChannelMessage,
    depth: number
  ): Promise<void> {
    if (depth > MAX_CHAIN_DEPTH) {
      console.warn(`[ChannelOrchestrator] Max chain depth reached (${MAX_CHAIN_DEPTH}) for channel ${channelId}`);
      broadcast(channelId, { type: "channel_chain_limit", channelId });
      return;
    }

    const channel = channelStore.getChannel(channelId);
    if (!channel || channel.members.length === 0) return;

    // Determine which members should receive this incoming message
    const targetMembers = this.resolveRecipients(channel, incomingMsg);
    if (targetMembers.length === 0) return;

    // Execute agent responses in series to preserve chronological order and avoid race conditions
    for (const member of targetMembers) {
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
        const { modelRegistry } = piSessionManager.getUserContext("admin");
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
        agentId: member.agentId,
        agentName,
      });

      try {
        // Build prompt with channel context
        const recentMessages = channelStore.getMessages(channelId, 20);
        const promptText = this.buildAgentPrompt(agentEntry.server.definition, incomingMsg, recentMessages, channel.context || []);

        let fullResponse = "";

        // Subscribe to agent streaming events to forward tokens via WS
        const unsub = agentEntry.server.session.subscribe((evt) => {
          if (evt.type === "message_update") {
            const ev = evt as any;
            if (ev.assistantMessageEvent?.type === "text_delta") {
              const delta = ev.assistantMessageEvent.delta;
              if (delta) {
                fullResponse += delta;
                broadcast(channelId, {
                  type: "channel_agent_token",
                  channelId,
                  agentId: member.agentId,
                  token: delta,
                });
              }
            }
          }
        });

        try {
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

        const agentMsg: ChannelMessage = {
          id: crypto.randomUUID(),
          channelId,
          role: "agent",
          agentId: member.agentId,
          agentName,
          content: fullResponse || "(empty response)",
          createdAt: new Date().toISOString(),
        };

        channelStore.appendMessage(channelId, agentMsg);

        broadcast(channelId, {
          type: "channel_agent_end",
          channelId,
          agentId: member.agentId,
        });

        broadcast(channelId, {
          type: "channel_message",
          channelId,
          message: agentMsg,
        });

        // Trigger next level of chain based on this agent's replyMode
        if (member.replyMode !== "user-only") {
          await this.runDispatchRound(channelId, agentMsg, depth + 1);
        }
      } catch (err: any) {
        console.error(`[ChannelOrchestrator] Error prompt agent ${member.agentId}:`, err);
        broadcast(channelId, {
          type: "channel_agent_error",
          channelId,
          agentId: member.agentId,
          error: String(err.message || err),
        });
      }
    }
  }

  private resolveRecipients(channel: Channel, incomingMsg: ChannelMessage): ChannelMember[] {
    const recipients: ChannelMember[] = [];

    for (const member of channel.members) {
      // Don't send agent's own message back to itself
      if (incomingMsg.role === "agent" && incomingMsg.agentId === member.agentId) {
        continue;
      }

      if (incomingMsg.role === "user") {
        // All members hear user messages
        recipients.push(member);
      } else if (incomingMsg.role === "agent") {
        // Find sender member configuration
        const senderMember = channel.members.find((m) => m.agentId === incomingMsg.agentId);
        if (!senderMember) continue;

        if (senderMember.replyMode === "user-only") {
          // Sender does not trigger other agents
          continue;
        } else if (senderMember.replyMode === "broadcast") {
          // Sender triggers all other agents
          recipients.push(member);
        } else if (senderMember.replyMode === "targeted") {
          // Sender triggers only specified targetAgentIds
          if (senderMember.targetAgentIds?.includes(member.agentId)) {
            recipients.push(member);
          }
        }
      }
    }

    return recipients;
  }

  private buildAgentPrompt(
    agentDef: any,
    incomingMsg: ChannelMessage,
    recentHistory: ChannelMessage[],
    contextItems: { key: string; value: string }[] = []
  ): string {
    let historyText = "";
    for (const msg of recentHistory) {
      if (msg.role === "user") {
        historyText += `[User]: ${msg.content}\n`;
      } else {
        historyText += `[Agent ${msg.agentName || msg.agentId}]: ${msg.content}\n`;
      }
    }

    let contextBlock = "";
    if (contextItems.length > 0) {
      contextBlock = `Channel Environmental Context Variables:\n` +
        contextItems.map((item) => `- ${item.key}: ${item.value}`).join("\n") + "\n\n";
    }

    const senderLabel = incomingMsg.role === "user" ? "User" : `Agent ${incomingMsg.agentName || incomingMsg.agentId}`;

    return (
      `You are participating in a multi-agent group channel.\n` +
      `Your Name: ${agentDef.name}\n` +
      `Your Role: ${agentDef.role}\n\n` +
      contextBlock +
      `Channel Conversation History:\n${historyText}\n` +
      `--- New Message from ${senderLabel} ---\n` +
      `${incomingMsg.content}\n\n` +
      `Respond concisely as ${agentDef.name} (${agentDef.role}) to this channel conversation.`
    );
  }
}

export const channelOrchestrator = new ChannelOrchestrator();
