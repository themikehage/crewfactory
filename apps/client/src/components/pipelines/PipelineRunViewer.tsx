import { useState, useEffect } from "react";
import { usePipelineRun } from "@/hooks/usePipelineRun";
import { useLiterals } from "@/lib";
import { literals as u } from "./PipelineRunViewer.literals";
import {
  Square,
  CheckCircle,
  XCircle,
  Clock,
  Code,
  Terminal,
  Activity,
  Layers,
  Cpu
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";

interface PipelineRunViewerProps {
  pipelineId: string;
  runId: string;
  onBack?: () => void;
}

export function PipelineRunViewer({ pipelineId, runId, onBack }: PipelineRunViewerProps) {
  const l = useLiterals(u);
  const { addToast } = useToast();
  const { run, logs, loading, error } = usePipelineRun(pipelineId, runId);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"logs" | "output">("logs");
  const [aborting, setAborting] = useState(false);

  // Auto-select running or first stage
  useEffect(() => {
    if (run && run.stageResults.length > 0) {
      if (!selectedStageId) {
        const runningStage = run.stageResults.find((s) => s.status === "running");
        if (runningStage) {
          setSelectedStageId(runningStage.stageId);
        } else {
          const failedStage = run.stageResults.find((s) => s.status === "failed");
          if (failedStage) {
            setSelectedStageId(failedStage.stageId);
          } else {
            setSelectedStageId(run.stageResults[0].stageId);
          }
        }
      }
    }
  }, [run, selectedStageId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-text-secondary">
        <Activity className="w-8 h-8 text-accent animate-spin" />
        <span className="text-sm">Loading run data...</span>
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="bg-error/10 border border-error/20 text-error rounded-xl p-6 flex flex-col gap-3">
        <h3 className="font-bold text-lg">Error loading run details</h3>
        <p className="text-sm">{error || "Run not found"}</p>
        {onBack && (
          <Button variant="outline" onClick={onBack} className="w-fit">
            Go Back
          </Button>
        )}
      </div>
    );
  }

  const currentStage = run.stageResults.find((s) => s.stageId === selectedStageId);

  // Compute duration
  const getDuration = (start?: string, end?: string) => {
    if (!start) return "—";
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const diff = endTime - startTime;
    if (diff < 1000) return `${diff}ms`;
    const secs = Math.floor(diff / 1000) % 60;
    const mins = Math.floor(diff / 60000);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const handleAbort = async () => {
    setAborting(true);
    try {
      await apiFetch(`/api/pipelines/${pipelineId}/runs/${runId}/abort`, {
        method: "POST",
      });
      addToast("info", "Pipeline aborted");
    } catch (e: any) {
      addToast("error", e.message || "Failed to abort pipeline");
    } finally {
      setAborting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Header card */}
      <div className="bg-surface border border-border rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs px-2 py-0.5 bg-bg text-text-secondary rounded border border-border font-mono">
              {run.pipelineId}
            </span>
            <span className="text-text-secondary text-xs font-mono">ID: {run.id.slice(0, 13)}...</span>
          </div>
          <h2 className="text-xl font-extrabold text-text-primary flex items-center gap-2">
            {l.runTitle}
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full border ${
                run.status === "running"
                  ? "bg-accent/10 border-accent/20 text-accent animate-pulse"
                  : run.status === "completed"
                  ? "bg-success/10 border-success/20 text-success"
                  : "bg-error/10 border-error/20 text-error"
              }`}
            >
              {run.status === "running"
                ? l.statusRunning
                : run.status === "completed"
                ? l.statusCompleted
                : l.statusFailed}
            </span>
          </h2>
        </div>

        <div className="flex items-center gap-4 text-sm text-text-secondary">
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            <span>
              {l.duration}: {getDuration(run.startedAt, run.finishedAt)}
            </span>
          </div>

          {run.status === "running" && (
            <button
              onClick={handleAbort}
              disabled={aborting}
              className="bg-error/10 border border-error/20 text-error hover:bg-error hover:text-bg hover:border-error transition-all px-3 py-1.5 rounded-lg flex items-center gap-1 text-xs font-bold"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              {l.abort}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start h-full">
        {/* Stepper list */}
        <div className="lg:col-span-1 bg-surface border border-border rounded-xl p-4 flex flex-col gap-2">
          {run.stageResults.map((stage, idx) => {
            const isSelected = selectedStageId === stage.stageId;
            const isRunning = stage.status === "running";
            const isCompleted = stage.status === "completed";
            const isFailed = stage.status === "failed";

            return (
              <button
                key={stage.stageId}
                onClick={() => setSelectedStageId(stage.stageId)}
                className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "bg-surface-hover/20 border-accent text-text-primary"
                    : "bg-surface/40 border-border/60 hover:bg-surface-hover/10 text-text-secondary hover:text-text-primary"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative flex items-center justify-center">
                    {/* Visual stepper lines */}
                    {idx < run.stageResults.length - 1 && (
                      <div className="absolute top-7 bottom-0 w-[2px] bg-border left-1/2 -translate-x-1/2 h-8" />
                    )}

                    {isCompleted ? (
                      <CheckCircle className="w-6 h-6 text-success" />
                    ) : isFailed ? (
                      <XCircle className="w-6 h-6 text-error" />
                    ) : isRunning ? (
                      <div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                    ) : (
                      <div className="w-6 h-6 rounded-full border-2 border-border bg-bg flex items-center justify-center text-xs font-mono">
                        {idx + 1}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-text-primary">
                      {stage.stageId}
                    </h4>
                    <span className="text-xs text-text-secondary">
                      {stage.status === "running"
                        ? l.stageStatusRunning
                        : stage.status === "completed"
                        ? l.stageStatusCompleted
                        : stage.status === "failed"
                        ? l.stageStatusFailed
                        : l.stageStatusPending}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-text-secondary font-mono flex flex-col items-end">
                  {stage.startedAt && <span>{getDuration(stage.startedAt, stage.finishedAt)}</span>}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected stage details & logs panel */}
        <div className="lg:col-span-2 bg-surface border border-border rounded-xl overflow-hidden flex flex-col h-[600px]">
          {currentStage ? (
            <div className="flex flex-col h-full">
              {/* Stage header info */}
              <div className="p-5 border-b border-border/80 bg-surface flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-text-primary flex items-center gap-2">
                    {currentStage.stageId}
                    <span className="text-xs font-normal text-text-secondary font-mono">
                      {l.startedAt}: {currentStage.startedAt ? new Date(currentStage.startedAt).toLocaleTimeString() : "—"}
                    </span>
                  </h3>
                  <div className="text-xs text-text-secondary flex items-center gap-3 mt-1 font-mono">
                    {currentStage.sessionId && (
                      <span className="flex items-center gap-1">
                        <Cpu className="w-3 h-3 text-accent" />
                        Session: {currentStage.sessionId}
                      </span>
                    )}
                    {currentStage.tokensIn !== undefined && (
                      <span className="flex items-center gap-1 text-accent">
                        Tokens: {currentStage.tokensIn + (currentStage.tokensOut || 0)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Tab selectors */}
                <div className="flex border border-border rounded-lg overflow-hidden bg-bg p-0.5">
                  <button
                    onClick={() => setActiveTab("logs")}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                      activeTab === "logs"
                        ? "bg-surface text-accent"
                        : "text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    {l.viewLogs}
                  </button>
                  <button
                    onClick={() => setActiveTab("output")}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                      activeTab === "output"
                        ? "bg-surface text-accent"
                        : "text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    <Code className="w-3.5 h-3.5" />
                    {l.parsedOutput}
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-5 bg-bg/40 font-mono text-sm">
                {activeTab === "logs" ? (
                  <pre className="whitespace-pre-wrap font-mono text-text-primary leading-relaxed text-xs break-all bg-bg border border-border p-4 rounded-xl max-h-full overflow-y-auto">
                    {logs[currentStage.stageId] || currentStage.rawOutput || "No logs generated yet."}
                  </pre>
                ) : (
                  <div className="h-full">
                    {currentStage.output && Object.keys(currentStage.output).length > 0 ? (
                      <pre className="p-4 bg-bg border border-border rounded-xl text-xs text-accent overflow-x-auto">
                        {JSON.stringify(currentStage.output, null, 2)}
                      </pre>
                    ) : (
                      <div className="text-text-secondary text-xs flex flex-col items-center justify-center h-full gap-2">
                        <Code className="w-8 h-8 text-border" />
                        <span>{l.noOutput}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-text-secondary gap-2">
              <Layers className="w-12 h-12 text-border" />
              <span>Select a stage to view progress logs</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
