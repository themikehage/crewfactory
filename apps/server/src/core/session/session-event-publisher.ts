import type { AgentSession } from "../../ai";
import { eventBroker } from "../../lib/event-broker";

export interface SubscribeSessionEventsParams {
  session: AgentSession;
  username: string;
  sessionId: string;
  metadataStore: {
    saveSessionMetadata: (username: string, sessionId: string, data: Record<string, unknown>) => void;
    getSessionMetadata: (username: string, sessionId: string) => Record<string, any> | null;
  };
}

export function subscribeSessionEvents({
  session,
  username,
  sessionId,
  metadataStore,
}: SubscribeSessionEventsParams): () => void {
  let cachedSessionName = sessionId;
  try {
    const meta = metadataStore.getSessionMetadata(username, sessionId);
    if (meta?.name) {
      cachedSessionName = meta.name;
    }
  } catch {}

  const globalLogUnsub = session.subscribe((evt: any) => {
    const ev = evt as any;

    if (
      evt.type === "agent_start" ||
      evt.type === "agent_end" ||
      evt.type === "tool_execution_start" ||
      evt.type === "tool_execution_end" ||
      evt.type === "agent_error"
    ) {
      try {
        metadataStore.saveSessionMetadata(username, sessionId, {
          updatedAt: new Date().toISOString(),
        });
      } catch {}
    }

    if (evt.type === "agent_start") {
      // Refresh name on agent start in case it changed in settings
      try {
        const meta = metadataStore.getSessionMetadata(username, sessionId);
        if (meta?.name) {
          cachedSessionName = meta.name;
        }
      } catch {}

      eventBroker.publishEvent(username, {
        sourceType: "session",
        sourceId: sessionId,
        sourceName: cachedSessionName,
        eventType: "agent_start",
      });
    } else if (evt.type === "agent_end") {
      eventBroker.publishEvent(username, {
        sourceType: "session",
        sourceId: sessionId,
        sourceName: cachedSessionName,
        eventType: "agent_end",
      });
    } else if (evt.type === "message_update") {
      if (ev.assistantMessageEvent?.type === "text_delta" && ev.assistantMessageEvent.delta) {
        eventBroker.publishEvent(username, {
          sourceType: "session",
          sourceId: sessionId,
          sourceName: cachedSessionName,
          eventType: "text_delta",
          detail: ev.assistantMessageEvent.delta,
        });
      } else if (ev.assistantMessageEvent?.type === "thinking_delta" && ev.assistantMessageEvent.delta) {
        eventBroker.publishEvent(username, {
          sourceType: "session",
          sourceId: sessionId,
          sourceName: cachedSessionName,
          eventType: "thinking_delta",
          detail: ev.assistantMessageEvent.delta,
        });
      }
    } else if (evt.type === "tool_execution_start") {
      eventBroker.publishEvent(username, {
        sourceType: "session",
        sourceId: sessionId,
        sourceName: cachedSessionName,
        eventType: "tool_start",
        detail: { toolName: ev.toolName, args: ev.args, toolCallId: ev.toolCallId },
      });
    } else if (evt.type === "tool_execution_end") {
      eventBroker.publishEvent(username, {
        sourceType: "session",
        sourceId: sessionId,
        sourceName: cachedSessionName,
        eventType: "tool_end",
        detail: { toolName: ev.toolName, result: ev.result, isError: ev.isError, toolCallId: ev.toolCallId },
      });
    } else if (evt.type === "agent_error") {
      eventBroker.publishEvent(username, {
        sourceType: "session",
        sourceId: sessionId,
        sourceName: cachedSessionName,
        eventType: "error",
        detail: ev.error,
      });
    }
  });

  return globalLogUnsub;
}
