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

        // Always propagate agent messages — resolveRecipients returns [] if no member listens
        await this.runDispatchRound(channelId, agentMsg, depth + 1);
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
      // Never route a message back to the agent that sent it
      if (incomingMsg.role === "agent" && incomingMsg.agentId === member.agentId) {
        continue;
      }

      if (incomingMsg.role === "user") {
        // Receiver-side: which members listen to user messages?
        // - "user-only" and "broadcast" always listen to the user
        // - "targeted" members listen to the user only if "__user__" is in their targetAgentIds
        if (member.replyMode === "user-only" || member.replyMode === "broadcast") {
          recipients.push(member);
        } else if (member.replyMode === "targeted" && member.targetAgentIds?.includes("__user__")) {
          recipients.push(member);
        }
      } else if (incomingMsg.role === "agent") {
        const senderId = incomingMsg.agentId!;

        // Receiver-side: which members listen to this specific agent?
        // - "broadcast" listens to all agents
        // - "targeted" listens only to agents whose ID is in targetAgentIds
        // - "user-only" never responds to agent messages
        if (member.replyMode === "broadcast") {
          recipients.push(member);
        } else if (member.replyMode === "targeted" && member.targetAgentIds?.includes(senderId)) {
          recipients.push(member);
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
      contextBlock +
      `Conversation so far:\n${historyText}\n` +
      `--- New message from ${senderLabel} ---\n` +
      `${incomingMsg.content}`
    );
  }
}

export const channelOrchestrator = new ChannelOrchestrator();
