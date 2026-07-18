import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import {
  getSessionPath,
  getSessionName,
  buildCreateSessionBody,
  getSessionContextPredicate,
} from "@/lib/session-utils";
import type { Route } from "@/hooks/useRouter";

interface UseSessionResolverParams {
  sessionId: string | null;
  activeProjectName: string | null;
  activeProjectFriendlyName?: string | null;
  activeAgent: { id: string; name: string } | null;
  activeChannel: { id: string; name: string } | null;
  currentPage: string;
  onNavigate: (path: string) => void;
  route: Route;
}

function isRouteAndContextOutOfSync(
  route: Route,
  activeProjectName: string | null,
  activeAgent: { id: string; name: string } | null,
  activeChannel: { id: string; name: string } | null
): boolean {
  const routeProject = route && "projectName" in route ? route.projectName : null;
  const routeAgent = route && "agentId" in route ? route.agentId : null;
  const routeChannel = route && "channelId" in route ? route.channelId : null;

  if (routeChannel && (!activeChannel || activeChannel.id !== routeChannel)) {
    return true;
  }
  if (routeAgent && (!activeAgent || activeAgent.id !== routeAgent)) {
    return true;
  }
  if (routeProject && activeProjectName !== routeProject) {
    return true;
  }
  if (!routeProject && !routeAgent && !routeChannel) {
    if (activeProjectName || activeAgent || activeChannel) {
      return true;
    }
  }
  return false;
}

export function useSessionResolver({
  sessionId,
  activeProjectName,
  activeProjectFriendlyName = null,
  activeAgent,
  activeChannel,
  currentPage,
  onNavigate,
  route,
}: UseSessionResolverParams) {
  const resolvingRef = useRef(false);

  useEffect(() => {
    if (currentPage !== "chat") return;
    if (sessionId || resolvingRef.current) return;
    if (isRouteAndContextOutOfSync(route, activeProjectName, activeAgent, activeChannel)) return;

    resolvingRef.current = true;

    const resolve = async () => {
      try {
        const res = await apiFetch("/api/sessions");
        if (!res.ok) return;

        const data = await res.json();
        const all = data.sessions ?? [];

        const context = {
          activeChannel,
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
    currentPage,
    onNavigate,
    route,
  ]);
}


