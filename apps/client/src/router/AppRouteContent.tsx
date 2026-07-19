import { useRouteRuntime } from "@/router/RouteRuntimeContext";
import { AdministrativeRoute } from "@/router/routes/AdministrativeRoute";
import { ContextRoute } from "@/router/routes/ContextRoute";
import { LaboratoryRoute } from "@/router/routes/LaboratoryRoute";

export function AppRouteContent() {
  const { route } = useRouteRuntime();
  if (route.page === "laboratory") return <LaboratoryRoute />;
  if (route.page === "projects" || route.page === "settings" || route.page === "skills" || route.page === "agents" || route.page === "channels" || route.page === "logs" || route.page === "mcps" || route.page === "plugins" || route.page === "sessions" || route.page === "pipelines" || route.page === "teams") return <AdministrativeRoute />;
  return <ContextRoute />;
}
