import { useState, useMemo, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import type { Route } from "@/hooks/useRouter";
import { useSessionResolver } from "@/hooks/useSessionResolver";
import { useLiterals } from "@/lib";
import { literals as u } from "./MainLayout.literals";
import { MobileTopbar } from "./MobileTopbar";
import { wsClient } from "@/lib/ws-client";
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
  route: Route;
  onNavigate: (path: string) => void;
  activeProjectName: string | null;
  activeProjectId?: string | null;
  activeAgent: { id: string; name: string; avatarUrl?: string } | null;
  activeChannel: { id: string; name: string } | null;
  onSelectProject?: (projectId: string | null, projectName: string | null) => void;
  onSelectAgent?: (agent: { id: string; name: string; avatarUrl?: string } | null) => void;
  onSelectChannel?: (channel: { id: string; name: string } | null) => void;
  children: ReactNode;
  isMobile?: boolean;
  canGoBack?: boolean;
  onBack?: () => void;
  lab?: LabProps;
}

export function MainLayout({
  route,
  onNavigate,
  activeProjectName,
  activeProjectId = null,
  activeAgent,
  activeChannel = null,
  onSelectProject,
  onSelectAgent,
  onSelectChannel,
  children,
  isMobile = false,
  canGoBack = false,
  onBack,
  lab,
}: Props) {
  const l = useLiterals(u);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionPopoverOpen, setSessionPopoverOpen] = useState(false);
  const [wsConnected, setWsConnected] = useState(() => wsClient.getState() === "connected");

  useEffect(() => {
    const unsub = wsClient.onStateChange((state) => {
      setWsConnected(state === "connected");
    });
    return unsub;
  }, []);

  // Hooks extraídos
  useWorkspaceNavigation(route, onNavigate);

  const {
    quickCreating,
    handleSelectSession,
    handleNewSession,
    handleQuickCreate,
  } = useSessionActions({
    activeProjectId,
    activeAgent,
    activeChannel,
    onNavigate,
    setSidebarOpen,
  });

  const handleBackClick = useCallback(() => {
    if (onBack) {
      onBack();
    }
  }, [onBack]);

  const isHome = isMobile && !activeProjectId && !activeAgent && !activeChannel && route.page === "chat";
  const isChatActive = route.page === "chat" && !isHome;

  const mobileTitle = useMemo(() => {
    if (activeProjectId) return activeProjectName || activeProjectId;
    if (activeAgent) return activeAgent.name;
    if (activeChannel) return `#${activeChannel.name}`;
    if (route.page === "laboratory") return "Laboratorio";
    if (route.page === "settings") return l.breadSettings || "Settings";
    if (route.page === "skills") return l.breadSkills || "Skills";
    if (route.page === "logs") return l.breadLogs || "Logs";
    if (route.page === "mcps") return l.breadMcps || "MCP Marketplace";
    if (route.page === "plugins") return "Plugins";
    return "Factory";
  }, [activeProjectId, activeProjectName, activeAgent, activeChannel, route.page, l]);

  const sessionId = route.page === "chat" ? route.sessionId : null;

  useSessionResolver({
    sessionId,
    activeProjectName: activeProjectId,
    activeProjectFriendlyName: activeProjectName,
    activeAgent,
    activeChannel,
    currentPage: route.page,
    onNavigate,
  });

  const isContextView = route.page === "chat" || route.page === "workspace" || route.page === "preview" || route.page === "laboratory" || route.page === "org";
  const showNewSessionButton = !isHome && isContextView && route.page !== "laboratory";

  const contextTabs = useMemo(() => {
    let basePath = "";
    if (activeChannel) basePath = `/channels/${activeChannel.id}`;
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

    if (activeChannel) {
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
  }, [sessionId, activeProjectId, activeProjectName, activeAgent, activeChannel, l]);

  const breadcrumbsElement = (
    <Breadcrumbs
      route={route}
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
      {route.page === "laboratory" ? (
        lab?.selectedExpId ? (
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
        ) : null
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
            onSelectSession={handleSelectSession}
            onNewSession={handleNewSession}
          />
        </>
      )}
    </>
  );

  const sharedTabBar = (
    <ContextTabBar
      route={route}
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
      activeProjectName={activeProjectId}
      activeAgent={activeAgent}
      activeChannel={activeChannel}
      currentPage={route.page}
      onNavigate={onNavigate}
      onSelectProject={onSelectProject}
      onSelectAgent={onSelectAgent}
      onSelectChannel={onSelectChannel}
      selectedExpId={lab?.selectedExpId}
      isMobile={isMobile}
      onCloseSidebar={() => setSidebarOpen(false)}
    />
  );

  return (
    <div className="h-dvh flex flex-col bg-background text-foreground overflow-hidden font-sans">
      {isMobile ? (
        <MobileTopbar
          isMobile={isMobile}
          isHome={isHome}
          title={mobileTitle}
          canGoBack={canGoBack}
          onBack={handleBackClick}
          onMenuToggle={() => setSidebarOpen((prev) => !prev)}
          onNewSession={handleQuickCreate}
          showNewSessionButton={showNewSessionButton}
          l={l}
        />
      ) : (
        <DesktopHeader
          onHome={() => onSelectProject ? onSelectProject(null, null) : onNavigate("/")}
          onToggleSidebar={() => setSidebarOpen((p) => !p)}
          wsConnected={wsConnected}
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
                isChatActive && !sidebarOpen ? "bottom-0" : "bottom-14"
              } z-30 flex flex-col bg-background`}
            >
              {isContextView && sharedTabBar}
              <div className="flex-1 min-h-0 relative">{children}</div>
            </main>

            {(!isChatActive || sidebarOpen) && (
              <MobileBottomBar
                currentPage={route.page}
                isHome={isHome}
                onNavigate={onNavigate}
                onSelectProject={onSelectProject}
                onSelectAgent={onSelectAgent}
                onSelectChannel={onSelectChannel}
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
              <div className="flex-1 min-h-0 relative">{children}</div>
            </main>
          </>
        )}
      </div>
    </div>
  );
}
