import { LaboratoryPage } from "@/pages/LaboratoryPage";
import { ExperimentDetailPage } from "@/pages/ExperimentDetailPage";
import { useNavigate, useParams } from "react-router-dom";
import { useLaboratory } from "@/router/LaboratoryContext";

export function LaboratoryRoute() {
  const navigate = useNavigate();
  const { experimentId, "*": splat } = useParams();
  const laboratory = useLaboratory();
  const sessionId = splat?.startsWith("session/") ? splat.slice("session/".length) || null : null;
  if (!experimentId) return <LaboratoryPage onNavigate={navigate} experiments={laboratory.experiments} setExperiments={laboratory.setExperiments} isEditorOpen={laboratory.isEditorOpen} setIsEditorOpen={laboratory.setIsEditorOpen} editingExpId={laboratory.editingExpId} sessionId={sessionId} />;
  return <ExperimentDetailPage experimentId={experimentId} experiments={laboratory.experiments} setExperiments={laboratory.setExperiments} activeVariantTab={laboratory.activeVariantTab} setActiveVariantTab={laboratory.setActiveVariantTab} onJudgeExperiment={laboratory.judgeExperiment} selectedRunId={laboratory.selectedRunId} selectedRunData={laboratory.selectedRunData} onRefreshRuns={() => laboratory.fetchPastRuns(experimentId)} />;
}
