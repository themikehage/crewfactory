import { useLiterals } from "@/lib";
import { literals as u } from "./SessionsKanbanPage.literals";
import { useSessions, type KanbanColumn, type SessionItem } from "@/contexts/SessionsContext";

interface Props {
  onNavigate: (path: string) => void;
}

const COLUMNS: { key: KanbanColumn; titleKey: string; descKey: string }[] = [
  { key: "idle", titleKey: "idleColumn", descKey: "idleDesc" },
  { key: "working", titleKey: "workingColumn", descKey: "workingDesc" },
  { key: "done", titleKey: "doneColumn", descKey: "doneDesc" },
];

function SessionCard({
  session,
  onOpen,
  l,
}: {
  session: SessionItem;
  onOpen: (s: SessionItem) => void;
  l: Record<string, string>;
}) {
  const badgeText = session.projectName
    ? `Proyecto ${session.projectName}`
    : session.channelId
      ? `Canal`
      : session.agentId
        ? `Agente`
        : "Global";

  let statusDot: string;
  let statusLabel: string;
  if (session.isExecution) {
    statusDot = "bg-success";
    statusLabel = l.statusDone;
  } else if (session.status === "streaming") {
    statusDot = "bg-warning animate-pulse";
    statusLabel = l.statusStreaming;
  } else if (session.status === "task-running") {
    statusDot = "bg-primary animate-pulse";
    statusLabel = l.statusTaskRunning;
  } else if (session.status === "active") {
    statusDot = "bg-primary";
    statusLabel = l.statusActive;
  } else {
    statusDot = "bg-text-secondary/30";
    statusLabel = l.statusSleeping;
  }

  const formatTime = (updatedAt: string) => {
    const diff = Date.now() - new Date(updatedAt).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 30) return "Hace un momento";
    if (sec < 60) return `Hace ${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `Hace ${min}min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `Hace ${h}h`;
    return new Date(updatedAt).toLocaleDateString();
  };

  return (
    <button
      onClick={() => onOpen(session)}
      className="w-full text-left bg-card border border-input/60 rounded-xl p-3 hover:border-primary/30 transition-all shadow-sm space-y-2 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-foreground text-xs truncate flex-1 leading-snug">
          {session.name}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
          <span className="text-[10px] font-semibold text-muted-foreground">
            {statusLabel}
          </span>
        </span>
      </div>
      <div className="text-[10px] text-muted-foreground/70 font-medium">
        {badgeText}
      </div>
      <div className="flex items-center justify-between pt-1 border-t border-input/20 text-[10px] text-muted-foreground">
        <span>{session.messageCount} mensajes</span>
        <span>{formatTime(session.updatedAt)}</span>
      </div>
    </button>
  );
}

export function SessionsKanbanPage({ onNavigate }: Props) {
  const l = useLiterals(u);
  const { workingSessions, idleSessions, doneSessions, loading } = useSessions();

  const columnSessions: Record<KanbanColumn, SessionItem[]> = {
    idle: idleSessions,
    working: workingSessions,
    done: doneSessions,
  };

  const handleOpen = (session: SessionItem) => {
    let path: string;
    if (session.channelId) {
      path = `/channels/${session.channelId}/session/${session.id}`;
    } else if (session.agentId) {
      if (session.agentId === "lab-architect") {
        path = `/laboratory/session/${session.id}`;
      } else {
        path = `/agents/${session.agentId}/session/${session.id}`;
      }
    } else if (session.projectName) {
      path = `/projects/${session.projectName}/session/${session.id}`;
    } else {
      path = `/session/${session.id}`;
    }
    onNavigate(path);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-xs">{l.loading}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden p-4 sm:p-6">
      <h1 className="text-sm font-semibold text-foreground mb-4">{l.title}</h1>
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 min-h-0 overflow-hidden">
        {COLUMNS.map(({ key, titleKey, descKey }) => (
          <div
            key={key}
            className="flex flex-col bg-card/40 border border-input/50 rounded-xl overflow-hidden min-h-0"
          >
            <div className="px-3 py-2 border-b border-input/40 flex items-center justify-between bg-card/60">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                  {l[titleKey]}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {l[descKey]}
                </span>
              </div>
              <span className="text-xs font-bold text-muted-foreground bg-card-hover px-2 py-0.5 rounded-full">
                {columnSessions[key].length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {columnSessions[key].length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-[11px]">
                  {l.noSessions}
                </div>
              ) : (
                columnSessions[key].map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    onOpen={handleOpen}
                    l={l}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
