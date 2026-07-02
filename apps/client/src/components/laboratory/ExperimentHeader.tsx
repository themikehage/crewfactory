import type { Experiment } from "@/types/laboratory";

interface Props {
  activeExp: Experiment;
  onEditExperiment: (exp: Experiment) => void;
  onDeleteExperiment: (id: string) => void;
  onTriggerRun: (id: string) => void;
  onStop: (id: string) => void;
}

export function ExperimentHeader({
  activeExp,
  onEditExperiment,
  onDeleteExperiment,
  onTriggerRun,
  onStop,
}: Props) {
  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface border border-surface-hover p-6 rounded-2xl shadow-sm">
      <div>
        <h1 className="text-lg font-bold text-text-primary">{activeExp.name}</h1>
        <p className="text-xs text-text-secondary font-mono mt-1 pr-4 max-w-2xl">{activeExp.taskPrompt}</p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="flex items-center gap-2 bg-bg px-3 py-1.5 rounded-xl border border-surface-hover">
          <span className={`w-2 h-2 rounded-full ${
            activeExp.status === "completed" ? "bg-accent" :
            activeExp.status === "running" ? "bg-warning animate-ping" :
            activeExp.status === "failed" ? "bg-error" : "bg-text-secondary/40"
          }`} />
          <span className="text-[10px] uppercase font-bold text-text-secondary">{activeExp.status}</span>
        </div>
        {activeExp.status !== "running" && (
          <>
            {!activeExp.blueprintId && (
              <button
                onClick={() => onEditExperiment(activeExp)}
                className="px-3 py-2 bg-surface-hover hover:bg-surface-hover/80 text-text-primary rounded-xl text-xs font-semibold border border-surface-hover"
              >
                Editar
              </button>
            )}
            <button
              onClick={() => onDeleteExperiment(activeExp.id)}
              className="px-3 py-2 bg-surface-hover hover:bg-surface-hover/80 text-text-primary hover:text-error rounded-xl text-xs font-semibold border border-surface-hover"
            >
              Eliminar
            </button>
            <button
              onClick={() => onTriggerRun(activeExp.id)}
              className="px-4 py-2 bg-accent text-bg hover:bg-accent/90 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow"
            >
              <span>Ejecutar</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </button>
          </>
        )}
        {activeExp.status === "running" && (
          <button
            onClick={() => onStop(activeExp.id)}
            className="px-4 py-2 bg-error text-white hover:bg-error/90 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow"
          >
            <span>Detener</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
