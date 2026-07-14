import { Menu, Plus } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import type { ConnectionState } from "@/lib/ws-client";

interface MobileTopbarProps {
  isMobile: boolean;
  isHome: boolean;
  title: string;
  canGoBack: boolean;
  onBack: () => void;
  onMenuToggle: () => void;
  onNewSession: () => void;
  onNavigate: (path: string) => void;
  showNewSessionButton: boolean;
  l: Record<string, string>;
  wsState: ConnectionState;
}

export function MobileTopbar({
  isMobile,
  isHome,
  title,
  onMenuToggle,
  onNewSession,
  onNavigate,
  showNewSessionButton,
  l,
  wsState,
}: MobileTopbarProps) {
  if (!isMobile) return null;

  return (
    <div className="w-full h-12 px-3 flex items-center justify-between bg-card/30 border-b border-border flex-shrink-0">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <button
          onClick={onMenuToggle}
          className="w-12 h-12 -ml-3 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg active:bg-surface-hover transition-colors cursor-pointer"
          aria-label={l.btnToggleMenu}
        >
          <Menu size={20} />
        </button>
        {isHome ? (
          <div className="flex items-center gap-2">
            <Logo size={20} className="w-[20px] h-[20px]" />
            <span className="text-base font-semibold text-foreground">{l.breadFactory || "Factory"}</span>
          </div>
        ) : (
          <h1 className="text-base font-semibold text-foreground truncate max-w-[200px]">
            {title}
          </h1>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span
          className={`w-2 h-2 rounded-full mr-1 flex-shrink-0 ${
            wsState === "connected" ? "bg-success" :
            wsState === "connecting" ? "bg-warning animate-pulse" :
            "bg-error"
          }`}
          title={`WebSocket: ${wsState}`}
        />
        <button
          onClick={() => onNavigate("/sessions")}
          className="w-11 h-11 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg active:bg-surface-hover transition-colors cursor-pointer"
          aria-label="Session Board"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
        </button>
        {showNewSessionButton && (
          <button
            onClick={onNewSession}
            className="w-11 h-11 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg active:bg-surface-hover transition-colors cursor-pointer"
            aria-label={l.btnNewSession}
          >
            <Plus size={20} />
          </button>
        )}
      </div>
    </div>
  );
}
