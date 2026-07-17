import { approvalManager } from "./approvals/approval-manager";

type PendingApprovalValue = {
  action: string;
  payload?: Record<string, any>;
};

class UiApprovalRegistry {
  register(toolCallId: string): Promise<PendingApprovalValue> {
    return approvalManager.request({
      username: "default_user",
      sessionId: "default",
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
