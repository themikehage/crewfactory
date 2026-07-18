import { useState, useEffect, useCallback } from "react";

export type Route =
  | { page: "chat"; sessionId: string | null; projectName?: string | null; agentId?: string | null; channelId?: string | null }
  | { page: "delegations"; sessionId: string | null; projectName?: string | null; agentId?: string | null; channelId?: string | null }
  | { page: "projects" }
  | { page: "dashboard" }
  | { page: "settings" }
  | { page: "skills" }
  | { page: "workspace"; projectName?: string | null; agentId?: string | null; channelId?: string | null }
  | { page: "preview"; projectName?: string | null }
  | { page: "agents" }
  | { page: "channels" }
  | { page: "channel"; channelId: string }
  | { page: "org"; channelId: string }
  | { page: "benchmark"; channelId: string }
  | { page: "logs" }
  | { page: "laboratory"; experimentId?: string | null; sessionId?: string | null }
  | { page: "mcps" }
  | { page: "plugins" }
  | { page: "sessions" }
  | { page: "teams" }
  | { page: "team"; teamId: string }
  | { page: "pipelines"; pipelineId?: string | null; runId?: string | null };

function parseRoute(): Route {
  const path = window.location.pathname;

  // Formato: /projects/{projectName}/...
  if (path.startsWith("/projects/")) {
    const parts = path.slice("/projects/".length).split("/");
    const projectName = parts[0];
    const subPage = parts[1];

    if (subPage === "session") {
      const remaining = parts.slice(2);
      if (remaining[remaining.length - 1] === "delegations") {
        const sessionId = remaining.slice(0, -1).join("/");
        return { page: "delegations", sessionId: sessionId || null, projectName };
      }
      const sessionId = remaining.join("/");
      return { page: "chat", sessionId: sessionId || null, projectName };
    }
    if (subPage === "delegations") {
      return { page: "delegations", sessionId: null, projectName };
    }
    if (subPage === "workspace") {
      return { page: "workspace", projectName };
    }
    if (subPage === "preview") {
      return { page: "preview", projectName };
    }
    // Default
    return { page: "chat", sessionId: null, projectName };
  }

  // Formato: /agents/{agentId}/...
  if (path.startsWith("/agents/")) {
    const parts = path.slice("/agents/".length).split("/");
    const agentId = parts[0];
    const subPage = parts[1];

    if (subPage === "session") {
      const remaining = parts.slice(2);
      if (remaining[remaining.length - 1] === "delegations") {
        const sessionId = remaining.slice(0, -1).join("/");
        return { page: "delegations", sessionId: sessionId || null, agentId };
      }
      const sessionId = remaining.join("/");
      return { page: "chat", sessionId: sessionId || null, agentId };
    }
    if (subPage === "delegations") {
      return { page: "delegations", sessionId: null, agentId };
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
      const remaining = parts.slice(2);
      if (remaining[remaining.length - 1] === "delegations") {
        const sessionId = remaining.slice(0, -1).join("/");
        return { page: "delegations", sessionId: sessionId || null, channelId };
      }
      const sessionId = remaining.join("/");
      return { page: "chat", sessionId: sessionId || null, channelId };
    }
    if (subPage === "delegations") {
      return { page: "delegations", sessionId: null, channelId };
    }
    if (subPage === "workspace") {
      return { page: "workspace", channelId };
    }
    if (subPage === "org") {
      return { page: "org", channelId };
    }
    if (subPage === "benchmarks") {
      return { page: "benchmark", channelId };
    }
    // Default
    return { page: "chat", sessionId: null, channelId };
  }

  // Formato global heredado y otras páginas fijas
  if (path.startsWith("/session/")) {
    const remaining = path.slice("/session/".length);
    if (remaining.endsWith("/delegations")) {
      const id = remaining.slice(0, -"/delegations".length);
      return { page: "delegations", sessionId: id || null };
    }
    const id = remaining;
    return { page: "chat", sessionId: id || null };
  }
  if (path.startsWith("/channel/")) {
    const id = path.slice("/channel/".length);
    return { page: "channel", channelId: id };
  }
  if (path === "/projects") return { page: "projects" };
  if (path === "/") return { page: "chat", sessionId: null };
  if (path === "/dashboard") return { page: "dashboard" };
  if (path === "/settings") return { page: "settings" };
  if (path === "/skills") return { page: "skills" };
  if (path === "/workspace") return { page: "workspace" };
  if (path === "/preview") return { page: "preview" };
  if (path === "/agents") return { page: "agents" };
  if (path === "/channels") return { page: "channels" };
  if (path === "/teams") return { page: "teams" };
  if (path.startsWith("/teams/")) {
    const id = path.slice("/teams/".length);
    return { page: "team", teamId: id };
  }
  if (path === "/logs") return { page: "logs" };
  if (path === "/mcps") return { page: "mcps" };
  if (path === "/plugins") return { page: "plugins" };
  if (path === "/sessions") return { page: "sessions" };
  if (path.startsWith("/laboratory")) {
    if (path === "/laboratory" || path === "/laboratory/") {
      return { page: "laboratory", experimentId: null, sessionId: null };
    }
    if (path.startsWith("/laboratory/session/")) {
      const sessionId = path.slice("/laboratory/session/".length);
      return { page: "laboratory", experimentId: null, sessionId: sessionId || null };
    }
    const experimentId = path.slice("/laboratory/".length);
    return { page: "laboratory", experimentId: experimentId || null, sessionId: null };
  }

  if (path.startsWith("/pipelines")) {
    if (path === "/pipelines" || path === "/pipelines/") {
      return { page: "pipelines", pipelineId: null, runId: null };
    }
    const parts = path.slice("/pipelines/".length).split("/");
    const pipelineId = parts[0];
    const subPage = parts[1];
    if (subPage === "runs" && parts[2]) {
      const runId = parts[2];
      return { page: "pipelines", pipelineId, runId };
    }
    return { page: "pipelines", pipelineId, runId: null };
  }

  return { page: "dashboard" };
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
