import { useState, useEffect, useCallback, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { useLiterals } from "@/lib";
import { literals as u } from "./SessionSidebar.literals";

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
}

interface ChannelItem {
  id: string;
  name: string;
  description?: string;
  maxChainDepth?: number;
}

interface Props {
  activeRepoName: string | null;
  activeAgent: { id: string; name: string } | null;
  activeChannel: { id: string; name: string } | null;
  currentPage?: string;
  onNavigate?: (path: string) => void;
  onSelectRepo?: (repoId: string | null, repoName: string | null) => void;
  onSelectAgent?: (agent: { id: string; name: string } | null) => void;
  onSelectChannel?: (channel: { id: string; name: string } | null) => void;
}

export function SessionSidebar({
  activeRepoName,
  activeAgent,
  activeChannel,
  currentPage = "chat",
  onNavigate,
  onSelectRepo,
  onSelectAgent,
  onSelectChannel,
}: Props) {
  const l = useLiterals(u);
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [channels, setChannels] = useState<ChannelItem[]>([]);

  const [loadingRepos, setLoadingRepos] = useState(true);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingChannels, setLoadingChannels] = useState(true);

  const [isOpenRepos, setIsOpenRepos] = useState(true);
  const [isOpenAgents, setIsOpenAgents] = useState(true);
  const [isOpenChannels, setIsOpenChannels] = useState(true);

  const fetchRepos = useCallback(async () => {
    try {
      const res = await apiFetch("/api/workspace-repos");
      if (res.ok) {
        const data = await res.json();
        setRepos(data.repos || []);
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

  useEffect(() => {
    fetchRepos();
    fetchAgents();
    fetchChannels();
  }, [fetchRepos, fetchAgents, fetchChannels]);

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      const type = customEvent.detail?.type;
      if (type === "repo") {
        fetchRepos();
      } else if (type === "agent") {
        fetchAgents();
      } else if (type === "channel") {
        fetchChannels();
      } else {
        fetchRepos();
        fetchAgents();
        fetchChannels();
      }
    };
    window.addEventListener("entity-updated", handleUpdate);
    return () => window.removeEventListener("entity-updated", handleUpdate);
  }, [fetchRepos, fetchAgents, fetchChannels]);

  const isGlobal = !activeChannel && !activeAgent && !activeRepoName;

  const handleGoFactory = useCallback(() => {
    if (onSelectRepo) onSelectRepo(null, null);
    if (onSelectAgent) onSelectAgent(null);
    if (onSelectChannel) onSelectChannel(null);
    if (onNavigate) onNavigate("/");
  }, [onSelectRepo, onSelectAgent, onSelectChannel, onNavigate]);

  const handleSelectRepoClick = useCallback(
    (repoId: string, repoName: string) => {
      if (onSelectRepo) onSelectRepo(repoId, repoName);
      if (onNavigate) onNavigate("/");
    },
    [onSelectRepo, onNavigate]
  );

  const handleSelectAgentClick = useCallback(
    (agent: { id: string; name: string }) => {
      if (onSelectAgent) onSelectAgent(agent);
      if (onNavigate) onNavigate("/");
    },
    [onSelectAgent, onNavigate]
  );

  const handleSelectChannelClick = useCallback(
    (channel: { id: string; name: string }) => {
      if (onSelectChannel) onSelectChannel(channel);
      if (onNavigate) onNavigate("/");
    },
    [onSelectChannel, onNavigate]
  );

  const adminItems = useMemo(
    () => [
      {
        id: "laboratory",
        label: l.navLaboratory,
        path: "/laboratory",
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4.5 3h15" />
            <path d="M6 3v6l6 9h-3.5a1 1 0 0 0 0 2h11a1 1 0 0 0 0-2H16l-6-9V3" />
          </svg>
        ),
      },
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
    ],
    []
  );

  return (
    <div className="flex flex-col h-full bg-background select-none text-foreground">
      {/* Factory Button */}
      <div className="p-3 border-b border-border flex-shrink-0">
        <button
          onClick={handleGoFactory}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            isGlobal
              ? "bg-card text-primary border border-primary/30"
              : "bg-card/40 text-muted-foreground hover:bg-card hover:text-primary border border-transparent hover:border-primary/20"
          }`}
          title={l.globalWorkspace}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="flex-shrink-0">
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
      <div className="flex-1 overflow-y-auto min-h-0 py-2 space-y-3">
        {/* Repos Accordion */}
        <div className="flex flex-col">
          <div className="group/title flex items-center justify-between px-3 py-1 text-xs uppercase tracking-wider font-semibold text-muted-foreground/70">
            <button
              onClick={() => setIsOpenRepos((prev) => !prev)}
              className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer text-left"
            >
              <svg
                width="12"
                height="12"
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
              onClick={() => onNavigate && onNavigate("/projects")}
              className="p-0.5 hover:bg-card rounded text-muted-foreground hover:text-primary transition-all cursor-pointer font-bold text-xs leading-none"
              title={l.manageProjects}
            >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            </button>
          </div>

          {isOpenRepos && (
            <div className="px-2 mt-1 space-y-0.5">
              {loadingRepos ? (
                <div className="text-xs text-muted-foreground/40 px-3 py-1 animate-pulse">{l.loading}</div>
              ) : repos.length === 0 ? (
                <div className="text-xs text-muted-foreground/40 px-3 py-1">{l.noProjects}</div>
              ) : (
                repos.map((repo) => {
                  const isActive = activeRepoName === repo.id && !activeAgent && !activeChannel;
                  return (
                    <button
                      key={repo.id || repo.name}
                      onClick={() => handleSelectRepoClick(repo.id || repo.name, repo.name)}
                      className={`w-full flex items-center gap-2 px-3 py-1 rounded-lg text-xs truncate transition-colors text-left cursor-pointer ${
                        isActive
                          ? "bg-card-hover text-foreground font-medium border-l-2 border-primary rounded-l-none pl-2"
                          : "text-muted-foreground hover:bg-card/50 hover:text-foreground"
                      }`}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="flex-shrink-0 text-muted-foreground/60"
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
          <div className="group/title flex items-center justify-between px-3 py-1 text-xs uppercase tracking-wider font-semibold text-muted-foreground/70">
            <button
              onClick={() => setIsOpenAgents((prev) => !prev)}
              className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer text-left"
            >
              <svg
                width="12"
                height="12"
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
              onClick={() => onNavigate && onNavigate("/agents")}
              className="p-0.5 hover:bg-card rounded text-muted-foreground hover:text-primary transition-all cursor-pointer font-bold text-xs leading-none"
              title={l.manageAgents}
            >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            </button>
          </div>

          {isOpenAgents && (
            <div className="px-2 mt-1 space-y-0.5">
              {loadingAgents ? (
                <div className="text-xs text-muted-foreground/40 px-3 py-1 animate-pulse">{l.loading}</div>
              ) : agents.length === 0 ? (
                <div className="text-xs text-muted-foreground/40 px-3 py-1">{l.noAgents}</div>
              ) : (
                agents.map((agent) => {
                  const isActive = activeAgent?.id === agent.id && !activeChannel;
                  return (
                    <button
                      key={agent.id}
                      onClick={() => handleSelectAgentClick({ id: agent.id, name: agent.name })}
                      className={`w-full flex items-center gap-2 px-3 py-1 rounded-lg text-xs truncate transition-colors text-left cursor-pointer ${
                        isActive
                          ? "bg-card-hover text-foreground font-medium border-l-2 border-primary rounded-l-none pl-2"
                          : "text-muted-foreground hover:bg-card/50 hover:text-foreground"
                      }`}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="flex-shrink-0 text-muted-foreground/60"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                          clipRule="evenodd"
                        />
                      </svg>
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
          <div className="group/title flex items-center justify-between px-3 py-1 text-xs uppercase tracking-wider font-semibold text-muted-foreground/70">
            <button
              onClick={() => setIsOpenChannels((prev) => !prev)}
              className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer text-left"
            >
              <svg
                width="12"
                height="12"
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
              onClick={() => onNavigate && onNavigate("/channels")}
              className="p-0.5 hover:bg-card rounded text-muted-foreground hover:text-primary transition-all cursor-pointer font-bold text-xs leading-none"
              title={l.manageChannels}
            >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            </button>
          </div>

          {isOpenChannels && (
            <div className="px-2 mt-1 space-y-0.5">
              {loadingChannels ? (
                <div className="text-xs text-muted-foreground/40 px-3 py-1 animate-pulse">{l.loading}</div>
              ) : channels.length === 0 ? (
                <div className="text-xs text-muted-foreground/40 px-3 py-1">{l.noChannels}</div>
              ) : (
                channels.map((channel) => {
                  const isActive = activeChannel?.id === channel.id;
                  return (
                    <button
                      key={channel.id}
                      onClick={() => handleSelectChannelClick({ id: channel.id, name: channel.name })}
                      className={`w-full flex items-center gap-2 px-3 py-1 rounded-lg text-xs truncate transition-colors text-left cursor-pointer ${
                        isActive
                          ? "bg-card-hover text-foreground font-medium border-l-2 border-primary rounded-l-none pl-2"
                          : "text-muted-foreground hover:bg-card/50 hover:text-foreground"
                      }`}
                    >
                      <span className="font-bold text-xs text-muted-foreground/60 flex-shrink-0 w-3 text-center">#</span>
                      <span className="truncate">{channel.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Admin Links */}
      <div className="p-2 border-t border-border/60 bg-card/10 space-y-1 flex-shrink-0">
        <div className="px-3 py-1 text-xs uppercase tracking-wider font-semibold text-muted-foreground/60">
          Admin
        </div>
        {adminItems.map((item) => {
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate && onNavigate(item.path)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                isActive
                  ? "bg-card text-foreground font-medium"
                  : "text-muted-foreground hover:bg-card/50 hover:text-foreground"
              }`}
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
    </div>
  );
}
