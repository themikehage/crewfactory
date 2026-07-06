import { SessionSidebar } from "@/components/sidebar/SessionSidebar";
import { SessionPopover } from "@/components/sidebar/SessionPopover";
import { Logo } from "@/components/ui/Logo";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import type { Route } from "@/hooks/useRouter";
import { useSessionResolver } from "@/hooks/useSessionResolver";
import { apiFetch } from "@/lib/api";
import { useLiterals } from "@/lib";
import { literals as u } from "./MainLayout.literals";

interface Props {
  route: Route;
  onNavigate: (path: string) => void;
  activeRepoName: string | null;
  activeRepoId?: string | null;
  activeAgent: { id: string; name: string; avatarUrl?: string } | null;
  activeChannel: { id: string; name: string } | null;
  onSelectRepo?: (repoId: string | null, repoName: string | null) => void;
  onSelectAgent?: (agent: { id: string; name: string; avatarUrl?: string } | null) => void;
  onSelectChannel?: (channel: { id: string; name: string } | null) => void;
  children: ReactNode;
  // Propiedades para Laboratorio
  selectedExpId?: string | null;
  experiments?: any[];
  onDeleteExperiment?: (id: string) => void;
  activeVariantTab?: "single" | "multiNoLeader" | "multiWithLeader" | "compare";
  setActiveVariantTab?: (tab: "single" | "multiNoLeader" | "multiWithLeader" | "compare") => void;
  onRunExperiment?: (id: string) => void;
  onStopExperiment?: (id: string) => void;
  onEditExperiment?: (id: string) => void;
  onJudgeExperiment?: (id: string) => void;
}

