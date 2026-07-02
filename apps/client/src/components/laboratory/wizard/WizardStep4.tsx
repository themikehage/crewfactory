import type { Agent } from "@/types/laboratory";

interface Props {
  customAgents: Agent[];
  onBack: () => void;
  onSave: () => void;
  onSaveAndRun: () => void;
}

export function WizardStep4({
  customAgents,
  onBack,
  onSave,
  onSaveAndRun,
}: Props) {
  return (
    <div className="space-y-4 text-left">
      <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">Estructura del Experimento</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-4 bg-bg/50 rounded-xl border border-surface-hover space-y-1">
          <h4 className="text-xs font-bold text-text-primary">1. Single Agent (Baseline)</h4>
          <p className="text-[10px] text-text-secondary">Un único agente general procesando el brief de forma directa.</p>
          <span className="text-[9px] bg-accent/10 px-2 py-0.5 rounded text-accent border border-accent/20 block w-max mt-2">1 Agente</span>
        </div>
        <div className="p-4 bg-bg/50 rounded-xl border border-surface-hover space-y-1">
          <h4 className="text-xs font-bold text-text-primary">2. Multi-Agent No Leader</h4>
          <p className="text-[10px] text-text-secondary">N agentes debatiendo en canal abierto (broadcast) sin jerarquías.</p>
          <span className="text-[9px] bg-accent/10 px-2 py-0.5 rounded text-accent border border-accent/20 block w-max mt-2">{customAgents.filter(a => !a.leader).length} Agentes</span>
        </div>
        <div className="p-4 bg-bg/50 rounded-xl border border-surface-hover space-y-1">
          <h4 className="text-xs font-bold text-text-primary">3. Multi-Agent With Leader</h4>
          <p className="text-[10px] text-text-secondary">N agentes coordinados por un líder. Protocolo de negociación y veredicto.</p>
          <span className="text-[9px] bg-accent/10 px-2 py-0.5 rounded text-accent border border-accent/20 block w-max mt-2">{customAgents.length} Agentes</span>
        </div>
      </div>

      <div className="flex justify-between pt-4 border-t border-surface-hover">
        <button
          onClick={onBack}
          className="px-4 py-2 bg-surface-hover hover:bg-surface-hover/80 text-text-primary rounded-xl text-xs font-semibold"
        >
          Atrás
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onSave}
            className="px-4 py-2 bg-surface-hover hover:bg-surface-hover/80 text-text-primary rounded-xl text-xs font-semibold border border-surface-hover"
          >
            Guardar
          </button>
          <button
            onClick={onSaveAndRun}
            className="px-6 py-2 bg-accent text-bg hover:bg-accent/90 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow"
          >
            <span>Guardar y Ejecutar</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
