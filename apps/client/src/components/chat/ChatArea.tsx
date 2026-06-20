import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { MessageList } from "./MessageList";
import { InputArea } from "./InputArea";

interface Message {
  role: "user" | "assistant" | "tool_result" | "system";
  content: string | Array<{ type: string; text?: string; thinking?: string; name?: string; arguments?: Record<string, unknown> }>;
  toolName?: string;
  isError?: boolean;
  isStreaming?: boolean;
}

interface Props {
  sessionId: string | null;
}

export function ChatArea({ sessionId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { connected, send, subscribe } = useWebSocket(sessionId);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/sessions/${sessionId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
      }
    };
    loadMessages();

    const unsubStart = subscribe("agent_start", () => {
      setStreaming(true);
    });

    const unsubEnd = subscribe("agent_end", () => {
      setStreaming(false);
    });

    const unsubMsg = subscribe("message_update", (data: unknown) => {
      const evt = data as Record<string, unknown>;
      const msg = evt.message as Message | undefined;
      if (!msg) return;

      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.isStreaming) {
          return [...prev.slice(0, -1), { ...msg, isStreaming: true }];
        }
        return [...prev, { ...msg, isStreaming: true }];
      });
    });

    const unsubMsgEnd = subscribe("message_end", (data: unknown) => {
      const evt = data as Record<string, unknown>;
      const msg = evt.message as Message | undefined;
      if (!msg) return;

      setMessages((prev) => {
        const rest = prev.slice(0, -1);
        return [...rest, msg];
      });
    });

    const unsubError = subscribe("agent_error", (data: unknown) => {
      const evt = data as Record<string, unknown>;
      setError(String(evt.error ?? "Unknown error"));
    });

    return () => {
      unsubStart();
      unsubEnd();
      unsubMsg();
      unsubMsgEnd();
      unsubError();
    };
  }, [sessionId, subscribe]);

  const handleSend = useCallback(
    (message: string) => {
      if (!message.trim() || !sessionId) return;

      const userMsg: Message = { role: "user", content: message };
      setMessages((prev) => [...prev, userMsg]);

      send({ type: "prompt", message, sessionId });
    },
    [sessionId, send]
  );

  const handleAbort = useCallback(() => {
    send({ type: "abort", sessionId });
  }, [sessionId, send]);

  if (!sessionId) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary">
        <p>Select or create a session to start</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 border-b border-surface text-xs text-text-secondary">
        <span
          className={`w-2 h-2 rounded-full ${connected ? "bg-success" : "bg-warning"}`}
        />
        {connected ? "Connected" : "Reconnecting..."}
        {streaming && <span className="ml-2 text-accent">Streaming...</span>}
      </div>
      {error && (
        <div className="px-3 sm:px-4 py-2 bg-error/10 border-b border-error/20 text-error text-xs">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <MessageList messages={messages} />
          <div ref={messagesEndRef} />
        </div>
      </div>
      <InputArea
        onSend={handleSend}
        onAbort={handleAbort}
        streaming={streaming}
        sessionId={sessionId}
      />
    </div>
  );
}
