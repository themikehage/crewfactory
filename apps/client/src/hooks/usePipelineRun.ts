import { useEffect, useState, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { wsClient } from "@/lib/ws-client";
import type { PipelineRun } from "shared";

export function usePipelineRun(pipelineId: string, runId: string) {
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [logs, setLogs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const logsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    
    apiFetch(`/api/pipelines/${pipelineId}/runs/${runId}`)
      .then((res) => res.json())
      .then((data) => {
        if (active) {
          setRun(data.run);
          setLoading(false);
          const initialLogs: Record<string, string> = {};
          if (data.run) {
            for (const s of data.run.stageResults) {
              initialLogs[s.stageId] = s.rawOutput || "";
            }
          }
          logsRef.current = initialLogs;
          setLogs(initialLogs);
        }
      })
      .catch((err) => {
        if (active) {
          setError(String(err));
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [pipelineId, runId]);

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    const handleRunStarted = (data: any) => {
      if (data.runId === runId) {
        setRun(prev => prev ? { ...prev, status: "running" } : null);
      }
    };

    const handleStageStarted = (data: any) => {
      if (data.runId === runId) {
        setRun(prev => {
          if (!prev) return null;
          return {
            ...prev,
            stageResults: prev.stageResults.map(s => 
              s.stageId === data.stageId ? { ...s, status: "running", startedAt: new Date().toISOString() } : s
            )
          };
        });
      }
    };

    const handleStageCompleted = (data: any) => {
      if (data.runId === runId) {
        setRun(prev => {
          if (!prev) return null;
          return {
            ...prev,
            stageResults: prev.stageResults.map(s => 
              s.stageId === data.stageId ? { 
                ...s, 
                status: "completed", 
                finishedAt: new Date().toISOString(),
                output: data.output
              } : s
            )
          };
        });
      }
    };

    const handleStageFailed = (data: any) => {
      if (data.runId === runId) {
        setRun(prev => {
          if (!prev) return null;
          return {
            ...prev,
            stageResults: prev.stageResults.map(s => 
              s.stageId === data.stageId ? { 
                ...s, 
                status: "failed", 
                finishedAt: new Date().toISOString()
              } : s
            )
          };
        });
      }
    };

    const handleRunCompleted = (data: any) => {
      if (data.runId === runId) {
        setRun(prev => prev ? { ...prev, status: "completed", finishedAt: new Date().toISOString() } : null);
      }
    };

    const handleRunFailed = (data: any) => {
      if (data.runId === runId) {
        setRun(prev => prev ? { 
          ...prev, 
          status: "failed", 
          finishedAt: new Date().toISOString(),
          error: { stageId: data.stageId, message: data.error }
        } : null);
      }
    };

    const handleStageLog = (data: any) => {
      if (data.runId === runId) {
        const { stageId, text } = data;
        const current = logsRef.current[stageId] || "";
        const updated = current + text;
        logsRef.current[stageId] = updated;
        setLogs({ ...logsRef.current });
      }
    };

    unsubs.push(wsClient.subscribe("pipeline_run_started", handleRunStarted));
    unsubs.push(wsClient.subscribe("pipeline_stage_started", handleStageStarted));
    unsubs.push(wsClient.subscribe("pipeline_stage_completed", handleStageCompleted));
    unsubs.push(wsClient.subscribe("pipeline_stage_failed", handleStageFailed));
    unsubs.push(wsClient.subscribe("pipeline_run_completed", handleRunCompleted));
    unsubs.push(wsClient.subscribe("pipeline_run_failed", handleRunFailed));
    unsubs.push(wsClient.subscribe("pipeline_stage_log", handleStageLog));

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [runId]);

  useEffect(() => {
    if (!run || run.status !== "running") return;

    let active = true;
    const interval = setInterval(async () => {
      try {
        const res = await apiFetch(`/api/pipelines/${pipelineId}/runs/${runId}`);
        const data = await res.json();
        if (active && data.run) {
          setRun((prev) => {
            if (!prev) return data.run;
            if (data.run.status !== "running" || prev.status === "running") {
              const updatedLogs = { ...logsRef.current };
              let logsChanged = false;
              for (const s of data.run.stageResults) {
                if (s.rawOutput && s.rawOutput !== updatedLogs[s.stageId]) {
                  updatedLogs[s.stageId] = s.rawOutput;
                  logsChanged = true;
                }
              }
              if (logsChanged) {
                logsRef.current = updatedLogs;
                setLogs(updatedLogs);
              }
              return data.run;
            }
            return prev;
          });
          if (data.run.status !== "running") {
            clearInterval(interval);
          }
        }
      } catch (e) {
        console.warn("Failed to poll pipeline run status:", e);
      }
    }, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [pipelineId, runId, run?.status]);

  return { run, logs, loading, error };
}
