import { sessionManager } from "../session-manager";
import { agentRegistry } from "../../agents";
import { channelStore } from "../../channels/channel-store";
import { channelOrchestrator } from "../../channels/channel-orchestrator";
import type { ModelRegistry, AuthStorage, DefaultResourceLoader } from "../../ai";
import { SessionPrefix } from "shared";
import { parseEnvelope, forwardSubagentEvents, forwardChannelEvents, getLastAssistantText, formatDelegationResultMessage } from "../agent-utils";
import { delegationRegistry } from "../delegation-registry";
import { AbortToken } from "../abort-token";
import { getAppConfig } from "../../config/app-config";
import { getSubagentDepth } from "../session/session-depth";

export interface DelegateTaskOptions {
  workspaceDir: string;
  username: string;
  parentSessionId: string;
  modelRegistry: ModelRegistry;
  authStorage: AuthStorage;
  resourceLoader: DefaultResourceLoader;
  inheritedWorkspaceDir?: string;
  permittedAgentIds?: Set<string>;
  parentModel?: any;
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
        model: {
          type: "string",
          description: "Optional explicit model ID or provider/model string to use for the delegation execution.",
        },
        autonomyMode: {
          type: "string",
          enum: ["read-only", "standard", "autonomous"],
          description: "Optional explicit autonomy/execution mode to use for the delegation execution.",
        },
      },
      required: ["targetType", "targetId", "task"],
    },
    execute: async (toolCallId: string, args: any, parentSignal?: AbortSignal) => {
      const { targetType, targetId, task, includeFullHistory = false, model: customModel, autonomyMode: customAutonomyMode } = args;

      if (targetType === "agent" && opts.permittedAgentIds && !opts.permittedAgentIds.has(targetId)) {
        throw new Error(
          `Agent "${targetId}" is not a permitted delegate in this Team context. Allowed targets: ${[...opts.permittedAgentIds].join(", ")}`
        );
      }

      const userSettings = sessionManager.userConfig.getUserSettings(username);
      const appConfig = getAppConfig();
      const maxDepth = userSettings.subagentMaxDepth !== undefined
        ? Number(userSettings.subagentMaxDepth)
        : appConfig.subagent.maxDepth;

      const currentDepth = getSubagentDepth(username, parentSessionId);
      const effectiveDepth = targetType === "channel" ? currentDepth : currentDepth + 1;

      if (effectiveDepth > maxDepth) {
        throw new Error(
          `Delegation depth limit reached (${maxDepth}). The delegation to this target would exceed the configured limit.`
        );
      }

      const delegateSessionId = `${SessionPrefix.DELEGATE}${toolCallId}`;

      const childToken = new AbortToken(parentSignal, `delegate:${delegateSessionId}`);

      const parentMeta = sessionManager.metadataStore.getSessionMetadata(username, parentSessionId) || {};
      const parentExecutionMode = parentMeta.executionMode;
      
      // Resolve autonomy mode parameter or inherit parent's executionMode
      const resolvedExecutionMode = customAutonomyMode || parentExecutionMode || undefined;

      sessionManager.metadataStore.saveSessionMetadata(username, delegateSessionId, {
        name: `Delegation: ${targetType} - ${targetId}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        parentSessionId,
        targetType,
        targetId,
        task: task.slice(0, 500),
        subagentDepth: effectiveDepth,
        executionMode: resolvedExecutionMode,
        teamId: parentMeta.teamId || null,
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
              targetId,
              undefined,
              opts.inheritedWorkspaceDir ? { workspaceDir: opts.inheritedWorkspaceDir } : undefined
            );

            // Resolve and set model (explicit customModel parameter or inherited parentModel / parent session model)
            let resolvedModel = opts.parentModel || null;
            if (!resolvedModel) {
              try {
                const parentSession = sessionManager.getSession(username, parentSessionId);
                if (parentSession?.model) {
                  resolvedModel = parentSession.model;
                }
              } catch {}
            }

            if (customModel) {
              try {
                const { modelRegistry } = sessionManager.userConfig.getUserContext(username);
                modelRegistry.refresh();
                const found = modelRegistry
                  .getAvailable()
                  .find((m: any) => m.id === customModel || `${m.provider}/${m.id}` === customModel || m.name === customModel);
                if (found) {
                  resolvedModel = found;
                }
              } catch (e) {
                console.error("[Delegate Tool] Failed to resolve custom model:", e);
              }
            }

            if (resolvedModel) {
              try {
                await session.setModel(resolvedModel);
              } catch (e) {
                console.error(`[Delegate Tool] Failed to set model on delegate session ${delegateSessionId}:`, e);
              }
            }

            childToken.register(() => {
              session.abort();
              delegationRegistry.abortAllRecursive(delegateSessionId);
            }, `agent:${targetId}`);

            const unsub = forwardSubagentEvents(session, parentSessionId, delegateSessionId, toolCallId);

            try {
              await session.prompt(task);
            } finally {
              unsub?.();
            }

            lastText = getLastAssistantText(session.messages);
            parsedEnvelope = parseEnvelope(lastText);
            if (includeFullHistory) {
              executionResultText = session.messages
                .map(m => `[${m.role.toUpperCase()}]: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
                .join("\n\n")
                .slice(0, 4000);
            }

          } else if (targetType === "project") {
            const session = await sessionManager.getOrCreateSession(
              username,
              delegateSessionId,
              targetId
            );

            childToken.register(() => {
              session.abort();
              delegationRegistry.abortAllRecursive(delegateSessionId);
            }, `project:${targetId}`);

            const unsub = forwardSubagentEvents(session, parentSessionId, delegateSessionId, toolCallId);

            try {
              await session.prompt(task);
            } finally {
              unsub?.();
            }

            lastText = getLastAssistantText(session.messages);
            parsedEnvelope = parseEnvelope(lastText);
            if (includeFullHistory) {
              executionResultText = session.messages
                .map(m => `[${m.role.toUpperCase()}]: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
                .join("\n\n")
                .slice(0, 4000);
            }

          } else if (targetType === "channel") {
            const channel = channelStore.getChannel(username, targetId);
            if (!channel) {
              throw new Error(`Channel "${targetId}" not found for user "${username}"`);
            }

            childToken.register(() => {
              channelOrchestrator.abortDispatch(username, targetId, delegateSessionId);
              delegationRegistry.abortAllRecursive(delegateSessionId);
            }, `channel:${targetId}`);

            const unsub = forwardChannelEvents(targetId, parentSessionId, delegateSessionId, toolCallId);

            try {
              await channelOrchestrator.dispatchUserMessage(username, targetId, task, delegateSessionId);
            } finally {
              unsub();
            }

            const channelMessages = channelStore.getMessages(username, targetId, 100, delegateSessionId);
            const lastAgentMsg = [...channelMessages].reverse().find(m => m.role === "agent");
            lastText = lastAgentMsg?.content || "";

            parsedEnvelope = parseEnvelope(lastText);
            if (includeFullHistory) {
              executionResultText = channelMessages
                .map(m => `[${m.role === "agent" ? m.agentName || "Agent" : "User"}]: ${m.content}`)
                .join("\n\n")
                .slice(0, 4000);
            }

          } else if (targetType === "session") {
            const session = await sessionManager.getOrCreateSession(username, targetId);

            childToken.register(() => {
              session.abort();
              delegationRegistry.abortAllRecursive(targetId);
            }, `session:${targetId}`);

            const unsub = forwardSubagentEvents(session, parentSessionId, targetId, toolCallId);

            try {
              await session.prompt(task);
            } finally {
              unsub?.();
            }

            lastText = getLastAssistantText(session.messages);
            parsedEnvelope = parseEnvelope(lastText);
            if (includeFullHistory) {
              executionResultText = session.messages
                .map(m => `[${m.role.toUpperCase()}]: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
                .join("\n\n")
                .slice(0, 4000);
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
          childToken.abortAll();
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

        let parent = sessionManager.getSession(username, parentSessionId);
        if (!parent) {
          try {
            parent = await sessionManager.getOrCreateSession(username, parentSessionId);
          } catch (e) {
            console.error(`[Delegate] Failed to load/create parent session ${parentSessionId}`, e);
          }
        }

        if (parent) {
          const toolResultMsg = formatDelegationResultMessage(toolCallId, "delegate_task", parsedEnvelope, delegateSessionId, lastText);
          if (includeFullHistory && executionResultText) {
            const baseText = toolResultMsg.content[0].text;
            toolResultMsg.content = [{
              type: "text",
              text: `${baseText}\n\n=== FULL CONVERSATION HISTORY ===\n\n${executionResultText}`
            }];
          }
          parent.addDelegationResult(toolResultMsg);

          if (!parent.isStreaming) {
            let success = false;
            try {
              await parent.continue();
              success = true;
            } catch (e) {
              console.error("[Delegate Async Return] Parent continue fail, will retry in 1s:", e);
              await new Promise((resolve) => setTimeout(resolve, 1000));
              try {
                await parent.continue();
                success = true;
              } catch (e2) {
                console.error("[Delegate Async Return] Parent continue retry fail:", e2);
              }
            }

            if (!success) {
              try {
                const { broadcastToUser } = await import("../../ws/handler");
                broadcastToUser(username, {
                  type: "delegation_completed",
                  parentSessionId,
                  subagentSessionId: delegateSessionId,
                  status: status === "error" ? "error" : "success",
                });
              } catch (e3) {
                console.error("Failed to broadcast fallback delegation_completed:", e3);
              }
            }
          }
        } else {
          console.warn(`[Delegate] Parent session ${parentSessionId} not found for toolCallId ${toolCallId} — delegation result discarded`);
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
          childToken.abortAll();
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
