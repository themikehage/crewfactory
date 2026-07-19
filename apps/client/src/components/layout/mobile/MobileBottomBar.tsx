import { Home, Library, Settings, Terminal, Cpu } from "lucide-react";

interface MobileBottomBarProps {
  currentPage: string;
  isHome: boolean;
  onNavigate: (path: string) => void;
  onSelectProject?: (projectId: string | null, projectName: string | null) => void;
  onSelectAgent?: (agent: { id: string; name: string; avatarUrl?: string } | null) => void;
  onSelectChannel?: (channel: { id: string; name: string } | null) => void;
  onSelectTeam?: (team: { id: string; name: string } | null) => void;
  setSidebarOpen: (open: boolean) => void;
}

export function MobileBottomBar({
  currentPage,
  isHome,
  onNavigate,
  onSelectProject,
  onSelectAgent,
  onSelectChannel,
  onSelectTeam,
  setSidebarOpen,
}: MobileBottomBarProps) {
  const tabs = [
    { id: "home", label: "Home", icon: <Home size={20} /> },
    { id: "skills", label: "Skills", icon: <Library size={20} /> },
    { id: "settings", label: "Settings", icon: <Settings size={20} /> },
    { id: "logs", label: "Logs", icon: <Terminal size={20} /> },
    { id: "plugins", label: "Plugins", icon: <Cpu size={20} /> },
  ];

  const handleTabClick = (tabId: string) => {
    setSidebarOpen(false);
    if (tabId === "home") {
      if (onSelectProject) onSelectProject(null, null);
      if (onSelectAgent) onSelectAgent(null);
      if (onSelectChannel) onSelectChannel(null);
      if (onSelectTeam) onSelectTeam(null);
      onNavigate("/");
    } else if (tabId === "skills") {
      onNavigate("/skills");
    } else if (tabId === "settings") {
      localStorage.setItem("settings-active-tab", "providers");
      onNavigate("/settings");
    } else if (tabId === "logs") {
      onNavigate("/logs");
    } else if (tabId === "plugins") {
      onNavigate("/plugins");
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 h-14 bg-[#171717]/95 border-t border-border flex items-center justify-around z-50 backdrop-blur-md px-2">
      {tabs.map((tab) => {
        let active = false;
        if (tab.id === "home") {
          active = isHome;
        } else {
          active = currentPage === tab.id;
        }

        return (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={`flex flex-col items-center justify-center flex-1 py-1 h-full cursor-pointer transition-colors ${
              active ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            <span className="text-[10px] mt-0.5">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
