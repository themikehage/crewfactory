import { mock } from "bun:test";

mock.module("../ws/handler", () => {
  return {};
});

import { expect, test, describe } from "bun:test";
import { TeamNegotiationEvaluator } from "../teams/team-negotiation-evaluator";
import { handleTeamNegotiation } from "../teams/team-negotiation";
import type { Team, TeamMessage } from "shared";

describe("TeamNegotiationEvaluator", () => {
  const protocol = {
    agreementPattern: "i agree",
    counterPattern: "counter offer",
    rejectPattern: "i reject",
    maxRounds: 3,
    quorumThreshold: 0.6,
  };

  test("classifyVote classifies messages correctly", () => {
    expect(TeamNegotiationEvaluator.classifyVote("Yes, I agree with this", protocol)).toBe("agreed");
    expect(TeamNegotiationEvaluator.classifyVote("Here is my counter offer: 50", protocol)).toBe("counter");
    expect(TeamNegotiationEvaluator.classifyVote("No, I reject this proposal", protocol)).toBe("rejected");
    expect(TeamNegotiationEvaluator.classifyVote("Hello world", protocol)).toBe("neutral");
  });

  test("evaluateRound handles consensus, conflict, open and escalate outcomes", () => {
    const votes = {
      agent1: "agreed",
      agent2: "agreed",
      agent3: "neutral",
    } as const;

    const res1 = TeamNegotiationEvaluator.evaluateRound(votes, 0.6, 3, 1, 3);
    expect(res1.result).toBe("consensus");

    const res2 = TeamNegotiationEvaluator.evaluateRound(votes, 0.7, 3, 1, 3);
    expect(res2.result).toBe("open");

    const conflictVotes = {
      agent1: "agreed",
      agent2: "rejected",
      agent3: "neutral",
    } as const;
    const resConflict = TeamNegotiationEvaluator.evaluateRound(conflictVotes, 0.6, 3, 1, 3);
    expect(resConflict.result).toBe("conflict");

    const resEscalate = TeamNegotiationEvaluator.evaluateRound(votes, 0.7, 3, 3, 3);
    expect(resEscalate.result).toBe("escalate");
  });
});

describe("handleTeamNegotiation integration", () => {
  test("handles agreement consensus action", () => {
    const teamId = `test-team-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const team: Team = {
      id: teamId,
      name: "Test Team",
      members: [
        { agentId: "agent1", role: "lead" },
        { agentId: "agent2", role: "member" },
      ],
      maxRounds: 3,
      createdAt: "",
      updatedAt: "",
      mode: "debate",
      teamType: "Negotiation",
      negotiationProtocol: {
        agreementPattern: "i agree",
        quorumThreshold: 0.5,
        maxRounds: 3,
      },
    };

    const incoming: TeamMessage = {
      id: "m1",
      teamId: teamId,
      role: "user",
      content: "start",
      createdAt: "",
    };

    const agentMsg: TeamMessage = {
      id: "m2",
      teamId: teamId,
      role: "agent",
      agentId: "agent1",
      content: "I agree with this",
      round: 1,
      createdAt: "",
    };

    const nameMap = new Map([["agent1", "Agent 1"], ["agent2", "Agent 2"]]);
    const broadcasts: any[] = [];
    const broadcastFn = (tid: string, data: any) => {
      broadcasts.push({ tid, data });
    };

    const result1 = handleTeamNegotiation(
      "test_user",
      teamId,
      team,
      "agent1",
      incoming,
      agentMsg,
      nameMap,
      broadcastFn
    );

    expect(result1.action).toBe("continue");

    const agentMsg2: TeamMessage = {
      id: "m3",
      teamId: teamId,
      role: "agent",
      agentId: "agent2",
      content: "I agree too",
      round: 1,
      createdAt: "",
    };

    const result2 = handleTeamNegotiation(
      "test_user",
      teamId,
      team,
      "agent2",
      incoming,
      agentMsg2,
      nameMap,
      broadcastFn
    );

    expect(result2.action).toBe("stop-agreed");
    expect(broadcasts.some(b => b.data.type === "team_negotiation_agreement")).toBe(true);
  });
});
