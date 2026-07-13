import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";

interface DesktopHeaderProps {
  onHome: () => void;
  onToggleSidebar: () => void;
  onNavigate: (path: string) => void;
  wsConnected: boolean;
  breadcrumbs: ReactNode;
}

export function DesktopHeader({
  onHome,
  onToggleSidebar,
  onNavigate,
  wsConnected,
  breadcrumbs,
}: DesktopHeaderProps) {
  return (
    <header className="h-10 sm:h-12 border-b border-border px-2 sm:px-4 flex items-center justify-between flex-shrink-0 bg-card/30">
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={onHome}
          className="p-1 text-muted-foreground hover:text-foreground rounded cursor-pointer flex-shrink-0"
          title="Inicio"
        >
          <Logo size={20} className="sm:w-[22px] sm:h-[22px] w-[18px] h-[18px]" />
        </button>
        <button
          onClick={onToggleSidebar}
          className="sm:hidden p-1 text-muted-foreground hover:text-foreground rounded flex-shrink-0"
          title="Toggle sidebar"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        {breadcrumbs}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onNavigate("/sessions")}
          className="p-1 text-muted-foreground hover:text-foreground rounded cursor-pointer"
          title="Session Board"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
        </button>
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${wsConnected ? "bg-primary" : "bg-warning"}`}
          title={wsConnected ? "Connected" : "Reconnecting"}
        />
        <span className="text-[10px] text-muted-foreground/60">
          {wsConnected ? "online" : "offline"}
        </span>
      </div>
    </header>
  );
}
