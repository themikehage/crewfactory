import type { ModelRegistry } from "../ai";
import { broadcastToSession } from "../ws/handler";
import type { EnvelopeResult, DelegationNotificationDetails } from "shared";
import { DELEGATION_NOTIFICATION_TYPE } from "shared";


/**
 * Parses the structured output envelope (status, executive_summary, artifacts, risks)
 * from an agent's response text.
 */
export function parseEnvelope(text: string): EnvelopeResult {
  const result: EnvelopeResult = {
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
        const validStatuses = ["success", "partial", "blocked", "error"] as const;
        result.status = validStatuses.includes(val as typeof validStatuses[number]) ? (val as typeof validStatuses[number]) : "success";
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

/**
 * Forwards a subagent's execution events (tokens, tool calls, thinking, etc.)
 * to the parent session so they can be rendered in the parent UI session.
 */
export function forwardSubagentEvents(
  subSession: { subscribe: (fn: (evt: any) => void) => () => void },
  parentSessionId: string,
  subagentSessionId: string,
  toolCallId: string
): () => void {
  let unsub: (() => void) | undefined;
  try {
    unsub = subSession.subscribe((evt: any) => {
      try {
        broadcastToSession(parentSessionId, {
          type: "subagent_event",
          sessionId: parentSessionId,
          subagentSessionId,
          toolCallId,
          event: evt,
        });
      } catch (err) {
        console.error("[Subagent Event Forwarding Error]:", err);
      }
    });
  } catch (err) {
    console.error("[forwardSubagentEvents] Subscribe failed:", err);
    unsub = () => {};
  }
  return unsub;
}

/**
 * Extracts and cleans the text content from the last assistant message.
 * Handles both plain string messages and structured ContentBlock[] content.
 */
export function getLastAssistantText(messages: any[]): string {
  const assistantMsgs = messages.filter((m: any) => m.role === "assistant");
  const lastMsg = assistantMsgs[assistantMsgs.length - 1];
  if (!lastMsg || !lastMsg.content) return "";
  if (typeof lastMsg.content === "string") {
    return lastMsg.content;
  }
  if (Array.isArray(lastMsg.content)) {
    return lastMsg.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");
  }
  return "";
}

/**
 * Resolves a model ID with a fallback to the first configured available model if needed.
 */
export function resolveModelWithFallback(
  modelId: string | undefined,
  modelRegistry: ModelRegistry
): string | undefined {
  const configuredModels = modelRegistry.getAvailable();
  if (!modelId) {
    if (configuredModels.length > 0) {
      return `${configuredModels[0].provider}/${configuredModels[0].id}`;
    }
    return undefined;
  }
  const foundModel = configuredModels.find(m => m.id === modelId || `${m.provider}/${m.id}` === modelId);
  if (!foundModel && configuredModels.length > 0) {
    return `${configuredModels[0].provider}/${configuredModels[0].id}`;
  }
  return modelId;
}

/**
 * Formats the delegation final output into a structured toolResult message.
 */
export function formatDelegationResultMessage(
  toolCallId: string,
  toolName: string,
  envelope: EnvelopeResult,
  subagentSessionId: string,
  outputText?: string
): any {
  const details: DelegationNotificationDetails = {
    type: DELEGATION_NOTIFICATION_TYPE,
    status: envelope.status,
    toolName,
    toolCallId,
    subagentSessionId,
    executiveSummary: envelope.executive_summary,
    artifacts: envelope.artifacts,
    hasOutputText: !!(outputText && outputText.trim()),
  };

  const statusLabel = envelope.status === "success" ? "Completed" : envelope.status;
  const statusBadge = `[Delegation ${statusLabel}]`;
  const summary = envelope.executive_summary.slice(0, 300);
  const parts = [statusBadge, summary];

  if (envelope.artifacts && envelope.artifacts !== "none") {
    parts.push(`Artifacts: ${envelope.artifacts}`);
  }

  if (envelope.risks && envelope.risks !== "None") {
    parts.push(`Risks: ${envelope.risks}`);
  }

  if (outputText && outputText.trim()) {
    parts.push(`\n${outputText.trim()}`);
  }

  const envelopeStr = parts.join("\n\n");

  return {
    role: "user",
    content: [{ type: "text", text: envelopeStr }],
    details,
    timestamp: Date.now(),
  };
}

