export class RateLimiter {
  private maxRequestsPerMinute: number;
  private maxConcurrent: number;
  private activeCount = 0;
  private requestHistory = new Map<string, number[]>(); // hostname -> timestamps

  constructor(maxRequestsPerMinute = 30, maxConcurrent = 3) {
    this.maxRequestsPerMinute = maxRequestsPerMinute;
    this.maxConcurrent = maxConcurrent;
  }

  async acquire(hostname: string, signal?: AbortSignal): Promise<void> {
    const delay = (ms: number) => new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("Fetch aborted by client"));
        });
      }
    });

    while (true) {
      if (signal?.aborted) {
        throw new Error("Fetch aborted by client");
      }

      if (this.activeCount >= this.maxConcurrent) {
        await delay(200);
        continue;
      }

      const now = Date.now();
      const timestamps = this.requestHistory.get(hostname) || [];
      const windowStart = now - 60 * 1000;
      const recentTimestamps = timestamps.filter(t => t > windowStart);
      this.requestHistory.set(hostname, recentTimestamps);

      if (recentTimestamps.length >= this.maxRequestsPerMinute) {
        const oldest = recentTimestamps[0];
        const waitTime = oldest + 60 * 1000 - now;
        await delay(Math.max(waitTime, 500));
        continue;
      }

      this.activeCount++;
      recentTimestamps.push(now);
      this.requestHistory.set(hostname, recentTimestamps);
      break;
    }
  }

  release(): void {
    this.activeCount = Math.max(0, this.activeCount - 1);
  }
}

export const rateLimiter = new RateLimiter();
