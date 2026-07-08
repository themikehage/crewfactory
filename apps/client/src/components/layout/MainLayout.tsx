import { SessionSidebar } from "@/components/sidebar/SessionSidebar";
import { SessionPopover } from "@/components/sidebar/SessionPopover";
import { Logo } from "@/components/ui/Logo";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { ReactNode } from "react";
import { Plus, Home, Library, Settings, Terminal, Cpu, Clock } from "lucide-react";
import { PortalPopover } from "@/components/chat/PortalPopover";
import type { Route } from "@/hooks/useRouter";
import { useSessionResolver } from "@/hooks/useSessionResolver";
import { apiFetch } from "@/lib/api";
import { useLiterals } from "@/lib";
import { literals as u } from "./MainLayout.literals";
import { MobileTopbar } from "./MobileTopbar";
import { wsClient } from "@/lib/ws-client";
import { motion, AnimatePresence } from "framer-motion";

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
  // Propiedades para Laboratorio
  selectedExpId?: string | null;
  experiments?: any[];
  onDeleteExperiment?: (id: string) => void;
  activeVariantTab?: "chat" | "config" | "single" | "multiNoLeader" | "multiWithLeader" | "compare";
  setActiveVariantTab?: (tab: "chat" | "config" | "single" | "multiNoLeader" | "multiWithLeader" | "compare") => void;
  onRunExperiment?: (id: string) => void;
  onStopExperiment?: (id: string) => void;
  onEditExperiment?: (id: string) => void;
  onJudgeExperiment?: (id: string) => void;
  onExportExperiment?: (id: string) => void;
  isMobile?: boolean;
  canGoBack?: boolean;
  onBack?: () => void;
  // Run selector state (for clock icon in tab bar)
  selectedRunId?: string;
  pastRuns?: any[];
  runPopoverOpen?: boolean;
  setRunPopoverOpen?: (open: boolean) => void;
  onSelectRun?: (runId: string) => void;
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
  selectedExpId = null,
  experiments = [],
  onDeleteExperiment,
  activeVariantTab = "chat" as "chat" | "config" | "single" | "multiNoLeader" | "multiWithLeader" | "compare",
  setActiveVariantTab,
  onRunExperiment,
  onStopExperiment,
  onEditExperiment,
  onJudgeExperiment,
  onExportExperiment,
  isMobile = false,
  canGoBack = false,
  onBack,
  /* Run selector props */
  selectedRunId = "latest",
  pastRuns = [],
  runPopoverOpen = false,
  setRunPopoverOpen,
  onSelectRun,
}: Props) {
  const l = useLiterals(u);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const localRunTriggerRef = useRef<HTMLButtonElement>(null);
  const [sessionPopoverOpen, setSessionPopoverOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [quickCreating, setQuickCreating] = useState(false);
  const [wsConnected, setWsConnected] = useState(() => wsClient.getState() === "connected");
  const pendingWorkspaceFile = useRef<string | null>(null);

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

  const handleBackClick = useCallback(() => {
    if (onBack) {
      onBack();
    }
  }, [onBack]);

  const handleMenuToggle = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const handleNavigate = useCallback((path: string) => {
    onNavigate(path);
    setSidebarOpen(false);
  }, [onNavigate]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [activeProjectId, activeAgent?.id, activeChannel?.id, route.page]);

  useEffect(() => {
    const handleOpenWorkspace = (e: Event) => {
      const path = (e as CustomEvent<{ path?: string }>).detail?.path ?? null;
      if (route.page !== "workspace") {
        pendingWorkspaceFile.current = path;
        onNavigate("/workspace");
      }
    };
    window.addEventListener("openWorkspaceFile", handleOpenWorkspace);
    return () => {
      window.removeEventListener("openWorkspaceFile", handleOpenWorkspace);
    };
  }, [onNavigate, route.page]);

  useEffect(() => {
    if (route.page === "workspace" && pendingWorkspaceFile.current) {
      const path = pendingWorkspaceFile.current;
      pendingWorkspaceFile.current = null;
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("openWorkspaceFile", { detail: { path } }));
      }, 150);
    }
  }, [route.page]);

  useEffect(() => {
    const unsub = wsClient.onStateChange((state) => {
      setWsConnected(state === "connected");
    });
    return unsub;
  }, []);

  const getSessionPath = useCallback((id: string) => {
    if (activeChannel) return `/channels/${activeChannel.id}/session/${id}`;
    if (activeAgent) return `/agents/${activeAgent.id}/session/${id}`;
    if (activeProjectId) return `/projects/${activeProjectId}/session/${id}`;
    return `/session/${id}`;
  }, [activeChannel?.id, activeAgent?.id, activeProjectId]);

  const handleSelectSession = useCallback((id: string) => {
    if (id) {
      onNavigate(getSessionPath(id));
    } else {
      let basePath = "";
      if (activeChannel) basePath = `/channels/${activeChannel.id}/chat`;
      else if (activeAgent) basePath = `/agents/${activeAgent.id}/chat`;
      else if (activeProjectId) basePath = `/projects/${activeProjectId}/chat`;
      onNavigate(basePath || "/");
    }
    setSidebarOpen(false);
  }, [onNavigate, getSessionPath, activeChannel?.id, activeAgent?.id, activeProjectId]);

  const handleNewSession = useCallback((id: string) => {
    onNavigate(getSessionPath(id));
    setSidebarOpen(false);
  }, [onNavigate, getSessionPath]);

  const handleQuickCreate = useCallback(async () => {
    setQuickCreating(true);
    try {
      const res = await apiFetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Nueva sesion",
          projectName: activeProjectId || undefined,
          agentId: activeAgent?.id || undefined,
          channelId: activeChannel?.id || undefined,
        }),
      });
      if (!res.ok) return;
      const session = await res.json();
      onNavigate(getSessionPath(session.id));
      setSidebarOpen(false);
    } catch {
      // silently ignore
    } finally {
      setQuickCreating(false);
    }
  }, [onNavigate, getSessionPath, activeProjectId, activeAgent, activeChannel]);

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

  const isContextView = route.page === "chat" || route.page === "workspace" || route.page === "preview" || route.page === "laboratory";

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

    return list;
  }, [sessionId, activeProjectId, activeProjectName, activeAgent, activeChannel]);

  const renderBreadcrumbs = () => {
    let items: { label: string; path?: string }[] = [];

    const currentProject = activeProjectId;
    const currentProjectFriendly = activeProjectName || activeProjectId;
    const currentAgent = activeAgent;
    const currentChannel = activeChannel;

    if (currentProject) {
      items = [
        { label: l.breadProyectos, path: "/projects" },
        { label: currentProjectFriendly || currentProject, path: `/projects/${currentProject}/chat` }
      ];
    } else if (currentAgent) {
      items = [
        { label: l.breadAgentes, path: "/agents" },
        { label: currentAgent.name, path: `/agents/${currentAgent.id}/chat` }
      ];
    } else if (currentChannel) {
      items = [
        { label: l.breadCanales, path: "/channels" },
        { label: `#${currentChannel.name}`, path: `/channels/${currentChannel.id}/chat` }
      ];
    } else {
      items = [{ label: l.breadFactory, path: "/" }];
    }

    if (route.page === "workspace") {
      items.push({ label: l.tabFiles });
    } else if (route.page === "preview") {
      items.push({ label: l.tabPreview });
    } else if (route.page === "chat") {
      items.push({ label: l.tabChat });
    } else if (route.page === "settings") {
      items = [{ label: l.breadSettings }];
    } else if (route.page === "skills") {
      items = [{ label: l.breadSkills }];
    } else if (route.page === "logs") {
      items = [{ label: l.breadLogs }];
    } else if (route.page === "mcps") {
      items = [{ label: l.breadMcps || "MCP Marketplace" }];
    } else if (route.page === "projects") {
      items = [{ label: l.breadProyectos }];
    } else if (route.page === "agents") {
      items = [{ label: l.breadAgentes }];
    } else if (route.page === "channels") {
      items = [{ label: l.breadCanales }];
    } else if (route.page === "channel") {
      items = [{ label: l.breadCanales, path: "/channels" }];
      if (activeChannel) {
        items.push({ label: `#${activeChannel.name}` });
      }
    } else if (route.page === "laboratory") {
      items = [{ label: "Laboratorio", path: "/laboratory" }];
      if (selectedExpId) {
        const activeExp = experiments.find((e: any) => e.id === selectedExpId);
        items.push({ label: activeExp?.name || "Experimento" });
      }
    }

    return (
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm">
        <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-primary inline-block flex-shrink-0" />
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <div key={index} className="flex items-center gap-1 sm:gap-1.5">
              {index > 0 && (
                <span className="text-muted-foreground font-normal select-none px-0.5 sm:px-1">/</span>
              )}
              {item.path && !isLast ? (
                <button
                  onClick={() => onNavigate(item.path!)}
                  className="text-muted-foreground hover:text-foreground transition-colors font-medium cursor-pointer"
                >
                  {item.label}
                </button>
              ) : (
                <span
                  className={`${
                    isLast ? "font-semibold text-foreground" : "text-muted-foreground font-medium"
                  }`}
                >
                  {item.label}
                </span>
              )}
            </div>
          );
        })}
      </nav>
    );
  };
  return (
    <div className="h-dvh flex flex-col bg-background text-foreground overflow-hidden font-sans">
      {isMobile ? (
        <MobileTopbar
          isMobile={isMobile}
          isHome={isHome}
          title={mobileTitle}
          canGoBack={canGoBack}
          onBack={handleBackClick}
          onMenuToggle={handleMenuToggle}
          onNewSession={handleQuickCreate}
          showNewSessionButton={showNewSessionButton}
          l={l}
        />
      ) : (
        <header className="h-10 sm:h-12 border-b border-border px-2 sm:px-4 flex items-center justify-between flex-shrink-0 bg-card/30">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => onSelectProject ? onSelectProject(null, null) : onNavigate("/")}
              className="p-1 text-muted-foreground hover:text-foreground rounded cursor-pointer flex-shrink-0"
              title="Inicio"
            >
              <Logo size={20} className="sm:w-[22px] sm:h-[22px] w-[18px] h-[18px]" />
            </button>
            <button
              onClick={() => setSidebarOpen((p) => !p)}
              className="sm:hidden p-1 text-muted-foreground hover:text-foreground rounded flex-shrink-0"
              title="Toggle sidebar"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </button>
            {renderBreadcrumbs()}
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${wsConnected ? "bg-primary" : "bg-warning"}`}
              title={wsConnected ? "Connected" : "Reconnecting"}
            />
            <span className="text-[10px] text-muted-foreground/60">{wsConnected ? "online" : "offline"}</span>
          </div>
        </header>
      )}

      <div className="flex flex-1 min-h-0 relative overflow-hidden">
        {isMobile ? (
          <>
            {/* Sidebar for Mobile */}
            <AnimatePresence>
              {sidebarOpen && (
                <motion.aside
                  key={isHome ? "sidebar-home" : "sidebar-overlay"}
                  initial={{ x: isHome ? 0 : "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={{ duration: 0.25, ease: sidebarOpen ? "easeOut" : "easeIn" }}
                  className="fixed inset-0 z-50 w-full bg-background pb-14"
                >
                  <div className="h-12 px-3 flex items-center border-b border-border bg-card/30 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <Logo size={20} className="w-[20px] h-[20px]" />
                      <span className="text-base font-semibold text-foreground">Factory</span>
                    </div>
                  </div>
                  <SessionSidebar
                    activeProjectName={activeProjectId}
                    activeAgent={activeAgent}
                    activeChannel={activeChannel}
                    currentPage={route.page}
                    onNavigate={handleNavigate}
                    onSelectProject={onSelectProject}
                    onSelectAgent={onSelectAgent}
                    onSelectChannel={onSelectChannel}
                    selectedExpId={selectedExpId}
                    isMobile={true}
                  />
                </motion.aside>
              )}
            </AnimatePresence>

            {/* Backdrop for Mobile Overlay Sidebar */}
            <AnimatePresence>
              {sidebarOpen && !isHome && (
                <motion.div
                  key="mobile-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.5 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  onClick={() => setSidebarOpen(false)}
                  className="fixed inset-0 bg-black z-40"
                />
              )}
            </AnimatePresence>

            {/* Content for Mobile */}
            <AnimatePresence>
              <motion.main
                key={route.page + (activeProjectId || activeAgent?.id || activeChannel?.id || "")}
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={`absolute inset-x-0 top-0 ${isChatActive && !sidebarOpen ? "bottom-0" : "bottom-14"} z-30 flex flex-col bg-background`}
              >
                    {isContextView && (
                        <div className="flex items-center justify-between px-4 border-b border-border bg-card/5 flex-shrink-0">
                          <div className="flex gap-1 overflow-x-auto scrollbar-none flex-nowrap">
                            {route.page === "laboratory" ? (
                              selectedExpId ? (
                                (() => {
                                  const activeExp = experiments.find((e) => e.id === selectedExpId);
                                  const isCompleted = activeExp?.status === "completed";
                                  const variantDefs = [
                                    { key: "chat" as const, label: "Chat" },
                                    { key: "config" as const, label: "Config" },
                                    { key: "single" as const, label: "Baseline" },
                                    { key: "multiNoLeader" as const, label: "H. Horizontal" },
                                    { key: "multiWithLeader" as const, label: "H. Jerárquico" },
                                  ];
                                  return (
                                    <>
                                      {variantDefs.map(({ key: vKey, label }) => {
                                        const runData = activeExp?.variants?.[vKey];
                                        const hasResult = !!runData?.result;
                                        const isRunning = activeExp?.status === "running" && runData?.activeSessionId && !hasResult;
                                        const isActive = activeVariantTab === vKey;
                                        return (
                                          <button
                                            key={vKey}
                                            onClick={() => setActiveVariantTab?.(vKey)}
                                            className={`flex-none flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all cursor-pointer border-b-2 -mb-[1px] ${
                                              isActive
                                                ? "text-primary border-primary font-semibold"
                                                : "text-muted-foreground border-transparent hover:text-foreground hover:border-input"
                                            }`}
                                          >
                                            {label}
                                            {isRunning && (
                                              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                                            )}
                                            {hasResult && (
                                              <span className={`w-1.5 h-1.5 rounded-full ${runData.result?.status === "completed" ? "bg-primary" : "bg-destructive"}`} />
                                            )}
                                          </button>
                                        );
                                      })}
                                      {isCompleted && (
                                        <button
                                          onClick={() => setActiveVariantTab?.("compare")}
                                          className={`flex-none flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all cursor-pointer border-b-2 -mb-[1px] ${
                                            activeVariantTab === "compare"
                                              ? "text-primary border-primary font-semibold"
                                              : "text-muted-foreground border-transparent hover:text-foreground hover:border-input"
                                          }`}
                                        >
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M18 20V10M12 20V4M6 20v-6" />
                                          </svg>
                                          Comparativa
                                        </button>
                                      )}
                                    </>
                                  );
                                })()
                              ) : (
                                <span className="flex-none flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-primary border-b-2 border-primary -mb-[1px]">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                                  </svg>
                                  Generador IA
                                </span>
                              )
                            ) : (
                              contextTabs.map((tab) => {
                                const isActive = route.page === tab.id;
                                return (
                                  <button
                                    key={tab.id}
                                    onClick={() => handleNavigate(tab.path)}
                                    className={`flex-none flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all cursor-pointer border-b-2 -mb-[1px] ${
                                      isActive
                                        ? "text-primary border-primary font-semibold"
                                        : "text-muted-foreground border-transparent hover:text-foreground hover:border-input"
                                    }`}
                                  >
                                    <span className={isActive ? "text-primary" : "text-muted-foreground"}>
                                      {tab.icon}
                                    </span>
                                    {tab.label}
                                  </button>
                                );
                              })
                            )}
                          </div>

                      <div className="relative py-1 flex items-center gap-2">
                        {route.page === "laboratory" ? (
                          selectedExpId ? (
                            <>
                              {experiments.find((e: any) => e.id === selectedExpId)?.status === "running" && (
                                <span className="flex items-center gap-1.5 text-primary text-[10px] font-bold animate-pulse bg-primary/10 border border-primary/20 px-2 py-1 rounded-md">
                                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-ping" />
                                  Ejecutando...
                                </span>
                              )}

                              <div className="relative">
                                <button
                                  ref={localRunTriggerRef}
                                  onClick={() => setRunPopoverOpen?.(!runPopoverOpen)}
                                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-card transition-colors cursor-pointer"
                                  title="Historial de ejecuciones"
                                >
                                  <Clock size={14} />
                                </button>

                                <PortalPopover
                                  triggerRef={localRunTriggerRef as React.RefObject<HTMLElement | null>}
                                  open={runPopoverOpen}
                                  onClose={() => setRunPopoverOpen?.(false)}
                                  matchWidth
                                >
                                  <div className="overflow-hidden bg-[#171717] border border-border rounded-xl shadow-xl min-w-[200px]">
                                    <div className="py-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onSelectRun?.("latest");
                                          setRunPopoverOpen?.(false);
                                        }}
                                        className={`w-full text-left px-3 py-2 text-xs transition-colors cursor-pointer ${
                                          selectedRunId === "latest"
                                            ? "bg-primary/10 text-primary font-semibold"
                                            : "text-text-primary hover:bg-card-hover"
                                        }`}
                                      >
                                        Última ejecución (Activa)
                                      </button>
                                      {pastRuns.map((run: any) => (
                                        <button
                                          key={run.activeRunId || run.createdAt}
                                          type="button"
                                          onClick={() => {
                                            onSelectRun?.(run.activeRunId);
                                            setRunPopoverOpen?.(false);
                                          }}
                                          className={`w-full text-left px-3 py-2 text-xs transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                                            selectedRunId === run.activeRunId
                                              ? "bg-primary/10 text-primary font-semibold"
                                              : "text-text-primary hover:bg-card-hover"
                                          }`}
                                        >
                                          <span className="truncate">
                                            {new Date(
                                              run.completedAt || run.startedAt || run.createdAt
                                            ).toLocaleString()}
                                          </span>
                                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                                            run.status === "completed"
                                              ? "bg-success/15 text-success border border-success/20"
                                              : run.status === "running"
                                              ? "bg-primary/15 text-primary border border-primary/20"
                                              : run.status === "failed"
                                              ? "bg-error/15 text-error border border-error/20"
                                              : "bg-warning/15 text-warning border border-warning/20"
                                          }`}>
                                            {run.status}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </PortalPopover>
                              </div>

                              {experiments.find((e: any) => e.id === selectedExpId)?.status === "completed" && (
                                <button
                                  onClick={() => onExportExperiment?.(selectedExpId)}
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border border-primary/30 hover:border-primary hover:bg-primary/10 text-primary transition-all cursor-pointer bg-primary/5"
                                  title="Exportar tripulación a Workspace"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                                  </svg>
                                  <span>Exportar</span>
                                </button>
                              )}

                              <button
                                onClick={() => setActionsOpen((p) => !p)}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border border-border hover:bg-card text-muted-foreground hover:text-foreground transition-all cursor-pointer bg-card/10"
                                title="Opciones del Experimento"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="1.5" />
                                  <circle cx="12" cy="5" r="1.5" />
                                  <circle cx="12" cy="19" r="1.5" />
                                </svg>
                                <span>Opciones</span>
                              </button>
                              
                              {actionsOpen && (
                                <>
                                  <div className="fixed inset-0 z-45 bg-transparent" onClick={() => setActionsOpen(false)} />
                                  <div className="absolute right-0 top-full mt-2 w-40 bg-card border border-input rounded-xl shadow-2xl flex flex-col z-50 py-1 animate-scale-in text-left">
                                    {experiments.find((e) => e.id === selectedExpId)?.status === "running" ? (
                                      <button
                                        onClick={() => {
                                          setActionsOpen(false);
                                          onStopExperiment?.(selectedExpId);
                                        }}
                                        className="w-full px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-2 font-medium cursor-pointer"
                                      >
                                        <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
                                          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                                        </svg>
                                        Detener
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setActionsOpen(false);
                                          onRunExperiment?.(selectedExpId);
                                        }}
                                        className="w-full px-3 py-1.5 text-xs text-foreground hover:bg-card-hover transition-colors flex items-center gap-2 font-medium cursor-pointer"
                                      >
                                        <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24" className="text-primary">
                                          <path d="M8 5v14l11-7z" />
                                        </svg>
                                        Ejecutar
                                      </button>
                                    )}
                                    
                                    {experiments.find((e) => e.id === selectedExpId)?.status === "completed" && (
                                      <>
                                        <button
                                          onClick={() => {
                                            setActionsOpen(false);
                                            onJudgeExperiment?.(selectedExpId);
                                          }}
                                          className="w-full px-3 py-1.5 text-xs text-foreground hover:bg-card-hover transition-colors flex items-center gap-2 font-medium cursor-pointer"
                                        >
                                          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className="text-primary">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                                          </svg>
                                          Re-evaluar
                                        </button>
                                        <button
                                          onClick={() => {
                                            setActionsOpen(false);
                                            onExportExperiment?.(selectedExpId);
                                          }}
                                          className="w-full px-3 py-1.5 text-xs text-foreground hover:bg-card-hover transition-colors flex items-center gap-2 font-medium cursor-pointer"
                                        >
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                                          </svg>
                                          Exportar
                                        </button>
                                      </>
                                    )}

                                    <button
                                      onClick={() => {
                                        setActionsOpen(false);
                                        onEditExperiment?.(selectedExpId);
                                      }}
                                      className="w-full px-3 py-1.5 text-xs text-foreground hover:bg-card-hover transition-colors flex items-center gap-2 font-medium cursor-pointer"
                                    >
                                      <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className="text-blue-400">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                      </svg>
                                      Editar
                                    </button>
                                    
                                    <button
                                      onClick={() => {
                                        setActionsOpen(false);
                                        onDeleteExperiment?.(selectedExpId);
                                      }}
                                      className="w-full px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-2 font-medium cursor-pointer"
                                    >
                                      <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                      Eliminar
                                    </button>
                                  </div>
                                </>
                              )}
                            </>
                          ) : null
                        ) : (
                          <>
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
                      </div>
                    </div>
                  )}
                  <div className="flex-1 min-h-0 relative">
                    {children}
                  </div>
                </motion.main>
            </AnimatePresence>
            {(!isChatActive || sidebarOpen) && (
              <MobileBottomBar
                currentPage={route.page}
                isHome={isHome}
                onNavigate={handleNavigate}
                onSelectProject={onSelectProject}
                onSelectAgent={onSelectAgent}
                onSelectChannel={onSelectChannel}
                setSidebarOpen={setSidebarOpen}
              />
            )}
          </>
        ) : (
          <>
            {sidebarOpen && (
              <div
                className="fixed inset-0 z-40 bg-black/50 sm:hidden"
                onClick={() => setSidebarOpen(false)}
              />
            )}
            <aside
              className={`${
                sidebarOpen ? "translate-x-0" : "-translate-x-full"
              } fixed sm:relative sm:translate-x-0 z-50 sm:z-auto w-64 sm:w-64 flex-shrink-0 h-full border-r border-border bg-background transition-transform duration-200`}
            >
              <SessionSidebar
                activeProjectName={activeProjectId}
                activeAgent={activeAgent}
                activeChannel={activeChannel}
                currentPage={route.page}
                onNavigate={handleNavigate}
                onSelectProject={onSelectProject}
                onSelectAgent={onSelectAgent}
                onSelectChannel={onSelectChannel}
                selectedExpId={selectedExpId}
              />
            </aside>
            <main className="flex-1 min-w-0 flex flex-col h-full bg-background">
              {isContextView && (
                <div className="flex items-center justify-between px-4 border-b border-border bg-card/5 flex-shrink-0">
                  <div className="flex gap-1 overflow-x-auto scrollbar-none flex-nowrap">
                    {route.page === "laboratory" ? (
                      selectedExpId ? (
                        (() => {
                          const activeExp = experiments.find((e) => e.id === selectedExpId);
                          const isCompleted = activeExp?.status === "completed";
                          const variantDefs = [
                            { key: "chat" as const, label: "Chat" },
                            { key: "config" as const, label: "Config" },
                            { key: "single" as const, label: "Baseline" },
                            { key: "multiNoLeader" as const, label: "H. Horizontal" },
                            { key: "multiWithLeader" as const, label: "H. Jerárquico" },
                          ];
                          return (
                            <>
                              {variantDefs.map(({ key: vKey, label }) => {
                                const runData = activeExp?.variants?.[vKey];
                                const hasResult = !!runData?.result;
                                const isRunning = activeExp?.status === "running" && runData?.activeSessionId && !hasResult;
                                const isActive = activeVariantTab === vKey;
                                return (
                                  <button
                                    key={vKey}
                                    onClick={() => setActiveVariantTab?.(vKey)}
                                    className={`flex-none flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all cursor-pointer border-b-2 -mb-[1px] ${
                                      isActive
                                        ? "text-primary border-primary font-semibold"
                                        : "text-muted-foreground border-transparent hover:text-foreground hover:border-input"
                                    }`}
                                  >
                                    {label}
                                    {isRunning && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                                    )}
                                    {hasResult && (
                                      <span className={`w-1.5 h-1.5 rounded-full ${runData.result?.status === "completed" ? "bg-primary" : "bg-destructive"}`} />
                                    )}
                                  </button>
                                );
                              })}
                              {isCompleted && (
                                <button
                                  onClick={() => setActiveVariantTab?.("compare")}
                                  className={`flex-none flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all cursor-pointer border-b-2 -mb-[1px] ${
                                    activeVariantTab === "compare"
                                      ? "text-primary border-primary font-semibold"
                                      : "text-muted-foreground border-transparent hover:text-foreground hover:border-input"
                                  }`}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 20V10M12 20V4M6 20v-6" />
                                  </svg>
                                  Comparativa
                                </button>
                              )}
                            </>
                          );
                        })()
                      ) : (
                        <span className="flex-none flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-primary border-b-2 border-primary -mb-[1px]">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                          </svg>
                          Generador IA
                        </span>
                      )
                    ) : (
                      contextTabs.map((tab) => {
                        const isActive = route.page === tab.id;
                        return (
                          <button
                            key={tab.id}
                            onClick={() => handleNavigate(tab.path)}
                            className={`flex-none flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all cursor-pointer border-b-2 -mb-[1px] ${
                              isActive
                                ? "text-primary border-primary font-semibold"
                                : "text-muted-foreground border-transparent hover:text-foreground hover:border-input"
                            }`}
                          >
                            <span className={isActive ? "text-primary" : "text-muted-foreground"}>
                              {tab.icon}
                            </span>
                            {tab.label}
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="relative py-1 flex items-center gap-2">
                    {route.page === "laboratory" ? (
                      selectedExpId ? (
                        <>
                          <button
                            onClick={() => setActionsOpen((p) => !p)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border border-border hover:bg-card text-muted-foreground hover:text-foreground transition-all cursor-pointer bg-card/10"
                            title="Opciones del Experimento"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="1.5" />
                              <circle cx="12" cy="5" r="1.5" />
                              <circle cx="12" cy="19" r="1.5" />
                            </svg>
                            <span>Opciones</span>
                          </button>
                          
                          {actionsOpen && (
                            <>
                              <div className="fixed inset-0 z-45 bg-transparent" onClick={() => setActionsOpen(false)} />
                              <div className="absolute right-0 top-full mt-2 w-40 bg-card border border-input rounded-xl shadow-2xl flex flex-col z-50 py-1 animate-scale-in text-left">
                                {experiments.find((e) => e.id === selectedExpId)?.status === "running" ? (
                                  <button
                                    onClick={() => {
                                      setActionsOpen(false);
                                      onStopExperiment?.(selectedExpId);
                                    }}
                                    className="w-full px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-2 font-medium cursor-pointer"
                                  >
                                    <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                                    </svg>
                                    Detener
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setActionsOpen(false);
                                      onRunExperiment?.(selectedExpId);
                                    }}
                                    className="w-full px-3 py-1.5 text-xs text-foreground hover:bg-card-hover transition-colors flex items-center gap-2 font-medium cursor-pointer"
                                  >
                                    <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24" className="text-primary">
                                      <path d="M8 5v14l11-7z" />
                                    </svg>
                                    Ejecutar
                                  </button>
                                )}
                                
                                {experiments.find((e) => e.id === selectedExpId)?.status === "completed" && (
                                  <button
                                    onClick={() => {
                                      setActionsOpen(false);
                                      onJudgeExperiment?.(selectedExpId);
                                    }}
                                    className="w-full px-3 py-1.5 text-xs text-foreground hover:bg-card-hover transition-colors flex items-center gap-2 font-medium cursor-pointer"
                                  >
                                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className="text-primary">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                                    </svg>
                                    Re-evaluar
                                  </button>
                                )}

                                <button
                                  onClick={() => {
                                    setActionsOpen(false);
                                    onEditExperiment?.(selectedExpId);
                                  }}
                                  className="w-full px-3 py-1.5 text-xs text-foreground hover:bg-card-hover transition-colors flex items-center gap-2 font-medium cursor-pointer"
                                >
                                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className="text-blue-400">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                  </svg>
                                  Editar
                                </button>
                                
                                <button
                                  onClick={() => {
                                    setActionsOpen(false);
                                    onDeleteExperiment?.(selectedExpId);
                                  }}
                                  className="w-full px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-2 font-medium cursor-pointer"
                                >
                                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  Eliminar
                                </button>
                              </div>
                            </>
                          )}
                        </>
                      ) : null
                    ) : (
                      <>
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
                  </div>
                </div>
              )}
              <div className="flex-1 min-h-0 relative">
                {children}
              </div>
            </main>
          </>
        )}
      </div>
    </div>
  );
}

interface MobileBottomBarProps {
  currentPage: string;
  isHome: boolean;
  onNavigate: (path: string) => void;
  onSelectProject?: (projectId: string | null, projectName: string | null) => void;
  onSelectAgent?: (agent: { id: string; name: string; avatarUrl?: string } | null) => void;
  onSelectChannel?: (channel: { id: string; name: string } | null) => void;
  setSidebarOpen: (open: boolean) => void;
}

function MobileBottomBar({
  currentPage,
  isHome,
  onNavigate,
  onSelectProject,
  onSelectAgent,
  onSelectChannel,
  setSidebarOpen,
}: MobileBottomBarProps) {
  const tabs = [
    { id: "home", label: "Home", icon: <Home size={20} /> },
    { id: "skills", label: "Skills", icon: <Library size={20} /> },
    { id: "settings", label: "Settings", icon: <Settings size={20} /> },
    { id: "logs", label: "Logs", icon: <Terminal size={20} /> },
    { id: "plugins", label: "Plugins", icon: <Cpu size={20} /> },
  ];

  const handleTabClick = (tabId: string) => {
    setSidebarOpen(false);
    if (tabId === "home") {
      if (onSelectProject) onSelectProject(null, null);
      if (onSelectAgent) onSelectAgent(null);
      if (onSelectChannel) onSelectChannel(null);
      onNavigate("/");
    } else if (tabId === "skills") {
      onNavigate("/skills");
    } else if (tabId === "settings") {
      localStorage.setItem("settings-active-tab", "providers");
      onNavigate("/settings");
    } else if (tabId === "logs") {
      onNavigate("/logs");
    } else if (tabId === "plugins") {
      onNavigate("/plugins");
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 h-14 bg-[#171717]/95 border-t border-border flex items-center justify-around z-50 backdrop-blur-md px-2">
      {tabs.map((tab) => {
        let active = false;
        if (tab.id === "home") {
          active = isHome;
        } else {
          active = currentPage === tab.id;
        }

        return (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={`flex flex-col items-center justify-center flex-1 py-1 h-full cursor-pointer transition-colors ${
              active ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            <span className="text-[10px] mt-0.5">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
