import { SessionSidebar } from "@/components/sidebar/SessionSidebar";
import { SessionPopover } from "@/components/sidebar/SessionPopover";
import { Logo } from "@/components/ui/Logo";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { ReactNode } from "react";
import type { Route } from "@/hooks/useRouter";
import { useSessionResolver } from "@/hooks/useSessionResolver";
import { ExperimentPopover } from "@/components/sidebar/ExperimentPopover";

interface Props {
  route: Route;
  onNavigate: (path: string) => void;
  activeRepoName: string | null;
  activeRepoId?: string | null;
  activeAgent: { id: string; name: string } | null;
  activeChannel: { id: string; name: string } | null;
  onSelectRepo?: (repoId: string | null, repoName: string | null) => void;
  onSelectAgent?: (agent: { id: string; name: string } | null) => void;
  onSelectChannel?: (channel: { id: string; name: string } | null) => void;
  children: ReactNode;
  // Propiedades para Laboratorio
  selectedExpId?: string | null;
  onSelectExp?: (id: string | null) => void;
  experiments?: any[];
  onDeleteExperiment?: (id: string) => void;
  onCreateExperiment?: () => void;
  loadingExps?: boolean;
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
  onSelectExp,
  experiments = [],
  onDeleteExperiment,
  onCreateExperiment,
  loadingExps = false,
}: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionPopoverOpen, setSessionPopoverOpen] = useState(false);
  const [experimentPopoverOpen, setExperimentPopoverOpen] = useState(false);
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
        label: "Chat",
        path: sessionId ? `${basePath}/session/${sessionId}` : (basePath ? `${basePath}/chat` : "/"),
        icon: (
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        id: "workspace",
        label: "Files",
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
        label: "Preview",
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
        { label: "Proyectos", path: "/projects" },
        { label: currentRepoFriendly || currentRepo, path: `/repos/${currentRepo}/chat` }
      ];
    } else if (currentAgent) {
      items = [
        { label: "Agentes", path: "/agents" },
        { label: currentAgent.name, path: `/agents/${currentAgent.id}/chat` }
      ];
    } else if (currentChannel) {
      items = [
        { label: "Canales", path: "/channels" },
        { label: `#${currentChannel.name}`, path: `/channels/${currentChannel.id}/chat` }
      ];
    } else {
      items = [{ label: "Factory", path: "/" }];
    }

    if (route.page === "workspace") {
      items.push({ label: "Files" });
    } else if (route.page === "preview") {
      items.push({ label: "Preview" });
    } else if (route.page === "chat") {
      items.push({ label: "Chat" });
    } else if (route.page === "settings") {
      items = [{ label: "Settings" }];
    } else if (route.page === "skills") {
      items = [{ label: "Skills" }];
    } else if (route.page === "logs") {
      items = [{ label: "Logs" }];
    } else if (route.page === "projects") {
      items = [{ label: "Proyectos" }];
    } else if (route.page === "agents") {
      items = [{ label: "Agentes" }];
    } else if (route.page === "channels") {
      items = [{ label: "Canales" }];
    } else if (route.page === "channel") {
      items = [{ label: "Canales", path: "/channels" }];
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
                <span className="text-muted-foreground/60 font-normal select-none px-0.5 sm:px-1">/</span>
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
          />
        </aside>
        <main className="flex-1 min-w-0 flex flex-col h-full bg-background">
          {isContextView && (
            <div className="flex items-center justify-between px-4 border-b border-border bg-card/5 flex-shrink-0">
              <div className="flex gap-1">
                {route.page === "laboratory" ? (
                  <span className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-primary border-b-2 border-primary -mb-[1px]">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4.5 3h15" />
                      <path d="M6 3v6l6 9h-3.5a1 1 0 0 0 0 2h11a1 1 0 0 0 0-2H16l-6-9V3" />
                    </svg>
                    Laboratorio
                  </span>
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
                  <>
                    <button
                      onClick={() => setExperimentPopoverOpen((p) => !p)}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border border-border hover:bg-card text-muted-foreground hover:text-foreground transition-all cursor-pointer bg-card/10"
                      title="Ver experimentos"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4.5 3h15" />
                        <path d="M6 3v6l6 9h-3.5a1 1 0 0 0 0 2h11a1 1 0 0 0 0-2H16l-6-9V3" />
                      </svg>
                      <span>Experimentos</span>
                    </button>
                    <ExperimentPopover
                      isOpen={experimentPopoverOpen}
                      onClose={() => setExperimentPopoverOpen(false)}
                      experiments={experiments}
                      selectedExpId={selectedExpId}
                      onSelectExp={onSelectExp || (() => {})}
                      onCreateExperiment={onCreateExperiment || (() => {})}
                      onDeleteExperiment={onDeleteExperiment || (() => {})}
                      loading={loadingExps}
                    />
                  </>
                ) : (
                  <>
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
