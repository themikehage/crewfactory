import { SettingsPage } from "@/pages/SettingsPage";
import { SkillsPage } from "@/pages/SkillsPage";
import { AgentsPage } from "@/pages/AgentsPage";
import { ChannelsPage } from "@/pages/ChannelsPage";
import { ChannelDetailPage } from "@/pages/ChannelDetailPage";
import { ChannelOrgPage } from "@/pages/ChannelOrgPage";
import { ChannelBenchmarkPage } from "@/pages/ChannelBenchmarkPage";
import { LogsConsolePage } from "@/pages/LogsConsolePage";
import { LaboratoryPage } from "@/pages/LaboratoryPage";
import { ExperimentDetailPage } from "@/pages/ExperimentDetailPage";
import { MCPMarketplacePage } from "@/pages/MCPMarketplacePage";
import { PluginsPage } from "@/pages/PluginsPage";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { ChatArea } from "@/components/chat/ChatArea";
import { DelegationsPanel } from "@/components/chat/DelegationsPanel";
import { ChannelChatArea } from "@/components/channels/ChannelChatArea";
import { TeamChatArea } from "@/components/teams/TeamChatArea";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { DashboardPage } from "@/pages/DashboardPage";
import { TeamsPage } from "@/pages/TeamsPage";
import { TeamDetailPage } from "@/pages/TeamDetailPage";
import { SessionsKanbanPage } from "@/pages/SessionsKanbanPage";
import { PipelinesPage } from "@/pages/PipelinesPage";
import { PipelineDetailPage } from "@/pages/PipelineDetailPage";
import { useRouteRuntime } from "@/router/RouteRuntimeContext";

export function AppRouteContent() {
  const { route, navigate, activeProjectId, activeAgent, activeChannel, activeTeam, selectProject, selectAgent, selectChannel, laboratory } = useRouteRuntime();
  if (route.page === "projects") {
    return <DashboardPage onNavigate={navigate} onSelectProject={selectProject} />;
  }
  if (route.page === "settings") return <SettingsPage />;
  if (route.page === "skills") return <SkillsPage />;
  if (route.page === "agents") return <AgentsPage onSelectAgent={selectAgent} />;
  if (route.page === "channels") return <ChannelsPage onNavigate={navigate} onSelectChannel={selectChannel} />;
  if (route.page === "logs") {
    return <LogsConsolePage onSelectProject={selectProject} onSelectAgent={selectAgent} onSelectChannel={selectChannel} onNavigate={navigate} />;
  }
  if (route.page === "laboratory") {
    if (!route.experimentId) {
      return <LaboratoryPage onNavigate={navigate} experiments={laboratory.experiments} setExperiments={laboratory.setExperiments} isEditorOpen={laboratory.isEditorOpen} setIsEditorOpen={laboratory.setIsEditorOpen} editingExpId={laboratory.editingExpId} sessionId={route.sessionId} />;
    }
    return <ExperimentDetailPage experimentId={route.experimentId} experiments={laboratory.experiments} setExperiments={laboratory.setExperiments} activeVariantTab={laboratory.activeVariantTab} setActiveVariantTab={laboratory.setActiveVariantTab} onJudgeExperiment={laboratory.judgeExperiment} selectedRunId={laboratory.selectedRunId} selectedRunData={laboratory.selectedRunData} onRefreshRuns={() => laboratory.fetchPastRuns(route.experimentId!)} />;
  }
  if (route.page === "mcps") return <MCPMarketplacePage />;
  if (route.page === "plugins") return <PluginsPage />;
  if (route.page === "sessions") return <SessionsKanbanPage onNavigate={navigate} />;
  if (route.page === "pipelines") {
    return route.pipelineId ? <PipelineDetailPage pipelineId={route.pipelineId} runId={route.runId} onNavigate={navigate} /> : <PipelinesPage />;
  }
  if (route.page === "channel") return <ChannelDetailPage channelId={route.channelId} onNavigate={navigate} />;
  if (route.page === "team") return <TeamDetailPage teamId={route.teamId} onNavigate={navigate} />;
  if (route.page === "org") return <ChannelOrgPage channelId={route.channelId} onNavigate={navigate} />;
  if (route.page === "benchmark") return <ChannelBenchmarkPage channelId={route.channelId} onNavigate={navigate} />;
  if (route.page === "teams") return <TeamsPage />;
  if (route.page === "delegations") {
    return <DelegationsPanel key={`${route.sessionId}-${activeProjectId}-${activeAgent?.id}-${activeChannel?.id}-${activeTeam?.id}`} sessionId={route.sessionId} activeProjectName={activeProjectId} activeAgent={activeAgent} activeChannel={activeChannel} activeTeam={activeTeam} />;
  }
  if (route.page === "workspace") {
    return <WorkspacePanel key={activeProjectId || activeAgent?.id || activeChannel?.id || activeTeam?.id || "global"} activeProjectName={activeProjectId} activeAgentId={activeAgent?.id} activeChannelId={activeChannel?.id} activeTeamId={activeTeam?.id} />;
  }
  if (route.page === "preview") return <PreviewPanel activeProjectName={activeProjectId} />;
  if (activeChannel) return <ChannelChatArea key={`${route.sessionId}-${activeChannel.id}`} activeChannel={activeChannel} sessionId={route.sessionId} />;
  if (activeTeam) return <TeamChatArea key={`${route.sessionId}-${activeTeam.id}`} activeTeam={activeTeam} sessionId={route.sessionId} />;
  return <ChatArea key={`${route.sessionId}-${activeProjectId}-${activeAgent?.id}`} sessionId={route.sessionId} activeProjectName={activeProjectId} activeAgent={activeAgent} />;
}
