import { channelStore } from "./channel-store";
import { agentRegistry } from "../agents";
import { piSessionManager } from "../pi/session-manager";
import { parseMentions } from "./mention-parser";
import type { Channel, ChannelMember, ChannelMessage } from "shared";

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

  abortDispatch(channelId: string, sessionId?: string): void {
    const key = `${channelId}:${sessionId || "default"}`;
    this.abortedDispatches.add(key);
    console.log(`[ChannelOrchestrator] Aborting dispatch for ${key}`);

    const channel = channelStore.getChannel(channelId);
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

  async dispatchUserMessage(channelId: string, userContent: string, sessionId?: string): Promise<void> {
    const key = `${channelId}:${sessionId || "default"}`;
    this.abortedDispatches.delete(key);

    const channel = channelStore.getChannel(channelId);
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
        sessionId: incomingMsg.sessionId,
        agentId: member.agentId,
        agentName,
      });

      try {
        // Build prompt with channel context and member roster
        const recentMessages = channelStore.getMessages(channelId, 20, incomingMsg.sessionId);
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
          if (evt.type === "message_update") {
            const ev = evt as any;
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
              }
            }
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

        if (isSilent) {
          console.log(`[ChannelOrchestrator] Agent ${member.agentId} produced silent response, suppressing message`);
          continue;
        }

        const agentMsg: ChannelMessage = {
          id: crypto.randomUUID(),
          channelId,
          sessionId: incomingMsg.sessionId,
          role: "agent",
          agentId: member.agentId,
          agentName,
          content: fullResponse,
          mentions: agentMentions.length > 0 ? agentMentions : undefined,
          createdAt: new Date().toISOString(),
        };

        channelStore.appendMessage(channelId, agentMsg);

        broadcast(channelId, {
          type: "channel_message",
          channelId,
          message: agentMsg,
        });

        if (!this.abortedDispatches.has(key)) {
          // Propagate agent messages to next depth round
          await this.runDispatchRound(channelId, agentMsg, depth + 1);
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
      rosterBlock =
        `Channel Participants & Tagging Protocol:\n` +
        `The following participants are in this channel. Explicitly mentioning them using @name or @id in your message will trigger them to respond:\n` +
        `${lines.join("\n")}\n\n` +
        `COMMUNICATION PROTOCOL & TASK ROUTING:\n` +
        `1. FOCUS ON VALUE & ACTION: Respond meaningfully to advance the project (e.g. analyzing user requests, generating scope proposals, conducting technical reviews, drafting commercial quotes). Do NOT reply merely to say hello, acknowledge attendance, or state that you are "present" or "on standby". If you genuinely have no input or action to contribute at this step, reply with "(silent)".\n` +
        `2. TASK DELEGATION: Mention other team members using @name or @id ONLY when transferring an explicit task, delivering a required work artifact, or asking a direct blocking technical question.\n` +
        `3. NO REPETITIVE CHATTER: Do not loop or repeat questions already answered or asked in the conversation history.\n\n`;
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
