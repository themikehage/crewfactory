import { permissionEngine } from "../sandbox";
import { uiApprovalRegistry } from "../ui-approval-registry";

export interface CreateBeforeToolCallHookParams {
  sessionId: string;
}

export function createBeforeToolCallHook({ sessionId }: CreateBeforeToolCallHookParams) {
  return async (context: any, signal?: AbortSignal): Promise<any> => {
    const { toolCall, args } = context;
    const toolName = toolCall.name;

    const verdict = permissionEngine.evaluate(toolName, args as Record<string, unknown>);
    if (verdict.allow === false) {
      return { block: true, reason: `[Permission Denied] ${verdict.reason}` };
    }

    if (verdict.allow === "ask") {
      const toolCallId = toolCall.id;
      const approvalPromise = uiApprovalRegistry.register(toolCallId);

      const onAbort = () => {
        uiApprovalRegistry.resolve(toolCallId, { action: "deny" });
      };
      if (signal) {
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener("abort", onAbort);
        }
      }

      try {
        const { broadcastToSession } = await import("../../ws/handler");
        broadcastToSession(sessionId, {
          type: "tool_approval_request",
          toolCallId,
          toolName,
          args,
          reason: verdict.reason,
        });
      } catch (e) {
        console.error("Failed to broadcast tool approval request:", e);
      }

      try {
        const result = await approvalPromise;
        if (result.action === "deny") {
          return { block: true, reason: `[Permission Denied] Rejected by user` };
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
