import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { wsClient } from "@/lib/ws-client";
import type { Experiment } from "@/types/laboratory";

type ActiveVariantTab = "chat" | "config" | "single" | "multiNoLeader" | "multiWithLeader" | "compare";

interface ExperimentRunSummary {
  activeRunId?: string;
  createdAt?: string;
  [key: string]: unknown;
}

interface UseLaboratoryControllerOptions {
  experimentId: string | null;
  enabled: boolean;
  navigate: (path: string) => void;
}

export function useLaboratoryController({ experimentId, enabled, navigate }: UseLaboratoryControllerOptions) {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingExpId, setEditingExpId] = useState<string | null>(null);
  const [isRunPromptModalOpen, setIsRunPromptModalOpen] = useState(false);
  const [runPromptValue, setRunPromptValue] = useState("");
  const [runningExpId, setRunningExpId] = useState<string | null>(null);
  const [exportingExpId, setExportingExpId] = useState<string | null>(null);
  const [activeVariantTab, setActiveVariantTab] = useState<ActiveVariantTab>("chat");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteExpId, setPendingDeleteExpId] = useState<string | null>(null);
  const [deletingExp, setDeletingExp] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState("latest");
  const [selectedRunData, setSelectedRunData] = useState<Experiment | null>(null);
  const [pastRuns, setPastRuns] = useState<ExperimentRunSummary[]>([]);
  const [runPopoverOpen, setRunPopoverOpen] = useState(false);

  const fetchPastRuns = useCallback(async (id: string) => {
    try {
      const res = await apiFetch(`/api/experiments/${id}/runs`);
      if (res.ok) {
        const data = await res.json() as { runs?: ExperimentRunSummary[] };
        setPastRuns(data.runs || []);
      }
    } catch (error) {
      console.error("Failed to fetch runs:", error);
    }
  }, []);

  const selectRun = useCallback(async (runId: string) => {
    setSelectedRunId(runId);
    if (runId === "latest" || !experimentId) {
      setSelectedRunData(null);
      return;
    }

    try {
      const res = await apiFetch(`/api/experiments/${experimentId}/runs/${runId}`);
      if (res.ok) {
        const data = await res.json() as { experiment: Experiment };
        setSelectedRunData(data.experiment);
      }
    } catch (error) {
      console.error("Failed to load run details:", error);
    }
  }, [experimentId]);

  useEffect(() => {
    if (!experimentId) return;
    setSelectedRunId("latest");
    setSelectedRunData(null);
    fetchPastRuns(experimentId);
  }, [experimentId, fetchPastRuns]);

  const fetchExperiments = useCallback(async () => {
    try {
      const res = await apiFetch("/api/experiments");
      if (res.ok) {
        const data = await res.json() as { experiments?: Experiment[] };
        setExperiments(data.experiments || []);
      }
    } catch (error) {
      console.error("Failed to load experiments:", error);
    }
  }, []);

  useEffect(() => {
    if (enabled) fetchExperiments();
  }, [enabled, fetchExperiments]);

  const stopRun = useCallback(async (id?: string) => {
    const targetId = id || runningExpId;
    if (!targetId) return;
    try {
      await apiFetch(`/api/experiments/${targetId}/stop`, { method: "POST" });
    } catch (error) {
      console.error("Failed to stop experiment:", error);
    } finally {
      setRunningExpId(null);
    }
  }, [runningExpId]);

  const judgeExperiment = useCallback(async (id: string, judgeModel?: string) => {
    try {
      const res = await apiFetch(`/api/experiments/${id}/judge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ judgeModel }),
      });
      if (res.ok) {
        const data = await res.json() as { experiment: Experiment };
        setExperiments((current) => current.map((experiment) => experiment.id === id ? data.experiment : experiment));
      }
    } catch (error) {
      console.error("Failed to judge experiment:", error);
    }
  }, []);

  const confirmRun = useCallback(async () => {
    if (!runningExpId) return;
    setIsRunPromptModalOpen(false);
    try {
      const patchResponse = await apiFetch(`/api/experiments/${runningExpId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskPrompt: runPromptValue }),
      });
      if (!patchResponse.ok) throw new Error("Failed to update prompt");

      const patchData = await patchResponse.json() as { experiment: Experiment };
      setExperiments((current) => current.map((experiment) => experiment.id === patchData.experiment.id ? patchData.experiment : experiment));
      await apiFetch(`/api/experiments/${runningExpId}/run`, { method: "POST" });
      fetchExperiments();
    } catch (error) {
      console.error("Failed to run experiment:", error);
    } finally {
      setRunningExpId(null);
    }
  }, [fetchExperiments, runPromptValue, runningExpId]);

  const deleteExperiment = useCallback(async () => {
    if (!pendingDeleteExpId) return;
    setDeletingExp(true);
    try {
      const res = await apiFetch(`/api/experiments/${pendingDeleteExpId}`, { method: "DELETE" });
      if (res.ok) {
        setExperiments((current) => current.filter((experiment) => experiment.id !== pendingDeleteExpId));
        if (experimentId === pendingDeleteExpId) navigate("/laboratory");
      }
    } catch (error) {
      console.error("Failed to delete experiment:", error);
    } finally {
      setDeletingExp(false);
      setShowDeleteConfirm(false);
      setPendingDeleteExpId(null);
    }
  }, [experimentId, navigate, pendingDeleteExpId]);

  const requestDelete = useCallback((id: string) => {
    setPendingDeleteExpId(id);
    setShowDeleteConfirm(true);
  }, []);

  const requestRun = useCallback((id: string) => {
    const experiment = experiments.find((item) => item.id === id);
    if (!experiment) return;
    setRunningExpId(id);
    setRunPromptValue(experiment.taskPrompt);
    setIsRunPromptModalOpen(true);
  }, [experiments]);

  const requestEdit = useCallback((id: string) => {
    if (!experiments.some((experiment) => experiment.id === id)) return;
    setEditingExpId(id);
    setIsEditorOpen(true);
  }, [experiments]);

  useEffect(() => {
    return wsClient.subscribe("experiment_status", (rawData: unknown) => {
      const data = rawData as {
        experimentId: string;
        status: "running" | "completed" | "failed";
        activeVariant?: "single" | "multiNoLeader" | "multiWithLeader" | "judging";
        experiment?: Experiment;
      };

      setExperiments((current) => current.map((experiment) => {
        if (experiment.id !== data.experimentId) return experiment;
        if (data.experiment) return data.experiment;
        return {
          ...experiment,
          status: data.status,
          ...(data.activeVariant !== undefined ? { activeVariant: data.activeVariant } : {}),
        };
      }));

      if ((data.status === "completed" || data.status === "failed") && experimentId === data.experimentId) {
        fetchPastRuns(data.experimentId);
      }
    });
  }, [experimentId, fetchPastRuns]);

  const closeDeleteModal = useCallback(() => {
    setShowDeleteConfirm(false);
    setPendingDeleteExpId(null);
  }, []);

  const closeRunPromptModal = useCallback(() => {
    setIsRunPromptModalOpen(false);
    setRunningExpId(null);
  }, []);

  return {
    experiments,
    setExperiments,
    isEditorOpen,
    setIsEditorOpen,
    editingExpId,
    activeVariantTab,
    setActiveVariantTab,
    selectedRunId,
    selectedRunData,
    pastRuns,
    runPopoverOpen,
    setRunPopoverOpen,
    selectRun,
    fetchPastRuns,
    requestDelete,
    requestRun,
    stopRun,
    requestEdit,
    judgeExperiment,
    requestExport: setExportingExpId,
    deleteModal: { open: showDeleteConfirm, onClose: closeDeleteModal, onConfirm: deleteExperiment, loading: deletingExp },
    exportExperiment: exportingExpId ? experiments.find((experiment) => experiment.id === exportingExpId) || null : null,
    closeExport: () => setExportingExpId(null),
    runPromptModal: { open: isRunPromptModalOpen, value: runPromptValue, setValue: setRunPromptValue, onCancel: closeRunPromptModal, onConfirm: confirmRun },
  };
}
