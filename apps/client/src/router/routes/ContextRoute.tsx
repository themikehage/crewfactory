import { ChannelDetailPage } from "@/pages/ChannelDetailPage";
import { ChannelOrgPage } from "@/pages/ChannelOrgPage";
import { ChannelBenchmarkPage } from "@/pages/ChannelBenchmarkPage";
import { TeamDetailPage } from "@/pages/TeamDetailPage";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { ChatArea } from "@/components/chat/ChatArea";
import { DelegationsPanel } from "@/components/chat/DelegationsPanel";
import { ChannelChatArea } from "@/components/channels/ChannelChatArea";
import { TeamChatArea } from "@/components/teams/TeamChatArea";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { useRouteRuntime } from "@/router/RouteRuntimeContext";

export function ContextRoute() {
  const { route, navigate, activeProjectId, activeAgent, activeChannel, activeTeam } = useRouteRuntime();
  if (route.page === "channel") return <ChannelDetailPage channelId={route.channelId} onNavigate={navigate} />;
  if (route.page === "team") return <TeamDetailPage teamId={route.teamId} onNavigate={navigate} />;
  if (route.page === "org") return <ChannelOrgPage channelId={route.channelId} onNavigate={navigate} />;
  if (route.page === "benchmark") return <ChannelBenchmarkPage channelId={route.channelId} onNavigate={navigate} />;
  if (route.page === "delegations") return <DelegationsPanel key={`${route.sessionId}-${activeProjectId}-${activeAgent?.id}-${activeChannel?.id}-${activeTeam?.id}`} sessionId={route.sessionId} activeProjectName={activeProjectId} activeAgent={activeAgent} activeChannel={activeChannel} activeTeam={activeTeam} />;
  if (route.page === "workspace") return <WorkspacePanel key={activeProjectId || activeAgent?.id || activeChannel?.id || activeTeam?.id || "global"} activeProjectName={activeProjectId} activeAgentId={activeAgent?.id} activeChannelId={activeChannel?.id} activeTeamId={activeTeam?.id} />;
  if (route.page === "preview") return <PreviewPanel activeProjectName={activeProjectId} />;
  if (route.page !== "chat") return null;
  if (activeChannel) return <ChannelChatArea key={`${route.sessionId}-${activeChannel.id}`} activeChannel={activeChannel} sessionId={route.sessionId} />;
  if (activeTeam) return <TeamChatArea key={`${route.sessionId}-${activeTeam.id}`} activeTeam={activeTeam} sessionId={route.sessionId} />;
  return <ChatArea key={`${route.sessionId}-${activeProjectId}-${activeAgent?.id}`} sessionId={route.sessionId} activeProjectName={activeProjectId} activeAgent={activeAgent} />;
}
