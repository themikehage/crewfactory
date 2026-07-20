import { useNavigate, useParams } from "react-router-dom";
import { ChatArea } from "@/components/chat/ChatArea";
import { DelegationsPanel } from "@/components/chat/DelegationsPanel";
import { TeamChatArea } from "@/components/teams/TeamChatArea";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { TimelineTabPanel } from "@/components/chat/TimelineTabPanel";
import { TeamDetailPage } from "@/pages/TeamDetailPage";
import { TeamOrgPage } from "@/pages/TeamOrgPage";
import { useWorkspaceContext } from "@/hooks/useWorkspaceContext";

function sessionFromSplat(splat: string | undefined, suffix = ""): string | null {
  const value = splat?.replace(new RegExp(`${suffix}$`), "") ?? "";
  return value || null;
}

export function ChatRoute() {
  const { "*": splat } = useParams();
  const { activeProjectId, activeProjectFriendlyName, activeAgent, activeTeam } = useWorkspaceContext();
  const sessionId = sessionFromSplat(splat);
  const projectDisplayName = activeProjectFriendlyName || activeProjectId;
  if (activeTeam) return <TeamChatArea key={`${sessionId}-${activeTeam.id}`} activeTeam={activeTeam} sessionId={sessionId} />;
  return <ChatArea key={`${sessionId}-${activeProjectId}-${activeAgent?.id}`} sessionId={sessionId} activeProjectName={projectDisplayName} activeAgent={activeAgent} />;
}

export function SessionRoute() {
  const { "*": splat } = useParams();
  if (splat?.endsWith("/delegations")) return <DelegationsRoute />;
  if (splat?.endsWith("/timeline")) return <TimelineRoute />;
  return <ChatRoute />;
}

export function TimelineRoute() {
  const { "*": splat } = useParams();
  const { activeProjectId, activeProjectFriendlyName, activeAgent, activeTeam } = useWorkspaceContext();
  const sessionId = sessionFromSplat(splat, "/timeline");
  const projectDisplayName = activeProjectFriendlyName || activeProjectId;
  return <TimelineTabPanel key={`${sessionId}-${activeProjectId}-${activeAgent?.id}-${activeTeam?.id}`} sessionId={sessionId} activeProjectName={projectDisplayName} activeAgent={activeAgent} activeTeam={activeTeam} />;
}

export function DelegationsRoute() {
  const { "*": splat } = useParams();
  const { activeProjectId, activeProjectFriendlyName, activeAgent, activeTeam } = useWorkspaceContext();
  const sessionId = sessionFromSplat(splat, "/delegations");
  const projectDisplayName = activeProjectFriendlyName || activeProjectId;
  return <DelegationsPanel key={`${sessionId}-${activeProjectId}-${activeAgent?.id}-${activeTeam?.id}`} sessionId={sessionId} activeProjectName={projectDisplayName} activeAgent={activeAgent} activeTeam={activeTeam} />;
}

export function WorkspaceRoute() {
  const { activeProjectId, activeProjectFriendlyName, activeAgent, activeTeam } = useWorkspaceContext();
  const projectDisplayName = activeProjectFriendlyName || activeProjectId;
  return <WorkspacePanel key={activeProjectId || activeAgent?.id || activeTeam?.id || "global"} activeProjectName={projectDisplayName} activeAgentId={activeAgent?.id} activeTeamId={activeTeam?.id} />;
}

export function PreviewRoute() {
  const { activeProjectId, activeProjectFriendlyName } = useWorkspaceContext();
  return <PreviewPanel activeProjectName={activeProjectFriendlyName || activeProjectId} />;
}

export function TeamDetailRoute() {
  const { teamId = "" } = useParams();
  const navigate = useNavigate();
  return <TeamDetailPage teamId={teamId} onNavigate={navigate} />;
}

export function TeamOrgRoute() {
  const { teamId = "" } = useParams();
  const navigate = useNavigate();
  return <TeamOrgPage teamId={teamId} onNavigate={navigate} />;
}
