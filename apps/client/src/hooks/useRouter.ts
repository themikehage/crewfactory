import { useState, useEffect, useCallback } from "react";

export type Route =
  | { page: "chat"; sessionId: string | null; repoName?: string | null; agentId?: string | null; channelId?: string | null }
  | { page: "projects" }
  | { page: "settings" }
  | { page: "skills" }
  | { page: "workspace"; repoName?: string | null; agentId?: string | null; channelId?: string | null }
  | { page: "preview"; repoName?: string | null }
  | { page: "agents" }
  | { page: "channels" }
  | { page: "channel"; channelId: string }
  | { page: "logs" }
  | { page: "laboratory"; experimentId?: string | null }
  | { page: "mcps" };

function parseRoute(): Route {
  const path = window.location.pathname;

  // Formato: /repos/{repoName}/...
  if (path.startsWith("/repos/")) {
    const parts = path.slice("/repos/".length).split("/");
    const repoName = parts[0];
    const subPage = parts[1];

    if (subPage === "session") {
      const sessionId = parts.slice(2).join("/");
      return { page: "chat", sessionId: sessionId || null, repoName };
    }
    if (subPage === "workspace") {
      return { page: "workspace", repoName };
    }
    if (subPage === "preview") {
      return { page: "preview", repoName };
    }
    // Default
    return { page: "chat", sessionId: null, repoName };
  }

  // Formato: /agents/{agentId}/...
  if (path.startsWith("/agents/")) {
    const parts = path.slice("/agents/".length).split("/");
    const agentId = parts[0];
    const subPage = parts[1];

    if (subPage === "session") {
      const sessionId = parts.slice(2).join("/");
      return { page: "chat", sessionId: sessionId || null, agentId };
    }
    if (subPage === "workspace") {
      return { page: "workspace", agentId };
    }
    // Default
    return { page: "chat", sessionId: null, agentId };
  }

  // Formato: /channels/{channelId}/...
  if (path.startsWith("/channels/")) {
    const parts = path.slice("/channels/".length).split("/");
    const channelId = parts[0];
    const subPage = parts[1];

    if (subPage === "session") {
      const sessionId = parts.slice(2).join("/");
      return { page: "chat", sessionId: sessionId || null, channelId };
    }
    if (subPage === "workspace") {
      return { page: "workspace", channelId };
    }
    // Default
    return { page: "chat", sessionId: null, channelId };
  }

  // Formato global heredado y otras páginas fijas
  if (path.startsWith("/session/")) {
    const id = path.slice("/session/".length);
    return { page: "chat", sessionId: id || null };
  }
  if (path.startsWith("/channel/")) {
    const id = path.slice("/channel/".length);
    return { page: "channel", channelId: id };
  }
  if (path === "/projects") return { page: "projects" };
  if (path === "/settings") return { page: "settings" };
  if (path === "/skills") return { page: "skills" };
  if (path === "/workspace") return { page: "workspace" };
  if (path === "/preview") return { page: "preview" };
  if (path === "/agents") return { page: "agents" };
  if (path === "/channels") return { page: "channels" };
  if (path === "/logs") return { page: "logs" };
  if (path === "/mcps") return { page: "mcps" };
  if (path.startsWith("/laboratory")) {
    if (path === "/laboratory" || path === "/laboratory/") {
      return { page: "laboratory", experimentId: null };
    }
    const experimentId = path.slice("/laboratory/".length);
    return { page: "laboratory", experimentId: experimentId || null };
  }

  return { page: "chat", sessionId: null };
}

export function useRouter() {
  const [route, setRoute] = useState<Route>(parseRoute);

  useEffect(() => {
    const onPop = () => setRoute(parseRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((path: string) => {
    window.history.pushState({}, "", path);
    setRoute(parseRoute());
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

  return { route, navigate };
}
