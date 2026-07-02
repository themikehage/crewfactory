import type { Blueprint } from "@/types/laboratory";

interface Props {
  wizardName: string;
  setWizardName: (val: string) => void;
  wizardPrompt: string;
  setWizardPrompt: (val: string) => void;
  blueprints: Blueprint[];
  selectedBlueprintId: string;
  onSelectBlueprint: (id: string) => void;
  selectedBlueprint: Blueprint | null;
  analyzeChannelLoading: boolean;
  analyzeChannelText: string;
  analyzeChannelError: string | null;
  onAnalyzeTask: () => void;
  onSaveBlueprint: () => void;
  onSaveAndRunBlueprint: () => void;
}

export function WizardStep1({
  wizardName,
  setWizardName,
  wizardPrompt,
  setWizardPrompt,
  blueprints,
  selectedBlueprintId,
  onSelectBlueprint,
  selectedBlueprint,
  analyzeChannelLoading,
  analyzeChannelText,
  analyzeChannelError,
  onAnalyzeTask,
  onSaveBlueprint,
  onSaveAndRunBlueprint,
}: Props) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-text-secondary mb-1">Nombre del Experimento</label>
        <input
          type="text"
          value={wizardName}
          onChange={(e) => setWizardName(e.target.value)}
          placeholder="Ej: Estimacion de Alcance AutoConsulting v2"
          className="w-full bg-bg border border-surface-hover rounded-xl px-3 py-2.5 text-xs text-text-primary focus:outline-none focus:border-accent/40"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-text-secondary mb-1">Cargar desde Template / Blueprint (Opcional)</label>
        <select
          value={selectedBlueprintId}
          onChange={(e) => onSelectBlueprint(e.target.value)}
          className="w-full bg-bg border border-surface-hover rounded-xl px-3 py-2.5 text-xs text-text-primary focus:outline-none focus:border-accent/40"
        >
          <option value="">-- Diseñar desde cero (Scratch) --</option>
          {blueprints.map((bp) => (
            <option key={bp.id} value={bp.id}>{bp.name}</option>
          ))}
        </select>
        {selectedBlueprint && (
          <p className="text-[10px] text-text-secondary mt-1">{selectedBlueprint.description}</p>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-text-secondary mb-1">Project Brief / Prompt de la Tarea</label>
        <textarea
          rows={5}
          value={wizardPrompt}
          onChange={(e) => setWizardPrompt(e.target.value)}
          placeholder="Describe la tarea o proyecto a estimar/evaluar..."
          className="w-full bg-bg border border-surface-hover rounded-xl px-3 py-2.5 text-xs text-text-primary focus:outline-none focus:border-accent/40 font-mono"
        />
      </div>

      <div className="flex justify-end pt-2">
        {selectedBlueprintId ? (
          <div className="flex justify-end gap-2">
            <button
              onClick={onSaveBlueprint}
              className="px-4 py-2 bg-surface-hover hover:bg-surface-hover/80 text-text-primary rounded-xl text-xs font-semibold border border-surface-hover"
            >
              Cargar Template
            </button>
            <button
              onClick={onSaveAndRunBlueprint}
              className="px-4 py-2 bg-accent text-bg hover:bg-accent/90 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <span>Cargar y Ejecutar</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-end w-full gap-2">
            {analyzeChannelLoading ? (
              <div className="w-full bg-bg/50 rounded-xl border border-surface-hover p-3 max-h-32 overflow-y-auto custom-scrollbar">
                <div className="text-xs text-text-secondary font-mono whitespace-pre-wrap break-words">
                  {analyzeChannelText || (
                    <span className="inline-flex items-center gap-1.5 text-text-secondary/60">
                      <span className="w-2 h-2 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      Analizando tarea...
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <button
                onClick={onAnalyzeTask}
                disabled={!wizardPrompt.trim() || !wizardName.trim()}
                className="px-4 py-2 bg-accent text-bg hover:bg-accent/90 disabled:bg-surface-hover disabled:text-text-secondary/40 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
              >
                <span>Analizar Tarea con IA</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            )}
            {analyzeChannelError && (
              <p className="text-[10px] text-error mt-1">{analyzeChannelError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
