import { Route, Routes } from "react-router-dom";
import { AppRouter } from "@/components/layout/AppRouter";

const compatiblePaths = [
  "/",
  "/session/*",
  "/projects",
  "/projects/:projectId/*",
  "/agents",
  "/agents/:agentId/*",
  "/channels",
  "/channels/:channelId/*",
  "/teams",
  "/teams/:teamId/*",
  "/channel/:channelId",
  "/team/:teamId",
  "/settings",
  "/skills",
  "/workspace",
  "/preview",
  "/logs",
  "/laboratory/*",
  "/mcps",
  "/plugins",
  "/sessions",
  "/pipelines/*",
  "*",
] as const;

export function AppRoutes() {
  return (
    <Routes>
      {compatiblePaths.map((path) => (
        <Route key={path} path={path} element={<AppRouter />} />
      ))}
    </Routes>
  );
}
