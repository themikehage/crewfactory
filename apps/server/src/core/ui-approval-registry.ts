import { activeContextStorage } from "./session/active-context";
import { approvalManager } from "./approvals/approval-manager";

type PendingApprovalValue = {
  action: string;
  payload?: Record<string, any>;
};

class UiApprovalRegistry {
  register(toolCallId: string): Promise<PendingApprovalValue> {
    const activeContext = activeContextStorage.getStore();
    const username = activeContext?.username || "default_user";
    const sessionId = activeContext?.sessionId || "default";

    return approvalManager.request({
      username,
      sessionId,
      toolCallId,
      toolName: "unknown",
      args: {},
      reason: "Legacy registration",
    }) as any;
  }

  resolve(toolCallId: string, result: string | PendingApprovalValue): boolean {
    return approvalManager.resolve(toolCallId, result as any);
  }

  reject(toolCallId: string, error: any): boolean {
    return approvalManager.reject(toolCallId, error);
  }
}

export const uiApprovalRegistry = new UiApprovalRegistry();
