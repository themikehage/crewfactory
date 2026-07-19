import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ExportExperimentModal } from "@/components/laboratory/ExportExperimentModal";
import { RunExperimentModal } from "@/components/laboratory/RunExperimentModal";
import type { useLaboratoryController } from "@/hooks/useLaboratoryController";

interface LaboratoryModalsProps {
  controller: ReturnType<typeof useLaboratoryController>;
  navigate: (path: string) => void;
}

export function LaboratoryModals({ controller, navigate }: LaboratoryModalsProps) {
  return <>
    <ConfirmModal open={controller.deleteModal.open} onClose={controller.deleteModal.onClose} onConfirm={controller.deleteModal.onConfirm} title="Delete Experiment" message="Are you sure you want to permanently delete this experiment?" confirmLabel="Delete" destructive loading={controller.deleteModal.loading} />
    {controller.exportExperiment && <ExportExperimentModal experiment={controller.exportExperiment} onClose={controller.closeExport} onNavigate={navigate} />}
    {controller.runPromptModal.open && <RunExperimentModal runPromptValue={controller.runPromptModal.value} setRunPromptValue={controller.runPromptModal.setValue} onCancel={controller.runPromptModal.onCancel} onConfirm={controller.runPromptModal.onConfirm} />}
  </>;
}
