import { useSearchParams } from "react-router-dom";
import { useLiterals } from "@/lib";
import { literals as u } from "./SessionsPage.literals";
import { TabsNav } from "@/components/ui/TabsNav";
import { SessionsKanbanPage } from "@/pages/SessionsKanbanPage";
import { AnalyticsPage } from "@/pages/AnalyticsPage";
import { SessionConsoleView } from "@/components/sessions/SessionConsoleView";

interface Props {
  onNavigate: (path: string) => void;
}

const TABS = [
  { id: "sessions", labelKey: "tabSessions" },
  { id: "analytics", labelKey: "tabAnalytics" },
  { id: "console", labelKey: "tabConsole" },
];

export function SessionsPage({ onNavigate }: Props) {
  const l = useLiterals(u);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "sessions";

  const handleTabChange = (tabId: string) => {
    setSearchParams(tabId === "sessions" ? {} : { tab: tabId }, { replace: true });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-0">
        <TabsNav
          tabs={TABS.map((t) => ({ id: t.id, label: l[t.labelKey] }))}
          activeTab={activeTab}
          onChange={handleTabChange}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "sessions" && <SessionsKanbanPage onNavigate={onNavigate} />}
        {activeTab === "analytics" && <AnalyticsPage />}
        {activeTab === "console" && <SessionConsoleView />}
      </div>
    </div>
  );
}
