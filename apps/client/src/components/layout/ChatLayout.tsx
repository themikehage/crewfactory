import { useAuth } from "@/contexts/AuthContext";
import { SessionSidebar } from "@/components/sidebar/SessionSidebar";
import { ChatArea } from "@/components/chat/ChatArea";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { useState, useCallback } from "react";

interface Props {
  sessionId: string | null;
  onNavigate: (path: string) => void;
}

export function ChatLayout({ sessionId, onNavigate }: Props) {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);

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

  return (
    <div className="h-dvh flex flex-col bg-bg">
      <header className="h-10 sm:h-12 flex items-center justify-between px-3 sm:px-4 border-b border-surface flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-text-secondary hover:text-text-primary transition-colors p-1"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" className="sm:w-5 sm:h-5">
              <path d="M3 4h14v2H3V4zm0 5h14v2H3V9zm0 5h14v2H3v-2z" />
            </svg>
          </button>
          <h1 className="font-display font-bold text-text-primary text-xs sm:text-sm">Pi Web</h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={() => setWorkspaceOpen(!workspaceOpen)}
            className={`text-text-secondary hover:text-text-primary transition-colors p-1 cursor-pointer ${
              workspaceOpen ? "text-accent" : ""
            }`}
            title="Workspace"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="sm:w-[18px] sm:h-[18px]">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
          </button>
          <button
            onClick={handleOpenSkills}
            className="text-text-secondary hover:text-text-primary transition-colors p-1 cursor-pointer"
            title="Skills Library"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="sm:w-[18px] sm:h-[18px]">
              <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
            </svg>
          </button>
          <button
            onClick={handleOpenSettings}
            className="text-text-secondary hover:text-text-primary transition-colors p-1 cursor-pointer"
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="sm:w-[18px] sm:h-[18px]">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
          <span className="hidden sm:inline text-text-secondary text-sm">{user?.username}</span>
          <button
            onClick={logout}
            className="text-text-secondary hover:text-text-primary text-xs sm:text-sm transition-colors"
          >
            Sign out
          </button>
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
            onSelectSession={handleSelectSession}
            onNewSession={handleNewSession}
          />
        </aside>
        <main className="flex-1 min-w-0">
          <ChatArea
            key={sessionId}
            sessionId={sessionId}
          />
        </main>
        {workspaceOpen && (
          <aside className="fixed inset-y-10 sm:inset-y-12 right-0 z-40 sm:relative sm:z-auto w-full sm:w-[400px] lg:w-[450px] flex-shrink-0 h-full bg-surface transition-transform duration-200">
            <WorkspacePanel onClose={() => setWorkspaceOpen(false)} />
          </aside>
        )}
      </div>
    </div>
  );
}
