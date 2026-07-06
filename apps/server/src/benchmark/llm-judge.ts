import { sessionManager } from "../core/session-manager.js";

export interface JudgeResult {
  scores: {
    completeness: number;
    structure: number;
    technicalPrecision: number;
    globalScore: number;
  };
  explanation: string;
  timestamp: string;
}

const WEIGHTS = {
  completeness: 0.35,
  structure: 0.35,
  technicalPrecision: 0.30,
};

const JUDGE_SYSTEM_PROMPT = `You are an impartial evaluator comparing two AI responses to the same task.

You will receive:
1. The original user prompt
2. Output A (channel — multi-agent collaboration)
3. Output B (baseline — single agent)

Evaluate each output independently on a scale of 1-100 for these 3 criteria:

- COMPLETENESS: Does the response address all aspects of the request? Are there omissions?
- STRUCTURE: Is the response well-organized, actionable, and clearly sectioned?
- TECHNICAL_PRECISION: Are technical concepts correct? Are there factual errors?

Provide your evaluation in this EXACT format:

CHANNEL:
COMPLETENESS: <score>
STRUCTURE: <score>
TECHNICAL_PRECISION: <score>

BASELINE:
COMPLETENESS: <score>
STRUCTURE: <score>
TECHNICAL_PRECISION: <score>

EXPLANATION: <2-3 sentences comparing the two and explaining key differences>`;

export async function runJudge(
  username: string,
  userPrompt: string,
  channelOutput: string,
  baselineOutput: string,
  modelId?: string
): Promise<{ channel: JudgeResult; baseline: JudgeResult }> {
  const sessionId = `judge_${crypto.randomUUID()}`;
  const session = await sessionManager.getOrCreateSession(username, sessionId);

  try {
    if (modelId) {
      const { modelRegistry } = sessionManager.getUserContext(username);
      const available = modelRegistry.getAvailable();
      const found = available.find(
        (m: any) => m.id === modelId || `${m.provider}/${m.id}` === modelId
      );
      if (found) {
        await session.setModel(found);
      }
    }

    const judgePrompt = `${JUDGE_SYSTEM_PROMPT}

---
USER PROMPT:
${userPrompt}

---
OUTPUT A (CHANNEL — Multi-Agent):
${channelOutput || "(no output)"}

---
OUTPUT B (BASELINE — Single Agent):
${baselineOutput || "(no output)"}
`;

    let rawResponse = "";
    await session.prompt(judgePrompt);

    const msgs = session.messages;
    const lastMsg = [...msgs].reverse().find((m: any) => m.role === "assistant") as any;
    if (lastMsg) {
      if (typeof lastMsg.content === "string") rawResponse = lastMsg.content;
      else if (Array.isArray(lastMsg.content)) {
        rawResponse = lastMsg.content.map((c: any) => c.text || "").join("\n");
      }
    }

    const channelScores = extractScores(rawResponse, "CHANNEL");
    const baselineScores = extractScores(rawResponse, "BASELINE");
    const explanation = extractExplanation(rawResponse);

    const now = new Date().toISOString();

    const channelResult: JudgeResult = {
      scores: {
        ...channelScores,
        globalScore: computeGlobal(channelScores),
      },
      explanation,
      timestamp: now,
    };

    const baselineResult: JudgeResult = {
      scores: {
        ...baselineScores,
        globalScore: computeGlobal(baselineScores),
      },
      explanation,
      timestamp: now,
    };

    return { channel: channelResult, baseline: baselineResult };
  } finally {
    try { await sessionManager.destroySession(username, sessionId); } catch {}
  }
}

function extractScores(text: string, section: "CHANNEL" | "BASELINE"): { completeness: number; structure: number; technicalPrecision: number } {
  const result = { completeness: 0, structure: 0, technicalPrecision: 0 };

  const sectionRegex = new RegExp(`${section}:\\s*\\n([\\s\\S]*?)(?=(?:CHANNEL:|BASELINE:|EXPLANATION:|$))`, "i");
  const sectionMatch = text.match(sectionRegex);

  if (!sectionMatch) return result;

  const block = sectionMatch[1];

  const completenessMatch = block.match(/COMPLETENESS:\s*(\d+)/i);
  const structureMatch = block.match(/STRUCTURE:\s*(\d+)/i);
  const precisionMatch = block.match(/TECHNICAL_PRECISION:\s*(\d+)/i);

  if (completenessMatch) result.completeness = clamp(parseInt(completenessMatch[1], 10));
  if (structureMatch) result.structure = clamp(parseInt(structureMatch[1], 10));
  if (precisionMatch) result.technicalPrecision = clamp(parseInt(precisionMatch[1], 10));

  return result;
}

function extractExplanation(text: string): string {
  const match = text.match(/EXPLANATION:\s*([\s\S]*?)$/i);
  return match ? match[1].trim() : "";
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function computeGlobal(scores: { completeness: number; structure: number; technicalPrecision: number }): number {
  return Math.round(
    scores.completeness * WEIGHTS.completeness +
    scores.structure * WEIGHTS.structure +
    scores.technicalPrecision * WEIGHTS.technicalPrecision
  );
}
