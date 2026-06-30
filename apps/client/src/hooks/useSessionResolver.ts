import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";

interface UseSessionResolverParams {
  sessionId: string | null;
  activeRepoName: string | null;
  activeAgent: { id: string; name: string } | null;
  activeChannel: { id: string; name: string } | null;
  onNavigate: (path: string) => void;
}

export function useSessionResolver({
  sessionId,
  activeRepoName,
  activeAgent,
  activeChannel,
  onNavigate,
}: UseSessionResolverParams) {
  const resolvingRef = useRef(false);

  useEffect(() => {
    if (sessionId || resolvingRef.current) return;

    resolvingRef.current = true;

    const resolve = async () => {
      try {
        const res = await apiFetch("/api/sessions");
        if (!res.ok) return;

        const data = await res.json();
        const all = data.sessions ?? [];

        const filtered = all.filter((s: {
          repoName?: string;
          agentId?: string;
          channelId?: string;
        }) => {
          if (activeChannel) return s.channelId === activeChannel.id;
          if (activeAgent) return s.agentId === activeAgent.id && !s.channelId;
          if (activeRepoName) return s.repoName === activeRepoName && !s.agentId && !s.channelId;
          return !s.repoName && !s.agentId && !s.channelId;
        });

        if (filtered.length > 0) {
          onNavigate(`/session/${filtered[0].id}`);
          return;
        }

        const sessionCount = filtered.length;
        const sessionName = activeChannel
          ? `#${activeChannel.name} - Session ${sessionCount + 1}`
          : activeAgent
          ? `${activeAgent.name} - Session ${sessionCount + 1}`
          : activeRepoName
          ? `${activeRepoName} - Session ${sessionCount + 1}`
          : `Global Session ${sessionCount + 1}`;

        const createRes = await apiFetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: sessionName,
            repoName: activeAgent || activeChannel ? undefined : activeRepoName || undefined,
            agentId: activeChannel ? undefined : activeAgent ? activeAgent.id : undefined,
            channelId: activeChannel ? activeChannel.id : undefined,
          }),
        });

        if (!createRes.ok) return;

        const session = await createRes.json();
        onNavigate(`/session/${session.id}`);
      } finally {
        resolvingRef.current = false;
      }
    };

    resolve();
  }, [sessionId, activeRepoName, activeAgent?.id, activeChannel?.id, onNavigate]);
}
