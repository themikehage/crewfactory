import type { ChannelMessage } from "shared";

export interface DispatchResult {
  agentMsg: ChannelMessage | null;
}

export interface DispatchRequest {
  id: string;
  signal: AbortSignal;
  execute: () => Promise<DispatchResult>;
}

export class AgentWorkQueue {
  private queue: Array<{
    req: DispatchRequest;
    resolve: (result: DispatchResult) => void;
    reject: (err: Error) => void;
  }> = [];

  private processing = false;
  private currentAbort: (() => void) | null = null;

  get size(): number {
    return this.queue.length;
  }

  enqueue(req: DispatchRequest): Promise<DispatchResult> {
    return new Promise<DispatchResult>((resolve, reject) => {
      if (req.signal.aborted) {
        reject(new Error("Aborted before enqueue"));
        return;
      }

      const onAbort = () => {
        const idx = this.queue.findIndex((item) => item.req.id === req.id);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
          reject(new Error("Aborted while queued"));
        }
      };
      req.signal.addEventListener("abort", onAbort, { once: true });

      this.queue.push({ req, resolve, reject });
      if (!this.processing) {
        this.processNext();
      }
    });
  }

  clear(): void {
    const pending = this.queue.splice(0);
    for (const { reject } of pending) {
      reject(new Error("Queue cleared"));
    }
  }

  abortCurrent(): void {
    if (this.currentAbort) {
      this.currentAbort();
      this.currentAbort = null;
    }
  }

  private async processNext(): Promise<void> {
    const next = this.queue.shift();
    if (!next) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const { req, resolve, reject } = next;

    if (req.signal.aborted) {
      reject(new Error("Aborted before execution"));
      this.processNext();
      return;
    }

    let abortCalled = false;
    const abortController = new AbortController();
    this.currentAbort = () => {
      abortCalled = true;
      abortController.abort();
    };

    const onSignalAbort = () => {
      if (!abortCalled) {
        abortCalled = true;
        abortController.abort();
      }
    };
    req.signal.addEventListener("abort", onSignalAbort, { once: true });

    try {
      const result = await req.execute();
      resolve(result);
    } catch (err: any) {
      reject(err instanceof Error ? err : new Error(String(err)));
    } finally {
      req.signal.removeEventListener("abort", onSignalAbort);
      this.currentAbort = null;
      this.processNext();
    }
  }
}
