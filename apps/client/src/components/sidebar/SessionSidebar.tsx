import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";

// --- Tab System ---

interface TabDef {
  id: string;
  label: string;
  path: (sessionId: string | null, repoName: string | null) => string;
  icon: ReactNode;
}

type ContextType = "global" | "repo" | "agent" | "channel";

const CHAT_TAB: TabDef = {
  id: "chat",
  label: "Chat",
  path: (sessionId) => (sessionId ? `/session/${sessionId}` : "/"),
  icon: (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
        clipRule="evenodd"
      />
    </svg>
  ),
};

const WORKSPACE_TAB: TabDef = {
  id: "workspace",
  label: "Files",
  path: () => "/workspace",
  icon: (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
    </svg>
  ),
};

const PREVIEW_TAB: TabDef = {
  id: "preview",
  label: "Preview",
  path: () => "/preview",
  icon: (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z"
        clipRule="evenodd"
      />
    </svg>
  ),
};

const CONTEXT_TABS: Record<ContextType, TabDef[]> = {
  global: [CHAT_TAB],
  agent: [CHAT_TAB],
  channel: [CHAT_TAB],
  repo: [CHAT_TAB, WORKSPACE_TAB, PREVIEW_TAB],
};

// --- Component ---

interface RepoItem {
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
  activeSessionId: string | null;
  activeRepoName: string | null;
  activeAgent: { id: string; name: string } | null;
  activeChannel: { id: string; name: string } | null;
  currentPage?: string;
  onNavigate?: (path: string) => void;
  onSelectRepo?: (repoName: string | null) => void;
  onSelectAgent?: (agent: { id: string; name: string } | null) => void;
  onSelectChannel?: (channel: { id: string; name: string } | null) => void;
}

