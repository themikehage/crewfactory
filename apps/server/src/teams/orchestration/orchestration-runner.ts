import { teamStore } from "../team-store";
import { agentRegistry } from "../../agents";
import { sessionManager } from "../../core/session-manager";
import {
  type Team,
  type TeamMessage,
  SessionPrefix,
  getTeamWorkspaceDir,
} from "shared";

type BroadcastFn = (teamId: string, data: any) => void;

interface ActiveBridge {
  sessionId: string | undefined;
  accumulatedText: string;
  unsub: (() => void) | null;
}

export class OrchestrationRunner {
  private activeBridges = new Map<string, ActiveBridge>();
  private broadcastFn: BroadcastFn;

  constructor(broadcastFn: BroadcastFn) {
    this.broadcastFn = broadcastFn;
  }

  async dispatch(
    username: string,
    teamId: string,
    userContent: string,
    conversationSessionId?: string
  ): Promise<void> {
    const team = teamStore.getTeam(username, teamId);
    if (!team) throw new Error("Team not found");

    const leader = team.members.find((m) => m.role === "lead");
    if (!leader) throw new Error("Orchestration leader not found");

    const leaderEntry = agentRegistry.get(leader.agentId);
    const leaderName = leaderEntry?.server.definition.name ?? leader.agentId;

    const ownerSessionId = `${SessionPrefix.TEAM}${teamId}`;

    const now = new Date().toISOString();
    const metaStore = sessionManager.metadataStore;
    if (!metaStore.getSessionMetadata(username, ownerSessionId)) {
      metaStore.saveSessionMetadata(username, ownerSessionId, {
        name: `${team.name} — Orchestration`,
        createdAt: now,
        updatedAt: now,
        agentId: leader.agentId,
        teamId,
      });
    }

    const userMsg: TeamMessage = {
      id: crypto.randomUUID(),
      teamId,
      sessionId: conversationSessionId,
      role: "user",
      content: userContent,
      createdAt: now,
    };
    teamStore.appendMessage(username, teamId, userMsg);
    this.broadcastFn(teamId, {
      type: "team_message",
      teamId,
      sessionId: conversationSessionId,
      message: userMsg,
      eventType: "user_message",
    });

    const session = await sessionManager.getOrCreateSession(
      username,
      ownerSessionId,
      undefined,
      leader.agentId,
      undefined,
      { workspaceDir: getTeamWorkspaceDir(username, teamId) }
    );

    const existingBridge = this.activeBridges.get(teamId);
    if (existingBridge?.unsub) {
      existingBridge.unsub();
    }

    const bridge: ActiveBridge = {
      sessionId: conversationSessionId,
      accumulatedText: "",
      unsub: null,
    };
    this.activeBridges.set(teamId, bridge);

    const unsub = session.subscribe((evt: any) => {
      const currentBridge = this.activeBridges.get(teamId);
      if (!currentBridge) return;
      const sid = currentBridge.sessionId;

      switch (evt.type) {
        case "agent_start":
          this.broadcastFn(teamId, {
            type: "team_agent_start",
            teamId,
            sessionId: sid,
            agentId: leader.agentId,
            agentName: leaderName,
          });
          currentBridge.accumulatedText = "";
          break;

        case "text_delta":
          if (evt.delta) {
            currentBridge.accumulatedText += evt.delta;
            this.broadcastFn(teamId, {
              type: "team_agent_token",
              teamId,
              sessionId: sid,
              agentId: leader.agentId,
              token: evt.delta,
              fullText: currentBridge.accumulatedText,
            });
          }
          break;

        case "thinking_delta":
          if (evt.delta) {
            this.broadcastFn(teamId, {
              type: "team_agent_thinking",
              teamId,
              sessionId: sid,
              agentId: leader.agentId,
              token: evt.delta,
            });
          }
          break;

        case "tool_execution_start":
          this.broadcastFn(teamId, {
            type: "team_agent_tool_start",
            teamId,
            sessionId: sid,
            agentId: leader.agentId,
            toolName: evt.toolName,
            toolCallId: evt.toolCallId,
            args: evt.args,
          });
          break;

        case "tool_execution_end":
          this.broadcastFn(teamId, {
            type: "team_agent_tool_end",
            teamId,
            sessionId: sid,
            agentId: leader.agentId,
            toolName: evt.toolName,
            toolCallId: evt.toolCallId,
            result: evt.result,
            isError: evt.isError,
          });
          break;

        case "message_end": {
          if (currentBridge.accumulatedText.trim()) {
            const agentMsg: TeamMessage = {
              id: crypto.randomUUID(),
              teamId,
              sessionId: sid,
              role: "agent",
              agentId: leader.agentId,
              agentName: leaderName,
              content: currentBridge.accumulatedText,
              createdAt: new Date().toISOString(),
            };
            teamStore.appendMessage(username, teamId, agentMsg);
            this.broadcastFn(teamId, {
              type: "team_message",
              teamId,
              sessionId: sid,
              message: agentMsg,
              eventType: "agent_message",
            });
            currentBridge.accumulatedText = "";
          }
          break;
        }

        case "agent_end":
          this.broadcastFn(teamId, {
            type: "team_agent_end",
            teamId,
            sessionId: sid,
            agentId: leader.agentId,
          });
          break;
      }
    });

    bridge.unsub = unsub;

    if (session.isStreaming) {
      try {
        session.followUp(userContent);
      } catch (err) {
        console.error("[OrchestrationRunner] followUp error:", err);
      }
    } else {
      session.prompt(userContent).catch((err) => {
        console.error("[OrchestrationRunner] prompt error:", err);
      });
    }
  }

  abort(username: string, teamId: string): void {
    const bridge = this.activeBridges.get(teamId);
    if (bridge?.unsub) {
      bridge.unsub();
      bridge.unsub = null;
    }
    this.activeBridges.delete(teamId);

    const ownerSessionId = `${SessionPrefix.TEAM}${teamId}`;
    const session = sessionManager.getSession(username, ownerSessionId);
    if (session) {
      session.abort().catch(() => {});
    }

    import("../../core/delegation-registry")
      .then(({ delegationRegistry }) => {
        delegationRegistry.abortAllRecursive(ownerSessionId);
      })
      .catch(console.error);
  }
}
