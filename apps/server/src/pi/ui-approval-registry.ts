type PendingApproval = {
  resolve: (value: string) => void;
  reject: (reason: any) => void;
};

class UiApprovalRegistry {
  private pending = new Map<string, PendingApproval>();

  register(toolCallId: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.pending.set(toolCallId, { resolve, reject });
    });
  }

  resolve(toolCallId: string, result: string): boolean {
    const entry = this.pending.get(toolCallId);
    if (entry) {
      entry.resolve(result);
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
