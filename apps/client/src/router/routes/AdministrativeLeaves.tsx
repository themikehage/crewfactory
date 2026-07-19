import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useWorkspaceContext } from "@/hooks/useWorkspaceContext";
import { AgentsPage } from "@/pages/AgentsPage";
import { ChannelsPage } from "@/pages/ChannelsPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { LogsConsolePage } from "@/pages/LogsConsolePage";
import { PipelineDetailPage } from "@/pages/PipelineDetailPage";
import { PipelinesPage } from "@/pages/PipelinesPage";
import { PluginsPage } from "@/pages/PluginsPage";
import { SessionsPage } from "@/pages/SessionsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SkillsPage } from "@/pages/SkillsPage";
import { TeamsPage } from "@/pages/TeamsPage";

export function ProjectsRoute() { const navigate = useNavigate(); const { selectProject } = useWorkspaceContext(); return <DashboardPage onNavigate={navigate} onSelectProject={selectProject} />; }
export function SettingsRoute() { return <SettingsPage />; }
export function SkillsRoute() { return <SkillsPage />; }
export function AgentsRoute() { const { selectAgent } = useWorkspaceContext(); return <AgentsPage onSelectAgent={selectAgent} />; }
export function ChannelsRoute() { const navigate = useNavigate(); const { selectChannel } = useWorkspaceContext(); return <ChannelsPage onNavigate={navigate} onSelectChannel={selectChannel} />; }
export function TeamsRoute() { return <TeamsPage />; }
export function LogsRoute() { const navigate = useNavigate(); const { selectProject, selectAgent, selectChannel } = useWorkspaceContext(); return <LogsConsolePage onNavigate={navigate} onSelectProject={selectProject} onSelectAgent={selectAgent} onSelectChannel={selectChannel} />; }
export function PluginsRoute() { return <PluginsPage />; }
export function SessionsRoute() { const navigate = useNavigate(); return <SessionsPage onNavigate={navigate} />; }
export function PipelinesRoute() { return <PipelinesPage />; }
export function PipelineRoute() { const navigate = useNavigate(); const { pipelineId = "", runId } = useParams(); return <PipelineDetailPage pipelineId={pipelineId} runId={runId ?? null} onNavigate={navigate} />; }
export function AnalyticsRoute() { return <Navigate to="/sessions?tab=analytics" replace />; }
