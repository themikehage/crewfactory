import { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface LedgerTask {
  id: string;
  assignedBy: string;
  assignedByName: string;
  assignedTo: string;
  assignedToName: string;
  role: string;
  task: string;
  status: "open" | "in-progress" | "done" | "failed";
  createdAt: string;
  updatedAt: string;
}

interface Props {
  channelId: string;
}

export function ChannelTaskLedger({ channelId }: Props) {
  const [tasks, setTasks] = useState<LedgerTask[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/channels/${channelId}/ledger`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch (e) {
      console.error("Failed to fetch task ledger:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 2500);
    return () => clearInterval(interval);
  }, [channelId]);

  if (loading && tasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-muted-foreground text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span>Cargando registro de tareas...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between pb-4 border-b border-input/60">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Registro de Tareas (Task Ledger)</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Seguimiento de la delegación y ejecución de sub-tareas asignadas en este canal.
          </p>
        </div>
        <div className="text-xs px-2 py-0.5 rounded-full bg-card border border-input/80 text-muted-foreground">
          {tasks.length} {tasks.length === 1 ? "tarea" : "tareas"}
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground text-xs">
          <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor" className="mb-2 text-muted-foreground">
            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
          </svg>
          <p>No se han registrado tareas en este canal todavía.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Los agentes asignan tareas cuando usan el formato de delegación (ej: DELEGATE: @TechLead — Scope).
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task, idx) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              key={task.id}
              className="p-4 bg-card border border-input rounded-xl shadow-sm space-y-2.5 text-xs relative overflow-hidden group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-foreground">@{task.assignedByName}</span>
                  <span className="text-muted-foreground font-normal">delegó a</span>
                  <span className="font-semibold text-primary">@{task.assignedToName}</span>
                  <span className="text-xs bg-primary/10 border border-primary/20 text-primary px-1.5 py-0.2 rounded font-medium">
                    {task.role.toUpperCase()}
                  </span>
                </div>

                <span
                  className={`px-2 py-0.5 rounded text-xs font-bold tracking-wide flex-shrink-0 uppercase ${
                    task.status === "done"
                      ? "bg-primary/15 border border-primary/30 text-primary"
                      : task.status === "in-progress"
                      ? "bg-blue-400/15 border border-blue-400/30 text-blue-400"
                      : task.status === "failed"
                      ? "bg-destructive/15 border border-error/30 text-destructive"
                      : "bg-warning/15 border border-warning/30 text-warning"
                  }`}
                >
                  {task.status === "done" ? "completado" : task.status === "open" ? "abierto" : task.status}
                </span>
              </div>

              <div className="bg-background/40 border border-input/40 rounded-lg p-2.5 text-foreground leading-relaxed font-mono text-[11px] whitespace-pre-wrap">
                {task.task}
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <span>Asignada: {new Date(task.createdAt).toLocaleString()}</span>
                {task.status === "done" && (
                  <span className="text-primary/60">Finalizada: {new Date(task.updatedAt).toLocaleTimeString()}</span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
