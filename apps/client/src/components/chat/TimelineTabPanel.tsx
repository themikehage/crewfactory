import { apiFetch } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useLiterals } from "@/lib";
import { literals as u } from "./TimelineTabPanel.literals";
import { SessionTimeline } from "./SessionTimeline";

interface Props {
  sessionId: string | null;
  activeProjectName?: string | null;
  activeAgent?: { id: string; name: string } | null;
  activeChannel?: { id: string; name: string } | null;
  activeTeam?: { id: string; name: string } | null;
}

export function TimelineTabPanel({ sessionId }: Props) {
  const l = useLiterals(u);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionMetadata, setSessionMetadata] = useState<any>(null);

  const { subscribe } = useWebSocket(sessionId);

  const loadMessages = useCallback(async (silent = false) => {
    if (!sessionId) {
      setMessages([]);
      setSessionMetadata(null);
      return;
    }
    if (!silent) {
      setLoading(true);
    }
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
        setSessionMetadata(data.metadata ?? null);
      }
    } catch (e) {
      console.error("Failed to load messages for timeline panel:", e);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [sessionId]);

  useEffect(() => {
    loadMessages();

    if (!sessionId) return;

    const unsubAgentEnd = subscribe("agent_end", () => {
      loadMessages(true);
    });

    const unsubMsgEnd = subscribe("message_end", () => {
      loadMessages(true);
    });

    return () => {
      unsubAgentEnd();
      unsubMsgEnd();
    };
  }, [sessionId, subscribe, loadMessages]);

  if (!sessionId) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-bg px-4 select-none">
        <div className="w-16 h-16 rounded-full bg-surface border border-border flex items-center justify-center mb-4 text-text-secondary opacity-75">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="12 6 12 12 16 14" />
            <circle cx="12" cy="12" r="10" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-text-primary mb-1 font-display">{l.noSession}</h2>
        <p className="text-xs text-text-secondary text-center max-w-sm">{l.noSessionDesc}</p>
      </div>
    );
  }

  if (loading && messages.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-bg">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs font-mono text-text-secondary animate-pulse">{l.loading}</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-w-0 bg-bg overflow-hidden animate-fade-in">
      <div className="p-4 border-b border-border bg-surface/30 flex-shrink-0">
        <h2 className="text-base font-semibold text-text-primary font-display">{l.title}</h2>
        <p className="text-xs text-text-secondary">
          {sessionMetadata?.task || sessionMetadata?.name || l.subtitle}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0">
        <div className="max-w-3xl mx-auto">
          <SessionTimeline
            messages={messages}
            sessionCreatedAt={sessionMetadata?.createdAt}
          />
        </div>
      </div>
    </div>
  );
}
