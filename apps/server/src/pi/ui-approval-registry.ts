type PendingApprovalValue = {
  action: string;
  payload?: Record<string, any>;
};

type PendingApproval = {
  resolve: (value: PendingApprovalValue) => void;
  reject: (reason: any) => void;
};

class UiApprovalRegistry {
  private pending = new Map<string, PendingApproval>();

  register(toolCallId: string): Promise<PendingApprovalValue> {
    return new Promise<PendingApprovalValue>((resolve, reject) => {
      this.pending.set(toolCallId, { resolve, reject });
    });
  }

  resolve(toolCallId: string, result: string | PendingApprovalValue): boolean {
    const entry = this.pending.get(toolCallId);
    if (entry) {
      const resolvedValue: PendingApprovalValue = typeof result === "string"
        ? { action: result }
        : result;
      entry.resolve(resolvedValue);
      this.pending.delete(toolCallId);
      return true;
    }
    return false;
  }

  reject(toolCallId: string, error: any): boolean {
    const entry = this.pending.get(toolCallId);
    if (entry) {
      entry.reject(error);
      this.pending.delete(toolCallId);
      return true;
    }
    return false;
  }
}

export const uiApprovalRegistry = new UiApprovalRegistry();
