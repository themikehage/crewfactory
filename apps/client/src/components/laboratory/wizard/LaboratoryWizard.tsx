import { motion } from "framer-motion";
import type { Blueprint, Agent } from "@/types/laboratory";
import { WizardStep1 } from "./WizardStep1";
import { WizardStep2 } from "./WizardStep2";
import { WizardStep3 } from "./WizardStep3";
import { WizardStep4 } from "./WizardStep4";

interface Props {
  wizardStep: number;
  setWizardStep: (val: number) => void;
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
  suggestedDichotomies: { id: string; reason: string }[];
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
  onGenerateStances: () => void;
  customAgents: Agent[];
  defaultModel: string;
  defaultModelLoaded: boolean;
  onSetAllModels: (model: string) => void;
  onUpdateAgentModel: (id: string, model: string) => void;
  onUpdateAgentPrompt: (id: string, text: string) => void;
  onCancel: () => void;
  onSave: () => void;
  onSaveAndRun: () => void;
}

export function LaboratoryWizard({
  wizardStep,
  setWizardStep,
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
  onGenerateStances,
  customAgents,
  defaultModel,
  defaultModelLoaded,
  onSetAllModels,
  onUpdateAgentModel,
  onUpdateAgentPrompt,
  onCancel,
  onSave,
  onSaveAndRun,
}: Props) {
  return (
    <motion.div
      key="wizard"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="max-w-3xl mx-auto w-full bg-surface border border-surface-hover rounded-2xl p-6 shadow-xl space-y-6 text-left"
    >
      <div className="flex items-center justify-between border-b border-surface-hover pb-4">
        <div>
          <h1 className="text-base font-bold text-text-primary">Laboratorio de Benchmarking Multivariable</h1>
          <p className="text-xs text-text-secondary mt-1">Configuración guiada de experimentos y debate competitivo.</p>
        </div>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 bg-surface-hover hover:bg-surface-hover/80 text-text-primary rounded-lg text-xs font-semibold border border-surface-hover"
        >
          Cancelar
        </button>
      </div>

      <div className="flex items-center justify-between bg-bg/50 p-3 rounded-xl border border-surface-hover/50 text-[10px] font-semibold text-text-secondary">
        <div className="flex items-center gap-1.5">
          <span className={`w-5 h-5 rounded-full flex items-center justify-center ${wizardStep >= 1 ? "bg-accent text-bg" : "bg-surface-hover text-text-secondary"}`}>1</span>
          <span>Configuración General</span>
        </div>
        <div className="w-12 h-px bg-surface-hover" />
        <div className="flex items-center gap-1.5">
          <span className={`w-5 h-5 rounded-full flex items-center justify-center ${wizardStep >= 2 ? "bg-accent text-bg" : "bg-surface-hover text-text-secondary"}`}>2</span>
          <span>Análisis & Rúbrica</span>
        </div>
        <div className="w-12 h-px bg-surface-hover" />
        <div className="flex items-center gap-1.5">
          <span className={`w-5 h-5 rounded-full flex items-center justify-center ${wizardStep >= 3 ? "bg-accent text-bg" : "bg-surface-hover text-text-secondary"}`}>3</span>
          <span>Briefings & Modelos</span>
        </div>
        <div className="w-12 h-px bg-surface-hover" />
        <div className="flex items-center gap-1.5">
          <span className={`w-5 h-5 rounded-full flex items-center justify-center ${wizardStep >= 4 ? "bg-accent text-bg" : "bg-surface-hover text-text-secondary"}`}>4</span>
          <span>Confirmación</span>
        </div>
      </div>

      {wizardStep === 1 && (
        <WizardStep1
          wizardName={wizardName}
          setWizardName={setWizardName}
          wizardPrompt={wizardPrompt}
          setWizardPrompt={setWizardPrompt}
          blueprints={blueprints}
          selectedBlueprintId={selectedBlueprintId}
          onSelectBlueprint={onSelectBlueprint}
          selectedBlueprint={selectedBlueprint}
          analyzeChannelLoading={analyzeChannelLoading}
          analyzeChannelText={analyzeChannelText}
          analyzeChannelError={analyzeChannelError}
          onAnalyzeTask={onAnalyzeTask}
          onSaveBlueprint={onSaveBlueprint}
          onSaveAndRunBlueprint={onSaveAndRunBlueprint}
        />
      )}

      {wizardStep === 2 && (
        <WizardStep2
          suggestedDichotomies={suggestedDichotomies}
          selectedDichotomies={selectedDichotomies}
          setSelectedDichotomies={setSelectedDichotomies}
          criteria={criteria}
          newCriterion={newCriterion}
          setNewCriterion={setNewCriterion}
          onAddCriterion={onAddCriterion}
          onRemoveCriterion={onRemoveCriterion}
          briefingsChannelLoading={briefingsChannelLoading}
          briefingsChannelText={briefingsChannelText}
          briefingsChannelError={briefingsChannelError}
          onBack={() => setWizardStep(1)}
          onGenerateStances={onGenerateStances}
        />
      )}

      {wizardStep === 3 && (
        <WizardStep3
          customAgents={customAgents}
          defaultModel={defaultModel}
          defaultModelLoaded={defaultModelLoaded}
          onSetAllModels={onSetAllModels}
          onUpdateAgentModel={onUpdateAgentModel}
          onUpdateAgentPrompt={onUpdateAgentPrompt}
          onBack={() => setWizardStep(2)}
          onNext={() => setWizardStep(4)}
        />
      )}

      {wizardStep === 4 && (
        <WizardStep4
          customAgents={customAgents}
          onBack={() => setWizardStep(3)}
          onSave={onSave}
          onSaveAndRun={onSaveAndRun}
        />
      )}
    </motion.div>
  );
}
