import type { ReactNode } from "react";
import type { Route } from "@/hooks/useRouter";
import { LabVariantTabs } from "./LabVariantTabs";

interface Tab {
  id: string;
  label: string;
  path: string;
  icon: ReactNode;
}

type VariantTab = "chat" | "config" | "single" | "multiNoLeader" | "multiWithLeader" | "compare";

interface ContextTabBarProps {
  route: Route;
  contextTabs: Tab[];
  selectedExpId?: string | null;
  experiments?: any[];
  activeVariantTab?: VariantTab;
  onChangeVariantTab?: (tab: VariantTab) => void;
  onNavigateTab: (path: string) => void;
  rightSlot?: ReactNode;
}

export function ContextTabBar({
  route,
  contextTabs,
  selectedExpId,
  experiments = [],
  activeVariantTab = "chat",
  onChangeVariantTab,
  onNavigateTab,
  rightSlot,
}: ContextTabBarProps) {
  const activeExp = selectedExpId ? experiments.find((e) => e.id === selectedExpId) : null;

  return (
    <div className="flex items-center justify-between px-4 border-b border-border bg-card/5 flex-shrink-0">
      <div className="flex gap-1 overflow-x-auto scrollbar-none flex-nowrap">
        {route.page === "laboratory" ? (
          selectedExpId && activeExp ? (
            <LabVariantTabs
              activeExp={activeExp}
              activeVariantTab={activeVariantTab}
              onChangeTab={onChangeVariantTab || (() => {})}
            />
          ) : (
            <span className="flex-none flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-primary border-b-2 border-primary -mb-[1px]">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
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
                onClick={() => onNavigateTab(tab.path)}
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

      <div className="relative py-1 flex items-center gap-2">{rightSlot}</div>
    </div>
  );
}
