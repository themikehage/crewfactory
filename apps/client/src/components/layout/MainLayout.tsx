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

  const handleOpenSettings = useCallback(() => {
    onNavigate("/settings");
  }, [onNavigate]);

  const handleOpenSkills = useCallback(() => {
    onNavigate("/skills");
  }, [onNavigate]);

  const isChat = route.page === "chat";
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
          {isChat && (
            <button
              onClick={() => setSidebarOpen((p) => !p)}
              className="sm:hidden p-1 text-text-secondary hover:text-text-primary rounded flex-shrink-0"
              title="Toggle sessions"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          {renderBreadcrumbs()}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => onNavigate("/projects")}
            className={`p-1 cursor-pointer transition-colors ${
              route.page === "projects"
                ? "text-accent"
                : "text-text-secondary hover:text-text-primary"
            }`}
            title="Projects"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="sm:w-[18px] sm:h-[18px]">
              <path d="M7 3a1 1 0 000 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L12.586 3H7z" />
              <path d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586l-1 1H16v8H4V6h1.586l-1-1H4z" />
            </svg>
          </button>
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
          {activeRepoName && (
            <button
              onClick={() => onNavigate("/preview")}
              className={`p-1 cursor-pointer transition-colors ${
                route.page === "preview"
                  ? "text-accent"
                  : "text-text-secondary hover:text-text-primary"
              }`}
              title="Preview"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="sm:w-[18px] sm:h-[18px]">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          <button
            onClick={() => onNavigate("/agents")}
            className={`p-1 cursor-pointer transition-colors ${
              route.page === "agents"
                ? "text-accent"
                : "text-text-secondary hover:text-text-primary"
            }`}
            title="Agents"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="sm:w-[18px] sm:h-[18px]">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
            </svg>
          </button>
          <button
            onClick={() => onNavigate("/channels")}
            className={`p-1 cursor-pointer transition-colors font-bold text-sm ${
              route.page === "channels" || route.page === "channel"
                ? "text-accent"
                : "text-text-secondary hover:text-text-primary"
            }`}
            title="Channels"
          >
            #
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
              activeAgent={activeAgent}
              activeChannel={activeChannel}
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
