interface TabDef {
  id: string;
  label: string;
}

interface TabsNavProps {
  tabs: TabDef[];
  activeTab: string;
  onChange: (tabId: string) => void;
}

export function TabsNav({ tabs, activeTab, onChange }: TabsNavProps) {
  return (
    <div className="flex border-b border-input flex-shrink-0">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 transition-all ${
            activeTab === tab.id
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
