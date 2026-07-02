import type { Channel, ChannelMessage } from "shared";
import { channelOrchestrator, channelStore } from "../channels/index.js";
import { piSessionManager } from "../pi/session-manager.js";
import { computeGlobalScore } from "./scoring.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import briefs from "./briefs.json";


export interface ConditionResult {
  condition: "A" | "B";
  rawOutput: string;
  durationMs: number;
  tokensTotal: number;
  costEstimate: number;
  globalScore: number;
  metricScores: Record<string, number>;
  fichasPropuestas: number | null;
}

export async function waitChannelIdle(username: string, channelId: string, sessionId: string): Promise<void> {
  const channel = channelStore.getChannel(username, channelId);
  if (!channel) return;

  // Wait 1.5s initially for the dispatch to spawn and enqueue tasks
  await new Promise((resolve) => setTimeout(resolve, 1500));

  while (true) {
    const activeStreams = channelOrchestrator.getActiveStreams(channelId, sessionId);
    const hasActiveStreams = Object.keys(activeStreams).length > 0;

    let hasQueuedOrProcessing = false;
    for (const member of channel.members) {
      const q = (channelOrchestrator as any).agentQueues.get(member.agentId);
      if (q && (q.size > 0 || q.processing)) {
        hasQueuedOrProcessing = true;
        break;
      }
    }

    if (!hasActiveStreams && !hasQueuedOrProcessing) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
}

export async function runConditionA(
  username: string,
  briefText: string,
  rubric: any,
  goldAnswer: { fichas: number; dias: number },
  modelId?: string
): Promise<ConditionResult> {
  const startTime = Date.now();
  const sessionId = `bench_a_${crypto.randomUUID()}`;

  const session = await piSessionManager.getOrCreateSession(username, sessionId);
  if (modelId) {
    const { modelRegistry } = piSessionManager.getUserContext(username);
    const available = modelRegistry.getAvailable();
    const found = available.find(
      (m) => m.id === modelId || `${m.provider}/${m.id}` === modelId
    );
    if (found) {
      await session.setModel(found);
    }
  }

  // Baseline single-agent system instruction
  const systemPrompt = `
Eres un consultor de software experimentado de AutoConsulting.
Recibes un brief del cliente y estimas el costo y alcance del proyecto en 'fichas' (donde 1 ficha = 4 horas de desarrollo de un programador senior).
Redacta una propuesta final completa.
Indica claramente al final de tu propuesta el acuerdo alcanzado utilizando la estructura:
ACUERDO ALCANZADO: [scope del proyecto, estimación en fichas, duración en días hábiles].
`;

  const promptText = `${systemPrompt}\n\nClient Brief:\n${briefText}`;

  let rawOutput = "";
  try {
    await session.prompt(promptText);
    const msgs = session.messages;
    const lastMsg = [...msgs].reverse().find((m) => m.role === "assistant");
    if (lastMsg) {
      if (typeof lastMsg.content === "string") rawOutput = lastMsg.content;
      else if (Array.isArray(lastMsg.content)) {
        rawOutput = lastMsg.content.map((c: any) => c.text || "").join("\n");
      }
    }
  } catch (err: any) {
    rawOutput = `Error executing baseline: ${err.message}`;
  }

  const durationMs = Date.now() - startTime;
  const stats = session.getSessionStats();
  const tokensTotal = stats ? stats.tokens.input + stats.tokens.output : 0;
  const costEstimate = tokensTotal * 0.000002; // general proxy price

  // Clean up baseline session
  await piSessionManager.destroySession(username, sessionId);

  // Compute metrics
  const { globalScore, metricScores } = await computeGlobalScore(username, rubric, rawOutput, goldAnswer, modelId);
  
  const extractFichas = (text: string): number | null => {
    const match = text.match(/(\d+)\s*ficha/i);
    return match ? parseInt(match[1], 10) : null;
  };
  const fichasPropuestas = extractFichas(rawOutput);

  return {
    condition: "A",
    rawOutput,
    durationMs,
    tokensTotal,
    costEstimate,
    globalScore,
    metricScores,
    fichasPropuestas,
  };
}

export async function runConditionB(
  username: string,
  channelId: string,
  briefText: string,
  rubric: any,
  goldAnswer: { fichas: number; dias: number }
): Promise<ConditionResult> {
  const startTime = Date.now();
  const sessionId = `bench_b_${crypto.randomUUID()}`;

  // Trigger dispatch to channel
  await channelOrchestrator.dispatchUserMessage(username, channelId, briefText, sessionId);

  // Poll until the chain settles
  await waitChannelIdle(username, channelId, sessionId);

  const durationMs = Date.now() - startTime;

  // Retrieve channel messages to get the final output (typically the Marketing Director's message or the last agent message)
  const messages = channelStore.getMessages(username, channelId, 50, sessionId);
  const agentMessages = messages.filter((m) => m.role === "agent");
  const rawOutput = agentMessages.map((m) => `[${m.agentName}]: ${m.content}`).join("\n\n");

  // Sum up tokens across all session contexts used by channel agents
  let tokensTotal = 0;
  const sessions = await piSessionManager.listSessions(username);
  for (const s of sessions) {
    if (s.channelId === channelId) {
      // Clean up benchmark sessions to prevent workspace clutter
      try {
        const stats = s.status === "active" ? (s as any).getSessionStats?.() : null;
        if (stats) {
          tokensTotal += stats.promptTokens + stats.completionTokens;
        }
      } catch {}
    }
  }

  const costEstimate = tokensTotal * 0.000002;

  // Compute metrics from the raw combined output
  const { globalScore, metricScores } = await computeGlobalScore(username, rubric, rawOutput, goldAnswer);
  
  const extractFichas = (text: string): number | null => {
    const match = text.match(/(\d+)\s*ficha/i);
    return match ? parseInt(match[1], 10) : null;
  };
  const fichasPropuestas = extractFichas(rawOutput);

  return {
    condition: "B",
    rawOutput,
    durationMs,
    tokensTotal,
    costEstimate,
    globalScore,
    metricScores,
    fichasPropuestas,
  };
}

export async function runBenchmarkSuite(
  username: string,
  channelId: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  const channel = channelStore.getChannel(username, channelId);
  if (!channel) throw new Error("Channel not found");

  const defaultRubric = {
    metrics: [
      {
        id: "precision",
        name: "Precisión de Fichas",
        weight: 0.6,
        type: "numeric-deviation" as const,
        config: {
          tolerance: 0.20,
        },
      },
      {
        id: "quality",
        name: "Calidad de Propuesta (Judge)",
        weight: 0.4,
        type: "llm-judge" as const,
        config: {
          judgePrompt: "Evalúa si la propuesta final es clara, profesional y consistente. Debe dar un plazo estimado en semanas y monto de inversión estimado.",
        },
      },
    ],
  };

  const rubric = channel.scoringRubric || defaultRubric;
  const results: any[] = [];

  for (const brief of briefs) {
    onProgress?.(`Running: "${brief.name}"...`);
    
    onProgress?.(`Running Condition A (Single Agent Baseline)...`);
    const resA = await runConditionA(username, brief.description, rubric, brief.goldAnswer);

    onProgress?.(`Running Condition B (Multi-Agent Channel)...`);
    const resB = await runConditionB(username, channelId, brief.description, rubric, brief.goldAnswer);

    results.push({
      brief,
      A: resA,
      B: resB,
    });
  }

  // Generate report
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportDir = join("/tmp/crewfactory", username, "benchmarks", channelId, timestamp);
  mkdirSync(reportDir, { recursive: true });

  let md = `# Reporte de Benchmark de Eficiencia: ${channel.name}\n\n`;
  md += `**Fecha:** ${new Date().toLocaleString()}\n`;
  md += `**Canal:** ${channel.name} (${channelId})\n\n`;

  md += `## Resumen Comparativo (Promedio)\n\n`;
  
  const avgScoreA = results.reduce((sum, r) => sum + r.A.globalScore, 0) / results.length;
  const avgScoreB = results.reduce((sum, r) => sum + r.B.globalScore, 0) / results.length;
  const avgTimeA = results.reduce((sum, r) => sum + r.A.durationMs, 0) / results.length / 1000;
  const avgTimeB = results.reduce((sum, r) => sum + r.B.durationMs, 0) / results.length / 1000;

  const scoreImprovement = ((avgScoreB - avgScoreA) / (avgScoreA || 1)) * 100;
  
  md += `- **Puntaje Promedio Baseline (A):** ${avgScoreA.toFixed(1)}%\n`;
  md += `- **Puntaje Promedio Multi-Agente (B):** ${avgScoreB.toFixed(1)}%\n`;
  md += `- **Mejora de Precisión:** ${scoreImprovement >= 0 ? "+" : ""}${scoreImprovement.toFixed(1)}%\n`;
  md += `- **Tiempo Promedio A:** ${avgTimeA.toFixed(1)}s\n`;
  md += `- **Tiempo Promedio B:** ${avgTimeB.toFixed(1)}s\n\n`;

  md += `## Detalle de Casos de Prueba (Briefs)\n\n`;
  md += `| Caso / Brief | Métrica | Condición A (Baseline) | Condición B (Multi-Agente) | Delta % |\n`;
  md += `|---|---|---|---|---|\n`;

  for (const r of results) {
    md += `| **${r.brief.name}** | Estimado (Fichas) | ${r.A.fichasPropuestas ?? "N/A"} (Gold: ${r.brief.goldAnswer.fichas}) | ${r.B.fichasPropuestas ?? "N/A"} (Gold: ${r.brief.goldAnswer.fichas}) | | \n`;
    md += `| | Score Global | ${r.A.globalScore}% | ${r.B.globalScore}% | ${r.B.globalScore - r.A.globalScore >= 0 ? "+" : ""}${r.B.globalScore - r.A.globalScore}% | \n`;
    md += `| | Tiempo | ${(r.A.durationMs / 1000).toFixed(1)}s | ${(r.B.durationMs / 1000).toFixed(1)}s | ${((r.B.durationMs - r.A.durationMs) / r.A.durationMs * 100).toFixed(1)}% | \n`;
    md += `| | Tokens | ${r.A.tokensTotal} | ${r.B.tokensTotal} | ${((r.B.tokensTotal - r.A.tokensTotal) / r.A.tokensTotal * 100).toFixed(1)}% | \n`;
  }

  const reportPath = join(reportDir, "report.md");
  const reportLatestPath = join("/tmp/crewfactory", username, "benchmarks", channelId, "latest-report.md");
  
  writeFileSync(reportPath, md, "utf-8");
  writeFileSync(reportLatestPath, md, "utf-8");

  return md;
}

