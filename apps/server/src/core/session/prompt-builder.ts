import { TaskStateManager } from "../tools/task-state-manager";
import { SessionPrefix } from "shared";
import { getEnvironmentContext } from "../env-check";
import { promptComposer } from "../prompts/composer";

import {
  HTML_PREVIEW_INSTRUCTIONS,
  AG_UI_INSTRUCTIONS,
  PERSISTENT_MEMORY_INSTRUCTIONS,
  SUBAGENT_DELEGATION_INSTRUCTIONS,
  TASK_DELEGATION_INSTRUCTIONS,
} from "../prompts/system-instructions";

export interface BuildPromptsParams {
  username: string;
  sessionId: string;
  workspaceDir: string;
  sessionDir: string;
  resolvedAgentId?: string;
  agentDef?: { name: string; role: string; systemPrompt: string };
  cachedMcpToolNames: string[];
  experimentId?: string;
}

export class SessionPromptBuilder {
  async buildSystemPrompts(params: BuildPromptsParams): Promise<string[]> {
    const {
      username,
      sessionId,
      workspaceDir,
      sessionDir,
      resolvedAgentId,
      agentDef,
      cachedMcpToolNames,
      experimentId,
    } = params;

    const envContext = getEnvironmentContext(workspaceDir);
    const appendPrompts = [
      `\n\nRuntime Environment:\n${envContext}`,
      HTML_PREVIEW_INSTRUCTIONS,
      AG_UI_INSTRUCTIONS,
      PERSISTENT_MEMORY_INSTRUCTIONS,
      SUBAGENT_DELEGATION_INSTRUCTIONS,
      TASK_DELEGATION_INSTRUCTIONS,
    ];

    if (sessionId.startsWith(SessionPrefix.DELEGATE)) {
      appendPrompts.push(
        `\n\n## Delegated Task Mode\n` +
        `You are executing a delegated task. Perform the task directly and output a structured result envelope at the very end of your response.\n` +
        `Return the result envelope exactly in this format as your last message:\n` +
        `---\n` +
        `status: success | partial | blocked\n` +
        `executive_summary: <1-3 sentences summarizing what was accomplished>\n` +
        `artifacts: <comma-separated list of files created/modified, or "none">\n` +
        `risks: <any risks found, or "None">\n` +
        `---`
      );
    }

    if (cachedMcpToolNames.length > 0) {
      appendPrompts.push(
        `\n\nModel Context Protocol (MCP) Tools Available:\n` +
        `You have the following custom MCP tools registered and active:\n` +
        `${cachedMcpToolNames.map((name: string) => `- ${name}`).join("\n")}\n` +
        `Use these tools when the task requires interacting with external databases, APIs, searching the web, or product integrations (like Slack, Linear, Jira, Google Drive). Do not assume you need to use bash if a specific MCP tool is more suitable.\n`
      );
    }

    if (agentDef?.systemPrompt) {
      const deployment = await this.resolveDeploymentContext(params);
      const layered = promptComposer.compose(agentDef, deployment, workspaceDir);
      appendPrompts.push(`\n\n${layered.composed}`);
    }

    if (resolvedAgentId === "lab-architect") {
      if (experimentId) {
        try {
          const { ExperimentStore } = await import("../../laboratory/experiment-store");
          const exp = await ExperimentStore.getExperiment(username, experimentId);
          if (exp) {
            const agentsStr = exp.variants.multiWithLeader.agents.map((a: any) =>
              `  * **${a.name}** (id: \`${a.id}\`, role: \`${a.role}\`)${a.leader ? " [LÍDER]" : ""}\n    Prompt: ${a.systemPrompt}`
            ).join("\n");
            appendPrompts.push(
              `\n\n## Experimento Activo (ID: ${experimentId})\n` +
              `Actualmente estás editando el experimento:\n` +
              `- **Nombre:** ${exp.name}\n` +
              `- **Objetivo/Task Prompt:** ${exp.taskPrompt}\n` +
              `- **Criterios de Evaluación:** ${exp.judge.criteria.join(", ")}\n` +
              `- **Agentes Configurados:**\n${agentsStr}\n\n` +
              `Cuando llames a \`create_experiment\` para actualizar este experimento, debes pasarle obligatoriamente su \`experimentId\`: \`"${experimentId}"\`.`
            );
          }
        } catch (e) {
          console.error("Failed to load experiment for prompt builder:", e);
        }
      } else {
        appendPrompts.push(
          `\n\n## Sin Experimento Activo\n` +
          `El usuario está iniciando el diseño de un experimento nuevo. Ayúdalo a diseñar su tripulación de agentes y criterios de evaluación. ` +
          `Una vez definido, llama a \`create_experiment\` omitiendo el parámetro \`experimentId\` (se le generará uno automáticamente).`
        );
      }
    }

    const tasksState = TaskStateManager.getTaskState(sessionDir);
    if (tasksState && tasksState.status === "running") {
      try {
        const activeTask = tasksState.tasks?.find((t: any) => t.id === tasksState.currentTaskId);
        const tasksListStr = tasksState.tasks
          ?.map((t: any) => `- [${t.status === "done" ? "x" : t.status === "running" ? "/" : " "}] ${t.id}: ${t.title}${t.depends_on?.length > 0 ? ` (depends on: ${t.depends_on.join(", ")})` : ""}`)
          .join("\n");

        const promptSnippet =
          `\n\n## Active Task Plan\n` +
          `You are currently executing a structured, dependency-aware task plan to achieve a high-level goal.\n` +
          `Overall Objective: "${tasksState.objective || ""}"\n` +
          `Current Plan Status: ${tasksState.status}\n\n` +
          `Tasks List:\n${tasksListStr}\n\n` +
          `Active Task Details:\n` +
          `- ID: ${tasksState.currentTaskId}\n` +
          `- Title: ${activeTask?.title || "N/A"}\n` +
          `- Instructions: "${activeTask?.prompt || "N/A"}"\n\n` +
          `Guidelines:\n` +
          `1. Focus ONLY on completing the active task: ${tasksState.currentTaskId}. Do not perform actions related to other tasks.\n` +
          `2. When the active task's objective is fully achieved, you MUST call the native tool: \`update_task_status(taskId: "${tasksState.currentTaskId}", status: "done", log: "summary of what was done")\` to mark it as complete. This will automatically update your active instructions in the next turn.\n` +
          `3. If a task fails or you hit an error you cannot resolve, call \`update_task_status(taskId: "${tasksState.currentTaskId}", status: "failed", log: "error reason")\`.\n` +
          `4. When all tasks in the list have been marked as "done", you MUST call \`complete_task_list(summary: "final completion summary")\` to finalize the execution.`;

        appendPrompts.push(promptSnippet);
      } catch (e) {
        console.error("Failed to parse tasks state for prompt injection:", e);
      }
    }

    return appendPrompts;
  }

