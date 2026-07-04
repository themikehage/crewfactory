import type { GlobalLogEvent } from "shared";

type BroadcastFn = (username: string, data: unknown) => void;
let broadcasterFn: BroadcastFn | null = null;

export function setEventBroadcaster(fn: BroadcastFn) {
  broadcasterFn = fn;
}

class EventBroker {
  private history = new Map<string, GlobalLogEvent[]>();

  publishEvent(username: string, event: Omit<GlobalLogEvent, "timestamp">) {
    const fullEvent: GlobalLogEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    const userHistory = this.history.get(username) ?? [];
    userHistory.push(fullEvent);
    if (userHistory.length > 150) {
      userHistory.shift();
    }
    this.history.set(username, userHistory);

    broadcasterFn?.(username, { type: "global_log", event: fullEvent });
  }

  getHistory(username: string): GlobalLogEvent[] {
    return this.history.get(username) ?? [];
  }
}

export const eventBroker = new EventBroker();

