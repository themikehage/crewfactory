import type { NegotiationProtocol } from "shared";

export type AgentVote = "agreed" | "counter" | "rejected" | "neutral";

export type RoundOutcome =
  | { result: "consensus"; votes: Record<string, AgentVote> }
  | { result: "conflict"; triggerAgentId: string; votes: Record<string, AgentVote> }
  | { result: "open"; votes: Record<string, AgentVote> }
  | { result: "escalate"; reason: string; votes: Record<string, AgentVote> };

export class TeamNegotiationEvaluator {
  static classifyVote(text: string, protocol: NegotiationProtocol): AgentVote {
    const agreementRe = new RegExp(protocol.agreementPattern, "i");
    const rejectRe = protocol.rejectPattern ? new RegExp(protocol.rejectPattern, "i") : null;
    const counterRe = protocol.counterPattern ? new RegExp(protocol.counterPattern, "i") : null;

    if (agreementRe.test(text)) {
      return "agreed";
    }
    if (rejectRe?.test(text)) {
      return "rejected";
    }
    if (counterRe?.test(text)) {
      return "counter";
    }
    return "neutral";
  }

  static evaluateRound(
    votes: Record<string, AgentVote>,
    quorumThreshold: number,
    activeCount: number,
    currentRound: number,
    maxRounds: number
  ): RoundOutcome {
    const agentIds = Object.keys(votes);
    
    for (const agentId of agentIds) {
      if (votes[agentId] === "rejected") {
        return { result: "conflict", triggerAgentId: agentId, votes };
      }
    }

    if (agentIds.length < activeCount) {
      return { result: "open", votes };
    }

    let agreeCount = 0;
    for (const vote of Object.values(votes)) {
      if (vote === "agreed") {
        agreeCount++;
      }
    }

    const agreeRatio = activeCount > 0 ? agreeCount / activeCount : 0;
    if (agreeRatio >= quorumThreshold) {
      return { result: "consensus", votes };
    }

    if (currentRound >= maxRounds) {
      return {
        result: "escalate",
        reason: `Max rounds reached (${currentRound}/${maxRounds}) without achieving the required agreement quorum of ${Math.round(quorumThreshold * 100)}% (${agreeCount}/${activeCount} agreed).`,
        votes
      };
    }

    return { result: "open", votes };
  }
}
