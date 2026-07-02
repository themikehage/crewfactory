import type { ScoringMetric, ScoringRubric } from "shared";
import { piSessionManager } from "../pi/session-manager.js";

export function extractFichas(text: string): number | null {
  // Matches "62 fichas", "62 Fichas", "62  fichas", etc.
  const match = text.match(/(\d+)\s*ficha/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

export async function computeMetric(
  username: string,
  metric: ScoringMetric,
  executionOutput: string,
  goldAnswer: { fichas: number; dias: number },
  modelId?: string
): Promise<number> {
  const type = metric.type;

  if (type === "numeric-deviation") {
    const proposed = extractFichas(executionOutput);
    if (proposed === null) {
      return 0; // failed to estimate/parse
    }
    const gold = goldAnswer.fichas;
    const tolerance = metric.config?.tolerance || 0.15; // default 15%
    const deviationPercent = Math.abs(proposed - gold) / gold;

    // 100 score for 0 deviation, drops to 0 when deviation equals or exceeds tolerance
    const score = Math.max(0, Math.min(100, 100 - (deviationPercent / tolerance) * 100));
    return Math.round(score);
  }

  if (type === "llm-judge") {
    const judgePrompt = metric.config?.judgePrompt || "Evalúa la calidad y viabilidad de la propuesta técnica.";
    const userPrompt = `
Eres un evaluador experto e independiente de propuestas comerciales de consultoría de software.

Tu tarea es evaluar la propuesta final generada por el equipo basándote en la siguiente rúbrica:
${judgePrompt}

Aquí está la propuesta del equipo:
---
${executionOutput}
---

Responde con una justificación breve de tu análisis y finaliza tu respuesta escribiendo de manera exacta:
SCORE: [número del 0 al 100]
`;

    try {
      // Call default configured model via pi session manager
      const { session } = await piSessionManager.getOrCreateSession(username, `judge_${crypto.randomUUID()}`);
      if (modelId) {
        await session.setModel(modelId);
      }
      
      const response = await session.prompt(userPrompt);
      // Clean up session afterward
      await piSessionManager.destroySession(username, session.id);

      const match = response.match(/SCORE:\s*(\d+)/i);
      if (match) {
        return Math.min(100, Math.max(0, parseInt(match[1], 10)));
      }
      return 70; // fallback default
    } catch (e) {
      console.error("[Scoring] LLM judge failed:", e);
      return 50; // fallback error score
    }
  }

  return 100; // default for unknown or custom script stub
}

export async function computeGlobalScore(
  username: string,
  rubric: ScoringRubric,
  executionOutput: string,
  goldAnswer: { fichas: number; dias: number },
  modelId?: string
): Promise<{ globalScore: number; metricScores: Record<string, number> }> {
  const metricScores: Record<string, number> = {};
  let totalWeight = 0;
  let weightedSum = 0;

  for (const metric of rubric.metrics) {
    const score = await computeMetric(username, metric, executionOutput, goldAnswer, modelId);
    metricScores[metric.id] = score;
    weightedSum += score * metric.weight;
    totalWeight += metric.weight;
  }

  const globalScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  return { globalScore, metricScores };
}
