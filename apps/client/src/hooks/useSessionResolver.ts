import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import {
  getSessionPath,
  getSessionName,
  buildCreateSessionBody,
  getSessionContextPredicate,
} from "@/lib/session-utils";

interface UseSessionResolverParams {
  sessionId: string | null;
  activeProjectName: string | null;
  activeProjectFriendlyName?: string | null;
  activeAgent: { id: string; name: string } | null;
  activeChannel: { id: string; name: string } | null;
  activeTeam?: { id: string; name: string } | null;
  currentPage: string;
  onNavigate: (path: string) => void;
}

export function useSessionResolver({
  sessionId,
  activeProjectName,
  activeProjectFriendlyName = null,
  activeAgent,
  activeChannel,
  activeTeam = null,
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

        const context = {
          activeChannel,
          activeTeam,
          activeAgent,
          activeProjectName,
          activeProjectFriendlyName,
        };

        const filtered = all.filter(getSessionContextPredicate(context));

        if (filtered.length > 0) {
          onNavigate(getSessionPath(filtered[0].id, context));
          return;
        }

        const sessionName = getSessionName(context, filtered.length);

        const createRes = await apiFetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildCreateSessionBody(sessionName, context)),
        });

        if (!createRes.ok) return;

        const session = await createRes.json();
        onNavigate(getSessionPath(session.id, context));
      } finally {
        resolvingRef.current = false;
      }
    };

    resolve();
  }, [
    sessionId,
    activeProjectName,
    activeProjectFriendlyName,
    activeAgent?.id,
    activeAgent?.name,
    activeChannel?.id,
    activeChannel?.name,
    activeTeam?.id,
    activeTeam?.name,
    currentPage,
    onNavigate,
  ]);
}


