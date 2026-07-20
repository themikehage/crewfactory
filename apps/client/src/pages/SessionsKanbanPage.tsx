import { useState, useEffect, useCallback, useMemo } from "react";
import { useLiterals } from "@/lib";
import { literals as u } from "./SessionsKanbanPage.literals";
import { useSessions, type KanbanColumn, type SessionItem } from "@/contexts/SessionsContext";
import { Trash2, Archive, RotateCcw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

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
  selected,
  onToggleSelect,
  onArchive,
  onDelete,
}: {
  session: SessionItem;
  onOpen: (s: SessionItem) => void;
  l: Record<string, string>;
  selected: boolean;
  onToggleSelect: (e: React.MouseEvent) => void;
  onArchive: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const badgeText = session.projectName
    ? `Proyecto ${session.projectName}`
    : session.teamId
      ? `Equipo`
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
    <div
      onClick={() => onOpen(session)}
      className={`w-full text-left bg-card border rounded-xl p-3 hover:border-primary/30 transition-all shadow-sm space-y-2 cursor-pointer relative group ${selected ? "border-primary bg-primary/5" : "border-input/60"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {!session.isExecution && (
            <input
              type="checkbox"
              checked={selected}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onToggleSelect(e as any)}
              className="accent-accent w-3.5 h-3.5 rounded border-input bg-background cursor-pointer"
            />
          )}
          <span className="font-semibold text-foreground text-xs truncate flex-1 leading-snug">
            {session.name}
          </span>
        </div>
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
        <div className="flex items-center gap-2">
          <span className="group-hover:hidden">{formatTime(session.updatedAt)}</span>
          {!session.isExecution && (
            <div className="hidden group-hover:flex items-center gap-1.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive(e);
                }}
                className="text-muted-foreground hover:text-accent p-0.5 rounded transition-colors"
                title={session.archived ? "Desarchivar" : "Archivar"}
              >
                {session.archived ? <RotateCcw size={12} /> : <Archive size={12} />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(e);
                }}
                className="text-muted-foreground hover:text-destructive p-0.5 rounded transition-colors"
                title="Eliminar"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SessionsKanbanPage({ onNavigate }: Props) {
  const l = useLiterals(u);
  const { workingSessions, idleSessions, doneSessions, loading, refetch } = useSessions();
  const [viewArchived, setViewArchived] = useState(false);
  const [archivedSessions, setArchivedSessions] = useState<SessionItem[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [batchDelete, setBatchDelete] = useState(false);

  const fetchArchived = useCallback(async () => {
    setLoadingArchived(true);
    try {
      const res = await apiFetch("/api/sessions?archived=true");
      if (res.ok) {
        const data = await res.json();
        setArchivedSessions(data.sessions ?? []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingArchived(false);
    }
  }, []);

  useEffect(() => {
    if (viewArchived) {
      fetchArchived();
    }
  }, [viewArchived, fetchArchived]);

  const activeSessions = useMemo(() => {
    if (viewArchived) {
      return archivedSessions;
    }
    return [...idleSessions, ...workingSessions, ...doneSessions];
  }, [viewArchived, archivedSessions, idleSessions, workingSessions, doneSessions]);

  const columnsData = useMemo(() => {
    const idle: SessionItem[] = [];
    const working: SessionItem[] = [];
    const done: SessionItem[] = [];

    for (const s of activeSessions) {
      if (s.isExecution) {
        done.push(s);
      } else if (
        s.status === "streaming" ||
        s.status === "active" ||
        s.status === "task-running"
      ) {
        working.push(s);
      } else {
        idle.push(s);
      }
    }

    return { idle, working, done };
  }, [activeSessions]);

  const handleOpen = (session: SessionItem) => {
    let path: string;
    if (session.teamId) {
      path = `/teams/${session.teamId}/session/${session.id}`;
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

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleArchive = async (id: string, isCurrentlyArchived?: boolean) => {
    const action = isCurrentlyArchived ? "unarchive" : "archive";
    await apiFetch(`/api/sessions/${id}/${action}`, { method: "POST" });
    window.dispatchEvent(new CustomEvent("entity-updated"));
    refetch();
    if (viewArchived) fetchArchived();
  };

  const handleDelete = (id: string) => {
    setDeleteTarget(id);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await apiFetch(`/api/sessions/${deleteTarget}`, { method: "DELETE" });
    setDeleteTarget(null);
    window.dispatchEvent(new CustomEvent("entity-updated"));
    refetch();
    if (viewArchived) fetchArchived();
  };

  const handleBatchAction = (action: "archive" | "unarchive" | "delete") => {
    if (action === "delete") {
      setBatchDelete(true);
      return;
    }
    executeBatch(action);
  };

  const executeBatch = async (action: string) => {
    await apiFetch("/api/sessions/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, sessionIds: selectedIds }),
    });
    setSelectedIds([]);
    setBatchDelete(false);
    window.dispatchEvent(new CustomEvent("entity-updated"));
    refetch();
    if (viewArchived) fetchArchived();
  };

  const showLoading = loading || (viewArchived && loadingArchived);

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden p-4 sm:p-6 relative">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-foreground">{l.title}</h1>
          <div className="h-4 w-px bg-border/60" />
          <button
            onClick={() => {
              setViewArchived(!viewArchived);
              setSelectedIds([]);
            }}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all cursor-pointer ${
              viewArchived
                ? "bg-accent/10 border-accent/20 text-accent font-bold"
                : "bg-card border-input/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {viewArchived ? "Ver Activas" : "Ver Archivadas"}
          </button>
        </div>
      </div>

      {showLoading && activeSessions.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">{l.loading}</span>
          </div>
        </div>
      ) : (
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
                  {columnsData[key].length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {columnsData[key].length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-[11px]">
                    {l.noSessions}
                  </div>
                ) : (
                  columnsData[key].map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onOpen={handleOpen}
                      l={l}
                      selected={selectedIds.includes(session.id)}
                      onToggleSelect={() => handleToggleSelect(session.id)}
                      onArchive={() => handleArchive(session.id, session.archived)}
                      onDelete={() => handleDelete(session.id)}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-card border border-input shadow-2xl rounded-2xl px-5 py-3 flex items-center gap-4 animate-scale-in z-30">
          <span className="text-xs font-semibold text-foreground">
            {selectedIds.length} seleccionados
          </span>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBatchAction(viewArchived ? "unarchive" : "archive")}
              className="px-3 py-1.5 bg-card hover:bg-card-hover border border-input rounded-lg text-xs font-semibold text-foreground cursor-pointer flex items-center gap-1.5 transition-colors"
            >
              <Archive size={13} />
              {viewArchived ? "Desarchivar" : "Archivar"}
            </button>
            <button
              onClick={() => handleBatchAction("delete")}
              className="px-3 py-1.5 bg-destructive text-white rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5 hover:opacity-90 transition-opacity"
            >
              <Trash2 size={13} />
              Eliminar
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Eliminar sesión"
        message="¿Estás seguro de que querés eliminar esta sesión?"
        confirmLabel="Eliminar"
        destructive
      />

      <ConfirmModal
        open={batchDelete}
        onClose={() => setBatchDelete(false)}
        onConfirm={() => executeBatch("delete")}
        title="Eliminar sesiones"
        message={`¿Estás seguro de que querés eliminar las ${selectedIds.length} sesiones seleccionadas?`}
        confirmLabel="Eliminar"
        destructive
      />
    </div>
  );
}
