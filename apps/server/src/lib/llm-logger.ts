import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";
import { eventBroker } from "./event-broker";

export interface LLMErrorPayload {
  username: string;
  timestamp?: string;
  sessionId?: string;
  parentSessionId?: string;
  entityId?: string;
  entityType?: "global" | "channel" | "agent" | "project" | "subagent";
  model?: string;
  provider?: string;
  error: string;
  stack?: string;
}

class LLMLogger {
  private logPath = "/tmp/crewfactory/logs/llm-errors.log";

  logError(payload: LLMErrorPayload) {
    const timestamp = new Date().toISOString();
    const fullPayload = {
      ...payload,
      timestamp,
    };

    try {
      const dir = dirname(this.logPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      appendFileSync(this.logPath, JSON.stringify(fullPayload) + "\n", "utf-8");
    } catch (e) {
      console.error("[LLMLogger] Failed to append to file log:", e);
    }

    try {
      eventBroker.publishEvent(payload.username, {
        eventType: "llm_error",
        sourceType: payload.entityType || "global",
        sourceId: payload.entityId || payload.sessionId || "system",
        payload: {
          error: payload.error,
          stack: payload.stack,
          model: payload.model,
          provider: payload.provider,
          sessionId: payload.sessionId,
          parentSessionId: payload.parentSessionId,
        },
      });
    } catch (e) {
      console.error("[LLMLogger] Failed to publish to eventBroker:", e);
    }
  }
}

export const llmLogger = new LLMLogger();
