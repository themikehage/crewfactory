import { permissionEngine, userPermissionStore, extractSubject } from "../sandbox";
import { approvalManager } from "../approvals/approval-manager";
import { SessionPrefix } from "shared";
import { sessionMetadataStore } from "./metadata-store";

export interface CreateBeforeToolCallHookParams {
  sessionId: string;
  isSubagent?: boolean;
  parentSessionId?: string;
  username?: string;
  executionMode?: "readonly" | "standard" | "autonomous";
}

export function createBeforeToolCallHook({ sessionId, isSubagent, parentSessionId, username, executionMode }: CreateBeforeToolCallHookParams) {
  const resolvedIsSubagent = isSubagent || sessionId.startsWith(SessionPrefix.SUBAGENT) || sessionId.startsWith(SessionPrefix.DELEGATE);

  return async (context: any, signal?: AbortSignal): Promise<any> => {
    const { toolCall, args } = context;
    const toolName = toolCall.name;

    const resolvedUsername = username || "default_user";

    // Read from session metadata if not explicitly provided
    const resolvedMode = executionMode 
      ?? (sessionMetadataStore.getSessionMetadata(resolvedUsername, sessionId)?.executionMode as any);

    const verdict = permissionEngine.evaluate(toolName, args as Record<string, unknown>, {
      isSubagent: resolvedIsSubagent,
      username: resolvedUsername,
      sessionId,
      parentSessionId,
      executionMode: resolvedMode,
    });
    if (verdict.allow === false) {
      return { block: true, reason: `[Permission Denied] ${verdict.reason}` };
    }

    if (verdict.allow === "ask") {
      const toolCallId = toolCall.id;
      const approvalPromise = approvalManager.request({
        username: resolvedUsername,
        sessionId,
        parentSessionId,
        toolCallId,
        toolName,
        args: args as Record<string, unknown>,
        reason: verdict.reason,
      });

      const onAbort = () => {
        approvalManager.resolve(toolCallId, { action: "deny" });
      };
      if (signal) {
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener("abort", onAbort);
        }
      }

      try {
        const result = await approvalPromise;
        if (result.action === "deny") {
          if (result.payload?.persist) {
            const pattern = result.payload.pattern || extractSubject(toolName, args as Record<string, unknown>);
            userPermissionStore.saveDecision(resolvedUsername, toolName, pattern, "deny");
          }
          return { block: true, reason: `[Permission Denied] Rejected by user` };
        }

        if (result.payload?.persist) {
          const pattern = result.payload.pattern || extractSubject(toolName, args as Record<string, unknown>);
          userPermissionStore.saveDecision(resolvedUsername, toolName, pattern, "allow");
        }
        return undefined; // Approved
      } finally {
        if (signal) {
          signal.removeEventListener("abort", onAbort);
        }
      }
    }

    return undefined; // Allowed
  };
}
