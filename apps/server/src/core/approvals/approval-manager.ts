import { broadcastToUser } from "../../ws/handler";

export interface ApprovalRequest {
  approvalId: string; // matches toolCallId
  username: string;
  sessionId: string;
  parentSessionId?: string;
  toolName: string;
  args: Record<string, unknown>;
  reason: string;
  expiresAt: number;
  status: "pending" | "approved" | "denied" | "timeout";
}

export interface ApprovalDecision {
  action: "approve" | "deny";
  payload?: Record<string, any>;
}

type PendingApproval = {
  request: ApprovalRequest;
  resolve: (value: ApprovalDecision) => void;
  reject: (reason: any) => void;
  timeoutId: any;
};

class ApprovalManager {
  private pending = new Map<string, PendingApproval>();

  async request(params: {
    username: string;
    sessionId: string;
    parentSessionId?: string;
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    reason: string;
    timeoutMs?: number;
  }): Promise<ApprovalDecision> {
    const {
      username,
      sessionId,
      parentSessionId,
      toolCallId,
      toolName,
      args,
      reason,
      timeoutMs = 60000,
    } = params;

    const expiresAt = Date.now() + timeoutMs;
    const approvalId = toolCallId;

    const request: ApprovalRequest = {
      approvalId,
      username,
      sessionId,
      parentSessionId,
      toolName,
      args,
      reason,
      expiresAt,
      status: "pending",
    };

    return new Promise<ApprovalDecision>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.handleTimeout(approvalId);
      }, timeoutMs);

      this.pending.set(approvalId, {
        request,
        resolve,
        reject,
        timeoutId,
      });

      try {
        broadcastToUser(username, {
          type: "approval_request",
          approval: request,
        });
      } catch (e) {
        console.error("Failed to broadcast approval request:", e);
      }
    });
  }

  resolve(approvalId: string, decision: string | ApprovalDecision): boolean {
    const entry = this.pending.get(approvalId);
    if (!entry) return false;

    clearTimeout(entry.timeoutId);

    const resolvedValue: ApprovalDecision = typeof decision === "string"
      ? { action: decision as any }
      : decision;

    entry.request.status = resolvedValue.action === "approve" ? "approved" : "denied";
    entry.resolve(resolvedValue);
    this.pending.delete(approvalId);

    try {
      broadcastToUser(entry.request.username, {
        type: "approval_resolved",
        approvalId,
        status: entry.request.status,
      });
    } catch (e) {
      console.error("Failed to broadcast approval resolution:", e);
    }

    return true;
  }

  reject(approvalId: string, error: any): boolean {
    const entry = this.pending.get(approvalId);
    if (!entry) return false;

    clearTimeout(entry.timeoutId);
    entry.request.status = "denied";
    entry.reject(error);
    this.pending.delete(approvalId);

    try {
      broadcastToUser(entry.request.username, {
        type: "approval_resolved",
        approvalId,
        status: "denied",
      });
    } catch (e) {
      console.error("Failed to broadcast approval rejection:", e);
    }

    return true;
  }

  private handleTimeout(approvalId: string) {
    const entry = this.pending.get(approvalId);
    if (!entry) return;

    entry.request.status = "timeout";
    entry.resolve({ action: "deny" });
    this.pending.delete(approvalId);

    try {
      broadcastToUser(entry.request.username, {
        type: "approval_resolved",
        approvalId,
        status: "timeout",
      });
    } catch (e) {
      console.error("Failed to broadcast approval timeout:", e);
    }
  }

  getAll(username: string): ApprovalRequest[] {
    const list: ApprovalRequest[] = [];
    for (const entry of this.pending.values()) {
      if (entry.request.username === username) {
        list.push(entry.request);
      }
    }
    return list;
  }
}

export const approvalManager = new ApprovalManager();
