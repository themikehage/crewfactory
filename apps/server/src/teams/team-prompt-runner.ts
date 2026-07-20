import { teamStore } from "./team-store";
import { agentRegistry } from "../agents";
import { sessionManager } from "../core/session-manager";
import { resolveModelWithFallback } from "../core/agent-utils";
import { type Team, type TeamMember, type TeamMessage, getTeamMemoryDbPath } from "shared";
import { memoryRegistry } from "../core/memory/registry";
import { assemblePromptAppends } from "../core/prompts/prompt-assembly";
import { parseAgentResponse, enforceDiffFormat } from "../core/multi-agent/response-parser";
import { parseMentions } from "../core/multi-agent/mention-parser";
import { buildAgentPrompt, buildAgentNameMap } from "../core/multi-agent/agent-prompt-runner";
import { streamSimple } from "../ai/vendor/ai/src/compat.ts";

const _promptCache = new Map<string, string[]>();

export interface ActiveTeamStream {
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

export function isSubstantiveMessage(content: string): boolean {
  if (content.trim().length <= 10) return false;
  const trivial = /^(hola|para|ok|si|no|gracias|dale|listo|stop|hey|hi|hello|\.\.\.)$/i;
  return !trivial.test(content.trim());
}

function getOutputMode(member: TeamMember, team?: Team): "full-proposal" | "diff-suggestion" | "normal" {
  if (member.outputMode) return member.outputMode;
  if (member.role === "lead") return "full-proposal";
  if (team?.negotiationProtocol) return "diff-suggestion";
  return "normal";
}

function buildTeamDeploymentContext(
  team: Team,
  agentId: string,
  agentNameMap: Map<string, string>
) {
  const selfMember = team.members.find((m) => m.agentId === agentId);
  const arbiterAgentId = team.negotiationProtocol?.arbiterAgentId;

  const isArbiter = arbiterAgentId
    ? selfMember?.agentId === arbiterAgentId
    : selfMember?.role === "lead";

  const leaderMember = team.members.find((m) => m.role === "lead");
  const leaderName = leaderMember ? (agentNameMap.get(leaderMember.agentId) || leaderMember.agentId) : undefined;
  const selfOutputMode = selfMember ? getOutputMode(selfMember, team) : "normal";

  return {
    mode: "negotiation-team" as const, // For debate, everyone is negotiation-team mode
    channelId: team.id,
    agentRole: selfMember?.role || "member",
    members: team.members.map((m) => ({
      agentId: m.agentId,
      agentName: agentNameMap.get(m.agentId) || m.agentId,
      role: m.role || "member",
      replyMode: "broadcast",
      outputMode: getOutputMode(m, team),
    })),
    negotiationProtocol: !!team.negotiationProtocol,
    isArbiter,
    selfReplyMode: "broadcast",
    leaderName,
    outputMode: selfOutputMode,
  };
}

export class TeamPromptRunner {
  constructor(
    private activeStreams: Map<string, Map<string, ActiveTeamStream>>,
    private broadcastFn: (teamId: string, data: any) => void
  ) {}

