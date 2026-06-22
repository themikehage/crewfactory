import { SessionSidebar } from "@/components/sidebar/SessionSidebar";
import { useState, useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { Route } from "@/hooks/useRouter";

interface Props {
  route: Route;
  onNavigate: (path: string) => void;
  activeRepoName: string | null;
  onLeaveContext: () => void;
  children: ReactNode;
}

export function MainLayout({ route, onNavigate, activeRepoName, onLeaveContext, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  const handleSelectSession = useCallback((id: string) => {
    if (id) {
      onNavigate(`/session/${id}`);
    } else {
      onNavigate("/");
    }
    setSidebarOpen(false);
  }, [onNavigate]);

  const handleNewSession = useCallback((id: string) => {
    onNavigate(`/session/${id}`);
    setSidebarOpen(false);
  }, [onNavigate]);

  const handleOpenSettings = useCallback(() => {
    onNavigate("/settings");
  }, [onNavigate]);

  const handleOpenSkills = useCallback(() => {
    onNavigate("/skills");
  }, [onNavigate]);

  const isChat = route.page === "chat";
  const sessionId = route.page === "chat" ? route.sessionId : null;

  const getPageName = () => {
    const contextName = activeRepoName ? `${activeRepoName}` : "Global";
    switch (route.page) {
      case "settings":
        return `Settings [${contextName}]`;
      case "skills":
        return `Skills [${contextName}]`;
      case "workspace":
        return `Workspace [${contextName}]`;
      default:
        return route.sessionId ? `Chat [${contextName}]` : `Pi Web [${contextName}]`;
    }
  };

  return (
    <div className="h-dvh flex flex-col bg-bg text-text-primary font-sans">
      <header className="h-10 sm:h-12 flex items-center justify-between px-3 sm:px-4 border-b border-surface flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onLeaveContext}
            className="px-2.5 py-1 text-xs bg-surface hover:bg-accent hover:text-bg text-text-primary border border-surface-hover rounded-md transition-colors cursor-pointer mr-2 flex items-center gap-1 font-semibold"
            title="Volver al Dashboard de Proyectos"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Proyectos
          </button>
          <div
            onClick={isChat ? () => setSidebarOpen(!sidebarOpen) : () => onNavigate("/")}
            className="p-1 text-accent hover:text-accent/80 cursor-pointer transition-colors"
            title={isChat ? "Toggle Sessions Sidebar" : "Go to Home"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 17L10 11L4 5" />
              <path d="M12 19H20" />
            </svg>
          </div>
          <span className="text-text-secondary/30 select-none text-xs sm:text-sm">/</span>
          <span className="font-display font-bold text-text-primary text-xs sm:text-sm select-none">
            {getPageName()}
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={() => onNavigate("/workspace")}
            className={`p-1 cursor-pointer transition-colors ${
              route.page === "workspace"
                ? "text-accent"
                : "text-text-secondary hover:text-text-primary"
            }`}
            title="Workspace"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="sm:w-[18px] sm:h-[18px]">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
          </button>
          <button
            onClick={handleOpenSkills}
            className={`p-1 cursor-pointer transition-colors ${
              route.page === "skills"
                ? "text-accent"
                : "text-text-secondary hover:text-text-primary"
            }`}
            title="Skills Library"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="sm:w-[18px] sm:h-[18px]">
              <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
            </svg>
          </button>
          <button
            onClick={handleOpenSettings}
            className={`p-1 cursor-pointer transition-colors ${
              route.page === "settings"
                ? "text-accent"
                : "text-text-secondary hover:text-text-primary"
            }`}
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="sm:w-[18px] sm:h-[18px]">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </header>
      <div className="flex flex-1 min-h-0 relative">
        {isChat && sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 sm:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        {isChat && (
          <aside
            className={`${
              sidebarOpen ? "translate-x-0" : "-translate-x-full"
            } fixed sm:relative sm:translate-x-0 z-50 sm:z-auto w-64 sm:w-64 flex-shrink-0 h-full border-r border-surface bg-bg transition-transform duration-200`}
          >
            <SessionSidebar
              activeSessionId={sessionId}
              activeRepoName={activeRepoName}
              onSelectSession={handleSelectSession}
              onNewSession={handleNewSession}
            />
          </aside>
        )}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
