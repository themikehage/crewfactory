import { sessionManager } from "../core/session-manager";
import { z } from "zod";
import { broadcastToUser } from "../ws/handler";
import { resolveModelWithFallback } from "../core/agent-utils";
import { type BenchmarkJudgeResult } from "shared";

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
});

export class ChannelBenchmarkJudge {
  static async evaluateRuns(
    username: string,
    channelId: string,
    runId: string,
    taskPrompt: string,
    criteria: string[],
    outputs: {
      multi: string;
      single: string;
    },
    judgeModel?: string
  ): Promise<BenchmarkJudgeResult> {
    const sessionId = `judge_bench_${crypto.randomUUID()}`;
    const session = await sessionManager.getOrCreateSession(username, sessionId);

    let unsub: (() => void) | undefined;
    unsub = session.subscribe((event: any) => {
      if (event.type === "message_update") {
        const ev = event as any;
        if (ev.assistantMessageEvent?.type === "text_delta" && ev.assistantMessageEvent.delta) {
          broadcastToUser(username, {
            type: "benchmark_judge_streaming",
            channelId,
            runId,
            textDelta: ev.assistantMessageEvent.delta
          });
        } else if (ev.assistantMessageEvent?.type === "thinking_delta" && ev.assistantMessageEvent.delta) {
          broadcastToUser(username, {
            type: "benchmark_judge_streaming",
            channelId,
            runId,
            thinkingDelta: ev.assistantMessageEvent.delta
          });
        }
      }
    });

    if (judgeModel) {
      const { modelRegistry } = sessionManager.userConfig.getUserContext(username);
      const resolved = resolveModelWithFallback(judgeModel, modelRegistry);
      if (resolved) {
        const model = modelRegistry.getAvailable().find(
          m => m.id === resolved || `${m.provider}/${m.id}` === resolved
        );
        if (model) {
          await session.setModel(model);
        }
      }
    }

    // Double-Blind Shuffling (Alpha/Beta)
    const keys = ["multi", "single"] as const;
    const shuffledKeys = [...keys].sort(() => Math.random() - 0.5);

    const labels = ["Alpha", "Beta"] as const;
    const keyToLabelMap = new Map<"multi" | "single", "Alpha" | "Beta">();
    const labelToKeyMap = new Map<"Alpha" | "Beta", "multi" | "single">();

    shuffledKeys.forEach((key, index) => {
      const label = labels[index];
      keyToLabelMap.set(key, label);
      labelToKeyMap.set(label, key);
    });

    const outputAlpha = outputs[labelToKeyMap.get("Alpha")!];
    const outputBeta = outputs[labelToKeyMap.get("Beta")!];

    console.log(`[ChannelBenchmarkJudge] Double-Blind Shuffling Map:`, 
      Array.from(keyToLabelMap.entries()).map(([k, l]) => `${k} -> ${l}`).join(", ")
    );

    const judgePrompt = `
You are an expert AI evaluator. Evaluate the following two different outputs produced for the same task.
Your assessment must be completely objective, impartial, and unbiased.

The evaluation is DOUBLE-BLIND. The outputs are labeled anonymously as Output Alpha and Output Beta.
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

ADDITIONAL EVALUATION RULES:
- Conciseness & Redundancy: Penalize outputs that contain excessive repetitiveness, boilerplate code, loops of courtesy pings between agents (e.g. "¡Gracias!", "De nada", "¡Excelente aporte!"), or useless chatty filler.
- Quality over Verbosity: High quality means exact, robust execution of the requested task. Do not award high scores to long outputs if they do not solve the task more correctly or efficiently than a concise one.
- Impartiality: Focus strictly on technical completeness, correctness, structure, and correctness of the output content.

---
Output Alpha:
${outputAlpha || "(No output produced)"}
---
Output Beta:
${outputBeta || "(No output produced)"}
---

For each output (Alpha, Beta), perform a detailed evaluation:
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
  }
}
`;

    let rawJson = "";
    try {
      await session.prompt(judgePrompt);
      const msgs = session.messages;
      const lastMsg = [...msgs].reverse().find((m) => m.role === "assistant");
      if (lastMsg) {
        if (typeof lastMsg.content === "string") rawJson = lastMsg.content;
        else if (Array.isArray(lastMsg.content)) {
          rawJson = lastMsg.content.map((c: any) => c.text || "").join("\n");
        }
      }

      rawJson = rawJson.trim();
      const startIndex = rawJson.indexOf("{");
      const endIndex = rawJson.lastIndexOf("}");
      if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        rawJson = rawJson.substring(startIndex, endIndex + 1);
      } else if (rawJson.startsWith("```")) {
        rawJson = rawJson.replace(/^```[a-zA-Z-]*\n/, "").replace(/\n```$/, "");
      }

      const parsedRaw = JSON.parse(rawJson);

      const normalizedRaw: any = {};
      const expectedKeys = ["Alpha", "Beta"] as const;
      for (const key of expectedKeys) {
        if (parsedRaw[key]) {
          normalizedRaw[key] = parsedRaw[key];
        } else {
          const lowercaseKey = key.toLowerCase();
          const foundKey = Object.keys(parsedRaw).find((k) => k.toLowerCase() === lowercaseKey);
          if (foundKey) {
            normalizedRaw[key] = parsedRaw[foundKey];
          }
        }
      }

      const parsed = JudgeResponseSchema.parse(normalizedRaw);

      const mapResult = (label: "Alpha" | "Beta") => {
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

      const multiRes = mapResult(keyToLabelMap.get("multi")!);
      const singleRes = mapResult(keyToLabelMap.get("single")!);

      let winner: "multi" | "single" | "tie" = "tie";
      if (multiRes.globalScore > singleRes.globalScore) {
        winner = "multi";
      } else if (singleRes.globalScore > multiRes.globalScore) {
        winner = "single";
      }

      return {
        winner,
        scores: {
          multi: multiRes.globalScore,
          single: singleRes.globalScore,
        },
        reasoning: `Winner: ${winner}. Multi global: ${multiRes.globalScore} (${multiRes.reasoning}). Single global: ${singleRes.globalScore} (${singleRes.reasoning})`,
        criteriaScores: {
          multi: multiRes.scores,
          single: singleRes.scores,
        }
      };

    } catch (e: any) {
      console.error("[ChannelBenchmarkJudge] Failed to evaluate runs, fallback to baseline:", e);
      
      const fallbackScores: Record<string, number> = {};
      for (const crit of criteria) {
        fallbackScores[crit] = 70;
      }

      const errMsg = e instanceof Error ? e.message : String(e);
      const reasoning = `Judge Error: ${errMsg}. Raw response: ${rawJson ? rawJson.substring(0, 800) : "No response"}`;

      return {
        winner: "tie",
        scores: {
          multi: 70,
          single: 70,
        },
        reasoning,
        criteriaScores: {
          multi: fallbackScores,
          single: fallbackScores,
        }
      };
    } finally {
      if (unsub) unsub();
      await sessionManager.destroySession(username, sessionId);
    }
  }
}
