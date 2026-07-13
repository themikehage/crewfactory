import { useState } from "react";
import type { ReactNode } from "react";

interface TabItem {
  label: string;
  content: any[];
}

interface TabsProps {
  tabs: TabItem[];
  defaultTab?: number;
  renderChild: (comp: any, idx: number) => ReactNode;
}

export function TabsComponent({ tabs, defaultTab = 0, renderChild }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  if (!tabs || tabs.length === 0) return null;

  return (
    <div className="flex flex-col w-full bg-card border border-border rounded-lg shadow-sm">
      {/* Tabs Headers */}
      <div className="flex border-b border-border bg-muted/30 overflow-x-auto">
        {tabs.map((tab, i) => {
          const isActive = activeTab === i;
          return (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              className={`px-4 py-2.5 text-xs font-semibold cursor-pointer border-b-2 transition-all whitespace-nowrap ${
                isActive
                  ? "border-primary text-foreground bg-card"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Active Tab Panel Content */}
      <div className="p-4 flex flex-col gap-4">
        {tabs[activeTab]?.content?.map((comp, idx) => renderChild(comp, idx))}
      </div>
    </div>
  );
}
