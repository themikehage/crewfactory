import type { RoutePage } from "@/router/useRoutePage";

interface BreadcrumbsProps {
  page: RoutePage;
  activeProjectId: string | null;
  activeProjectName: string | null;
  activeAgent: { id: string; name: string } | null;
  activeChannel: { id: string; name: string } | null;
  selectedExpId?: string | null;
  experiments?: any[];
  onNavigate: (path: string) => void;
  l: Record<string, string>;
}

export function Breadcrumbs({
  page,
  activeProjectId,
  activeProjectName,
  activeAgent,
  activeChannel,
  selectedExpId,
  experiments = [],
  onNavigate,
  l,
}: BreadcrumbsProps) {
  let items: { label: string; path?: string }[] = [];

  const currentProject = activeProjectId;
  const currentProjectFriendly = activeProjectName || activeProjectId;
  const currentAgent = activeAgent;
  const currentChannel = activeChannel;

  if (currentProject) {
    items = [
      { label: l.breadProyectos || "Projects", path: "/projects" },
      { label: currentProjectFriendly || currentProject, path: `/projects/${currentProject}/chat` },
    ];
  } else if (currentAgent) {
    items = [
      { label: l.breadAgentes || "Agents", path: "/agents" },
      { label: currentAgent.name, path: `/agents/${currentAgent.id}/chat` },
    ];
  } else if (currentChannel) {
    items = [
      { label: l.breadCanales || "Channels", path: "/channels" },
      { label: `#${currentChannel.name}`, path: `/channels/${currentChannel.id}/chat` },
    ];
  } else {
    items = [{ label: l.breadFactory || "Factory", path: "/" }];
  }

  if (page === "workspace") {
    items.push({ label: l.tabFiles || "Files" });
  } else if (page === "preview") {
    items.push({ label: l.tabPreview || "Preview" });
  } else if (page === "chat") {
    items.push({ label: l.tabChat || "Chat" });
  } else if (page === "settings") {
    items = [{ label: l.breadSettings || "Settings" }];
  } else if (page === "skills") {
    items = [{ label: l.breadSkills || "Skills" }];
  } else if (page === "logs") {
    items = [{ label: l.breadLogs || "Logs" }];
  } else if (page === "projects") {
    items = [{ label: l.breadProyectos || "Projects" }];
  } else if (page === "agents") {
    items = [{ label: l.breadAgentes || "Agents" }];
  } else if (page === "channels") {
    items = [{ label: l.breadCanales || "Channels" }];
  } else if (page === "channel") {
    items = [{ label: l.breadCanales || "Channels", path: "/channels" }];
    if (activeChannel) {
      items.push({ label: `#${activeChannel.name}` });
    }
  } else if (page === "org") {
    items.push({ label: l.tabOrgChart || "Org Chart" });
  } else if (page === "sessions") {
    items = [{ label: l.breadSessions || "Sessions" }];
  } else if (page === "analytics") {
    items = [{ label: l.breadAnalytics || "Analytics" }];
  } else if (page === "laboratory") {
    items = [{ label: "Laboratorio", path: "/laboratory" }];
    if (selectedExpId) {
      const activeExp = experiments.find((e: any) => e.id === selectedExpId);
      items.push({ label: activeExp?.name || "Experimento" });
    }
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm">
      <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-primary inline-block flex-shrink-0" />
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <div key={index} className="flex items-center gap-1 sm:gap-1.5">
            {index > 0 && (
              <span className="text-muted-foreground font-normal select-none px-0.5 sm:px-1">/</span>
            )}
            {item.path && !isLast ? (
              <button
                onClick={() => onNavigate(item.path!)}
                className="text-muted-foreground hover:text-foreground transition-colors font-medium cursor-pointer"
              >
                {item.label}
              </button>
            ) : (
              <span
                className={`${
                  isLast ? "font-semibold text-foreground" : "text-muted-foreground font-medium"
                }`}
              >
                {item.label}
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}
