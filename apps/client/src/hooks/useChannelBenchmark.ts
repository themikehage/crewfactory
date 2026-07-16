import { apiFetch } from "@/lib/api";
import { wsClient } from "@/lib/ws-client";
import { useState, useEffect, useCallback } from "react";
import type { ChannelBenchmarkRun } from "shared";

export interface RunSummary {
  runId: string;
  name?: string;
  status: "running" | "completed" | "failed";
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  winner?: "multi" | "single" | "tie";
  scores?: {
    multi: number;
    single: number;
  };
}

export function useChannelBenchmark(channelId: string) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [progressStep, setProgressStep] = useState<"multi" | "single" | "judging" | null>(null);
  const [judgeDelta, setJudgeDelta] = useState<string>("");

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/channels/${channelId}/benchmarks`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRuns(data.runs || []);
    } catch (err: any) {
      setError(err.message || "Failed to load benchmark runs");
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  // Subscribe to real-time events via wsClient
  useEffect(() => {
    const onStarted = (data: any) => {
      if (data.channelId !== channelId) return;
      setActiveRunId(data.runId);
      setProgressStep("multi");
      setJudgeDelta("");
      fetchRuns();
    };

    const onProgress = (data: any) => {
      if (data.channelId !== channelId) return;
      setActiveRunId(data.runId);
      setProgressStep(data.variant);
    };

    const onComplete = (data: any) => {
      if (data.channelId !== channelId) return;
      setActiveRunId(null);
      setProgressStep(null);
      setJudgeDelta("");
      fetchRuns();
    };

    const onFailed = (data: any) => {
      if (data.channelId !== channelId) return;
      setActiveRunId(null);
      setProgressStep(null);
      setJudgeDelta("");
      fetchRuns();
      setError(data.error || "Benchmark run failed");
    };

    const onJudgeStreaming = (data: any) => {
      if (data.channelId !== channelId) return;
      if (data.textDelta) {
        setJudgeDelta((prev) => prev + data.textDelta);
      }
    };

    const unsubStarted = wsClient.subscribe("benchmark_started", onStarted);
    const unsubProgress = wsClient.subscribe("benchmark_progress", onProgress);
    const unsubComplete = wsClient.subscribe("benchmark_complete", onComplete);
    const unsubFailed = wsClient.subscribe("benchmark_failed", onFailed);
    const unsubJudgeStream = wsClient.subscribe("benchmark_judge_streaming", onJudgeStreaming);

    return () => {
      unsubStarted();
      unsubProgress();
      unsubComplete();
      unsubFailed();
      unsubJudgeStream();
    };
  }, [channelId, fetchRuns]);

  const startBenchmark = useCallback(async (opts: {
    taskPrompt: string;
    name?: string;
    singleAgentId?: string;
    criteria?: string[];
  }) => {
    setError(null);
    try {
      const res = await apiFetch(`/api/channels/${channelId}/benchmarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to trigger benchmark" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setActiveRunId(data.runId);
      setProgressStep("multi");
      return data.runId;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [channelId]);

  const stopBenchmark = useCallback(async () => {
    try {
      wsClient.send({
        type: "benchmark_stop",
        channelId
      });
      setActiveRunId(null);
      setProgressStep(null);
    } catch (err: any) {
      setError(err.message || "Failed to stop benchmark");
    }
  }, [channelId]);

  const deleteRun = useCallback(async (runId: string) => {
    try {
      const res = await apiFetch(`/api/channels/${channelId}/benchmarks/${runId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchRuns();
    } catch (err: any) {
      setError(err.message || "Failed to delete run");
      throw err;
    }
  }, [channelId, fetchRuns]);

  const reEvaluateRun = useCallback(async (runId: string) => {
    setError(null);
    try {
      const res = await apiFetch(`/api/channels/${channelId}/benchmarks/${runId}/re-evaluate`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to re-evaluate" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      await fetchRuns();
      return data.run;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [channelId, fetchRuns]);

  const getRunDetails = useCallback(async (runId: string): Promise<ChannelBenchmarkRun> => {
    const res = await apiFetch(`/api/channels/${channelId}/benchmarks/${runId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.run;
  }, [channelId]);

  return {
    runs,
    loading,
    error,
    activeRunId,
    progressStep,
    judgeDelta,
    startBenchmark,
    stopBenchmark,
    deleteRun,
    reEvaluateRun,
    getRunDetails,
    fetchRuns,
  };
}
