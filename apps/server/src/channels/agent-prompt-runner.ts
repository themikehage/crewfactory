import { channelStore } from "./channel-store";
import { agentRegistry } from "../agents";
import { sessionManager } from "../core/session-manager";
import { resolveModelWithFallback } from "../core/agent-utils";
import { type ChannelMember, type ChannelMessage, getChannelMemoryDbPath } from "shared";
import { memoryRegistry } from "../core/memory/registry";
import { assemblePromptAppends } from "../core/prompts/prompt-assembly";
import { buildDeploymentContext, getOutputMode } from "../core/channel/deployment-context";
import { parseAgentResponse, enforceDiffFormat } from "./response-parser";
import { parseMentions } from "./mention-parser";
import type { DispatchResult } from "./agent-work-queue";

const _promptCache = new Map<string, string[]>();

export interface ActiveAgentStream {
  agentId: string;
  agentName: string;
  text: string;
  thinking: string;
  toolCalls: Record<
    string,
    {
      toolName: string;
      args: any;
      result: any | null;
      isError: boolean;
    }
  >;
}

export function buildAgentNameMap(members: ChannelMember[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const member of members) {
    const entry = agentRegistry.get(member.agentId);
    if (entry) {
      map.set(member.agentId, entry.server.definition.name);
    }
  }
  return map;
}

export function buildAgentPrompt(
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
    incomingMsg.role === "user" ? "User" : incomingMsg.agentName || incomingMsg.agentId;

  return (
    contextBlock +
    `Conversation so far:\n${historyText}\n` +
    `--- New message from ${senderLabel} ---\n` +
    `${incomingMsg.content}`
  );
}

function isSubstantiveMessage(content: string): boolean {
  if (content.trim().length <= 10) return false;
  const trivial = /^(hola|para|ok|si|no|gracias|dale|listo|stop|hey|hi|hello|\.\.\.)$/i;
  return !trivial.test(content.trim());
}

export class AgentPromptRunner {
  constructor(
    private activeStreams: Map<string, Map<string, ActiveAgentStream>>,
    private broadcastFn: (channelId: string, data: any) => void
  ) {}

