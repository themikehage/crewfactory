import { ArrowLeft, Menu, Plus } from "lucide-react";
import { Logo } from "@/components/ui/Logo";

interface MobileTopbarProps {
  isMobile: boolean;
  isHome: boolean;
  title: string;
  canGoBack: boolean;
  onBack: () => void;
  onMenuToggle: () => void;
  onNewSession: () => void;
  showNewSessionButton: boolean;
  l: Record<string, string>;
}

export function MobileTopbar({
  isMobile,
  isHome,
  title,
  onBack,
  onMenuToggle,
  onNewSession,
  showNewSessionButton,
  l,
}: MobileTopbarProps) {
  if (!isMobile) return null;

  return (
    <div className="w-full h-12 px-3 flex items-center justify-between bg-card/30 border-b border-border flex-shrink-0">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {!isHome && (
          <button
            onClick={onBack}
            className="w-12 h-12 -ml-3 flex items-center justify-center text-foreground hover:text-foreground/80 rounded-lg active:bg-surface-hover transition-colors cursor-pointer"
            aria-label={l.btnBack}
          >
            <ArrowLeft size={20} />
          </button>
        )}
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
        {showNewSessionButton && (
          <button
            onClick={onNewSession}
            className="w-11 h-11 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg active:bg-surface-hover transition-colors cursor-pointer"
            aria-label={l.btnNewSession}
          >
            <Plus size={20} />
          </button>
        )}
        {!isHome && (
          <button
            onClick={onMenuToggle}
            className="w-11 h-11 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg active:bg-surface-hover transition-colors cursor-pointer"
            aria-label={l.btnToggleMenu}
          >
            <Menu size={20} />
          </button>
        )}
      </div>
    </div>
  );
}
