import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sessionManager } from "./session-manager";
import { agentRegistry } from "../agents";
import { channelStore } from "../channels/channel-store";
import { channelOrchestrator } from "../channels/channel-orchestrator";
import type { ModelRegistry, AuthStorage, DefaultResourceLoader } from "../ai";

export interface DelegateTaskOptions {
  workspaceDir: string;
  username: string;
  parentSessionId: string;
  modelRegistry: ModelRegistry;
  authStorage: AuthStorage;
  resourceLoader: DefaultResourceLoader;
}

function parseEnvelope(text: string): { status: string; executive_summary: string; artifacts: string; risks: string } {
  const result = {
    status: "success",
    executive_summary: "",
    artifacts: "none",
    risks: "None",
  };

  const cleanText = text.trim();
  result.executive_summary = cleanText.slice(0, 500);

  const lines = cleanText.split("\n");
  let hasStatus = false;
  let hasSummary = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(status|executive_summary|summary|artifacts|risks)\s*:\s*(.*)$/i);
    if (match) {
      const key = match[1].toLowerCase();
      const val = match[2].trim();
      if (key === "status") {
        result.status = val;
        hasStatus = true;
      } else if (key === "executive_summary" || key === "summary") {
        result.executive_summary = val;
        hasSummary = true;
      } else if (key === "artifacts") {
        result.artifacts = val;
      } else if (key === "risks") {
        result.risks = val;
      }
    }
  }

  if (!hasStatus && !hasSummary) {
    const cleanSummary = cleanText
      .replace(/---/g, "")
      .trim()
      .slice(0, 300);
    result.executive_summary = cleanSummary;
  }

  return result;
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
      const delegateSessionId = `del_${toolCallId}`;
      let status = "success";
      let executionResultText = "";
      let parsedEnvelope: any = null;

      // Handle Abort Signal propagation
      const abortControllers: any[] = [];
      const onAbort = () => {
        for (const ac of abortControllers) {
          try { ac.abort(); } catch {}
        }
      };
      if (parentSignal) {
        parentSignal.addEventListener("abort", onAbort, { once: true });
      }

      try {
        if (targetType === "agent") {
          const entry = agentRegistry.get(targetId, username);
          if (!entry) {
            throw new Error(`Programmatic Agent "${targetId}" not found for user "${username}"`);
          }

          // Create isolated session for this agent target
          const session = await sessionManager.getOrCreateSession(
            username,
            delegateSessionId,
            undefined,
            targetId
          );

          if (parentSignal) {
            abortControllers.push({
              abort: () => session.abort(),
            });
          }

          // Forward parent websocket event notifications for streaming logging
          const unsub = session.subscribe((evt: any) => {
            try {
              const { broadcastToSession } = require("../ws/handler");
              broadcastToSession(parentSessionId, {
                type: "subagent_event",
                sessionId: parentSessionId,
                subagentSessionId: delegateSessionId,
                toolCallId,
                event: evt,
              });
            } catch (err) {
              console.error("[Delegate Agent Event Forwarding Error]:", err);
            }
          });

          try {
            await session.prompt(task);
          } finally {
            unsub();
          }

          // Read the output and parse
          const assistantMsgs = session.messages.filter(m => m.role === "assistant");
          const lastMsg = assistantMsgs[assistantMsgs.length - 1];
          let lastText = "";
          if (lastMsg && lastMsg.content) {
            if (typeof lastMsg.content === "string") {
              lastText = lastMsg.content;
            } else if (Array.isArray(lastMsg.content)) {
              lastText = lastMsg.content
                .filter((c: any) => c.type === "text")
                .map((c: any) => c.text)
                .join("\n");
            }
          }

          parsedEnvelope = parseEnvelope(lastText);
          if (includeFullHistory) {
            executionResultText = session.messages
              .map(m => `[${m.role.toUpperCase()}]: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
              .join("\n\n");
          }

        } else if (targetType === "project") {
          // Create isolated project-scoped session
          const session = await sessionManager.getOrCreateSession(
            username,
            delegateSessionId,
            targetId
          );

          if (parentSignal) {
            abortControllers.push({
              abort: () => session.abort(),
            });
          }

          const unsub = session.subscribe((evt: any) => {
            try {
              const { broadcastToSession } = require("../ws/handler");
              broadcastToSession(parentSessionId, {
                type: "subagent_event",
                sessionId: parentSessionId,
                subagentSessionId: delegateSessionId,
                toolCallId,
                event: evt,
              });
            } catch (err) {
              console.error("[Delegate Project Event Forwarding Error]:", err);
            }
          });

          try {
            await session.prompt(task);
          } finally {
            unsub();
          }

          // Read and parse output
          const assistantMsgs = session.messages.filter(m => m.role === "assistant");
          const lastMsg = assistantMsgs[assistantMsgs.length - 1];
          let lastText = "";
          if (lastMsg && lastMsg.content) {
            if (typeof lastMsg.content === "string") {
              lastText = lastMsg.content;
            } else if (Array.isArray(lastMsg.content)) {
              lastText = lastMsg.content
                .filter((c: any) => c.type === "text")
                .map((c: any) => c.text)
                .join("\n");
            }
          }

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

          if (parentSignal) {
            abortControllers.push({
              abort: () => channelOrchestrator.abortDispatch(username, targetId, delegateSessionId),
            });
          }

          // Await completion of channel execution chain
          await channelOrchestrator.dispatchUserMessage(username, targetId, task, delegateSessionId);

          // Get channel messages for the session
          const channelMessages = channelStore.getMessages(username, targetId, 100, delegateSessionId);
          const lastAgentMsg = [...channelMessages].reverse().find(m => m.role === "agent");
          const lastText = lastAgentMsg?.content || "";

          parsedEnvelope = parseEnvelope(lastText);
          if (includeFullHistory) {
            executionResultText = channelMessages
              .map(m => `[${m.role === "agent" ? m.agentName || "Agent" : "User"}]: ${m.content}`)
              .join("\n\n");
          }

        } else if (targetType === "session") {
          // Use/continue an existing session
          const session = await sessionManager.getOrCreateSession(username, targetId);

          if (parentSignal) {
            abortControllers.push({
              abort: () => session.abort(),
            });
          }

          const unsub = session.subscribe((evt: any) => {
            try {
              const { broadcastToSession } = require("../ws/handler");
              broadcastToSession(parentSessionId, {
                type: "subagent_event",
                sessionId: parentSessionId,
                subagentSessionId: targetId,
                toolCallId,
                event: evt,
              });
            } catch (err) {
              console.error("[Delegate Session Event Forwarding Error]:", err);
            }
          });

          try {
            await session.prompt(task);
          } finally {
            unsub();
          }

          const assistantMsgs = session.messages.filter(m => m.role === "assistant");
          const lastMsg = assistantMsgs[assistantMsgs.length - 1];
          let lastText = "";
          if (lastMsg && lastMsg.content) {
            if (typeof lastMsg.content === "string") {
              lastText = lastMsg.content;
            } else if (Array.isArray(lastMsg.content)) {
              lastText = lastMsg.content
                .filter((c: any) => c.type === "text")
                .map((c: any) => c.text)
                .join("\n");
            }
          }

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

      return {
        content: [{ type: "text", text: finalResultContent }],
        details: { ...parsedEnvelope, subagentSessionId: delegateSessionId },
      };
    },
  };
}
