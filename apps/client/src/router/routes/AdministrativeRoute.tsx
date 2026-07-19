import { SettingsPage } from "@/pages/SettingsPage";
import { SkillsPage } from "@/pages/SkillsPage";
import { AgentsPage } from "@/pages/AgentsPage";
import { ChannelsPage } from "@/pages/ChannelsPage";
import { LogsConsolePage } from "@/pages/LogsConsolePage";
import { MCPMarketplacePage } from "@/pages/MCPMarketplacePage";
import { PluginsPage } from "@/pages/PluginsPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { TeamsPage } from "@/pages/TeamsPage";
import { SessionsKanbanPage } from "@/pages/SessionsKanbanPage";
import { PipelinesPage } from "@/pages/PipelinesPage";
import { PipelineDetailPage } from "@/pages/PipelineDetailPage";
import { useRouteRuntime } from "@/router/RouteRuntimeContext";

export function AdministrativeRoute() {
  const { route, navigate, selectProject, selectAgent, selectChannel } = useRouteRuntime();
  if (route.page === "projects") return <DashboardPage onNavigate={navigate} onSelectProject={selectProject} />;
  if (route.page === "settings") return <SettingsPage />;
  if (route.page === "skills") return <SkillsPage />;
  if (route.page === "agents") return <AgentsPage onSelectAgent={selectAgent} />;
  if (route.page === "channels") return <ChannelsPage onNavigate={navigate} onSelectChannel={selectChannel} />;
  if (route.page === "logs") return <LogsConsolePage onSelectProject={selectProject} onSelectAgent={selectAgent} onSelectChannel={selectChannel} onNavigate={navigate} />;
  if (route.page === "mcps") return <MCPMarketplacePage />;
  if (route.page === "plugins") return <PluginsPage />;
  if (route.page === "sessions") return <SessionsKanbanPage onNavigate={navigate} />;
  if (route.page === "pipelines") return route.pipelineId ? <PipelineDetailPage pipelineId={route.pipelineId} runId={route.runId} onNavigate={navigate} /> : <PipelinesPage />;
  return <TeamsPage />;
}
