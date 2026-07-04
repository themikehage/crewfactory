import { piSessionManager } from "../pi/session-manager";
import { z } from "zod";

const OutputEvaluationSchema = z.object({
  criteria: z.record(z.object({
    analysis: z.string(),
    score: z.number().min(0).max(100)
  })),
  globalAnalysis: z.string(),
  globalScore: z.number().min(0).max(100),
  reasoning: z.string()
});

const JudgeResponseSchema = z.object({
  Alpha: OutputEvaluationSchema,
  Beta: OutputEvaluationSchema,
  Gamma: OutputEvaluationSchema
});

export class LabJudge {
  static async evaluateRuns(
    username: string,
    taskPrompt: string,
    criteria: string[],
    outputs: {
      single: string;
      multiNoLeader: string;
      multiWithLeader: string;
    }
  ): Promise<{
    single: { scores: Record<string, number>; globalScore: number; reasoning: string };
    multiNoLeader: { scores: Record<string, number>; globalScore: number; reasoning: string };
    multiWithLeader: { scores: Record<string, number>; globalScore: number; reasoning: string };
  }> {
    const sessionId = `judge_${crypto.randomUUID()}`;
    const session = await piSessionManager.getOrCreateSession(username, sessionId);

    // 1. Double-Blind Shuffling
    const keys = ["single", "multiNoLeader", "multiWithLeader"] as const;
    const shuffledKeys = [...keys].sort(() => Math.random() - 0.5);

    const labels = ["Alpha", "Beta", "Gamma"] as const;
    const keyToLabelMap = new Map<"single" | "multiNoLeader" | "multiWithLeader", "Alpha" | "Beta" | "Gamma">();
    const labelToKeyMap = new Map<"Alpha" | "Beta" | "Gamma", "single" | "multiNoLeader" | "multiWithLeader">();

    shuffledKeys.forEach((key, index) => {
      const label = labels[index];
      keyToLabelMap.set(key, label);
      labelToKeyMap.set(label, key);
    });

    const outputAlpha = outputs[labelToKeyMap.get("Alpha")!];
    const outputBeta = outputs[labelToKeyMap.get("Beta")!];
    const outputGamma = outputs[labelToKeyMap.get("Gamma")!];

    console.log(`[LabJudge] Double-Blind Shuffling Map:`, 
      Array.from(keyToLabelMap.entries()).map(([k, l]) => `${k} -> ${l}`).join(", ")
    );

    const judgePrompt = `
You are an expert AI evaluator. Evaluate the following three different outputs produced for the same task.
Your assessment must be completely objective, impartial, and unbiased.

The evaluation is DOUBLE-BLIND. The outputs are labeled anonymously as Output Alpha, Output Beta, and Output Gamma.
Evaluate the outputs against the listed criteria, explaining your analysis step-by-step before assigning the scores.

Task Prompt:
"${taskPrompt}"

Criteria to score (0-100 for each):
${JSON.stringify(criteria)}

SCORING RUBRIC GUIDE FOR EACH CRITERION:
- 90-100: Exceptional quality. Fully satisfies the task prompt, demonstrates excellent structure, tone, clarity, and proactively handles edge cases or introduces high-value additions.
- 70-89: Very good. Complete, well-structured, minor improvements in depth or tone are possible.
- 50-69: Satisfactory but basic. Meets the requirements but lacks depth, has minor formatting issues, or limited scope.
- 0-49: Incomplete or incorrect. Significant gaps, lacks clarity, or contains irrelevant material.

---
Output Alpha:
${outputAlpha || "(No output produced)"}
---
Output Beta:
${outputBeta || "(No output produced)"}
---
Output Gamma:
${outputGamma || "(No output produced)"}
---

For each output (Alpha, Beta, Gamma), perform a detailed evaluation:
1. For each criterion, write a step-by-step critical analysis (Chain-of-Thought) and then assign a score (0 to 100).
2. Provide a global quality analysis and a final global quality score (0 to 100).
3. Provide a concise overall reasoning summary (max 2 sentences).

You must respond ONLY with a valid JSON object matching this structure (no markdown boxes, code fences or conversational text outside the JSON):
{
  "Alpha": {
    "criteria": {
      "${criteria[0] || 'Quality'}": {
        "analysis": "Analysis explanation...",
        "score": 85
      }
    },
    "globalAnalysis": "...",
    "globalScore": 87,
    "reasoning": "Overall summary..."
  },
  "Beta": {
    "criteria": {
      "${criteria[0] || 'Quality'}": {
        "analysis": "Analysis explanation...",
        "score": 90
      }
    },
    "globalAnalysis": "...",
    "globalScore": 92,
    "reasoning": "Overall summary..."
  },
  "Gamma": {
    "criteria": {
      "${criteria[0] || 'Quality'}": {
        "analysis": "Analysis explanation...",
        "score": 95
      }
    },
    "globalAnalysis": "...",
    "globalScore": 95,
    "reasoning": "Overall summary..."
  }
}
`;

    try {
      await session.prompt(judgePrompt);
      const msgs = session.messages;
      const lastMsg = [...msgs].reverse().find((m) => m.role === "assistant");
      let rawJson = "";
      if (lastMsg) {
        if (typeof lastMsg.content === "string") rawJson = lastMsg.content;
        else if (Array.isArray(lastMsg.content)) {
          rawJson = lastMsg.content.map((c: any) => c.text || "").join("\n");
        }
      }

      rawJson = rawJson.trim();
      if (rawJson.startsWith("```")) {
        rawJson = rawJson.replace(/^```[a-zA-Z-]*\n/, "").replace(/\n```$/, "");
      }

      // Safe JSON parsing
      const parsedRaw = JSON.parse(rawJson);
      
      // Zod Validation
      const parsed = JudgeResponseSchema.parse(parsedRaw);

      // Inverse Mapping to true variant keys
      const mapResult = (label: "Alpha" | "Beta" | "Gamma") => {
        const evalData = parsed[label];
        const scoresRecord: Record<string, number> = {};
        
        if (evalData && evalData.criteria) {
          for (const critKey of Object.keys(evalData.criteria)) {
            scoresRecord[critKey] = evalData.criteria[critKey].score;
          }
        }

        return {
          scores: scoresRecord,
          globalScore: evalData.globalScore,
          reasoning: evalData.reasoning
        };
      };

      return {
        single: mapResult(keyToLabelMap.get("single")!),
        multiNoLeader: mapResult(keyToLabelMap.get("multiNoLeader")!),
        multiWithLeader: mapResult(keyToLabelMap.get("multiWithLeader")!),
      };

    } catch (e) {
      console.error("[LabJudge] Failed to evaluate runs, fallback to baseline:", e);
      
      const fallbackScores: Record<string, number> = {};
      for (const crit of criteria) {
        fallbackScores[crit] = 70;
      }

      return {
        single: { scores: fallbackScores, globalScore: 70, reasoning: "Evaluation failed due to parse error." },
        multiNoLeader: { scores: fallbackScores, globalScore: 70, reasoning: "Evaluation failed due to parse error." },
        multiWithLeader: { scores: fallbackScores, globalScore: 70, reasoning: "Evaluation failed due to parse error." },
      };
    } finally {
      await piSessionManager.destroySession(username, sessionId);
    }
  }
}
