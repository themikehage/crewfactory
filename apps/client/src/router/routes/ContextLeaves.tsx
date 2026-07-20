import { useNavigate, useParams } from "react-router-dom";
import { ChatArea } from "@/components/chat/ChatArea";
import { DelegationsPanel } from "@/components/chat/DelegationsPanel";
import { ChannelChatArea } from "@/components/channels/ChannelChatArea";
import { TeamChatArea } from "@/components/teams/TeamChatArea";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { ChannelBenchmarkPage } from "@/pages/ChannelBenchmarkPage";
import { ChannelDetailPage } from "@/pages/ChannelDetailPage";
import { ChannelOrgPage } from "@/pages/ChannelOrgPage";
import { TeamDetailPage } from "@/pages/TeamDetailPage";
import { TeamOrgPage } from "@/pages/TeamOrgPage";
import { useWorkspaceContext } from "@/hooks/useWorkspaceContext";

function sessionFromSplat(splat: string | undefined, suffix = ""): string | null {
  const value = splat?.replace(new RegExp(`${suffix}$`), "") ?? "";
  return value || null;
}

export function ChatRoute() {
  const { "*": splat } = useParams();
  const { activeProjectId, activeProjectFriendlyName, activeAgent, activeChannel, activeTeam } = useWorkspaceContext();
  const sessionId = sessionFromSplat(splat);
  const projectDisplayName = activeProjectFriendlyName || activeProjectId;
  if (activeChannel) return <ChannelChatArea key={`${sessionId}-${activeChannel.id}`} activeChannel={activeChannel} sessionId={sessionId} />;
  if (activeTeam) return <TeamChatArea key={`${sessionId}-${activeTeam.id}`} activeTeam={activeTeam} sessionId={sessionId} />;
  return <ChatArea key={`${sessionId}-${activeProjectId}-${activeAgent?.id}`} sessionId={sessionId} activeProjectName={projectDisplayName} activeAgent={activeAgent} />;
}

export function SessionRoute() {
  const { "*": splat } = useParams();
  return splat?.endsWith("/delegations") ? <DelegationsRoute /> : <ChatRoute />;
}

export function DelegationsRoute() {
  const { "*": splat } = useParams();
  const { activeProjectId, activeProjectFriendlyName, activeAgent, activeChannel, activeTeam } = useWorkspaceContext();
  const sessionId = sessionFromSplat(splat, "/delegations");
  const projectDisplayName = activeProjectFriendlyName || activeProjectId;
  return <DelegationsPanel key={`${sessionId}-${activeProjectId}-${activeAgent?.id}-${activeChannel?.id}-${activeTeam?.id}`} sessionId={sessionId} activeProjectName={projectDisplayName} activeAgent={activeAgent} activeChannel={activeChannel} activeTeam={activeTeam} />;
}

export function WorkspaceRoute() {
  const { activeProjectId, activeProjectFriendlyName, activeAgent, activeChannel, activeTeam } = useWorkspaceContext();
  const projectDisplayName = activeProjectFriendlyName || activeProjectId;
  return <WorkspacePanel key={activeProjectId || activeAgent?.id || activeChannel?.id || activeTeam?.id || "global"} activeProjectName={projectDisplayName} activeAgentId={activeAgent?.id} activeChannelId={activeChannel?.id} activeTeamId={activeTeam?.id} />;
}

export function PreviewRoute() {
  const { activeProjectId, activeProjectFriendlyName } = useWorkspaceContext();
  return <PreviewPanel activeProjectName={activeProjectFriendlyName || activeProjectId} />;
}

export function ChannelDetailRoute() {
  const { channelId = "" } = useParams();
  const navigate = useNavigate();
  return <ChannelDetailPage channelId={channelId} onNavigate={navigate} />;
}

export function TeamDetailRoute() {
  const { teamId = "" } = useParams();
  const navigate = useNavigate();
  return <TeamDetailPage teamId={teamId} onNavigate={navigate} />;
}

export function ChannelOrgRoute() {
  const { channelId = "" } = useParams();
  const navigate = useNavigate();
  return <ChannelOrgPage channelId={channelId} onNavigate={navigate} />;
}

export function ChannelBenchmarkRoute() {
  const { channelId = "" } = useParams();
  const navigate = useNavigate();
  return <ChannelBenchmarkPage channelId={channelId} onNavigate={navigate} />;
}

export function TeamOrgRoute() {
  const { teamId = "" } = useParams();
  const navigate = useNavigate();
  return <TeamOrgPage teamId={teamId} onNavigate={navigate} />;
}
