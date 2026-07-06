import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";

interface UseSessionResolverParams {
  sessionId: string | null;
  activeProjectName: string | null;
  activeProjectFriendlyName?: string | null;
  activeAgent: { id: string; name: string } | null;
  activeChannel: { id: string; name: string } | null;
  currentPage: string;
  onNavigate: (path: string) => void;
}

export function useSessionResolver({
  sessionId,
  activeProjectName,
  activeProjectFriendlyName = null,
  activeAgent,
  activeChannel,
  currentPage,
  onNavigate,
}: UseSessionResolverParams) {
  const resolvingRef = useRef(false);

  useEffect(() => {
    if (currentPage !== "chat") return;
    if (sessionId || resolvingRef.current) return;

    resolvingRef.current = true;

    const resolve = async () => {
      try {
        const res = await apiFetch("/api/sessions");
        if (!res.ok) return;

        const data = await res.json();
        const all = data.sessions ?? [];

        const filtered = all.filter((s: {
          projectName?: string;
          agentId?: string;
          channelId?: string;
        }) => {
          if (activeChannel) return s.channelId === activeChannel.id;
          if (activeAgent) return s.agentId === activeAgent.id && !s.channelId;
          if (activeProjectName) return s.projectName === activeProjectName && !s.agentId && !s.channelId;
          return !s.projectName && !s.agentId && !s.channelId;
        });

        const getSessionPath = (id: string) => {
          if (activeChannel) return `/channels/${activeChannel.id}/session/${id}`;
          if (activeAgent) return `/agents/${activeAgent.id}/session/${id}`;
          if (activeProjectName) return `/projects/${activeProjectName}/session/${id}`;
          return `/session/${id}`;
        };

        if (filtered.length > 0) {
          onNavigate(getSessionPath(filtered[0].id));
          return;
        }

        const sessionCount = filtered.length;
        const sessionName = activeChannel
          ? `#${activeChannel.name} - Session ${sessionCount + 1}`
          : activeAgent
          ? `${activeAgent.name} - Session ${sessionCount + 1}`
          : activeProjectFriendlyName
          ? `${activeProjectFriendlyName} - Session ${sessionCount + 1}`
          : `Global Session ${sessionCount + 1}`;

        const createRes = await apiFetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: sessionName,
            projectName: activeAgent || activeChannel ? undefined : activeProjectName || undefined,
            agentId: activeChannel ? undefined : activeAgent ? activeAgent.id : undefined,
            channelId: activeChannel ? activeChannel.id : undefined,
          }),
        });

        if (!createRes.ok) return;

        const session = await createRes.json();
        onNavigate(getSessionPath(session.id));
      } finally {
        resolvingRef.current = false;
      }
    };

    resolve();
  }, [sessionId, activeProjectName, activeAgent?.id, activeChannel?.id, currentPage, onNavigate]);
}

