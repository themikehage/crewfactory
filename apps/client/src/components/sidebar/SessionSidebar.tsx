import { useState, useEffect, useCallback, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { useWorkspaceContext } from "@/hooks/useWorkspaceContext";
import { useExperiments } from "@/hooks/useExperiments";
import { useLiterals } from "@/lib";
import { literals as u } from "./SessionSidebar.literals";
import { AgentAvatar } from "@/components/shared/AgentAvatar";
import { useSessions } from "@/contexts/SessionsContext";

// --- Component ---

interface RepoItem {
  id?: string;
  name: string;
  path: string;
  lastModified: string;
}

interface AgentItem {
  id: string;
  name: string;
  role: string;
  status: string;
  createdAt: string;
  avatarUrl?: string;
}

interface ChannelItem {
  id: string;
  name: string;
  description?: string;
  maxChainDepth?: number;
}

interface Props {
  currentPage?: string;
  onNavigate?: (path: string) => void;
  selectedExpId?: string | null;
  isMobile?: boolean;
  onCloseSidebar?: () => void;
}

export function SessionSidebar({
  currentPage = "chat",
  onNavigate,
  selectedExpId = null,
  isMobile = false,
  onCloseSidebar,
}: Props) {
  const workspace = useWorkspaceContext();
  const {
    activeProjectId: activeProjectName,
    activeAgent,
    activeChannel,
    activeTeam,
    selectProject: onSelectProject,
    selectAgent: onSelectAgent,
    selectChannel: onSelectChannel,
    selectTeam: onSelectTeam,
  } = workspace;

  const l = useLiterals(u);
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const { experiments, loading: loadingExperiments } = useExperiments();

  const [loadingRepos, setLoadingRepos] = useState(true);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const { getAgentKanbanStatus } = useSessions();

  const [isOpenRepos, setIsOpenRepos] = useState(true);
  const [isOpenAgents, setIsOpenAgents] = useState(true);
  const [isOpenChannels, setIsOpenChannels] = useState(true);
  const [isOpenTeams, setIsOpenTeams] = useState(true);
  const [isOpenExperiments, setIsOpenExperiments] = useState(true);

  const fetchRepos = useCallback(async () => {
    try {
      const res = await apiFetch("/api/workspace-projects");
      if (res.ok) {
        const data = await res.json();
        setRepos(data.projects || data.repos || []);
      }
    } catch (err) {
      console.error("Failed to fetch repositories:", err);
    } finally {
      setLoadingRepos(false);
    }
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await apiFetch("/api/agents");
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || []);
      }
    } catch (err) {
      console.error("Failed to fetch agents:", err);
    } finally {
      setLoadingAgents(false);
    }
  }, []);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await apiFetch("/api/channels");
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
      }
    } catch (err) {
      console.error("Failed to fetch channels:", err);
    } finally {
      setLoadingChannels(false);
    }
  }, []);

  const fetchTeams = useCallback(async () => {
    try {
      const res = await apiFetch("/api/teams");
      if (res.ok) {
        const data = await res.json();
        setTeams(data.teams || []);
      }
    } catch (err) {
      console.error("Failed to fetch teams:", err);
    } finally {
      setLoadingTeams(false);
    }
  }, []);

  const isGlobal = !activeChannel && !activeAgent && !activeProjectName && !activeTeam;
  const isSessionView = currentPage === "chat" || currentPage === "workspace" || currentPage === "preview";

  const itemClass = useCallback((isActive: boolean) => {
    if (isMobile) {
      return `w-full flex items-center gap-3 px-4 py-3 h-12 rounded-lg text-base truncate transition-colors text-left cursor-pointer ${
        isActive
          ? "bg-card-hover text-foreground font-semibold border-l-4 border-primary rounded-l-none pl-3"
          : "text-muted-foreground hover:bg-card/50 hover:text-foreground"
      }`;
    }
    return `w-full flex items-center gap-2 px-3 py-1 rounded-lg text-xs truncate transition-colors text-left cursor-pointer ${
      isActive
        ? "bg-card-hover text-foreground font-medium border-l-2 border-primary rounded-l-none pl-2"
        : "text-muted-foreground hover:bg-card/50 hover:text-foreground"
    }`;
  }, [isMobile]);

  const accordionHeaderClass = isMobile
    ? "group/title flex items-center justify-between px-4 py-3 h-12 text-sm uppercase tracking-wider font-semibold text-muted-foreground"
    : "group/title flex items-center justify-between px-3 py-1 text-xs uppercase tracking-wider font-semibold text-muted-foreground";

  const accordionButtonClass = "flex items-center gap-2 hover:text-foreground transition-colors cursor-pointer text-left";

  const chevronSize = isMobile ? 20 : 12;

  const actionButtonClass = isMobile
    ? "w-11 h-11 flex items-center justify-center hover:bg-card rounded text-muted-foreground hover:text-primary transition-all cursor-pointer font-bold"
    : "p-0.5 hover:bg-card rounded text-muted-foreground hover:text-primary transition-all cursor-pointer font-bold text-xs leading-none";

  const factoryButtonClass = `${
    isMobile
      ? "w-full flex items-center gap-3 px-4 py-3 h-12 rounded-lg text-base font-semibold transition-all cursor-pointer"
      : "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer"
  } ${
    isGlobal
      ? "bg-card text-primary border border-primary/30"
      : "bg-card/40 text-muted-foreground hover:bg-card hover:text-primary border border-transparent hover:border-primary/20"
  }`;

  const adminItemClass = useCallback((isActive: boolean) => {
    if (isMobile) {
      return `w-full flex items-center gap-3 px-4 py-3 h-12 rounded-lg text-base transition-colors cursor-pointer text-left ${
        isActive
          ? "bg-card text-foreground font-semibold border-l-4 border-primary rounded-l-none pl-3"
          : "text-muted-foreground hover:bg-card/50 hover:text-foreground"
      }`;
    }
    return `w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
      isActive
        ? "bg-card text-foreground font-medium"
        : "text-muted-foreground hover:bg-card/50 hover:text-foreground"
    }`;
  }, [isMobile]);

  useEffect(() => {
    fetchRepos();
    fetchAgents();
    fetchChannels();
    fetchTeams();
  }, [fetchRepos, fetchAgents, fetchChannels, fetchTeams]);

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      const type = customEvent.detail?.type;
      if (type === "project") {
        fetchRepos();
      } else if (type === "agent") {
        fetchAgents();
      } else if (type === "channel") {
        fetchChannels();
      } else if (type === "team") {
        fetchTeams();
      } else if (type !== "experiment") {
        fetchRepos();
        fetchAgents();
        fetchChannels();
        fetchTeams();
      }
    };
    window.addEventListener("entity-updated", handleUpdate);
    return () => window.removeEventListener("entity-updated", handleUpdate);
  }, [fetchRepos, fetchAgents, fetchChannels, fetchTeams]);

  const handleSelectExperimentClick = useCallback(
    (expId: string) => {
      onCloseSidebar?.();
      if (onNavigate) onNavigate(`/laboratory/${expId}`);
    },
    [onNavigate, onCloseSidebar]
  );

  const handleGoFactory = useCallback(() => {
    if (onSelectProject) onSelectProject(null, null);
    if (onSelectAgent) onSelectAgent(null);
    if (onSelectChannel) onSelectChannel(null);
    if (onSelectTeam) onSelectTeam(null);
    if (onNavigate) onNavigate("/");
    onCloseSidebar?.();
  }, [onSelectProject, onSelectAgent, onSelectChannel, onSelectTeam, onNavigate, onCloseSidebar]);

  const handleSelectRepoClick = useCallback(
    (projectId: string, projectName: string) => {
      if (onSelectProject) onSelectProject(projectId, projectName);
      onCloseSidebar?.();
    },
    [onSelectProject, onCloseSidebar]
  );

  const handleSelectAgentClick = useCallback(
    (agent: { id: string; name: string; avatarUrl?: string }) => {
      if (onSelectAgent) onSelectAgent(agent);
      onCloseSidebar?.();
    },
    [onSelectAgent, onCloseSidebar]
  );

  const handleSelectChannelClick = useCallback(
    (channel: { id: string; name: string }) => {
      if (onSelectChannel) onSelectChannel(channel);
      onCloseSidebar?.();
    },
    [onSelectChannel, onCloseSidebar]
  );

  const handleSelectTeamClick = useCallback(
    (team: { id: string; name: string }) => {
      if (onSelectTeam) onSelectTeam(team);
      onCloseSidebar?.();
    },
    [onSelectTeam, onCloseSidebar]
  );

  const adminItems = useMemo(
    () => [
      {
        id: "skills",
        label: l.navSkills,
        path: "/skills",
        icon: (
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
          </svg>
        ),
      },
      {
        id: "settings",
        label: l.navSettings,
        path: "/settings",
        icon: (
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
              clipRule="evenodd"
            />
          </svg>
        ),
      },
      {
        id: "logs",
        label: l.navLogs,
        path: "/logs",
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        ),
      },

      {
        id: "plugins",
        label: l.navPlugins || "Plugins",
        path: "/plugins",
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21 16-4 4-4-4" />
            <path d="M17 20V4" />
            <path d="m3 8 4-4 4 4" />
            <path d="M7 4v16" />
          </svg>
        ),
      },
      {
        id: "pipelines",
        label: l.navPipelines || "Pipelines",
        path: "/pipelines",
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M7 8h10" />
            <path d="M7 12h10" />
            <path d="M7 16h10" />
          </svg>
        ),
      },
    ],
    [l.navSkills, l.navSettings, l.navLogs, l.navPlugins, l.navPipelines]
  );

  return (
    <div className="flex flex-col h-full bg-background select-none text-foreground">
      {/* Factory Button */}
      <div className={isMobile ? "p-4 border-b border-border flex-shrink-0" : "p-3 border-b border-border flex-shrink-0"}>
        <button
          onClick={handleGoFactory}
          className={factoryButtonClass}
          title={l.globalWorkspace}
        >
          <svg width={isMobile ? 20 : 14} height={isMobile ? 20 : 14} viewBox="0 0 20 20" fill="currentColor" className="flex-shrink-0">
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-5L9 4H4zm7 5a1 1 0 10-2 0v1H8a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V9z"
              clipRule="evenodd"
            />
          </svg>
          <span>Factory</span>
        </button>
      </div>

      {/* Context List Accordions */}
      <div className={isMobile ? "flex-1 overflow-y-auto min-h-0 py-3 space-y-4" : "flex-1 overflow-y-auto min-h-0 py-2 space-y-3"}>
        {/* Repos Accordion */}
        <div className="flex flex-col">
          <div className={accordionHeaderClass}>
            <button
              onClick={() => setIsOpenRepos((prev) => !prev)}
              className={accordionButtonClass}
            >
              <svg
                width={chevronSize}
                height={chevronSize}
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`transform transition-transform ${isOpenRepos ? "rotate-90" : ""}`}
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{l.sectionProjects} ({repos.length})</span>
            </button>
            <button
              onClick={() => { onCloseSidebar?.(); onNavigate?.("/projects"); }}
              className={actionButtonClass}
              title={l.manageProjects}
            >
            <svg width={isMobile ? 20 : 12} height={isMobile ? 20 : 12} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            </button>
          </div>

          {isOpenRepos && (
            <div className={isMobile ? "px-3 mt-1 space-y-1.5" : "px-2 mt-1 space-y-0.5"}>
              {loadingRepos ? (
                <div className="text-xs text-muted-foreground px-3 py-1 animate-pulse">{l.loading}</div>
              ) : repos.length === 0 ? (
                <div className="text-xs text-muted-foreground px-3 py-1">{l.noProjects}</div>
              ) : (
                repos.map((repo) => {
                  const isActive = isSessionView && activeProjectName === repo.id && !activeAgent && !activeChannel;
                  return (
                    <button
                      key={repo.id || repo.name}
                      onClick={() => handleSelectRepoClick(repo.id || repo.name, repo.name)}
                      className={itemClass(isActive)}
                    >
                      <svg
                        width={isMobile ? 20 : 12}
                        height={isMobile ? 20 : 12}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="flex-shrink-0 text-muted-foreground"
                      >
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                      </svg>
                      <span className="truncate">{repo.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Agents Accordion */}
        <div className="flex flex-col">
          <div className={accordionHeaderClass}>
            <button
              onClick={() => setIsOpenAgents((prev) => !prev)}
              className={accordionButtonClass}
            >
              <svg
                width={chevronSize}
                height={chevronSize}
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`transform transition-transform ${isOpenAgents ? "rotate-90" : ""}`}
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{l.sectionAgents} ({agents.length})</span>
            </button>
            <button
              onClick={() => { onCloseSidebar?.(); onNavigate?.("/agents"); }}
              className={actionButtonClass}
              title={l.manageAgents}
            >
            <svg width={isMobile ? 20 : 12} height={isMobile ? 20 : 12} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            </button>
          </div>

          {isOpenAgents && (
            <div className={isMobile ? "px-3 mt-1 space-y-1.5" : "px-2 mt-1 space-y-0.5"}>
              {loadingAgents ? (
                <div className="text-xs text-muted-foreground px-3 py-1 animate-pulse">{l.loading}</div>
              ) : agents.length === 0 ? (
                <div className="text-xs text-muted-foreground px-3 py-1">{l.noAgents}</div>
              ) : (
                agents.map((agent) => {
                  const isActive = isSessionView && activeAgent?.id === agent.id && !activeChannel;
                  const agentKanbanStatus = getAgentKanbanStatus(agent.id);
                  const statusDot =
                    agentKanbanStatus === "working"
                      ? "bg-success shadow-[0_0_6px_rgba(74,222,128,0.6)]"
                      : agentKanbanStatus === "idle"
                        ? "bg-text-secondary/30"
                        : "bg-text-secondary/10";
                  return (
                    <button
                      key={agent.id}
                      onClick={() => handleSelectAgentClick({ id: agent.id, name: agent.name, avatarUrl: agent.avatarUrl })}
                      className={itemClass(isActive)}
                    >
                      <span className="relative flex-shrink-0">
                        <AgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size={isMobile ? "sm" : "xs"} />
                        <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-background ${statusDot}`} />
                      </span>
                      <span className="truncate">{agent.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Channels Accordion */}
        <div className="flex flex-col">
          <div className={accordionHeaderClass}>
            <button
              onClick={() => setIsOpenChannels((prev) => !prev)}
              className={accordionButtonClass}
            >
              <svg
                width={chevronSize}
                height={chevronSize}
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`transform transition-transform ${isOpenChannels ? "rotate-90" : ""}`}
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{l.sectionChannels} ({channels.length})</span>
            </button>
            <button
              onClick={() => { onCloseSidebar?.(); onNavigate?.("/channels"); }}
              className={actionButtonClass}
              title={l.manageChannels}
            >
            <svg width={isMobile ? 20 : 12} height={isMobile ? 20 : 12} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            </button>
          </div>

          {isOpenChannels && (
            <div className={isMobile ? "px-3 mt-1 space-y-1.5" : "px-2 mt-1 space-y-0.5"}>
              {loadingChannels ? (
                <div className="text-xs text-muted-foreground px-3 py-1 animate-pulse">{l.loading}</div>
              ) : channels.length === 0 ? (
                <div className="text-xs text-muted-foreground px-3 py-1">{l.noChannels}</div>
              ) : (
                channels.map((channel) => {
                  const isActive = isSessionView && activeChannel?.id === channel.id;
                  return (
                    <button
                      key={channel.id}
                      onClick={() => handleSelectChannelClick({ id: channel.id, name: channel.name })}
                      className={itemClass(isActive)}
                    >
                      <span className={isMobile ? "font-bold text-base text-muted-foreground flex-shrink-0 w-5 text-center" : "font-bold text-xs text-muted-foreground flex-shrink-0 w-3 text-center"}>#</span>
                      <span className="truncate">{channel.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Teams Accordion */}
        <div className="flex flex-col">
          <div className={accordionHeaderClass}>
            <button
              onClick={() => setIsOpenTeams((prev) => !prev)}
              className={accordionButtonClass}
            >
              <svg
                width={chevronSize}
                height={chevronSize}
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`transform transition-transform ${isOpenTeams ? "rotate-90" : ""}`}
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{l.sectionTeams} ({teams.length})</span>
            </button>
            <button
              onClick={() => { onCloseSidebar?.(); onNavigate?.("/teams"); }}
              className={actionButtonClass}
              title={l.manageTeams}
            >
            <svg width={isMobile ? 20 : 12} height={isMobile ? 20 : 12} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            </button>
          </div>

          {isOpenTeams && (
            <div className={isMobile ? "px-3 mt-1 space-y-1.5" : "px-2 mt-1 space-y-0.5"}>
              {loadingTeams ? (
                <div className="text-xs text-muted-foreground px-3 py-1 animate-pulse">{l.loading}</div>
              ) : teams.length === 0 ? (
                <div className="text-xs text-muted-foreground px-3 py-1">{l.noTeams}</div>
              ) : (
                teams.map((team) => {
                  const isActive = isSessionView && activeTeam?.id === team.id;
                  return (
                    <button
                      key={team.id}
                      onClick={() => handleSelectTeamClick({ id: team.id, name: team.name })}
                      className={itemClass(isActive)}
                    >
                      <span className={isMobile ? "font-bold text-base text-muted-foreground flex-shrink-0 w-5 text-center" : "font-bold text-xs text-muted-foreground flex-shrink-0 w-3 text-center"}>#</span>
                      <span className="truncate">{team.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Experiments Accordion */}
        <div className="flex flex-col">
          <div className={accordionHeaderClass}>
            <button
              onClick={() => setIsOpenExperiments((prev) => !prev)}
              className={accordionButtonClass}
            >
              <svg
                width={chevronSize}
                height={chevronSize}
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`transform transition-transform ${isOpenExperiments ? "rotate-90" : ""}`}
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{l.sectionExperiments || "Experimentos"} ({experiments.length})</span>
            </button>
            <button
              onClick={() => { onCloseSidebar?.(); onNavigate?.("/laboratory"); }}
              className={actionButtonClass}
              title={l.manageExperiments || "Gestionar Experimentos"}
            >
              <svg width={isMobile ? 20 : 12} height={isMobile ? 20 : 12} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {isOpenExperiments && (
            <div className={isMobile ? "px-3 mt-1 space-y-1.5" : "px-2 mt-1 space-y-0.5"}>
              {loadingExperiments ? (
                <div className="text-xs text-muted-foreground px-3 py-1 animate-pulse">{l.loading}</div>
              ) : experiments.length === 0 ? (
                <div className="text-xs text-muted-foreground px-3 py-1">{l.noExperiments || "Sin experimentos"}</div>
              ) : (
                experiments.map((exp) => {
                  const isActive = currentPage === "laboratory" && selectedExpId === exp.id;
                  return (
                    <button
                      key={exp.id}
                      onClick={() => handleSelectExperimentClick(exp.id)}
                      className={itemClass(isActive)}
                    >
                      <svg
                        width={isMobile ? 20 : 12}
                        height={isMobile ? 20 : 12}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        className="flex-shrink-0 text-muted-foreground"
                      >
                        <path d="M4.5 3h15" />
                        <path d="M6 3v6l6 9h-3.5a1 1 0 0 0 0 2h11a1 1 0 0 0 0-2H16l-6-9V3" />
                      </svg>
                      <span className="truncate">{exp.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Admin Links */}
      {!isMobile && (
        <div className="p-2 border-t border-border/60 bg-card/10 space-y-1 flex-shrink-0">
          <div className="px-3 py-1 text-xs uppercase tracking-wider font-semibold text-muted-foreground">
            Admin
          </div>
          {adminItems.map((item) => {
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate && onNavigate(item.path)}
                className={adminItemClass(isActive)}
              >
                <span
                  className={`${isActive ? "text-primary" : "text-muted-foreground"} w-4 flex justify-center flex-shrink-0`}
                >
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
