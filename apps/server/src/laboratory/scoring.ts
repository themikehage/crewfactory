import { type VariantRunResult } from "shared";

export function calculateVariantScores(
  type: "single" | "multi_no_leader" | "multi_with_leader",
  taskQuality: number, // 0-100
  durationMs: number,
  tokensIn: number,
  tokensOut: number,
  baseline: { durationMs: number; totalTokens: number } | null,
  negotiation?: {
    agreementReached: boolean;
    rounds: number;
    maxRounds: number;
    escalationsToLeader: number;
  }
): VariantRunResult["scores"] {
  const totalTokens = tokensIn + tokensOut;

  // 1. Efficiency Score
  let efficiencyScore = 100;
  if (type !== "single" && baseline) {
    const timeRatio = durationMs / (baseline.durationMs || 1);
    const tokenRatio = totalTokens / (baseline.totalTokens || 1);
    // Weighted penalty - scale so overhead reduces the score reasonably
    const penalty = (0.5 * timeRatio + 0.5 * tokenRatio) * 10;
    efficiencyScore = Math.max(0, Math.min(100, 100 - penalty));
  }

  // 2. Negotiation Score (only for multi-agent variants)
  let negotiationScore: number | undefined = undefined;
  if (type !== "single" && negotiation) {
    const { agreementReached, rounds, maxRounds, escalationsToLeader } = negotiation;
    const agreedVal = agreementReached ? 1 : 0;
    const roundsRatio = maxRounds > 0 ? Math.min(1, rounds / maxRounds) : 0;

    if (type === "multi_with_leader") {
      // 40% agreed, 30% rounds speed, 30% no escalation required (or escalated = 0.5)
      const escalationPenalty = escalationsToLeader > 0 ? 0.5 : 1.0;
      negotiationScore = (40 * agreedVal + 30 * (1 - roundsRatio) + 30 * escalationPenalty);
    } else {
      // multi_no_leader (50% agreed, 50% rounds speed)
      negotiationScore = (50 * agreedVal + 50 * (1 - roundsRatio));
    }
    negotiationScore = Math.max(0, Math.min(100, negotiationScore));
  }

  // 3. Global Score (weighted compound)
  let globalScore = 0;
  if (type === "single") {
    // 60% Quality, 40% Efficiency
    globalScore = 0.6 * taskQuality + 0.4 * efficiencyScore;
  } else {
    // 50% Quality, 30% Efficiency, 20% Negotiation
    const negScore = negotiationScore ?? 100;
    globalScore = 0.5 * taskQuality + 0.3 * efficiencyScore + 0.2 * negScore;
  }

  return {
    taskQuality,
    efficiencyScore: Math.round(efficiencyScore),
    negotiationScore: negotiationScore !== undefined ? Math.round(negotiationScore) : undefined,
    globalScore: Math.round(globalScore),
  };
}