export function SessionSidebar({
  activeSessionId,
  activeRepoName,
  activeAgent,
  activeChannel,
  currentPage = "chat",
  onNavigate,
  onSelectRepo,
  onSelectAgent,
  onSelectChannel,
}: Props) {
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

  const contextType = useMemo((): ContextType => {
    if (activeChannel) return "channel";
    if (activeAgent) return "agent";
    if (activeRepoName) return "repo";
    return "global";
  }, [activeChannel, activeAgent, activeRepoName]);

  const tabs = useMemo(() => CONTEXT_TABS[contextType], [contextType]);

  const handleGoFactory = useCallback(() => {
    if (onSelectRepo) onSelectRepo(null);
    if (onSelectAgent) onSelectAgent(null);
    if (onSelectChannel) onSelectChannel(null);
    if (onNavigate) onNavigate("/");
  }, [onSelectRepo, onSelectAgent, onSelectChannel, onNavigate]);

  const handleSelectRepoClick = useCallback(
    (repoName: string) => {
      if (onSelectRepo) onSelectRepo(repoName);
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
        id: "skills",
        label: "Skills Library",
        path: "/skills",
        icon: (
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
          </svg>
        ),
      },
      {
        id: "settings",
        label: "Settings",
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
    ],
    []
  );

  return (
    <div className="flex flex-col h-full bg-bg select-none text-text-primary">
      {/* Factory Button */}
      <div className="p-3 border-b border-surface flex-shrink-0">
        <button
          onClick={handleGoFactory}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            contextType === "global"
              ? "bg-surface text-accent border border-accent/30"
              : "bg-surface/40 text-text-secondary hover:bg-surface hover:text-accent border border-transparent hover:border-accent/20"
          }`}
          title="Global workspace"
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

      {/* Context Tabs */}
      {tabs.length > 1 && (
        <div className="flex px-2 pt-2 gap-0.5 border-b border-surface flex-shrink-0">
          {tabs.map((tab) => {
            const isActive = currentPage === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onNavigate && onNavigate(tab.path(activeSessionId, activeRepoName))}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all cursor-pointer rounded-t-md border-b-2 ${
                  isActive
                    ? "text-accent border-accent bg-surface/50"
                    : "text-text-secondary border-transparent hover:text-text-primary hover:border-surface-hover"
                }`}
              >
                <span className={isActive ? "text-accent" : "text-text-secondary"}>{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Context List Accordions */}
      <div className="flex-1 overflow-y-auto min-h-0 py-2 space-y-3">
        {/* Repos Accordion */}
        <div className="flex flex-col">
          <div className="group/title flex items-center justify-between px-3 py-1 text-[9px] uppercase tracking-wider font-semibold text-text-secondary/70">
            <button
              onClick={() => setIsOpenRepos((prev) => !prev)}
              className="flex items-center gap-1.5 hover:text-text-primary transition-colors cursor-pointer text-left"
            >
              <svg
                width="8"
                height="8"
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
              <span>Projects ({repos.length})</span>
            </button>
            <button
              onClick={() => onNavigate && onNavigate("/projects")}
              className="opacity-0 group-hover/title:opacity-100 p-0.5 hover:bg-surface rounded text-text-secondary hover:text-accent transition-all cursor-pointer font-bold text-xs leading-none"
              title="Manage Projects"
            >
              +
            </button>
          </div>

          {isOpenRepos && (
            <div className="px-2 mt-1 space-y-0.5">
              {loadingRepos ? (
                <div className="text-[10px] text-text-secondary/40 px-3 py-1 animate-pulse">Loading...</div>
              ) : repos.length === 0 ? (
                <div className="text-[10px] text-text-secondary/40 px-3 py-1">No projects</div>
              ) : (
                repos.map((repo) => {
                  const isActive = activeRepoName === repo.name && !activeAgent && !activeChannel;
                  return (
                    <button
                      key={repo.name}
                      onClick={() => handleSelectRepoClick(repo.name)}
                      className={`w-full flex items-center gap-2 px-3 py-1 rounded-lg text-xs truncate transition-colors text-left cursor-pointer ${
                        isActive
                          ? "bg-surface-hover text-text-primary font-medium border-l-2 border-accent rounded-l-none pl-2"
                          : "text-text-secondary hover:bg-surface/50 hover:text-text-primary"
                      }`}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="flex-shrink-0 text-text-secondary/60"
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
          <div className="group/title flex items-center justify-between px-3 py-1 text-[9px] uppercase tracking-wider font-semibold text-text-secondary/70">
            <button
              onClick={() => setIsOpenAgents((prev) => !prev)}
              className="flex items-center gap-1.5 hover:text-text-primary transition-colors cursor-pointer text-left"
            >
              <svg
                width="8"
                height="8"
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
              <span>Agents ({agents.length})</span>
            </button>
            <button
              onClick={() => onNavigate && onNavigate("/agents")}
              className="opacity-0 group-hover/title:opacity-100 p-0.5 hover:bg-surface rounded text-text-secondary hover:text-accent transition-all cursor-pointer font-bold text-xs leading-none"
              title="Manage Agents"
            >
              +
            </button>
          </div>

          {isOpenAgents && (
            <div className="px-2 mt-1 space-y-0.5">
              {loadingAgents ? (
                <div className="text-[10px] text-text-secondary/40 px-3 py-1 animate-pulse">Loading...</div>
              ) : agents.length === 0 ? (
                <div className="text-[10px] text-text-secondary/40 px-3 py-1">No agents</div>
              ) : (
                agents.map((agent) => {
                  const isActive = activeAgent?.id === agent.id && !activeChannel;
                  return (
                    <button
                      key={agent.id}
                      onClick={() => handleSelectAgentClick({ id: agent.id, name: agent.name })}
                      className={`w-full flex items-center gap-2 px-3 py-1 rounded-lg text-xs truncate transition-colors text-left cursor-pointer ${
                        isActive
                          ? "bg-surface-hover text-text-primary font-medium border-l-2 border-accent rounded-l-none pl-2"
                          : "text-text-secondary hover:bg-surface/50 hover:text-text-primary"
                      }`}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="flex-shrink-0 text-text-secondary/60"
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
          <div className="group/title flex items-center justify-between px-3 py-1 text-[9px] uppercase tracking-wider font-semibold text-text-secondary/70">
            <button
              onClick={() => setIsOpenChannels((prev) => !prev)}
              className="flex items-center gap-1.5 hover:text-text-primary transition-colors cursor-pointer text-left"
            >
              <svg
                width="8"
                height="8"
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
              <span>Channels ({channels.length})</span>
            </button>
            <button
              onClick={() => onNavigate && onNavigate("/channels")}
              className="opacity-0 group-hover/title:opacity-100 p-0.5 hover:bg-surface rounded text-text-secondary hover:text-accent transition-all cursor-pointer font-bold text-xs leading-none"
              title="Manage Channels"
            >
              +
            </button>
          </div>

          {isOpenChannels && (
            <div className="px-2 mt-1 space-y-0.5">
              {loadingChannels ? (
                <div className="text-[10px] text-text-secondary/40 px-3 py-1 animate-pulse">Loading...</div>
              ) : channels.length === 0 ? (
                <div className="text-[10px] text-text-secondary/40 px-3 py-1">No channels</div>
              ) : (
                channels.map((channel) => {
                  const isActive = activeChannel?.id === channel.id;
                  return (
                    <button
                      key={channel.id}
                      onClick={() => handleSelectChannelClick({ id: channel.id, name: channel.name })}
                      className={`w-full flex items-center gap-2 px-3 py-1 rounded-lg text-xs truncate transition-colors text-left cursor-pointer ${
                        isActive
                          ? "bg-surface-hover text-text-primary font-medium border-l-2 border-accent rounded-l-none pl-2"
                          : "text-text-secondary hover:bg-surface/50 hover:text-text-primary"
                      }`}
                    >
                      <span className="font-bold text-xs text-text-secondary/60 flex-shrink-0 w-3 text-center">#</span>
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
      <div className="p-2 border-t border-surface/60 bg-surface/10 space-y-1 flex-shrink-0">
        <div className="px-3 py-1 text-[9px] uppercase tracking-wider font-semibold text-text-secondary/60">
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
                  ? "bg-surface text-text-primary font-medium"
                  : "text-text-secondary hover:bg-surface/50 hover:text-text-primary"
              }`}
            >
              <span
                className={`${isActive ? "text-accent" : "text-text-secondary"} w-4 flex justify-center flex-shrink-0`}
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
