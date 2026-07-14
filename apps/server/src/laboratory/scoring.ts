import { type VariantRunResult } from "shared";

export function calculateVariantScores(
  type: "single" | "multi_no_leader" | "multi_with_leader",
  taskQuality: number, // 0-100
  durationMs: number,
  tokensIn: number,
  tokensOut: number,
  baseline: { durationMs: number; totalTokens: number } | null,
  numAgents: number,
  effectiveRounds?: number,
  negotiation?: {
    agreementReached: boolean;
    rounds: number;
    maxRounds: number;
    escalationsToLeader: number;
    divergenceEventsCount?: number;
    arbitrationRoundsCount?: number;
    protocolActivationRate?: number;
  },
  judgeDetail?: {
    reasoning: string;
    criteriaScores: Record<string, number>;
  }
): VariantRunResult["scores"] {
  const totalTokens = tokensIn + tokensOut;
  const agentCount = Math.max(1, numAgents);
  const adjustedDuration = durationMs / agentCount;
  const adjustedTokens = totalTokens / agentCount;

  // 1. Efficiency Score
  let efficiencyScore = 100;
  if (type !== "single" && baseline) {
    const timeRatio = adjustedDuration / (baseline.durationMs || 1);
    const tokenRatio = adjustedTokens / (baseline.totalTokens || 1);
    const penalty = (0.5 * Math.log2(1 + timeRatio) + 0.5 * Math.log2(1 + tokenRatio)) * 15;
    efficiencyScore = Math.max(0, Math.min(100, 100 - penalty));
  }

  // 2. Negotiation Score (only for multi-agent variants)
  let negotiationScore: number | undefined = undefined;
  if (type !== "single" && negotiation) {
    const { agreementReached, rounds, maxRounds, escalationsToLeader, divergenceEventsCount } = negotiation;
    const agreedVal = agreementReached ? 1 : 0;
    const roundsRatio = maxRounds > 0 ? Math.min(1, rounds / maxRounds) : 0;

    const divergenceBonus = (divergenceEventsCount ?? 0) > 0 ? 20 : 0;

    if (type === "multi_with_leader") {
      const escalationPenalty = escalationsToLeader > 0 ? 0.5 : 1.0;
      const baseScore = (40 * agreedVal + 30 * (1 - roundsRatio) + 30 * escalationPenalty);
      negotiationScore = baseScore + divergenceBonus;
    } else {
      const baseScore = (50 * agreedVal + 50 * (1 - roundsRatio));
      negotiationScore = baseScore + divergenceBonus;
    }
    negotiationScore = Math.max(0, Math.min(100, negotiationScore));
  }

  // 3. Global Score (weighted compound)
  let globalScore = 0;
  if (type === "single") {
    globalScore = 0.6 * taskQuality + 0.4 * efficiencyScore;
  } else {
    const negScore = negotiationScore ?? 100;
    globalScore = 0.5 * taskQuality + 0.3 * efficiencyScore + 0.2 * negScore;
  }

  return {
    taskQuality,
    efficiencyScore: Math.round(efficiencyScore),
    negotiationScore: negotiationScore !== undefined ? Math.round(negotiationScore) : undefined,
    globalScore: Math.round(globalScore),
    efficiencyDetail: {
      numAgents: agentCount,
      effectiveRounds: effectiveRounds ?? 0,
      adjustedDuration: Math.round(adjustedDuration),
      adjustedTokens: Math.round(adjustedTokens),
    },
    ...(judgeDetail ? {
      judgeReasoning: judgeDetail.reasoning,
      criteriaScores: judgeDetail.criteriaScores,
    } : {}),
  };
}
