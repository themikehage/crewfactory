import { getEnvironmentContext } from "../env-check";
import { promptComposer, type DeploymentContext } from "./composer";
import {
  HTML_PREVIEW_INSTRUCTIONS,
  AG_UI_INSTRUCTIONS,
  PERSISTENT_MEMORY_INSTRUCTIONS,
  SUBAGENT_DELEGATION_INSTRUCTIONS,
  TASK_DELEGATION_INSTRUCTIONS,
  LAB_APPEND_INSTRUCTIONS,
} from "./system-instructions";

export type PromptAssemblyMode =
  | "standard-session" // Global/project chat sessions
  | "channel-member"   // Channel orchestrator agent invocations
  | "team-orchestration"
  | "agent-startup"    // Standalone agent server bootstrap
  | "subagent-spawn"  // Spawned subagent executor
  | "experiment-member"; // Laboratory experiment agent invocations

export interface PromptAssemblyContext {
  mode: PromptAssemblyMode;
  workspaceDir: string;
  agentDef?: { name: string; role: string; systemPrompt: string };
  deployment?: DeploymentContext;
  subagentTask?: string;
  subagentRole?: string;
}

export const STANDARD_APPEND_INSTRUCTIONS = [
  HTML_PREVIEW_INSTRUCTIONS,
  AG_UI_INSTRUCTIONS,
  PERSISTENT_MEMORY_INSTRUCTIONS,
  SUBAGENT_DELEGATION_INSTRUCTIONS,
  TASK_DELEGATION_INSTRUCTIONS,
];

export function formatEnvironmentContext(workspaceDir: string): string {
  const envContext = getEnvironmentContext(workspaceDir);
  return `\n\nRuntime Environment:\n${envContext}`;
}

export function buildSubagentInstructions(task: string, role?: string): string {
  return [
    `\n\n## Subagent Executor Mode`,
    `You are a SUBAGENT EXECUTOR. Your goal is to perform a focused task on behalf of the parent agent orchestrator.`,
    `The task you must perform is:`,
    `"""\n${task}\n"""`,
    role ? `\nRole context: ${role}` : "",
    `\n## Executor Contract`,
    `1. Perform the task directly using your tools.`,
    `2. Save any artifacts (files) before your final text response.`,
    `3. Your final message MUST contain the structured result envelope below.`,
    `Return the result envelope exactly in this format as your last message:`,
    `---`,
    `status: success | partial | blocked`,
    `executive_summary: <1-3 sentences summarizing what was accomplished>`,
    `artifacts: <comma-separated list of files created/modified, or "none">`,
    `risks: <any risks found, or "None">`,
    `---`
  ].filter(Boolean).join("\n");
}

export function assemblePromptAppends(ctx: PromptAssemblyContext): string[] {
  switch (ctx.mode) {
    case "standard-session":
      return [
        formatEnvironmentContext(ctx.workspaceDir),
        ...STANDARD_APPEND_INSTRUCTIONS,
      ];
    case "channel-member":
    case "team-orchestration":
    case "agent-startup": {
      const deployment = ctx.deployment || { mode: "solo" };
      const layered = promptComposer.compose(
        ctx.agentDef || { name: "", role: "", systemPrompt: "" },
        deployment,
        ctx.workspaceDir
      );
      return [
        formatEnvironmentContext(ctx.workspaceDir),
        layered.composed,
        ...STANDARD_APPEND_INSTRUCTIONS,
      ];
    }
    case "experiment-member": {
      const deployment = ctx.deployment || { mode: "solo" };
      const layered = promptComposer.compose(
        ctx.agentDef || { name: "", role: "", systemPrompt: "" },
        deployment,
        ctx.workspaceDir
      );
      return [
        formatEnvironmentContext(ctx.workspaceDir),
        layered.composed,
        ...LAB_APPEND_INSTRUCTIONS,
      ];
    }
    case "subagent-spawn": {
      const instructions = buildSubagentInstructions(
        ctx.subagentTask || "",
        ctx.subagentRole
      );
      return [
        instructions,
        formatEnvironmentContext(ctx.workspaceDir),
      ];
    }
  }
}
