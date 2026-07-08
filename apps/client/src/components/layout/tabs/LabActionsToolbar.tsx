import { useState, useRef } from "react";
import { Clock } from "lucide-react";
import { PortalPopover } from "@/components/chat/PortalPopover";

interface LabActionsToolbarProps {
  selectedExpId: string;
  experiments: any[];
  selectedRunId?: string;
  pastRuns?: any[];
  runPopoverOpen?: boolean;
  setRunPopoverOpen?: (open: boolean) => void;
  onSelectRun?: (runId: string) => void;
  onRunExperiment?: (id: string) => void;
  onStopExperiment?: (id: string) => void;
  onEditExperiment?: (id: string) => void;
  onDeleteExperiment?: (id: string) => void;
  onJudgeExperiment?: (id: string) => void;
  onExportExperiment?: (id: string) => void;
}

export function LabActionsToolbar({
  selectedExpId,
  experiments,
  selectedRunId = "latest",
  pastRuns = [],
  runPopoverOpen = false,
  setRunPopoverOpen,
  onSelectRun,
  onRunExperiment,
  onStopExperiment,
  onEditExperiment,
  onDeleteExperiment,
  onJudgeExperiment,
  onExportExperiment,
}: LabActionsToolbarProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const localRunTriggerRef = useRef<HTMLButtonElement>(null);

  const activeExp = experiments.find((e: any) => e.id === selectedExpId);
  const isRunning = activeExp?.status === "running";

  return (
    <>
      {isRunning && (
        <span className="flex items-center gap-1.5 text-primary text-[10px] font-bold animate-pulse bg-primary/10 border border-primary/20 px-2 py-1 rounded-md">
          <span className="w-1.5 h-1.5 bg-primary rounded-full animate-ping" />
          Ejecutando...
        </span>
      )}

      <div className="relative">
        <button
          ref={localRunTriggerRef}
          onClick={() => setRunPopoverOpen?.(!runPopoverOpen)}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-card transition-colors cursor-pointer"
          title="Historial de ejecuciones"
        >
          <Clock size={14} />
        </button>

        <PortalPopover
          triggerRef={localRunTriggerRef as React.RefObject<HTMLElement | null>}
          open={runPopoverOpen}
          onClose={() => setRunPopoverOpen?.(false)}
          matchWidth
        >
          <div className="overflow-hidden bg-[#171717] border border-border rounded-xl shadow-xl min-w-[200px]">
            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  onSelectRun?.("latest");
                  setRunPopoverOpen?.(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs transition-colors cursor-pointer ${
                  selectedRunId === "latest"
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-text-primary hover:bg-card-hover"
                }`}
              >
                Última ejecución (Activa)
              </button>
              {pastRuns.map((run: any) => (
                <button
                  key={run.activeRunId || run.createdAt}
                  type="button"
                  onClick={() => {
                    onSelectRun?.(run.activeRunId);
                    setRunPopoverOpen?.(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                    selectedRunId === run.activeRunId
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-text-primary hover:bg-card-hover"
                  }`}
                >
                  <span className="truncate">
                    {new Date(run.completedAt || run.startedAt || run.createdAt).toLocaleString()}
                  </span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                      run.status === "completed"
                        ? "bg-success/15 text-success border border-success/20"
                        : run.status === "running"
                        ? "bg-primary/15 text-primary border border-primary/20"
                        : run.status === "failed"
                        ? "bg-error/15 text-error border border-error/20"
                        : "bg-warning/15 text-warning border border-warning/20"
                    }`}
                  >
                    {run.status}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </PortalPopover>
      </div>

      <button
        onClick={() => setActionsOpen((p) => !p)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border border-border hover:bg-card text-muted-foreground hover:text-foreground transition-all cursor-pointer bg-card/10"
        title="Opciones del Experimento"
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
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
        <span>Opciones</span>
      </button>

      {actionsOpen && (
        <>
          <div className="fixed inset-0 z-45 bg-transparent" onClick={() => setActionsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-40 bg-card border border-input rounded-xl shadow-2xl flex flex-col z-50 py-1 animate-scale-in text-left">
            {activeExp?.status === "running" ? (
              <button
                onClick={() => {
                  setActionsOpen(false);
                  onStopExperiment?.(selectedExpId);
                }}
                className="w-full px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-2 font-medium cursor-pointer"
              >
                <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
                Detener
              </button>
            ) : (
              <button
                onClick={() => {
                  setActionsOpen(false);
                  onRunExperiment?.(selectedExpId);
                }}
                className="w-full px-3 py-1.5 text-xs text-foreground hover:bg-card-hover transition-colors flex items-center gap-2 font-medium cursor-pointer"
              >
                <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24" className="text-primary">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Ejecutar
              </button>
            )}

            {activeExp?.status === "completed" && (
              <>
                <button
                  onClick={() => {
                    setActionsOpen(false);
                    onJudgeExperiment?.(selectedExpId);
                  }}
                  className="w-full px-3 py-1.5 text-xs text-foreground hover:bg-card-hover transition-colors flex items-center gap-2 font-medium cursor-pointer"
                >
                  <svg
                    width="12"
                    height="12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    viewBox="0 0 24 24"
                    className="text-primary"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                    />
                  </svg>
                  Re-evaluar
                </button>
                <button
                  onClick={() => {
                    setActionsOpen(false);
                    onExportExperiment?.(selectedExpId);
                  }}
                  className="w-full px-3 py-1.5 text-xs text-foreground hover:bg-card-hover transition-colors flex items-center gap-2 font-medium cursor-pointer"
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
                    className="text-primary"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  Exportar
                </button>
              </>
            )}

            <button
              onClick={() => {
                setActionsOpen(false);
                onEditExperiment?.(selectedExpId);
              }}
              className="w-full px-3 py-1.5 text-xs text-foreground hover:bg-card-hover transition-colors flex items-center gap-2 font-medium cursor-pointer"
            >
              <svg
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
                className="text-blue-400"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"
                />
              </svg>
              Editar
            </button>

            <button
              onClick={() => {
                setActionsOpen(false);
                onDeleteExperiment?.(selectedExpId);
              }}
              className="w-full px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-2 font-medium cursor-pointer"
            >
              <svg
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Eliminar
            </button>
          </div>
        </>
      )}
    </>
  );
}