  private async resolveDeploymentContext(params: BuildPromptsParams): Promise<any> {
    const { username, sessionId } = params;
    try {
      const { sessionManager } = await import("../session-manager");
      const meta = sessionManager.getSessionMetadata(username, sessionId);
      const channelId = meta?.channelId;

      if (channelId) {
        const { channelStore } = await import("../../channels/channel-store");
        const channel = channelStore.getChannel(username, channelId);
        if (channel) {
          const isBroadcast = channel.members.some(m => m.replyMode === "broadcast");
          const agentId = params.resolvedAgentId;
          const selfMember = channel.members.find(m => m.agentId === agentId);
          const hasLeader = channel.members.some(m => m.role === "lead");
          const isArbiter = selfMember?.role === "lead";

          const members = [];
          const { agentRegistry } = await import("../../agents");
          for (const m of channel.members) {
            const agentEntry = agentRegistry.get(m.agentId);
            members.push({
              agentId: m.agentId,
              agentName: agentEntry?.server.definition.name || m.agentId,
              role: m.role || "member",
            });
          }

          return {
            mode: isBroadcast ? "broadcast" : (hasLeader ? "targeted" : "broadcast"),
            channelId,
            agentRole: selfMember?.role || "member",
            members,
            negotiationProtocol: !!channel.negotiationProtocol,
            isArbiter,
          };
        }
      }
    } catch (e) {
      console.error("Error resolving deployment context in PromptBuilder:", e);
    }
    return { mode: "solo" };
  }
}

export const sessionPromptBuilder = new SessionPromptBuilder();
