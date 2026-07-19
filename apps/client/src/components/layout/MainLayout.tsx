import { useState, useMemo, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import type { ReactNode } from "react";
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
    activeChannel,
    activeTeam,
    selectProject: onSelectProject,
  } = workspace;

  const activeAgent = (page === "laboratory" && !lab?.selectedExpId)
    ? { id: "lab-architect", name: "Lab Architect" }
    : rawActiveAgent;

  const l = useLiterals(u);
  const { pathname } = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionPopoverOpen, setSessionPopoverOpen] = useState(false);
  const [wsState, setWsState] = useState<ConnectionState>(() => wsClient.getState());
  const [showAgentEdit, setShowAgentEdit] = useState(false);
  const { updateAgent, uploadAvatar, deleteAvatar } = useAgents();

  useEffect(() => {
    const unsub = wsClient.onStateChange((state) => {
      setWsState(state);
    });
    return unsub;
  }, []);

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
    activeChannel,
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

  const isHome = isMobile && !activeProjectId && !activeAgent && !activeChannel && page === "chat";

  const mobileTitle = useMemo(() => {
    if (activeProjectId) return activeProjectName || activeProjectId;
    if (activeAgent) return activeAgent.name;
    if (activeChannel) return `#${activeChannel.name}`;
    if (page === "laboratory") return "Laboratorio";
    if (page === "settings") return l.breadSettings || "Settings";
    if (page === "skills") return l.breadSkills || "Skills";
    if (page === "logs") return l.breadLogs || "Logs";
    if (page === "plugins") return "Plugins";
    return "Factory";
  }, [activeProjectId, activeProjectName, activeAgent, activeChannel, page, l]);

  const sessionMatch = pathname.match(/\/session\/(.+?)(?:\/delegations)?$/);
  const sessionId = sessionMatch?.[1] ?? null;

  const { resolvedSessionId, resolving } = useSessionResolver({
    sessionId,
    activeProjectName: activeProjectId,
    activeProjectFriendlyName: activeProjectName,
    activeAgent,
    activeChannel,
    activeTeam,
    currentPage: page,
  });

  useEffect(() => {
    if (resolvedSessionId && !sessionId) {
      const context = {
        activeChannel,
        activeTeam,
        activeAgent,
        activeProjectName: activeProjectId,
        activeProjectFriendlyName: activeProjectName,
      };
      onNavigate(getSessionPath(resolvedSessionId, context));
    }
  }, [resolvedSessionId, sessionId, activeChannel, activeTeam, activeAgent, activeProjectId, activeProjectName, onNavigate]);

  const resolvingSession = !sessionId && page === "chat" && resolving;

  const contentElement = resolvingSession ? (
    <div className="absolute inset-0 flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  ) : (
    children
  );

  const isContextView = page === "chat" || page === "workspace" || page === "preview" || page === "laboratory" || page === "org" || page === "delegations";
  const showNewSessionButton = !isHome && isContextView && page !== "laboratory";

  const contextTabs = useMemo(() => {
    let basePath = "";
    if (activeChannel) basePath = `/channels/${activeChannel.id}`;
    else if (activeTeam) basePath = `/teams/${activeTeam.id}`;
    else if (activeAgent) basePath = `/agents/${activeAgent.id}`;
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
      }
    ];

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

    if (activeChannel || activeTeam) {
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
      if (activeChannel) {
        list.push({
          id: "benchmark",
          label: l.tabBenchmark || "Benchmark",
          path: `${basePath}/benchmarks`,
          icon: (
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
            </svg>
          ),
        });
      }
    }

    return list;
  }, [sessionId, activeProjectId, activeProjectName, activeAgent, activeChannel, activeTeam, l]);

  const breadcrumbsElement = (
    <Breadcrumbs
      page={page}
      activeProjectId={activeProjectId}
      activeProjectName={activeProjectName}
      activeAgent={activeAgent}
      activeChannel={activeChannel}
      selectedExpId={lab?.selectedExpId}
      experiments={lab?.experiments}
      onNavigate={onNavigate}
      l={l}
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
          {activeAgent && activeAgent.id !== "lab-architect" && (
            <button
              onClick={() => setShowAgentEdit(true)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-card transition-all cursor-pointer"
              title="Configurar agente"
            >
              <Settings size={14} />
            </button>
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
            activeChannel={activeChannel}
            activeTeam={activeTeam}
            onSelectSession={handleSelectSession}
            onNewSession={handleNewSession}
          />
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
          onHome={() => onSelectProject ? onSelectProject(null, null) : onNavigate("/")}
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
            >
              {sessionSidebarElement}
            </MobileSidebarOverlay>

            <main
              className={`absolute inset-x-0 top-0 ${
                sidebarOpen ? "bottom-14" : "bottom-0"
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
      </AnimatePresence>
    </>
  );
}
