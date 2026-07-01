import type { GlobalLogEvent } from "shared";

class EventBroker {
  private history = new Map<string, GlobalLogEvent[]>(); // username -> array of events

  publishEvent(username: string, event: Omit<GlobalLogEvent, "timestamp">) {
    const fullEvent: GlobalLogEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    let userHistory = this.history.get(username) || [];
    userHistory.push(fullEvent);
    if (userHistory.length > 150) {
      userHistory.shift();
    }
    this.history.set(username, userHistory);

    // Broadcast to user WS sockets (dynamic require to prevent circular dependency)
    try {
      const { broadcastToUser } = require("../ws/handler");
      broadcastToUser(username, {
        type: "global_log",
        event: fullEvent,
      });
    } catch (e) {
      console.error("[EventBroker] Failed to broadcast event:", e);
    }
  }

  getHistory(username: string): GlobalLogEvent[] {
    return this.history.get(username) || [];
  }
}

export const eventBroker = new EventBroker();
