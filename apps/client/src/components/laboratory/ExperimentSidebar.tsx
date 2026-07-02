import type { Experiment } from "@/types/laboratory";

interface Props {
  experiments: Experiment[];
  selectedExpId: string | null;
  isWizard: boolean;
  loadingExps: boolean;
  onSelectExperiment: (id: string) => void;
  onOpenWizard: () => void;
  onDeleteExperiment: (id: string) => void;
}

export function ExperimentSidebar({
  experiments,
  selectedExpId,
  isWizard,
  loadingExps,
  onSelectExperiment,
  onOpenWizard,
  onDeleteExperiment,
}: Props) {
  return (
    <div className="w-72 border-r border-surface flex flex-col flex-shrink-0 bg-bg">
      <div className="p-4 border-b border-surface flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-text-primary uppercase">Experimentos</h2>
        <button
          onClick={onOpenWizard}
          className="p-1.5 hover:bg-surface hover:text-accent text-text-secondary rounded-lg transition-colors border border-surface"
          title="Crear Experimento"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loadingExps ? (
          <div className="text-xs text-text-secondary/40 text-center py-4 animate-pulse">Cargando histórico...</div>
        ) : experiments.length === 0 ? (
          <div className="text-xs text-text-secondary/30 text-center py-8">No hay experimentos registrados</div>
        ) : (
          experiments.map((exp) => {
            const isSelected = exp.id === selectedExpId && !isWizard;
            return (
              <div
                key={exp.id}
                onClick={() => onSelectExperiment(exp.id)}
                className={`group p-3 rounded-xl transition-all cursor-pointer border text-left flex items-center justify-between ${
                  isSelected
                    ? "bg-surface border-accent/40 shadow-sm"
                    : "bg-surface/30 border-transparent hover:bg-surface hover:border-surface-hover"
                }`}
              >
                <div className="min-w-0 flex-1 pr-2">
                  <h3 className="text-xs font-semibold text-text-primary truncate">{exp.name}</h3>
                  <p className="text-[10px] text-text-secondary truncate mt-0.5">{exp.taskPrompt}</p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      exp.status === "completed" ? "bg-accent" :
                      exp.status === "running" ? "bg-warning animate-ping" :
                      exp.status === "failed" ? "bg-error" : "bg-text-secondary/40"
                    }`} />
                    <span className="text-[9px] uppercase font-semibold text-text-secondary">{exp.status}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteExperiment(exp.id);
                  }}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-hover/80 text-text-secondary hover:text-error transition-all"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