  async run(
    username: string,
    channelId: string,
    member: ChannelMember,
    incomingMsg: ChannelMessage,
    agentNameMap: Map<string, string>,
    signal: AbortSignal
  ): Promise<DispatchResult> {
    if (signal.aborted) return { agentMsg: null };

    const channel = channelStore.getChannel(username, channelId);
    if (!channel) return { agentMsg: null };

    // Pre-LLM silent bypass
    if (channel.members.length > 1) {
      const isObserver = member.role === "observer";
      if (isObserver) {
        return { agentMsg: null };
      }
    }

    const agentEntry = agentRegistry.get(member.agentId);
    if (!agentEntry || agentEntry.status === "stopped") {
      this.broadcastFn(channelId, {
        type: "channel_agent_error",
        channelId,
        agentId: member.agentId,
        error: `Agent "${member.agentId}" is not available`,
      });
      return { agentMsg: null };
    }

    const agentName = agentEntry.server.definition.name;

    if (!agentEntry.server.session.model) {
      const { modelRegistry } = sessionManager.userConfig.getUserContext(username);
      modelRegistry.refresh();
      const resolved = resolveModelWithFallback(undefined, modelRegistry);
      if (resolved) {
        const model = modelRegistry
          .getAvailable()
          .find((m) => m.id === resolved || `${m.provider}/${m.id}` === resolved);
        if (model) {
          try {
            await agentEntry.server.session.setModel(model);
          } catch (e) {
            console.error(`[AgentPromptRunner] Failed to assign model to ${member.agentId}:`, e);
          }
        }
      }
    }

    if (!agentEntry.server.session.model) {
      this.broadcastFn(channelId, {
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

    this.broadcastFn(channelId, {
      type: "channel_agent_start",
      channelId,
      sessionId: incomingMsg.sessionId,
      agentId: member.agentId,
      agentName,
    });

    const userSettings = sessionManager.userConfig.getUserSettings(username);
    const memoryEnabled = userSettings.memoryEnabled ?? true;
    const channelDbPath = getChannelMemoryDbPath(username, channelId);
    const channelMemory = await memoryRegistry.get(`channel:${channelId}`, channelDbPath, memoryEnabled);

    const substantive = isSubstantiveMessage(incomingMsg.content);
    const [agentMemCtx, channelMemCtx] = substantive
      ? await Promise.all([
          agentEntry.server.memory.buildContext(incomingMsg.content, { sessionId: incomingMsg.sessionId }),
          channelMemory.buildContext(incomingMsg.content, { sessionId: incomingMsg.sessionId }),
        ])
      : ["", ""];

    let memoryPrefix = "";
    if (agentMemCtx) {
      memoryPrefix += `${agentMemCtx}\n\n`;
    }
    if (channelMemCtx) {
      const channelFormatted = channelMemCtx.replace(
        "--- Memories from previous sessions (historical context only — do not resume or re-execute past tasks unless explicitly asked) ---",
        "--- Channel Memories from previous sessions (historical context only — do not resume or re-execute past tasks unless explicitly asked) ---"
      );
      memoryPrefix += `${channelFormatted}\n\n`;
    }

    const recentMessages = channelStore.getMessages(username, channelId, 20, incomingMsg.sessionId);

    const deployment = buildDeploymentContext(channel, member.agentId, agentNameMap);

    const workspaceDir = agentEntry.server.session.cwd;
    const isLabChannel = channelId.startsWith("lab_");
    const cacheKey = isLabChannel ? `lab:${member.agentId}:${channelId}` : `${member.agentId}:${channelId}`;

    let appendSystemPrompts = _promptCache.get(cacheKey);
    if (!appendSystemPrompts) {
      appendSystemPrompts = assemblePromptAppends({
        mode: isLabChannel ? "experiment-member" : "channel-member",
        workspaceDir,
        agentDef: agentEntry.server.definition,
        deployment,
      });
      _promptCache.set(cacheKey, appendSystemPrompts);
    }

    const resourceLoader = agentEntry.server.session.resourceLoader as any;
    if (resourceLoader && typeof resourceLoader.setAppendSystemPrompt === "function") {
      if (resourceLoader._appendSystemPrompt !== appendSystemPrompts) {
        resourceLoader.setAppendSystemPrompt(appendSystemPrompts);
        if (!isLabChannel) {
          await resourceLoader.reload();
        }
      }
    }

    const promptText =
      memoryPrefix + buildAgentPrompt(incomingMsg, recentMessages, channel.context || []);

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
            this.broadcastFn(channelId, {
              type: "channel_agent_token",
              channelId,
              sessionId: incomingMsg.sessionId,
              agentId: member.agentId,
              token: delta,
              fullText: stream ? stream.text : undefined,
            });
          }
        } else if (ev.assistantMessageEvent?.type === "thinking_delta" && channel.showThinking) {
          const delta = ev.assistantMessageEvent.delta;
          if (delta) {
            const stream = this.activeStreams.get(streamKey)?.get(member.agentId);
            if (stream) {
              stream.thinking += delta;
            }
            this.broadcastFn(channelId, {
              type: "channel_agent_thinking",
              channelId,
              sessionId: incomingMsg.sessionId,
              agentId: member.agentId,
              token: delta,
              fullThinking: stream ? stream.thinking : undefined,
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
        this.broadcastFn(channelId, {
          type: "channel_agent_tool_start",
          channelId,
          sessionId: incomingMsg.sessionId,
          agentId: member.agentId,
          toolName: ev.toolName,
          args: ev.args,
          toolCallId: ev.toolCallId,
        });
      } else if (evt.type === "tool_execution_update" && channel.showTools) {
        this.broadcastFn(channelId, {
          type: "channel_agent_tool_update",
          channelId,
          sessionId: incomingMsg.sessionId,
          agentId: member.agentId,
          toolCallId: ev.toolCallId,
          toolName: ev.toolName,
          partialResult: ev.partialResult,
        });
      } else if (evt.type === "tool_execution_end" && channel.showTools) {
        const stream = this.activeStreams.get(streamKey)?.get(member.agentId);
        if (stream && stream.toolCalls[ev.toolCallId]) {
          stream.toolCalls[ev.toolCallId].result = ev.result;
          stream.toolCalls[ev.toolCallId].isError = ev.isError;
        }
        this.broadcastFn(channelId, {
          type: "channel_agent_tool_end",
          channelId,
          sessionId: incomingMsg.sessionId,
          agentId: member.agentId,
          toolName: ev.toolName,
          result: ev.result,
          isError: ev.isError,
          toolCallId: ev.toolCallId,
        });
      }
    });

    try {
      if ((agentEntry.server.session as any).agent?.reset) {
        (agentEntry.server.session as any).agent.reset();
      }
      await agentEntry.server.session.prompt(promptText);
    } catch (err: any) {
      unsub();
      const isAbort =
        signal.aborted || err.message?.includes("abort") || err.message?.includes("cancel");
      if (!isAbort) {
        console.error(`[AgentPromptRunner] Error prompting agent ${member.agentId}:`, err);
        this.broadcastFn(channelId, {
          type: "channel_agent_error",
          channelId,
          sessionId: incomingMsg.sessionId,
          agentId: member.agentId,
          error: String(err.message || err),
        });
      }
      this.broadcastFn(channelId, {
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

    const parseResult = parseAgentResponse(
      agentEntry.server.session.messages,
      channel,
      fullResponse
    );

    parseResult.content = enforceDiffFormat(parseResult.content, deployment.outputMode || "normal");

    if (
      memoryEnabled &&
      userSettings.memoryAutoStore !== false &&
      parseResult.content &&
      !parseResult.isSilent
    ) {
      await agentEntry.server.memory.store(
        parseResult.content.slice(0, 500),
        "episodic",
        0.5,
        ["interaction", `channel:${channelId}`],
        incomingMsg.sessionId
      );
    }

    this.broadcastFn(channelId, {
      type: "channel_agent_end",
      channelId,
      sessionId: incomingMsg.sessionId,
      agentId: member.agentId,
    });

    if (parseResult.isSilent) {
      console.log(`[AgentPromptRunner] Agent ${member.agentId} produced silent response`);
      return { agentMsg: null };
    }

    const agentMentions = parseMentions(parseResult.content, channel.members, agentNameMap);

    const agentMsg: ChannelMessage = {
      id: crypto.randomUUID(),
      channelId,
      sessionId: incomingMsg.sessionId,
      role: "agent",
      agentId: member.agentId,
      agentName,
      content: parseResult.content,
      thinking: parseResult.thinking || undefined,
      toolCalls: parseResult.toolCalls.length > 0 ? parseResult.toolCalls : undefined,
      mentions: agentMentions.length > 0 ? agentMentions : undefined,
      tokensIn: parseResult.tokensIn || undefined,
      tokensOut: parseResult.tokensOut || undefined,
      createdAt: new Date().toISOString(),
    };

    return { agentMsg };
  }
}
