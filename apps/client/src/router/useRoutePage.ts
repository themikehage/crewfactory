import { useLocation } from "react-router-dom";

export type RoutePage = "chat" | "delegations" | "workspace" | "preview" | "projects" | "settings" | "skills" | "agents" | "channels" | "channel" | "org" | "benchmark" | "teams" | "team" | "logs" | "laboratory" | "plugins" | "sessions" | "pipelines" | "not-found";

export function useRoutePage(): RoutePage {
  const { pathname } = useLocation();
  if (pathname.startsWith("/laboratory")) return "laboratory";
  if (pathname.startsWith("/pipelines")) return "pipelines";
  if (pathname.startsWith("/channel/")) return "channel";
  if (pathname.startsWith("/team/")) return "team";
  if (pathname.includes("/benchmarks")) return "benchmark";
  if (pathname.includes("/org")) return "org";
  if (pathname.includes("/delegations")) return "delegations";
  if (pathname.includes("/workspace") || pathname === "/workspace") return "workspace";
  if (pathname.includes("/preview") || pathname === "/preview") return "preview";
  if (pathname === "/dashboard" || pathname === "/projects") return "projects";
  if (pathname === "/settings") return "settings";
  if (pathname === "/skills") return "skills";
  if (pathname === "/agents") return "agents";
  if (pathname === "/channels") return "channels";
  if (pathname === "/teams") return "teams";
  if (pathname === "/logs") return "logs";
  if (pathname === "/plugins") return "plugins";
  if (pathname === "/sessions") return "sessions";
  return pathname === "/" || pathname.startsWith("/session/") || /\/(projects|agents|channels|teams)\/[^/]+(?:\/chat|\/session\/|$)/.test(pathname) ? "chat" : "not-found";
}
