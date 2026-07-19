import { LaboratoryPage } from "@/pages/LaboratoryPage";
import { ExperimentDetailPage } from "@/pages/ExperimentDetailPage";
import { useRouteRuntime } from "@/router/RouteRuntimeContext";

export function LaboratoryRoute() {
  const { route, navigate, laboratory } = useRouteRuntime();
  if (route.page !== "laboratory") return null;
  if (!route.experimentId) return <LaboratoryPage onNavigate={navigate} experiments={laboratory.experiments} setExperiments={laboratory.setExperiments} isEditorOpen={laboratory.isEditorOpen} setIsEditorOpen={laboratory.setIsEditorOpen} editingExpId={laboratory.editingExpId} sessionId={route.sessionId} />;
  return <ExperimentDetailPage experimentId={route.experimentId} experiments={laboratory.experiments} setExperiments={laboratory.setExperiments} activeVariantTab={laboratory.activeVariantTab} setActiveVariantTab={laboratory.setActiveVariantTab} onJudgeExperiment={laboratory.judgeExperiment} selectedRunId={laboratory.selectedRunId} selectedRunData={laboratory.selectedRunData} onRefreshRuns={() => laboratory.fetchPastRuns(route.experimentId!)} />;
}
