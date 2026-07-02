interface Dichotomy {
  id: string;
  reason: string;
}

interface Props {
  suggestedDichotomies: Dichotomy[];
  selectedDichotomies: string[];
  setSelectedDichotomies: (val: string[]) => void;
  criteria: string[];
  newCriterion: string;
  setNewCriterion: (val: string) => void;
  onAddCriterion: () => void;
  onRemoveCriterion: (idx: number) => void;
  briefingsChannelLoading: boolean;
  briefingsChannelText: string;
  briefingsChannelError: string | null;
  onBack: () => void;
  onGenerateStances: () => void;
}

export function WizardStep2({
  suggestedDichotomies,
  selectedDichotomies,
  setSelectedDichotomies,
  criteria,
  newCriterion,
  setNewCriterion,
  onAddCriterion,
  onRemoveCriterion,
  briefingsChannelLoading,
  briefingsChannelText,
  briefingsChannelError,
  onBack,
  onGenerateStances,
}: Props) {
  const toggleDichotomy = (id: string) => {
    if (selectedDichotomies.includes(id)) {
      setSelectedDichotomies(selectedDichotomies.filter((dId) => dId !== id));
    } else {
      setSelectedDichotomies([...selectedDichotomies, id]);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-2">Dicotomías Recomendadas por IA</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {suggestedDichotomies.map((dic) => (
            <div
              key={dic.id}
              onClick={() => toggleDichotomy(dic.id)}
              className={`p-3 rounded-xl border transition-all cursor-pointer text-left ${
                selectedDichotomies.includes(dic.id)
                  ? "bg-surface border-accent/40"
                  : "bg-surface-hover/30 border-transparent hover:bg-surface-hover"
              }`}
            >
              <h4 className="text-xs font-bold text-text-primary capitalize">{dic.id.replace(/_/g, " ")}</h4>
              <p className="text-[10px] text-text-secondary mt-1">{dic.reason}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-2">Criterios del Rubro de Evaluación (Judge)</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={newCriterion}
            onChange={(e) => setNewCriterion(e.target.value)}
            placeholder="Añadir criterio personalizado..."
            className="flex-1 bg-bg border border-surface-hover rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none"
          />
          <button
            onClick={onAddCriterion}
            className="px-3 bg-surface-hover hover:bg-surface rounded-xl text-xs border border-surface-hover"
          >
            Añadir
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {criteria.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-surface-hover px-2.5 py-1 rounded-full text-[10px] border border-surface-hover">
              <span>{c}</span>
              <button
                onClick={() => onRemoveCriterion(i)}
                className="text-text-secondary hover:text-error font-bold"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between pt-4 border-t border-surface-hover items-start gap-3">
        <button
          onClick={onBack}
          disabled={briefingsChannelLoading}
          className="px-4 py-2 bg-surface-hover hover:bg-surface-hover/80 text-text-primary rounded-xl text-xs font-semibold disabled:opacity-50 flex-shrink-0"
        >
          Atrás
        </button>
        <div className="flex-1 flex flex-col items-end gap-2">
          {briefingsChannelLoading ? (
            <div className="w-full bg-bg/50 rounded-xl border border-surface-hover p-3 max-h-32 overflow-y-auto custom-scrollbar">
              <div className="text-xs text-text-secondary font-mono whitespace-pre-wrap break-words">
                {briefingsChannelText || (
                  <span className="inline-flex items-center gap-1.5 text-text-secondary/60">
                    <span className="w-2 h-2 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    Generando briefings de agentes...
                  </span>
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={onGenerateStances}
              disabled={selectedDichotomies.length === 0}
              className="px-4 py-2 bg-accent text-bg hover:bg-accent/90 disabled:bg-surface-hover disabled:text-text-secondary/40 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
            >
              <span>Generar Briefings de Agentes</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}
          {briefingsChannelError && (
            <p className="text-[10px] text-error">{briefingsChannelError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
