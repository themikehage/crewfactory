import { teamStore } from "../teams/team-store";
import { TeamPromptRunner } from "../teams/team-prompt-runner";
import { handleTeamNegotiation } from "../teams/team-negotiation";
import { channelStore } from "../channels";
import { sessionManager } from "../core/session-manager";
import { agentRegistry } from "../agents";
import { broadcastToUser } from "../ws/handler";
import type { Team, TeamMember, TeamMessage, ChannelMessage, ChannelMember } from "shared";
import crypto from "node:crypto";

export interface LabNegotiationOptions {
  username: string;
  experimentId: string;
  variantKey: string;
  agents: any[];
  maxChainDepth: number;
  negotiationProtocol?: any;
  taskPrompt: string;
  sessionId: string;
  sessionName: string;
  signal: AbortSignal;
}

export interface LabNegotiationResult {
  status: "completed" | "failed" | "aborted";
  tokensIn: number;
  tokensOut: number;
  negotiationRounds: number;
  escalationsToLeader: number;
  agreementReached: boolean;
  divergenceEventsCount: number;
  arbitrationRoundsCount: number;
  protocolActivationRate: number;
  messages: any[];
}

export class LabNegotiationRunner {
  static async run(opts: LabNegotiationOptions): Promise<LabNegotiationResult> {
    const {
      username,
      experimentId,
      variantKey,
      agents,
      maxChainDepth,
      negotiationProtocol,
      taskPrompt,
      sessionId,
      sessionName,
      signal
    } = opts;

    const channelId = `lab_${experimentId}_${variantKey}`;
    const teamId = `lab_team_${experimentId}_${variantKey}`;

    // 1. Setup channel representation in channelStore for client compatibility
    const existingChannel = channelStore.getChannel(username, channelId);
    const channelMembers: ChannelMember[] = agents.map((ag) => ({
      agentId: `lab_${experimentId}_${variantKey}_${ag.id}`,
      replyMode: "targeted",
      role: ag.leader ? "lead" : "member"
    }));

    if (!existingChannel) {
      channelStore.createChannel(username, {
        id: channelId,
        name: `${sessionName} (${variantKey})`,
        description: "Virtual Lab Channel",
        maxChainDepth,
        showThinking: true,
        showTools: true,
        negotiationProtocol
      } as any);
    }
    channelStore.updateMembers(username, channelId, channelMembers);

    // 2. Setup active session in sessionManager
    await sessionManager.getOrCreateSession(username, sessionId, undefined, undefined, channelId);
    sessionManager.metadataStore.saveSessionMetadata(username, sessionId, {
      name: sessionName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      channelId,
      isExecution: true
    });

    // 3. Setup temporary team representation in teamStore
    const teamMembers: TeamMember[] = agents.map((ag) => ({
      agentId: `lab_${experimentId}_${variantKey}_${ag.id}`,
      role: ag.leader ? "lead" : "member",
      outputMode: "normal"
    }));

    const tempTeam: Team = {
      id: teamId,
      name: `Lab Team ${experimentId}`,
      mode: "debate",
      teamType: "Negotiation",
      members: teamMembers,
      maxRounds: maxChainDepth,
      showThinking: true,
      showTools: true,
      streamingEnabled: true,
      negotiationProtocol,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save temporary team definitions to teamStore
    const teamJsonPath = (teamStore as any).getTeamJsonPath(username, teamId);
    (teamStore as any).getTeamDirectory(username, teamId);
    require("node:fs").writeFileSync(teamJsonPath, JSON.stringify(tempTeam, null, 2), "utf-8");

    // 4. Build Agent Name Map
    const agentNameMap = new Map<string, string>();
    for (const ag of agents) {
      const regId = `lab_${experimentId}_${variantKey}_${ag.id}`;
      agentNameMap.set(regId, ag.name);
    }

    // 5. Define Broadcast Mapper
    // Maps team events from TeamPromptRunner to channel events expected by the client ChannelChatArea
    const customBroadcast = (tId: string, data: any) => {
      let mappedData = { ...data };
      if (data.type?.startsWith("team_")) {
        mappedData.type = data.type.replace("team_", "channel_");
      }
      mappedData.channelId = channelId;
      delete mappedData.teamId;

      broadcastToUser(username, mappedData);
    };

    const promptRunner = new TeamPromptRunner(new Map(), customBroadcast);
    channelStore.resetNegotiationState(username, channelId);

    // Initial user message in the channel
    const userMsg: ChannelMessage = {
      id: crypto.randomUUID(),
      channelId,
      sessionId,
      role: "user",
      content: taskPrompt,
      createdAt: new Date().toISOString()
    };

    channelStore.appendMessage(username, channelId, userMsg);
    broadcastToUser(username, {
      type: "channel_message",
      channelId,
      message: userMsg
    });

    let status: "completed" | "failed" | "aborted" = "completed";
    let round = 1;
    let agreementReached = false;
    let currentIncomingMsg: TeamMessage = {
      id: userMsg.id,
      teamId,
      sessionId,
      role: "user",
      content: taskPrompt,
      createdAt: userMsg.createdAt
    };

    try {
      while (round <= maxChainDepth && !signal.aborted) {
        if (signal.aborted) {
          status = "aborted";
          break;
        }

        // Parallel execution of all active members (excluding arbiter)
        const activeMembers = tempTeam.members.filter(
          (m) => m.role !== "observer" && m.agentId !== negotiationProtocol?.arbiterAgentId
        );

        if (activeMembers.length === 0) {
          status = "failed";
          break;
        }

        const recentHistory = channelStore.getMessages(username, channelId, 40, sessionId) as unknown as TeamMessage[];

        // Prompts all members in parallel
        const promises = activeMembers.map((m) =>
          promptRunner.runStateless(
            username,
            teamId,
            m,
            currentIncomingMsg,
            recentHistory,
            agentNameMap,
            signal
          )
        );

        const results = await Promise.all(promises);
        if (signal.aborted) {
          status = "aborted";
          break;
        }

        const activeResults = results.filter((r) => r.agentMsg !== null) as { agentMsg: TeamMessage }[];

        if (activeResults.length === 0) {
          console.log(`[LabNegotiationRunner] All agents silent in round ${round}. Stopping.`);
          break;
        }

        // Publish and save agents' responses
        for (const res of activeResults) {
          const chMsg: ChannelMessage = {
            id: res.agentMsg.id,
            channelId,
            sessionId,
            role: "agent",
            agentId: res.agentMsg.agentId,
            agentName: res.agentMsg.agentName,
            content: res.agentMsg.content,
            thinking: res.agentMsg.thinking,
            toolCalls: res.agentMsg.toolCalls,
            createdAt: res.agentMsg.createdAt
          };

          channelStore.appendMessage(username, channelId, chMsg);
          broadcastToUser(username, {
            type: "channel_message",
            channelId,
            message: chMsg
          });
        }

        // Last message becomes the incoming context for next round
        const lastResult = activeResults[activeResults.length - 1];
        currentIncomingMsg = lastResult.agentMsg;

        // Evaluate negotiation consensus
        let stopLoop = false;
        let escalationMsg: TeamMessage | undefined = undefined;
        let arbiterMember: TeamMember | undefined = undefined;

        for (const res of activeResults) {
          const negResult = handleTeamNegotiation(
            username,
            teamId,
            tempTeam,
            res.agentMsg.agentId!,
            currentIncomingMsg,
            res.agentMsg,
            agentNameMap,
            customBroadcast
          );

          if (negResult.action === "stop-agreed" || negResult.action === "stop-rejected") {
            if (negResult.action === "stop-agreed") {
              agreementReached = true;
            }
            stopLoop = true;
            break;
          }

          if (negResult.action === "escalate" && negResult.escalationMessage && negResult.arbiterMember) {
            escalationMsg = negResult.escalationMessage;
            arbiterMember = negResult.arbiterMember;
            break;
          }
        }

        if (stopLoop) {
          console.log(`[LabNegotiationRunner] Agreement or consensus stop reached.`);
          break;
        }

        // Handle escalation to Arbiter if triggered
        if (escalationMsg && arbiterMember) {
          const negState = teamStore.getNegotiationState(username, teamId);
          const currentArbitrations = negState._arbitrations || 0;

          if (currentArbitrations >= 3) {
            const fallbackMsg: ChannelMessage = {
              id: crypto.randomUUID(),
              channelId,
              sessionId,
              role: "system",
              content: `RESOLUTION: Se aplica el protocolo de contingencia "Safety First". Se da por finalizado el debate técnico sin consenso tras superar el límite de arbitrajes.`,
              createdAt: new Date().toISOString()
            };

            channelStore.appendMessage(username, channelId, fallbackMsg);
            broadcastToUser(username, {
              type: "channel_message",
              channelId,
              message: fallbackMsg
            });
            break;
          }

          // Publish the escalation message
          const escChMsg: ChannelMessage = {
            id: escalationMsg.id,
            channelId,
            sessionId,
            role: "system",
            content: escalationMsg.content,
            createdAt: escalationMsg.createdAt
          };
          channelStore.appendMessage(username, channelId, escChMsg);
          broadcastToUser(username, {
            type: "channel_message",
            channelId,
            message: escChMsg
          });

          // Run Arbiter
          const arbiterHistory = channelStore.getMessages(username, channelId, 40, sessionId) as unknown as TeamMessage[];
          const arbiterResult = await promptRunner.runStateless(
            username,
            teamId,
            arbiterMember,
            escalationMsg,
            arbiterHistory,
            agentNameMap,
            signal
          );

          if (arbiterResult.agentMsg) {
            const arbChMsg: ChannelMessage = {
              id: arbiterResult.agentMsg.id,
              channelId,
              sessionId,
              role: "agent",
              agentId: arbiterResult.agentMsg.agentId,
              agentName: arbiterResult.agentMsg.agentName,
              content: arbiterResult.agentMsg.content,
              thinking: arbiterResult.agentMsg.thinking,
              toolCalls: arbiterResult.agentMsg.toolCalls,
              createdAt: arbiterResult.agentMsg.createdAt
            };

            channelStore.appendMessage(username, channelId, arbChMsg);
            broadcastToUser(username, {
              type: "channel_message",
              channelId,
              message: arbChMsg
            });

            currentIncomingMsg = arbiterResult.agentMsg;
          }
        }

        round++;
      }
    } catch (err) {
      console.error(`[LabNegotiationRunner] Error in execution:`, err);
      status = "failed";
    } finally {
      if (signal.aborted) status = "aborted";

      // Clean up temporary team definition from teamStore
      try {
        teamStore.deleteTeam(username, teamId);
      } catch {}
    }

    // 6. Collect final execution results
    const messages = channelStore.getMessages(username, channelId, 100, sessionId);
    const agentMessages = messages.filter((m) => m.role === "agent");

    // Recalculate tokens using core agent registry
    let tokensIn = 0;
    let tokensOut = 0;
    for (const ag of agents) {
      const regId = `lab_${experimentId}_${variantKey}_${ag.id}`;
      const entry = agentRegistry.get(regId);
      if (entry) {
        try {
          const stats = entry.server.session.getSessionStats();
          if (stats && stats.tokens) {
            tokensIn += stats.tokens.input || 0;
            tokensOut += stats.tokens.output || 0;
          }
        } catch {}
      }
    }

    // Collect negotiation statistics
    const negState = teamStore.getNegotiationState(username, teamId);
    let negotiationRounds = 0;
    let escalationsToLeader = 0;

    for (const key of Object.keys(negState)) {
      if (key.startsWith("_")) continue;
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
      tokensIn,
      tokensOut,
      negotiationRounds: negotiationRounds || round - 1,
      escalationsToLeader,
      agreementReached,
      divergenceEventsCount,
      arbitrationRoundsCount,
      protocolActivationRate,
      messages
    };
  }
}
