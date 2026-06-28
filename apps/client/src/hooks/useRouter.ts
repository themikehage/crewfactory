import { useState, useEffect, useCallback } from "react";

export type Route =
  | { page: "chat"; sessionId: string | null }
  | { page: "projects" }
  | { page: "settings" }
  | { page: "skills" }
  | { page: "workspace" }
  | { page: "preview" }
  | { page: "agents" }
  | { page: "channels" }
  | { page: "channel"; channelId: string };

function parseRoute(): Route {
  const path = window.location.pathname;
  if (path.startsWith("/session/")) {
    const id = path.slice("/session/".length);
    return { page: "chat", sessionId: id || null };
  }
  if (path.startsWith("/channel/")) {
    const id = path.slice("/channel/".length);
    return { page: "channel", channelId: id };
  }
  if (path === "/projects") {
    return { page: "projects" };
  }
  if (path === "/settings") {
    return { page: "settings" };
  }
  if (path === "/skills") {
    return { page: "skills" };
  }
  if (path === "/workspace") {
    return { page: "workspace" };
  }
  if (path === "/preview") {
    return { page: "preview" };
  }
  if (path === "/agents") {
    return { page: "agents" };
  }
  if (path === "/channels") {
    return { page: "channels" };
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
  }, []);

  return { route, navigate };
}
