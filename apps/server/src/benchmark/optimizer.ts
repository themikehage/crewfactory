import { agentRegistry } from "../agents/agent-registry.js";
import { channelStore } from "../channels/index.js";
import { runBenchmarkSuite } from "./harness.js";
import { piSessionManager } from "../pi/session-manager.js";

export interface OptimizationResult {
  iteration: number;
  avgScore: number;
  reportMd: string;
  prompts: Record<string, string>; // agentId -> prompt
}

export async function runOptimizationStep(
  username: string,
  channelId: string,
  iteration: number,
  onProgress?: (msg: string) => void
): Promise<OptimizationResult> {
  const channel = channelStore.getChannel(username, channelId);
  if (!channel) throw new Error("Channel not found");

  onProgress?.(`Starting optimization iteration ${iteration}...`);

  // Run the benchmark suite to get the baseline report for this iteration
  const reportMd = await runBenchmarkSuite(username, channelId, onProgress);

  // Extract average score from report
  const scoreMatch = reportMd.match(/Puntaje Promedio Multi-Agente \(B\):\s*([\d.]+)%/);
  const avgScore = scoreMatch ? parseFloat(scoreMatch[1]) : 0;

  onProgress?.(`Iteration ${iteration} completed with Average Score: ${avgScore}%`);

  // If score is already 100% or we reached our limit, skip prompting LLM for changes
  if (avgScore >= 100) {
    onProgress?.(`Perfect score achieved! Stopping optimization loop.`);
    const currentPrompts: Record<string, string> = {};
    for (const member of channel.members) {
      const agentEntry = agentRegistry.get(member.agentId);
      if (agentEntry) {
        currentPrompts[member.agentId] = agentEntry.server.definition.systemPrompt || "";
      }
    }
    return { iteration, avgScore, reportMd, prompts: currentPrompts };
  }

  // Optimize system prompt of the members using LLM
  onProgress?.(`Generating refined prompts using LLM Optimizer...`);

  const leadMember = channel.members.find((m) => m.role === "lead") || channel.members[0];
  if (!leadMember) throw new Error("No members in channel to optimize");

  const leadAgentEntry = agentRegistry.get(leadMember.agentId);
  if (!leadAgentEntry) throw new Error(`Lead agent ${leadMember.agentId} not found`);

  const currentLeadPrompt = leadAgentEntry.server.definition.systemPrompt || "";

  // Spawn an optimizer session
  const optimizerSessionId = `optimizer_${crypto.randomUUID()}`;
  const session = await piSessionManager.getOrCreateSession(username, optimizerSessionId);

  const optimizationPrompt = `
You are a Prompt Optimizer Meta-Agent. Your task is to analyze the performance of a multi-agent team estimation channel and optimize the Lead Agent's system prompt to fix estimation errors and quality deviations.

Here is the current system prompt of the Lead Agent:
\`\`\`
${currentLeadPrompt}
\`\`\`

Here is the latest benchmark evaluation report of the team's performance across multiple test cases (Briefs):
\`\`\`
${reportMd}
\`\`\`

Instructions for optimization:
- Carefully study the errors. If the estimates are too high, guide the agent to scale estimates down. If quality or detail is missing, add structure requirements.
- Optimize the prompt to be precise, clear, and actionable. Do not add conversational fluff.
- Output ONLY the new optimized system prompt. Do not include markdown code block syntax (like \`\`\`system-prompt or \`\`\`), explanations, or comments. Output the raw text of the new prompt directly.
`;

  let refinedPrompt = "";
  try {
    refinedPrompt = await session.prompt(optimizationPrompt);
    refinedPrompt = refinedPrompt.trim();
    // Strip any potential markdown wrappers if the model didn't follow instructions perfectly
    if (refinedPrompt.startsWith("```")) {
      refinedPrompt = refinedPrompt.replace(/^```[a-zA-Z-]*\n/, "").replace(/\n```$/, "");
    }
  } catch (e: any) {
    console.error("Prompt optimization request failed:", e);
    refinedPrompt = currentLeadPrompt;
  } finally {
    await piSessionManager.destroySession(username, optimizerSessionId);
  }

  if (refinedPrompt && refinedPrompt !== currentLeadPrompt) {
    onProgress?.(`Updating Lead Agent prompt with optimized version...`);
    await agentRegistry.update(username, leadMember.agentId, {
      systemPrompt: refinedPrompt,
    });
  } else {
    onProgress?.(`No prompt adjustments suggested in this step.`);
  }

  const prompts: Record<string, string> = {
    [leadMember.agentId]: refinedPrompt || currentLeadPrompt,
  };

  return {
    iteration,
    avgScore,
    reportMd,
    prompts,
  };
}
