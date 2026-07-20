import { useState, useMemo, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { Plus, Settings } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import type { RoutePage } from "@/router/useRoutePage";
import { useSessionResolver } from "@/hooks/useSessionResolver";
import { useLiterals } from "@/lib";
import { useWorkspaceContext } from "@/hooks/useWorkspaceContext";
import { getSessionPath } from "@/lib/session-utils";
import { literals as u } from "./MainLayout.literals";
import { MobileTopbar } from "./MobileTopbar";
import { wsClient, type ConnectionState } from "@/lib/ws-client";
import { useWorkspaceNavigation } from "./hooks/useWorkspaceNavigation";
import { useSessionActions } from "./hooks/useSessionActions";
import { Breadcrumbs } from "./header/Breadcrumbs";
import { DesktopHeader } from "./header/DesktopHeader";
import { ContextTabBar } from "./tabs/ContextTabBar";
import { LabActionsToolbar } from "./tabs/LabActionsToolbar";
import { DesktopSidebar } from "./sidebar/DesktopSidebar";
import { MobileSidebarOverlay } from "./sidebar/MobileSidebarOverlay";
import { MobileBottomBar } from "./mobile/MobileBottomBar";
import { SessionSidebar } from "@/components/sidebar/SessionSidebar";
import { SessionPopover } from "@/components/sidebar/SessionPopover";
import { RegisterModal } from "@/components/agents/RegisterModal";
import { useAgents } from "@/hooks/useAgents";
import type { AgentDefinition, AgentInfo } from "shared";
import { ProjectSettingsModal } from "@/components/projects/ProjectSettingsModal";
import { TeamSettingsModal } from "@/components/teams/TeamSettingsModal";
import { GlobalAgentSettingsModal } from "@/components/agents/GlobalAgentSettingsModal";

type VariantTab = "chat" | "config" | "single" | "multiNoLeader" | "multiWithLeader" | "compare";

interface LabProps {
  selectedExpId?: string | null;
  experiments?: any[];
  onDeleteExperiment?: (id: string) => void;
  activeVariantTab?: VariantTab;
  setActiveVariantTab?: (tab: VariantTab) => void;
  onRunExperiment?: (id: string) => void;
  onStopExperiment?: (id: string) => void;
  onEditExperiment?: (id: string) => void;
  onJudgeExperiment?: (id: string) => void;
  onExportExperiment?: (id: string) => void;
  selectedRunId?: string;
  pastRuns?: any[];
  runPopoverOpen?: boolean;
  setRunPopoverOpen?: (open: boolean) => void;
  onSelectRun?: (runId: string) => void;
}

interface Props {
  page: RoutePage;
  onNavigate: (path: string) => void;
  children: ReactNode;
  isMobile?: boolean;
  canGoBack?: boolean;
  onBack?: () => void;
  lab?: LabProps;
}

export function MainLayout({
  page,
  onNavigate,
  children,
  isMobile = false,
  canGoBack = false,
  onBack,
  lab,
}: Props) {
  const workspace = useWorkspaceContext();
  const {
    activeProjectId,
    activeProjectFriendlyName: activeProjectName,
    activeAgent: rawActiveAgent,
    activeTeam,
    selectProject: onSelectProject,
    selectTeam: onSelectTeam,
  } = workspace;

  const activeAgent = (page === "laboratory" && !lab?.selectedExpId)
    ? { id: "lab-architect", name: "Lab Architect" }
    : rawActiveAgent;

  const l = useLiterals(u);
  const { pathname } = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionPopoverOpen, setSessionPopoverOpen] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [wsState, setWsState] = useState<ConnectionState>(() => wsClient.getState());
  const [showAgentEdit, setShowAgentEdit] = useState(false);
  const [showProjectEdit, setShowProjectEdit] = useState(false);
  const [showTeamEdit, setShowTeamEdit] = useState(false);
  const [showGlobalEdit, setShowGlobalEdit] = useState(false);
  const [activeProjectData, setActiveProjectData] = useState<any>(null);
  const [activeTeamData, setActiveTeamData] = useState<any>(null);
  const [globalSettings, setGlobalSettings] = useState<{ factoryName?: string; factoryAvatarUrl?: string | null } | null>(null);
  const { updateAgent, uploadAvatar, deleteAvatar } = useAgents();

  useEffect(() => {
    const unsub = wsClient.onStateChange((state) => {
      setWsState(state);
    });
    return unsub;
  }, []);

  const sessionMatch = pathname.match(/\/session\/(.+?)(?:\/(?:delegations|timeline))?$/);
  const sessionId = sessionMatch?.[1] ?? null;

  const handleExport = useCallback((format: "json" | "jsonl" | "markdown") => {
    if (!sessionId) return;
    setExportDropdownOpen(false);

    const url = `/api/sessions/${sessionId}/export?format=${format}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `session-${sessionId}.${format === "markdown" ? "md" : format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [sessionId]);

  // Hooks extraídos
  useWorkspaceNavigation(page, onNavigate);

  const {
    quickCreating,
    handleSelectSession,
    handleNewSession,
    handleQuickCreate,
  } = useSessionActions({
    activeProjectId,
    activeProjectFriendlyName: activeProjectName,
    activeAgent,
    activeTeam,
    onNavigate,
    setSidebarOpen,
  });

  const handleBackClick = useCallback(() => {
    if (onBack) {
      onBack();
    }
  }, [onBack]);

  const handleUpdateAgent = useCallback(async (def: AgentDefinition) => {
    if (!activeAgent) return;
    const { id, ...updates } = def;
    await updateAgent(activeAgent.id, updates);
  }, [activeAgent, updateAgent]);

  const handleUpdateProject = useCallback(async (updates: { name: string; cloneUrl: string | null; avatarUrl: string | null }) => {
    if (!activeProjectId) return;
    const res = await apiFetch(`/api/workspace-projects/${activeProjectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to update project" }));
      throw new Error(err.error || "Failed to update project");
    }
    localStorage.setItem("active-project-name", updates.name);
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "project" } }));
  }, [activeProjectId]);

  const handleUploadProjectAvatar = useCallback(async (id: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await apiFetch(`/api/workspace-projects/${id}/avatar`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to upload avatar");
    }
    const data = await res.json();
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "project" } }));
    return data.avatarUrl;
  }, []);

  const handleDeleteProjectAvatar = useCallback(async (id: string) => {
    const res = await apiFetch(`/api/workspace-projects/${id}/avatar`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to delete avatar");
    }
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "project" } }));
  }, []);

  const handleDeleteProject = useCallback(async (id: string) => {
    const res = await apiFetch(`/api/workspace-projects/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to delete project");
    }
    onSelectProject(null, null);
    onNavigate("/projects");
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "project" } }));
  }, [onSelectProject, onNavigate]);

  const handleUpdateTeam = useCallback(async (updates: any) => {
    if (!activeTeam?.id) return;
    const res = await apiFetch(`/api/teams/${activeTeam.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to update team" }));
      throw new Error(err.error || "Failed to update team");
    }
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "team" } }));
  }, [activeTeam?.id]);

  const handleUploadTeamAvatar = useCallback(async (id: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await apiFetch(`/api/teams/${id}/avatar`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to upload team avatar");
    }
    const data = await res.json();
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "team" } }));
    return data.avatarUrl;
  }, []);

  const handleDeleteTeamAvatar = useCallback(async (id: string) => {
    const res = await apiFetch(`/api/teams/${id}/avatar`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to delete team avatar");
    }
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "team" } }));
  }, []);

  const handleDeleteTeam = useCallback(async (id: string) => {
    const res = await apiFetch(`/api/teams/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to delete team");
    }
    onSelectTeam(null);
    onNavigate("/teams");
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "team" } }));
  }, [onSelectTeam, onNavigate]);

  const fetchGlobalSettings = useCallback(async () => {
    try {
      const res = await apiFetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setGlobalSettings(data);
      }
    } catch (err) {
      console.error("Failed to fetch global settings:", err);
    }
  }, []);

  useEffect(() => {
    fetchGlobalSettings();
  }, [fetchGlobalSettings]);

  useEffect(() => {
    if (!activeProjectId) {
      setActiveProjectData(null);
      return;
    }
    const fetchProjectData = async () => {
      try {
        const res = await apiFetch(`/api/workspace-projects`);
        if (res.ok) {
          const data = await res.json();
          const proj = data.projects?.find((p: any) => p.id === activeProjectId);
          if (proj) {
            setActiveProjectData(proj);
          }
        }
      } catch (err) {
        console.error("Failed to fetch project details:", err);
      }
    };
    fetchProjectData();
  }, [activeProjectId]);

  useEffect(() => {
    if (!activeTeam?.id) {
      setActiveTeamData(null);
      return;
    }
    const fetchTeamData = async () => {
      try {
        const res = await apiFetch(`/api/teams`);
        if (res.ok) {
          const data = await res.json();
          const team = data.teams?.find((t: any) => t.id === activeTeam.id);
          if (team) {
            setActiveTeamData(team);
          }
        }
      } catch (err) {
        console.error("Failed to fetch team details:", err);
      }
    };
    fetchTeamData();
  }, [activeTeam?.id]);

  useEffect(() => {
    const handleUpdate = async (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      const type = detail?.type;

      if (type === "project" && activeProjectId) {
        try {
          const res = await apiFetch(`/api/workspace-projects`);
          if (res.ok) {
            const data: any = await res.json();
            const proj = data.projects?.find((p: any) => p.id === activeProjectId);
            if (proj) {
              setActiveProjectData(proj);
              localStorage.setItem("active-project-name", proj.name);
            }
          }
        } catch (err) {
          console.error("Error refreshing active project data:", err);
        }
      }

      if (type === "team" && activeTeam?.id) {
        try {
          const res = await apiFetch(`/api/teams`);
          if (res.ok) {
            const data: any = await res.json();
            const team = data.teams?.find((t: any) => t.id === activeTeam.id);
            if (team) {
              setActiveTeamData(team);
            }
          }
        } catch (err) {
          console.error("Error refreshing active team data:", err);
        }
      }

      if (type === "settings") {
        fetchGlobalSettings();
      }
    };
    window.addEventListener("entity-updated", handleUpdate);
    return () => window.removeEventListener("entity-updated", handleUpdate);
  }, [activeProjectId, activeTeam?.id, fetchGlobalSettings]);

  const isHome = isMobile && !activeProjectId && !activeAgent && !activeTeam && page === "chat";

  const mobileTitle = useMemo(() => {
    if (activeProjectId) return activeProjectName || activeProjectId;
    if (activeAgent) return activeAgent.name;
    if (activeTeam) return `#${activeTeam.name}`;
    if (page === "laboratory") return "Laboratorio";
    if (page === "settings") return l.breadSettings || "Settings";
    if (page === "skills") return l.breadSkills || "Skills";
    if (page === "logs") return l.breadLogs || "Logs";
    if (page === "sessions") return l.breadSessions || "Sessions";
    if (page === "plugins") return "Plugins";
    return "Factory";
  }, [activeProjectId, activeProjectName, activeAgent, activeTeam, page, l]);

  const { resolvedSessionId, resolving } = useSessionResolver({
    sessionId,
    activeProjectName: activeProjectId,
    activeProjectFriendlyName: activeProjectName,
    activeAgent,
    activeTeam,
    currentPage: page,
  });

  useEffect(() => {
    if (resolvedSessionId && !sessionId) {
      const context = {
        activeTeam,
        activeAgent,
        activeProjectName: activeProjectId,
        activeProjectFriendlyName: activeProjectName,
      };
      onNavigate(getSessionPath(resolvedSessionId, context));
    }
  }, [resolvedSessionId, sessionId, activeTeam, activeAgent, activeProjectId, activeProjectName, onNavigate]);

  const resolvingSession = !sessionId && page === "chat" && resolving;

  const contentElement = resolvingSession ? (
    <div className="absolute inset-0 flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  ) : (
    children
  );

  const isContextView = page === "chat" || page === "workspace" || page === "preview" || page === "laboratory" || page === "org" || page === "delegations" || page === "timeline";
  const showNewSessionButton = !isHome && isContextView && page !== "laboratory";

  const isNegotiationTeam = activeTeamData?.teamType === "Negotiation";

  const contextTabs = useMemo(() => {
    let basePath = "";
    if (activeAgent) basePath = `/agents/${activeAgent.id}`;
    else if (activeTeam) basePath = `/teams/${activeTeam.id}`;
    else if (activeProjectId) basePath = `/projects/${activeProjectId}`;

    const list = [
      {
        id: "chat",
        label: l.tabChat,
        path: sessionId ? `${basePath}/session/${sessionId}` : (basePath ? `${basePath}/chat` : "/"),
        icon: (
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
          </svg>
        ),
      },
    ];

    if (!isNegotiationTeam) {
      list.push(
        {
          id: "delegations",
          label: l.tabDelegations || "Delegations",
          path: sessionId ? `${basePath}/session/${sessionId}/delegations` : (basePath ? `${basePath}/delegations` : "/delegations"),
          icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          ),
        },
        {
          id: "workspace",
          label: l.tabFiles,
          path: basePath ? `${basePath}/workspace` : "/workspace",
          icon: (
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
          ),
        },
        {
          id: "timeline",
          label: l.tabTimeline || "Timeline",
          path: sessionId ? `${basePath}/session/${sessionId}/timeline` : (basePath ? `${basePath}/timeline` : "/timeline"),
          icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          ),
        }
      );
    }

    if (activeProjectName || activeProjectId) {
      list.push({
        id: "preview",
        label: l.tabPreview,
        path: basePath ? `${basePath}/preview` : "/preview",
        icon: (
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 01-1.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd" />
          </svg>
        ),
      });
    }

    if (activeTeam) {
      list.push({
        id: "org",
        label: l.tabOrgChart,
        path: `${basePath}/org`,
        icon: (
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 3a1 1 0 000 2h11a1 1 0 100-2H3zm0 4a1 1 0 000 2h7a1 1 0 100-2H3zm0 4a1 1 0 100 2h7a1 1 0 100-2H3zm0 4a1 1 0 100 2h11a1 1 0 100-2H3z" clipRule="evenodd" />
          </svg>
        ),
      });
    }

    return list;
  }, [sessionId, activeProjectId, activeProjectName, activeAgent, activeTeam, activeTeamData, l]);

  const breadcrumbsElement = (
    <Breadcrumbs
      page={page}
      activeProjectId={activeProjectId}
      activeProjectName={activeProjectName}
      activeAgent={activeAgent}
      activeTeam={activeTeam}
      selectedExpId={lab?.selectedExpId}
      experiments={lab?.experiments}
      onNavigate={onNavigate}
      l={l}
      factoryName={globalSettings?.factoryName}
    />
  );

  const rightToolbarElement = (
    <>
      {page === "laboratory" && lab?.selectedExpId ? (
        <LabActionsToolbar
          selectedExpId={lab.selectedExpId}
          experiments={lab.experiments || []}
          selectedRunId={lab.selectedRunId}
          pastRuns={lab.pastRuns}
          runPopoverOpen={lab.runPopoverOpen}
          setRunPopoverOpen={lab.setRunPopoverOpen}
          onSelectRun={lab.onSelectRun}
          onRunExperiment={lab.onRunExperiment}
          onStopExperiment={lab.onStopExperiment}
          onEditExperiment={lab.onEditExperiment}
          onDeleteExperiment={lab.onDeleteExperiment}
          onJudgeExperiment={lab.onJudgeExperiment}
          onExportExperiment={lab.onExportExperiment}
        />
      ) : (
        <>
          {!isMobile && (
            <button
              onClick={handleQuickCreate}
              disabled={quickCreating}
              className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-semibold border border-border hover:bg-card text-muted-foreground hover:text-foreground transition-all cursor-pointer bg-card/10 disabled:opacity-50"
              title="Nueva sesion"
            >
              {quickCreating ? (
                <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <Plus size={14} />
              )}
            </button>
          )}

          {sessionId && (
            <div className="relative flex items-center">
              <button
                onClick={() => setExportDropdownOpen(p => !p)}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border border-border hover:bg-card text-muted-foreground hover:text-foreground transition-all cursor-pointer bg-card/10"
                title="Exportar conversación"
              >
                <svg className="w-3 h-3 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>

              </button>
              {exportDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setExportDropdownOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-44 bg-card border border-input rounded-xl shadow-2xl flex flex-col z-50 animate-scale-in overflow-hidden p-1">
                    <button
                      onClick={() => handleExport("markdown")}
                      className="w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:bg-card-hover hover:text-foreground transition-all cursor-pointer font-sans"
                    >
                      Exportar Markdown (.md)
                    </button>
                    <button
                      onClick={() => handleExport("jsonl")}
                      className="w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:bg-card-hover hover:text-foreground transition-all cursor-pointer font-sans"
                    >
                      Exportar JSONL (.jsonl)
                    </button>
                    <button
                      onClick={() => handleExport("json")}
                      className="w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:bg-card-hover hover:text-foreground transition-all cursor-pointer font-sans"
                    >
                      Exportar JSON (.json)
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          <button
            onClick={() => setSessionPopoverOpen((p) => !p)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border border-border hover:bg-card text-muted-foreground hover:text-foreground transition-all cursor-pointer bg-card/10"
            title={l.titleSessions}
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.8 2.8a1 1 0 101.414-1.414L11 10.586V6z" clipRule="evenodd" />
            </svg>
            <span>{l.btnSessions}</span>
          </button>
          <SessionPopover
            isOpen={sessionPopoverOpen}
            onClose={() => setSessionPopoverOpen(false)}
            activeSessionId={sessionId}
            activeProjectName={activeProjectId}
            activeProjectFriendlyName={activeProjectName}
            activeAgent={activeAgent}
            activeTeam={activeTeam}
            onSelectSession={handleSelectSession}
            onNewSession={handleNewSession}
          />
          {activeAgent && activeAgent.id !== "lab-architect" && (
            <button
              onClick={() => setShowAgentEdit(true)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-card transition-all cursor-pointer"
              title="Configurar agente"
            >
              <Settings size={14} />
            </button>
          )}
          {activeProjectId && (
            <button
              onClick={() => setShowProjectEdit(true)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-card transition-all cursor-pointer"
              title="Configurar proyecto"
            >
              <Settings size={14} />
            </button>
          )}
          {activeTeam && (
            <button
              onClick={() => setShowTeamEdit(true)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-card transition-all cursor-pointer"
              title="Configurar equipo"
            >
              <Settings size={14} />
            </button>
          )}
          {!rawActiveAgent && !activeProjectId && !activeTeam && page === "chat" && (
            <button
              onClick={() => setShowGlobalEdit(true)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-card transition-all cursor-pointer"
              title="Configurar Factory"
            >
              <Settings size={14} />
            </button>
          )}
        </>
      )}
    </>
  );

  const sharedTabBar = (
    <ContextTabBar
      page={page}
      contextTabs={contextTabs}
      selectedExpId={lab?.selectedExpId}
      experiments={lab?.experiments}
      activeVariantTab={lab?.activeVariantTab}
      onChangeVariantTab={lab?.setActiveVariantTab}
      onNavigateTab={onNavigate}
      rightSlot={rightToolbarElement}
    />
  );

  const sessionSidebarElement = (
    <SessionSidebar
      currentPage={page}
      onNavigate={onNavigate}
      selectedExpId={lab?.selectedExpId}
      isMobile={isMobile}
      onCloseSidebar={() => setSidebarOpen(false)}
    />
  );

  return (
    <><div className="h-dvh flex flex-col bg-background text-foreground overflow-hidden font-sans">
      {isMobile ? (
        <MobileTopbar
          isMobile={isMobile}
          isHome={isHome}
          title={mobileTitle}
          canGoBack={canGoBack}
          onBack={handleBackClick}
          onMenuToggle={() => setSidebarOpen((prev) => !prev)}
          onNewSession={handleQuickCreate}
          onNavigate={onNavigate}
          showNewSessionButton={showNewSessionButton}
          l={l}
          wsState={wsState}
        />
      ) : (
        <DesktopHeader
          onHome={() => { onSelectProject(null, null); onNavigate("/dashboard"); }}
          onToggleSidebar={() => setSidebarOpen((p) => !p)}
          onNavigate={onNavigate}
          wsState={wsState}
          breadcrumbs={breadcrumbsElement}
        />
      )}

      <div className="flex flex-1 min-h-0 relative overflow-hidden">
        {isMobile ? (
          <>
            <MobileSidebarOverlay
              sidebarOpen={sidebarOpen}
              isHome={isHome}
              onClose={() => setSidebarOpen(false)}
              onNavigate={onNavigate}
            >
              {sessionSidebarElement}
            </MobileSidebarOverlay>

            <main
              className={`absolute inset-x-0 top-0 ${sidebarOpen ? "bottom-14" : "bottom-0"
                } z-30 flex flex-col bg-background`}
            >
              {isContextView && sharedTabBar}
              <div className="flex-1 min-h-0 relative">{contentElement}</div>
            </main>

            {sidebarOpen && (
              <MobileBottomBar
                currentPage={page}
                isHome={isHome}
                onNavigate={onNavigate}
                setSidebarOpen={setSidebarOpen}
              />
            )}
          </>
        ) : (
          <>
            <DesktopSidebar sidebarOpen={sidebarOpen}>
              {sessionSidebarElement}
            </DesktopSidebar>

            <main className="flex-1 min-w-0 flex flex-col h-full bg-background">
              {isContextView && sharedTabBar}
              <div className="flex-1 min-h-0 relative">{contentElement}</div>
            </main>
          </>
        )}
      </div>
    </div>
      <AnimatePresence>
        {showAgentEdit && activeAgent && (
          <RegisterModal
            agent={{ id: activeAgent.id, name: activeAgent.name, avatarUrl: activeAgent.avatarUrl, role: "", status: "idle" as const, createdAt: "" } as unknown as AgentInfo}
            onClose={() => setShowAgentEdit(false)}
            onSubmit={handleUpdateAgent}
            onUploadAvatar={uploadAvatar}
            onDeleteAvatar={deleteAvatar}
          />
        )}
        {showProjectEdit && activeProjectData && (
          <ProjectSettingsModal
            project={{
              id: activeProjectId!,
              name: activeProjectData.name,
              cloneUrl: activeProjectData.cloneUrl,
              avatarUrl: activeProjectData.avatarUrl,
              createdAt: activeProjectData.createdAt,
              diskPath: activeProjectData.diskPath,
            }}
            onClose={() => setShowProjectEdit(false)}
            onSave={handleUpdateProject}
            onUploadAvatar={handleUploadProjectAvatar}
            onDeleteAvatar={handleDeleteProjectAvatar}
            onDeleteProject={handleDeleteProject}
          />
        )}
        {showTeamEdit && activeTeamData && (
          <TeamSettingsModal
            team={activeTeamData}
            onClose={() => setShowTeamEdit(false)}
            onSave={handleUpdateTeam}
            onUploadAvatar={handleUploadTeamAvatar}
            onDeleteAvatar={handleDeleteTeamAvatar}
            onDeleteTeam={handleDeleteTeam}
          />
        )}
        {showGlobalEdit && (
          <GlobalAgentSettingsModal
            onClose={() => setShowGlobalEdit(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