  async runStateless(
    username: string,
    teamId: string,
    member: TeamMember,
    incomingMsg: TeamMessage,
    recentHistory: TeamMessage[],
    agentNameMap: Map<string, string>,
    signal: AbortSignal
  ): Promise<{ agentMsg: TeamMessage | null }> {
    if (signal.aborted) return { agentMsg: null };

    const team = teamStore.getTeam(username, teamId);
    if (!team) return { agentMsg: null };

    // Pre-LLM silent bypass
    if (team.members.length > 1) {
      const isObserver = member.role === "observer";
      if (isObserver) {
        return { agentMsg: null };
      }
    }

    const agentEntry = agentRegistry.get(member.agentId);
    if (!agentEntry || agentEntry.status === "stopped") {
      this.broadcastFn(teamId, {
        type: "team_agent_error",
        teamId,
        agentId: member.agentId,
        error: `Agent "${member.agentId}" is not available`,
      });
      return { agentMsg: null };
    }

    const agentName = agentEntry.server.definition.name;

    // Resolve model settings (reusing logic from channel runner)
    let model = agentEntry.server.session.model;
    if (!model) {
      const { modelRegistry } = sessionManager.userConfig.getUserContext(username);
      modelRegistry.refresh();
      const resolved = resolveModelWithFallback(undefined, modelRegistry);
      if (resolved) {
        model = modelRegistry
          .getAvailable()
          .find((m) => m.id === resolved || `${m.provider}/${m.id}` === resolved) || null;
        if (model) {
          try {
            await agentEntry.server.session.setModel(model);
          } catch (e) {
            console.error(`[TeamPromptRunner] Failed to assign model to ${member.agentId}:`, e);
          }
        }
      }
    }

    if (!model) {
      this.broadcastFn(teamId, {
        type: "team_agent_error",
        teamId,
        agentId: member.agentId,
        error: `No LLM providers or models available for agent "${agentName}". Please configure API keys in Settings.`,
      });
      return { agentMsg: null };
    }

    const streamKey = `${teamId}:${incomingMsg.sessionId || "default"}`;
    let teamStreams = this.activeStreams.get(streamKey);
    if (!teamStreams) {
      teamStreams = new Map();
      this.activeStreams.set(streamKey, teamStreams);
    }
    teamStreams.set(member.agentId, {
      agentId: member.agentId,
      agentName,
      text: "",
      thinking: "",
      toolCalls: {},
    });

    this.broadcastFn(teamId, {
      type: "team_agent_start",
      teamId,
      sessionId: incomingMsg.sessionId,
      agentId: member.agentId,
      agentName,
    });

    // Resolve memory contexts
    const userSettings = sessionManager.userConfig.getUserSettings(username);
    const memoryEnabled = userSettings.memoryEnabled ?? true;
    const teamDbPath = getTeamMemoryDbPath(username, teamId);
    const teamMemory = await memoryRegistry.get(`team:${teamId}`, teamDbPath, memoryEnabled);

    const substantive = isSubstantiveMessage(incomingMsg.content);
    const [agentMemCtx, teamMemCtx] = substantive
      ? await Promise.all([
          agentEntry.server.memory.buildContext(incomingMsg.content, { sessionId: incomingMsg.sessionId }),
          teamMemory.buildContext(incomingMsg.content, { sessionId: incomingMsg.sessionId }),
        ])
      : ["", ""];

    let memoryPrefix = "";
    if (agentMemCtx) {
      memoryPrefix += `${agentMemCtx}\n\n`;
    }
    if (teamMemCtx) {
      const teamFormatted = teamMemCtx.replace(
        "--- Memories from previous sessions (historical context only — do not resume or re-execute past tasks unless explicitly asked) ---",
        "--- Team Memories from previous sessions (historical context only — do not resume or re-execute past tasks unless explicitly asked) ---"
      );
      memoryPrefix += `${teamFormatted}\n\n`;
    }

    // Build Deployment Context
    const deployment = buildTeamDeploymentContext(team, member.agentId, agentNameMap);
    const workspaceDir = agentEntry.server.session.cwd;
    const cacheKey = `team:${member.agentId}:${teamId}:${deployment.isArbiter}:${deployment.outputMode}`;

    let appendSystemPrompts = _promptCache.get(cacheKey);
    if (!appendSystemPrompts) {
      appendSystemPrompts = assemblePromptAppends({
        mode: "orchestration-team", // We use "orchestration-team" mode which resolves the team layered prompts
        workspaceDir,
        agentDef: agentEntry.server.definition,
        deployment: deployment as any,
      });
      _promptCache.set(cacheKey, appendSystemPrompts);
    }

    const resourceLoader = agentEntry.server.session.resourceLoader;
    const baseSystemPrompt = resourceLoader.getSystemPrompt() || "";
    const fullSystemPrompt = [
      baseSystemPrompt,
      ...(appendSystemPrompts || []),
    ].filter(Boolean).join("\n\n");

    const promptText =
      memoryPrefix + buildAgentPrompt(incomingMsg as any, recentHistory as any, ((team as any).context || []) as any);

    const context = {
      systemPrompt: fullSystemPrompt,
      messages: [
        {
          role: "user" as const,
          content: promptText,
          timestamp: Date.now(),
        },
      ],
    };

    let fullResponse = "";

    const apiKey = model.apiKey;
    const options = {
      apiKey,
      signal,
      reasoning: agentEntry.server.session.thinkingLevel as any,
    };

    let stream;
    try {
      stream = streamSimple(model as any, context as any, options);
      
      // Consume the stream asynchronously to broadcast token updates
      const streamingEnabled = team.streamingEnabled !== false;
      (async () => {
        try {
          for await (const evt of stream) {
            if (evt.type === "text_delta" && evt.delta) {
              fullResponse += evt.delta;
              const activeStreamsMap = this.activeStreams.get(streamKey);
              const activeStream = activeStreamsMap?.get(member.agentId);
              if (activeStream) {
                activeStream.text += evt.delta;
              }
              if (streamingEnabled) {
                this.broadcastFn(teamId, {
                  type: "team_agent_token",
                  teamId,
                  sessionId: incomingMsg.sessionId,
                  agentId: member.agentId,
                  token: evt.delta,
                  fullText: activeStream ? activeStream.text : undefined,
                });
              }
            } else if (evt.type === "thinking_delta" && evt.delta && team.showThinking) {
              const activeStreamsMap = this.activeStreams.get(streamKey);
              const activeStream = activeStreamsMap?.get(member.agentId);
              if (activeStream) {
                activeStream.thinking += evt.delta;
              }
              if (streamingEnabled) {
                this.broadcastFn(teamId, {
                  type: "team_agent_thinking",
                  teamId,
                  sessionId: incomingMsg.sessionId,
                  agentId: member.agentId,
                  token: evt.delta,
                  fullThinking: activeStream ? activeStream.thinking : undefined,
                });
              }
            }
          }
        } catch (streamErr) {
          console.error(`[TeamPromptRunner] Stream reading error for ${member.agentId}:`, streamErr);
        }
      })();

      const finalMsg = await stream.result();

      const parseResult = parseAgentResponse(
        [finalMsg],
        { showThinking: team.showThinking, showTools: true },
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
          ["interaction", `team:${teamId}`],
          incomingMsg.sessionId
        );
      }

      this.broadcastFn(teamId, {
        type: "team_agent_end",
        teamId,
        sessionId: incomingMsg.sessionId,
        agentId: member.agentId,
      });

      if (parseResult.isSilent) {
        console.log(`[TeamPromptRunner] Agent ${member.agentId} produced silent response`);
        return { agentMsg: null };
      }

      const agentMentions = parseMentions(parseResult.content, team.members as any, agentNameMap);

      const agentMsg: TeamMessage = {
        id: crypto.randomUUID(),
        teamId,
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

    } catch (err: any) {
      const isAbort =
        signal.aborted || err.message?.includes("abort") || err.message?.includes("cancel");
      if (!isAbort) {
        console.error(`[TeamPromptRunner] Error prompting stateless agent ${member.agentId}:`, err);
        this.broadcastFn(teamId, {
          type: "team_agent_error",
          teamId,
          sessionId: incomingMsg.sessionId,
          agentId: member.agentId,
          error: String(err.message || err),
        });
      }
      this.broadcastFn(teamId, {
        type: "team_agent_end",
        teamId,
        sessionId: incomingMsg.sessionId,
        agentId: member.agentId,
      });
      return { agentMsg: null };
    } finally {
      const activeStreamsMap = this.activeStreams.get(streamKey);
      if (activeStreamsMap) {
        activeStreamsMap.delete(member.agentId);
        if (activeStreamsMap.size === 0) {
          this.activeStreams.delete(streamKey);
        }
      }
    }
  }
}
