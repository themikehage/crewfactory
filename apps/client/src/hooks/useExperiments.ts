import { apiFetch } from "@/lib/api";
import { useState, useEffect, useCallback } from "react";
import type { Experiment } from "@/types/laboratory";

export function useExperiments() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExperiments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/experiments");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setExperiments(data.experiments || []);
    } catch (err: any) {
      setError(err.message || "Failed to load experiments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExperiments();
  }, [fetchExperiments]);

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      const type = customEvent.detail?.type;
      if (type === "experiment" || type === "all" || !type) {
        fetchExperiments();
      }
    };
    window.addEventListener("entity-updated", handleUpdate);
    return () => window.removeEventListener("entity-updated", handleUpdate);
  }, [fetchExperiments]);

  const createExperiment = useCallback(async (data: {
    name: string;
    taskPrompt: string;
    criteria: string[];
    variants?: any;
  }): Promise<Experiment> => {
    const res = await apiFetch("/api/experiments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const result = await res.json();
    const saved = result.experiment as Experiment;
    setExperiments((prev) => [saved, ...prev]);
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "experiment" } }));
    return saved;
  }, []);

  const updateExperiment = useCallback(async (id: string, data: {
    name?: string;
    taskPrompt?: string;
    criteria?: string[];
    variants?: any;
  }): Promise<Experiment> => {
    const res = await apiFetch(`/api/experiments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const result = await res.json();
    const updated = result.experiment as Experiment;
    setExperiments((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "experiment" } }));
    return updated;
  }, []);

  const deleteExperiment = useCallback(async (id: string): Promise<void> => {
    const res = await apiFetch(`/api/experiments/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    setExperiments((prev) => prev.filter((e) => e.id !== id));
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "experiment" } }));
  }, []);

  const runExperiment = useCallback(async (id: string, taskPrompt?: string): Promise<void> => {
    if (taskPrompt) {
      await apiFetch(`/api/experiments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskPrompt }),
      });
    }
    await apiFetch(`/api/experiments/${id}/run`, { method: "POST" });
    await fetchExperiments();
  }, [fetchExperiments]);

  const stopExperiment = useCallback(async (id: string): Promise<void> => {
    await apiFetch(`/api/experiments/${id}/stop`, { method: "POST" });
  }, []);

  const judgeExperiment = useCallback(async (id: string, judgeModel?: string): Promise<Experiment> => {
    const res = await apiFetch(`/api/experiments/${id}/judge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ judgeModel }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const updated = data.experiment as Experiment;
    setExperiments((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    return updated;
  }, []);

  const exportExperiment = useCallback(async (id: string, payload: {
    variantKey: "single" | "multiNoLeader" | "multiWithLeader";
    channelName?: string;
  }): Promise<any> => {
    const res = await apiFetch(`/api/experiments/${id}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }, []);

  return {
    experiments,
    loading,
    error,
    fetchExperiments,
    setExperiments,
    createExperiment,
    updateExperiment,
    deleteExperiment,
    runExperiment,
    stopExperiment,
    judgeExperiment,
    exportExperiment,
  };
}
