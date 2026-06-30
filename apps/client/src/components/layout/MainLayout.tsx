import { SessionSidebar } from "@/components/sidebar/SessionSidebar";
import { Logo } from "@/components/ui/Logo";
import { useState, useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { Route } from "@/hooks/useRouter";

interface Props {
  route: Route;
  onNavigate: (path: string) => void;
  activeRepoName: string | null;
  activeAgent: { id: string; name: string } | null;
  activeChannel: { id: string; name: string } | null;
  onSelectRepo?: (repoName: string | null) => void;
  children: ReactNode;
}

export function MainLayout({ route, onNavigate, activeRepoName, activeAgent, activeChannel = null, onSelectRepo, children }: Props) {
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

  const sessionId = route.page === "chat" ? route.sessionId : null;

  const renderBreadcrumbs = () => {
    let items: { label: string; path?: string }[] = [];

    const contextLabel = activeChannel
      ? `Channel: #${activeChannel.name}`
      : activeAgent
      ? `Agent: ${activeAgent.name}`
      : activeRepoName
      ? `${activeRepoName}`
      : "Global";

    switch (route.page) {
      case "projects":
        items = [{ label: "Proyectos", path: "/projects" }];
        break;
      case "settings":
        items = [{ label: "Settings", path: "/settings" }];
        if (contextLabel) items.push({ label: contextLabel });
        break;
      case "skills":
        items = [{ label: "Skills", path: "/skills" }];
        if (contextLabel) items.push({ label: contextLabel });
        break;
      case "workspace":
        items = [{ label: "Workspace", path: "/workspace" }];
        if (contextLabel) items.push({ label: contextLabel });
        break;
      case "preview":
        items = [{ label: "Preview", path: "/preview" }];
        if (activeRepoName) items.push({ label: activeRepoName });
        break;
      case "agents":
        items = [{ label: "Agents", path: "/agents" }];
        break;
      case "channels":
        items = [{ label: "Channels", path: "/channels" }];
        break;
      case "channel":
        items = [{ label: "Channels", path: "/channels" }];
        if (activeChannel) {
          items.push({ label: `#${activeChannel.name}` });
        }
        break;
      default:
        // "chat"
        items = [{ label: "Chat", path: "/" }];
        if (contextLabel) {
          items.push({ label: contextLabel });
        }
        break;
    }

    return (
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm">
        <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-accent inline-block flex-shrink-0" />
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <div key={index} className="flex items-center gap-1 sm:gap-1.5">
              {index > 0 && (
                <span className="text-text-secondary/60 font-normal select-none px-0.5 sm:px-1">/</span>
              )}
              {item.path && !isLast ? (
                <button
                  onClick={() => onNavigate(item.path!)}
                  className="text-text-secondary hover:text-text-primary transition-colors font-medium cursor-pointer"
                >
                  {item.label}
                </button>
              ) : (
                <span
                  className={`${
                    isLast ? "font-semibold text-text-primary" : "text-text-secondary font-medium"
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
    <div className="h-dvh flex flex-col bg-bg text-text-primary overflow-hidden font-sans">
      <header className="h-10 sm:h-12 border-b border-surface px-2 sm:px-4 flex items-center justify-between flex-shrink-0 bg-surface/30">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => onSelectRepo ? onSelectRepo(null) : onNavigate("/")}
            className="p-1 text-text-secondary hover:text-text-primary rounded cursor-pointer flex-shrink-0"
            title="Inicio"
          >
            <Logo size={20} className="sm:w-[22px] sm:h-[22px] w-[18px] h-[18px]" />
          </button>
          <button
            onClick={() => setSidebarOpen((p) => !p)}
            className="sm:hidden p-1 text-text-secondary hover:text-text-primary rounded flex-shrink-0"
            title="Toggle sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
          </button>
          {renderBreadcrumbs()}
        </div>
        <div className="flex items-center">
          {/* Vacío en barra superior derecha, toda la navegación está en el sidebar */}
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
          } fixed sm:relative sm:translate-x-0 z-50 sm:z-auto w-64 sm:w-64 flex-shrink-0 h-full border-r border-surface bg-bg transition-transform duration-200`}
        >
          <SessionSidebar
            activeSessionId={sessionId}
            activeRepoName={activeRepoName}
            activeAgent={activeAgent}
            activeChannel={activeChannel}
            onSelectSession={handleSelectSession}
            onNewSession={handleNewSession}
            currentPage={route.page}
            onNavigate={onNavigate}
            onSelectRepo={onSelectRepo}
          />
        </aside>
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
