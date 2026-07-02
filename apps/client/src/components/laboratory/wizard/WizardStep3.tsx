import { ModelSelector } from "@/components/chat/ModelSelector";
import type { Agent } from "@/types/laboratory";

interface Props {
  customAgents: Agent[];
  defaultModel: string;
  defaultModelLoaded: boolean;
  onSetAllModels: (model: string) => void;
  onUpdateAgentModel: (id: string, model: string) => void;
  onUpdateAgentPrompt: (id: string, text: string) => void;
  onBack: () => void;
  onNext: () => void;
}

export function WizardStep3({
  customAgents,
  defaultModel,
  defaultModelLoaded,
  onSetAllModels,
  onUpdateAgentModel,
  onUpdateAgentPrompt,
  onBack,
  onNext,
}: Props) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider text-left">Customización de Briefings del Debate</h3>

      <div className="p-3 bg-accent/5 border border-accent/20 rounded-xl flex items-center justify-between gap-3 text-left">
        <div>
          <span className="text-xs font-semibold text-text-primary">Modelo por defecto para todos</span>
          <span className="text-[10px] text-text-secondary block">Se aplica a todos los agentes del experimento</span>
        </div>
        {defaultModelLoaded && (
          <ModelSelector
            sessionId={null}
            value={defaultModel}
            onChange={onSetAllModels}
          />
        )}
      </div>

      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {customAgents.map((ag) => (
          <div key={ag.id} className="p-4 bg-bg/50 rounded-xl border border-surface-hover space-y-3 text-left">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-xs font-bold text-accent">{ag.name}</span>
                <span className="text-[10px] text-text-secondary block">{ag.role}</span>
              </div>
              <div className="flex items-center">
                <label className="text-[10px] text-text-secondary mr-2">Modelo:</label>
                <ModelSelector
                  sessionId={null}
                  value={ag.model}
                  onChange={(modelId) => onUpdateAgentModel(ag.id, modelId)}
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-text-secondary mb-1">Instrucciones / System Prompt del Agente</label>
              <textarea
                rows={3}
                value={ag.systemPrompt}
                onChange={(e) => onUpdateAgentPrompt(ag.id, e.target.value)}
                className="w-full bg-bg border border-surface-hover rounded-xl px-2.5 py-1.5 text-xs text-text-secondary focus:text-text-primary focus:outline-none"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between pt-4 border-t border-surface-hover">
        <button
          onClick={onBack}
          className="px-4 py-2 bg-surface-hover hover:bg-surface-hover/80 text-text-primary rounded-xl text-xs font-semibold"
        >
          Atrás
        </button>
        <button
          onClick={onNext}
          className="px-4 py-2 bg-accent text-bg hover:bg-accent/90 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
        >
          <span>Continuar</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
