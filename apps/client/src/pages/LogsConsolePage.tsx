import { SessionConsoleView } from "@/components/sessions/SessionConsoleView";

interface LogsConsolePageProps {
  onSelectProject: (projectId: string | null, projectName: string | null) => void;
  onSelectAgent: (agent: { id: string; name: string } | null) => void;
  onNavigate: (path: string) => void;
}

export function LogsConsolePage(_props: LogsConsolePageProps) {
  return <SessionConsoleView />;
}
