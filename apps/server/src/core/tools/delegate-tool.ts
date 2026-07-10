import { sessionManager } from "../session-manager";
import { agentRegistry } from "../../agents";
import { channelStore } from "../../channels/channel-store";
import { channelOrchestrator } from "../../channels/channel-orchestrator";
import type { ModelRegistry, AuthStorage, DefaultResourceLoader } from "../../ai";
import { SessionPrefix } from "shared";
import { parseEnvelope, forwardSubagentEvents, getLastAssistantText, formatDelegationResultMessage } from "../agent-utils";
import { delegationRegistry } from "../delegation-registry";

export interface DelegateTaskOptions {
  workspaceDir: string;
  username: string;
  parentSessionId: string;
  modelRegistry: ModelRegistry;
  authStorage: AuthStorage;
  resourceLoader: DefaultResourceLoader;
}

export function createDelegateTaskTool(opts: DelegateTaskOptions) {
  const { username, parentSessionId } = opts;

  return {
    name: "delegate_task",
    description: `Delegate a task or instruction to another agent, project, channel, or session.
Allows keeping parent context clean by returning a structured summary instead of the full conversation log.`,
    parameters: {
      type: "object",
      properties: {
        targetType: {
          type: "string",
          enum: ["agent", "project", "channel", "session"],
          description: "The type of target to delegate the task to.",
        },
        targetId: {
          type: "string",
          description: "The identifier of the target (agent ID, project UUID or name, channel ID, or session ID).",
        },
        task: {
          type: "string",
          description: "The prompt, task, or instruction message to send to the target.",
        },
        includeFullHistory: {
          type: "boolean",
          description: "If true, includes the full conversation history in the tool result content. Defaults to false (clean mode).",
          default: false,
        },
      },
      required: ["targetType", "targetId", "task"],
    },
    execute: async (toolCallId: string, args: any, parentSignal?: AbortSignal) => {
      const { targetType, targetId, task, includeFullHistory = false } = args;
      const delegateSessionId = `${SessionPrefix.DELEGATE}${toolCallId}`;

      const abortControllers: any[] = [];
      const onAbort = () => {
        for (const ac of abortControllers) {
          try { ac.abort(); } catch { }
        }
      };
      if (parentSignal) {
        parentSignal.addEventListener("abort", onAbort, { once: true });
      }

      // Guardar metadata inicial para la sesion delegada para persistir parentSessionId
      sessionManager.saveSessionMetadata(username, delegateSessionId, {
        name: `Delegation: ${targetType} - ${targetId}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        parentSessionId,
        targetType,
        targetId,
        task: task.slice(0, 500),
      });

      const runPromise = async () => {
        let status = "success";
        let executionResultText = "";
        let parsedEnvelope: any = null;
        let lastText = "";

        try {
          if (targetType === "agent") {
            const entry = agentRegistry.get(targetId, username);
            if (!entry) {
              throw new Error(`Programmatic Agent "${targetId}" not found for user "${username}"`);
            }

            const session = await sessionManager.getOrCreateSession(
              username,
              delegateSessionId,
              undefined,
              targetId
            );

            abortControllers.push({
              abort: () => session.abort(),
            });

            const unsub = forwardSubagentEvents(session, parentSessionId, delegateSessionId, toolCallId);

            try {
              await session.prompt(task);
            } finally {
              unsub();
            }

            lastText = getLastAssistantText(session.messages);
            parsedEnvelope = parseEnvelope(lastText);
            if (includeFullHistory) {
              executionResultText = session.messages
                .map(m => `[${m.role.toUpperCase()}]: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
                .join("\n\n");
            }

          } else if (targetType === "project") {
            const session = await sessionManager.getOrCreateSession(
              username,
              delegateSessionId,
              targetId
            );

            abortControllers.push({
              abort: () => session.abort(),
            });

            const unsub = forwardSubagentEvents(session, parentSessionId, delegateSessionId, toolCallId);

            try {
              await session.prompt(task);
            } finally {
              unsub();
            }

            lastText = getLastAssistantText(session.messages);
            parsedEnvelope = parseEnvelope(lastText);
            if (includeFullHistory) {
              executionResultText = session.messages
                .map(m => `[${m.role.toUpperCase()}]: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
                .join("\n\n");
            }

          } else if (targetType === "channel") {
            const channel = channelStore.getChannel(username, targetId);
            if (!channel) {
              throw new Error(`Channel "${targetId}" not found for user "${username}"`);
            }

            abortControllers.push({
              abort: () => channelOrchestrator.abortDispatch(username, targetId, delegateSessionId),
            });

            await channelOrchestrator.dispatchUserMessage(username, targetId, task, delegateSessionId);

            const channelMessages = channelStore.getMessages(username, targetId, 100, delegateSessionId);
            const lastAgentMsg = [...channelMessages].reverse().find(m => m.role === "agent");
            lastText = lastAgentMsg?.content || "";

            parsedEnvelope = parseEnvelope(lastText);
            if (includeFullHistory) {
              executionResultText = channelMessages
                .map(m => `[${m.role === "agent" ? m.agentName || "Agent" : "User"}]: ${m.content}`)
                .join("\n\n");
            }

          } else if (targetType === "session") {
            const session = await sessionManager.getOrCreateSession(username, targetId);

            abortControllers.push({
              abort: () => session.abort(),
            });

            const unsub = forwardSubagentEvents(session, parentSessionId, targetId, toolCallId);

            try {
              await session.prompt(task);
            } finally {
              unsub();
            }

            lastText = getLastAssistantText(session.messages);
            parsedEnvelope = parseEnvelope(lastText);
            if (includeFullHistory) {
              executionResultText = session.messages
                .map(m => `[${m.role.toUpperCase()}]: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
                .join("\n\n");
            }
          } else {
            throw new Error(`Unsupported target type: ${targetType}`);
          }
        } catch (err: any) {
          status = "error";
          parsedEnvelope = {
            status: "blocked",
            executive_summary: `Delegation execution failed: ${err.message || err}`,
            artifacts: "none",
            risks: "Execution encountered an error.",
          };
        } finally {
          if (parentSignal) {
            parentSignal.removeEventListener("abort", onAbort);
          }
        }

        if (parentSignal?.aborted) {
          status = "blocked";
          parsedEnvelope = {
            status: "blocked",
            executive_summary: "Delegation execution was aborted by the parent orchestrator.",
            artifacts: "none",
            risks: "Execution aborted.",
          };
        }

        // Complete delegation in registry
        delegationRegistry.complete(username, parentSessionId, toolCallId, status as any, parsedEnvelope);

        // Format final envelope response
        const envelopeStr = [
          "---",
          `status: ${parsedEnvelope.status}`,
          `executive_summary: ${parsedEnvelope.executive_summary}`,
          `artifacts: ${parsedEnvelope.artifacts}`,
          `risks: ${parsedEnvelope.risks}`,
          "---",
        ].join("\n");

        let finalResultContent = envelopeStr;
        if (includeFullHistory && executionResultText) {
          finalResultContent = `${envelopeStr}\n\n=== FULL CONVERSATION HISTORY ===\n\n${executionResultText}`;
        }

        const parent = sessionManager.getSession(username, parentSessionId);
        if (parent) {
          const toolResultMsg = formatDelegationResultMessage(toolCallId, "delegate_task", parsedEnvelope, delegateSessionId, lastText);
          if (includeFullHistory && executionResultText) {
            toolResultMsg.content = [{ type: "text", text: finalResultContent }];
          }
          parent.addDelegationResult(toolResultMsg);

          if (!parent.isStreaming) {
            const wakeMessage = [
              `Delegation result received for ${targetType} ${targetId}:`,
              `status: ${parsedEnvelope.status}`,
              `executive_summary: ${parsedEnvelope.executive_summary}`,
              `artifacts: ${parsedEnvelope.artifacts}`,
              `risks: ${parsedEnvelope.risks}`,
              `Respuesta final del delegado:`,
              `"""`,
              lastText,
              `"""`
            ].join("\n");
            
            parent.prompt(wakeMessage).catch((e) => {
              console.error("[Delegate Async Return] Parent prompt fail:", e);
            });
          }
        }
      };

      // Register the active delegation
      delegationRegistry.register(
        username,
        parentSessionId,
        {
          toolCallId,
          parentSessionId,
          targetType: "delegate",
          targetLabel: `Delegated Task (${targetType}: ${targetId})`,
          task,
          status: "running",
          startedAt: new Date().toISOString(),
          subagentSessionId: delegateSessionId,
        },
        () => {
          onAbort();
        }
      );

      // Start the background process
      runPromise().catch((err) => {
        console.error(`[Delegate Tool Async Error] toolCallId=${toolCallId}:`, err);
      });

      return {
        content: [{ type: "text", text: `Delegation started for target ${targetType}:${targetId}. Session ID: ${delegateSessionId}` }],
        details: { status: "delegated", subagentSessionId: delegateSessionId, task },
        terminate: true,
      };
    },
  };
}