export function MainLayout({
  route,
  onNavigate,
  activeRepoName,
  activeRepoId = null,
  activeAgent,
  activeChannel = null,
  onSelectRepo,
  onSelectAgent,
  onSelectChannel,
  children,
  selectedExpId = null,
  experiments = [],
  onDeleteExperiment,
  activeVariantTab = "single" as "single" | "multiNoLeader" | "multiWithLeader" | "compare",
  setActiveVariantTab,
  onRunExperiment,
  onStopExperiment,
  onEditExperiment,
  onJudgeExperiment,
}: Props) {
  const l = useLiterals(u);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionPopoverOpen, setSessionPopoverOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [quickCreating, setQuickCreating] = useState(false);
  const pendingWorkspaceFile = useRef<string | null>(null);

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

  const getSessionPath = useCallback((id: string) => {
    if (activeChannel) return `/channels/${activeChannel.id}/session/${id}`;
    if (activeAgent) return `/agents/${activeAgent.id}/session/${id}`;
    if (activeRepoId) return `/repos/${activeRepoId}/session/${id}`;
    return `/session/${id}`;
  }, [activeChannel?.id, activeAgent?.id, activeRepoId]);

  const handleSelectSession = useCallback((id: string) => {
    if (id) {
      onNavigate(getSessionPath(id));
    } else {
      let basePath = "";
      if (activeChannel) basePath = `/channels/${activeChannel.id}/chat`;
      else if (activeAgent) basePath = `/agents/${activeAgent.id}/chat`;
      else if (activeRepoId) basePath = `/repos/${activeRepoId}/chat`;
      onNavigate(basePath || "/");
    }
    setSidebarOpen(false);
  }, [onNavigate, getSessionPath, activeChannel?.id, activeAgent?.id, activeRepoId]);

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
          repoName: activeRepoId || undefined,
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
  }, [onNavigate, getSessionPath, activeRepoId, activeAgent, activeChannel]);

  const sessionId = route.page === "chat" ? route.sessionId : null;

  useSessionResolver({
    sessionId,
    activeRepoName: activeRepoId,
    activeRepoFriendlyName: activeRepoName,
    activeAgent,
    activeChannel,
    currentPage: route.page,
    onNavigate,
  });

  const isContextView = route.page === "chat" || route.page === "workspace" || route.page === "preview" || route.page === "laboratory";

  const contextTabs = useMemo(() => {
    let basePath = "";
    if (activeChannel) basePath = `/channels/${activeChannel.id}`;
    else if (activeAgent) basePath = `/agents/${activeAgent.id}`;
    else if (activeRepoId) basePath = `/repos/${activeRepoId}`;

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

    if (activeRepoName || activeRepoId) {
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
  }, [sessionId, activeRepoId, activeRepoName, activeAgent, activeChannel]);

  const renderBreadcrumbs = () => {
    let items: { label: string; path?: string }[] = [];

    const currentRepo = activeRepoId;
    const currentRepoFriendly = activeRepoName || activeRepoId;
    const currentAgent = activeAgent;
    const currentChannel = activeChannel;

    if (currentRepo) {
      items = [
        { label: l.breadProyectos, path: "/projects" },
        { label: currentRepoFriendly || currentRepo, path: `/repos/${currentRepo}/chat` }
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
      <header className="h-10 sm:h-12 border-b border-border px-2 sm:px-4 flex items-center justify-between flex-shrink-0 bg-card/30">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => onSelectRepo ? onSelectRepo(null, null) : onNavigate("/")}
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
      </header>
      <div className="flex flex-1 min-h-0 relative">
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
            activeRepoName={activeRepoId}
            activeAgent={activeAgent}
            activeChannel={activeChannel}
            currentPage={route.page}
            onNavigate={onNavigate}
            onSelectRepo={onSelectRepo}
            onSelectAgent={onSelectAgent}
            onSelectChannel={onSelectChannel}
            selectedExpId={selectedExpId}
          />
        </aside>
        <main className="flex-1 min-w-0 flex flex-col h-full bg-background">
          {isContextView && (
            <div className="flex items-center justify-between px-4 border-b border-border bg-card/5 flex-shrink-0">
              <div className="flex gap-1">
                {route.page === "laboratory" ? (
                  selectedExpId ? (
                    (() => {
                      const activeExp = experiments.find((e) => e.id === selectedExpId);
                      const isCompleted = activeExp?.status === "completed";
                      const variantDefs = [
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
                                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all cursor-pointer border-b-2 -mb-[1px] ${
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
                              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all cursor-pointer border-b-2 -mb-[1px] ${
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
                    <span className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-primary border-b-2 border-primary -mb-[1px]">
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
                        onClick={() => onNavigate(tab.path)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all cursor-pointer border-b-2 -mb-[1px] ${
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

              {/* Botón de sesiones o experimentos pegado a la derecha en la barra de pestañas */}
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
                            {/* Run/Stop */}
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
                            
                            {/* Re-evaluar con Judge (solo cuando completed) */}
                            {experiments.find((e) => e.id === selectedExpId)?.status === "completed" && (
                              <button
                                onClick={() => {
                                  setActionsOpen(false);
                                  onJudgeExperiment?.(selectedExpId);
                                }}
                                className="w-full px-3 py-1.5 text-xs text-foreground hover:bg-card-hover transition-colors flex items-center gap-2 font-medium cursor-pointer"
                              >
                                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className="text-primary">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                                </svg>
                                Re-evaluar
                              </button>
                            )}

                            {/* Edit */}
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
                            
                            {/* Delete */}
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
                      title="Ver sesiones"
                    >
                      <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.8 2.8a1 1 0 101.414-1.414L11 10.586V6z" clipRule="evenodd" />
                      </svg>
                      <span>Sesiones</span>
                    </button>
                    <SessionPopover
                      isOpen={sessionPopoverOpen}
                      onClose={() => setSessionPopoverOpen(false)}
                      activeSessionId={sessionId}
                      activeRepoName={activeRepoId}
                      activeRepoFriendlyName={activeRepoName}
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
      </div>
    </div>
  );
}
