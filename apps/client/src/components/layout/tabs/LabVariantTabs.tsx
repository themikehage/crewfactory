type VariantTab = "chat" | "config" | "single" | "multiNoLeader" | "multiWithLeader" | "compare";

interface LabVariantTabsProps {
  activeExp: any;
  activeVariantTab: VariantTab;
  onChangeTab: (tab: VariantTab) => void;
}

export function LabVariantTabs({
  activeExp,
  activeVariantTab,
  onChangeTab,
}: LabVariantTabsProps) {
  const isCompleted = activeExp?.status === "completed";
  const variantDefs = [
    { key: "chat" as const, label: "Chat" },
    { key: "config" as const, label: "Config" },
    { key: "single" as const, label: "Baseline" },
    { key: "multiWithLeader" as const, label: "Negociación" },
  ];

  return (
    <>
      {variantDefs.map(({ key: vKey, label }) => {
        const runData = activeExp?.variants?.[vKey];
        const hasResult = !!runData?.result;
        const isRunning = activeExp?.status === "running" && runData?.activeSessionId && !hasResult;
        const isActive = activeVariantTab === vKey;
        return (
          <button
            key={vKey}
            onClick={() => onChangeTab(vKey)}
            className={`flex-none flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all cursor-pointer border-b-2 -mb-[1px] ${
              isActive
                ? "text-primary border-primary font-semibold"
                : "text-muted-foreground border-transparent hover:text-foreground hover:border-input"
            }`}
          >
            {label}
            {isRunning && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
            )}
            {hasResult && (
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  runData.result?.status === "completed" ? "bg-primary" : "bg-destructive"
                }`}
              />
            )}
          </button>
        );
      })}
      {isCompleted && (
        <button
          onClick={() => onChangeTab("compare")}
          className={`flex-none flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all cursor-pointer border-b-2 -mb-[1px] ${
            activeVariantTab === "compare"
              ? "text-primary border-primary font-semibold"
              : "text-muted-foreground border-transparent hover:text-foreground hover:border-input"
          }`}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 20V10M12 20V4M6 20v-6" />
          </svg>
          Comparativa
        </button>
      )}
    </>
  );
}
