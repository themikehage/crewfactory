import { teamStore } from "../teams/team-store";
import { TeamPromptRunner } from "../teams/team-prompt-runner";
import { handleTeamNegotiation } from "../teams/team-negotiation";
import { sessionManager } from "../core/session-manager";
import { agentRegistry } from "../agents";
import { broadcastToUser } from "../ws/handler";
import { type Team, type TeamMember, type TeamMessage, getTeamWorkspaceDir } from "shared";
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

    const teamId = `lab_team_${experimentId}_${variantKey}`;

    // 1. Setup active session in sessionManager using the team's workspace
    await sessionManager.getOrCreateSession(username, sessionId, undefined, undefined, undefined, {
      workspaceDir: getTeamWorkspaceDir(username, teamId)
    });
    sessionManager.metadataStore.saveSessionMetadata(username, sessionId, {
      name: sessionName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      teamId,
      isExecution: true
    });

    // 2. Setup temporary team representation in teamStore
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

    // Clean up any previous run's team state before creating the new one
    try { teamStore.deleteTeam(username, teamId); } catch {}

    // Save temporary team definitions to teamStore
    const teamJsonPath = (teamStore as any).getTeamJsonPath(username, teamId);
    (teamStore as any).getTeamDirectory(username, teamId);
    require("node:fs").writeFileSync(teamJsonPath, JSON.stringify(tempTeam, null, 2), "utf-8");

    // 3. Build Agent Name Map
    const agentNameMap = new Map<string, string>();
    for (const ag of agents) {
      const regId = `lab_${experimentId}_${variantKey}_${ag.id}`;
      agentNameMap.set(regId, ag.name);
    }

    // 4. Define Broadcast Mapper (transfers directly to client without translation)
    const customBroadcast = (tId: string, data: any) => {
      broadcastToUser(username, data);
    };

    const promptRunner = new TeamPromptRunner(new Map(), customBroadcast);
    teamStore.resetNegotiationState(username, teamId);

    // Initial user message in the team
    const userMsg: TeamMessage = {
      id: crypto.randomUUID(),
      teamId,
      sessionId,
      role: "user",
      content: taskPrompt,
      createdAt: new Date().toISOString()
    };

    teamStore.appendMessage(username, teamId, userMsg);
    broadcastToUser(username, {
      type: "team_message",
      teamId,
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

        const recentHistory = teamStore.getMessages(username, teamId, 40, sessionId);

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
          teamStore.appendMessage(username, teamId, res.agentMsg);
          broadcastToUser(username, {
            type: "team_message",
            teamId,
            message: res.agentMsg
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
            const fallbackMsg: TeamMessage = {
              id: crypto.randomUUID(),
              teamId,
              sessionId,
              role: "system",
              content: `RESOLUTION: Se aplica el protocolo de contingencia "Safety First". Se da por finalizado el debate técnico sin consenso tras superar el límite de arbitrajes.`,
              createdAt: new Date().toISOString()
            };

            teamStore.appendMessage(username, teamId, fallbackMsg);
            broadcastToUser(username, {
              type: "team_message",
              teamId,
              message: fallbackMsg
            });
            break;
          }

          // Publish the escalation message
          teamStore.appendMessage(username, teamId, escalationMsg);
          broadcastToUser(username, {
            type: "team_message",
            teamId,
            message: escalationMsg
          });

          // Run Arbiter
          const arbiterHistory = teamStore.getMessages(username, teamId, 40, sessionId);
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
            teamStore.appendMessage(username, teamId, arbiterResult.agentMsg);
            broadcastToUser(username, {
              type: "team_message",
              teamId,
              message: arbiterResult.agentMsg
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
      // Team is intentionally NOT deleted here.
      // It persists so the client can read historical messages after the run.
      // Cleanup happens when the experiment is deleted (DELETE /api/experiments/:id).
    }

    // 5. Collect final execution results
    const messages = teamStore.getMessages(username, teamId, 100, sessionId);
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
