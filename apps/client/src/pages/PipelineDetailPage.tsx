import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import { useLiterals } from "@/lib";
import { literals as u } from "./PipelineDetailPage.literals";
import { PipelineRunViewer } from "@/components/pipelines/PipelineRunViewer";
import {
  ChevronLeft,
  Layers,
  Clock,
  Play,
  Activity,
  ChevronRight,
  Cpu,
  FileCode2
} from "lucide-react";
import type { PipelineDefinition, PipelineRun } from "shared";

interface PipelineDetailPageProps {
  pipelineId: string;
  runId?: string | null;
  onNavigate: (path: string) => void;
}

export function PipelineDetailPage({ pipelineId, runId, onNavigate }: PipelineDetailPageProps) {
  const l = useLiterals(u);
  const { addToast } = useToast();

  const [pipeline, setPipeline] = useState<PipelineDefinition | null>(null);
  const [scripts, setScripts] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"definition" | "runs">("definition");
  const [triggering, setTriggering] = useState(false);

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

  const fetchDetails = useCallback(async () => {
    setLoading(true);
    try {
      const [pipeRes, runsRes] = await Promise.all([
        apiFetch(`/api/pipelines/${pipelineId}`),
        apiFetch(`/api/pipelines/${pipelineId}/runs`)
      ]);
      const pipeData = await pipeRes.json();
      const runsData = await runsRes.json();

      setPipeline(pipeData.pipeline);
      setScripts(pipeData.scripts || {});
      setRuns(runsData.runs || []);
      setError("");
    } catch (e: any) {
      setError(e.message || "Failed to load pipeline details");
    } finally {
      setLoading(false);
    }
  }, [pipelineId]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  // Refresh runs helper
  const refreshRuns = async () => {
    try {
      const res = await apiFetch(`/api/pipelines/${pipelineId}/runs`);
      const data = await res.json();
      setRuns(data.runs || []);
    } catch (e) {
      console.error("Failed to refresh runs:", e);
    }
  };

  const handleRun = async () => {
    setTriggering(true);
    try {
      const res = await apiFetch(`/api/pipelines/${pipelineId}/run`, { method: "POST" });
      const data = await res.json();
      addToast("success", l.triggerSuccess);

      // UI Entity Refresh Trigger
      await apiFetch("/api/factory", {
        method: "POST",
        body: JSON.stringify({ entity: "pipelines", action: "upsert", id: pipelineId }),
      }).catch(() => { });

      refreshRuns();

      // Auto navigate to the run progress screen
      if (data.runId) {
        onNavigate(`/pipelines/${pipelineId}/runs/${data.runId}`);
      }
    } catch (e: any) {
      addToast("error", e.message || l.triggerError);
    } finally {
      setTriggering(false);
    }
  };

  if (runId) {
    return (
      <div className="p-6 max-w-7xl mx-auto flex flex-col gap-6 h-full overflow-y-auto">
        <button
          onClick={() => onNavigate(`/pipelines/${pipelineId}`)}
          className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors w-fit font-bold"
        >
          <ChevronLeft className="w-4 h-4" />
          Detail View ({pipelineId})
        </button>
        <PipelineRunViewer
          pipelineId={pipelineId}
          runId={runId}
          onBack={() => onNavigate(`/pipelines/${pipelineId}`)}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-text-secondary">
        <Activity className="w-8 h-8 text-accent animate-spin" />
        <span className="text-sm">Loading pipeline...</span>
      </div>
    );
  }

  if (error || !pipeline) {
    return (
      <div className="p-6 max-w-3xl mx-auto mt-10">
        <div className="bg-error/10 border border-error/20 text-error rounded-xl p-6 flex flex-col gap-3">
          <h3 className="font-bold text-lg">Error loading pipeline</h3>
          <p className="text-sm">{error || "Pipeline not found"}</p>
          <button
            onClick={() => onNavigate("/pipelines")}
            className="flex items-center gap-1.5 text-xs text-error hover:underline transition-colors w-fit font-bold"
          >
            <ChevronLeft className="w-4 h-4" />
            {l.backToPipelines}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto flex flex-col gap-6 h-full overflow-y-auto">
      {/* Detail Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <button
            onClick={() => onNavigate("/pipelines")}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors mb-2 font-bold"
          >
            <ChevronLeft className="w-4 h-4" />
            {l.backToPipelines}
          </button>

          <div className="flex items-center gap-3">
            <Layers className="w-7 h-7 text-accent" />
            <h1 className="text-2xl font-extrabold text-text-primary">{pipeline.name}</h1>
            <span className="text-xs px-2 py-0.5 bg-bg text-text-secondary rounded border border-border font-mono">
              v{pipeline.version}
            </span>
          </div>
          <p className="text-text-secondary text-sm mt-1.5">
            {pipeline.description || "No description provided."}
          </p>
        </div>

        <button
          onClick={handleRun}
          disabled={triggering}
          className="bg-accent text-bg hover:bg-accent/90 disabled:opacity-50 transition-all font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm cursor-pointer shadow-lg shadow-accent/10"
        >
          <Play className="w-4 h-4 fill-current" />
          {triggering ? l.running : l.runPipeline}
        </button>
      </div>

      {/* Tabs list */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("definition")}
          className={`px-5 py-3 text-sm font-bold border-b-2 transition-all ${activeTab === "definition"
              ? "border-accent text-accent"
              : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
        >
          {l.definitionTab}
        </button>
        <button
          onClick={() => setActiveTab("runs")}
          className={`px-5 py-3 text-sm font-bold border-b-2 transition-all ${activeTab === "runs"
              ? "border-accent text-accent"
              : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
        >
          {l.runsTab} ({runs.length})
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === "definition" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Stepper details */}
          <div className="lg:col-span-2 space-y-6">
            <h3 className="text-base font-extrabold text-text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <ChevronRight className="w-4.5 h-4.5 text-accent" />
              {l.stages}
            </h3>

            <div className="space-y-4 relative pl-8 border-l border-border/80 ml-4">
              {pipeline.stages.map((stage, idx) => (
                <div key={stage.id} className="relative bg-surface border border-border/80 rounded-xl p-5 shadow-sm">
                  {/* Stepper Dot */}
                  <div className="absolute -left-[45px] top-6 w-8 h-8 rounded-full border-2 border-border bg-bg flex items-center justify-center text-xs text-text-secondary font-mono">
                    {idx + 1}
                  </div>

                  <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3 mb-3">
                    <div>
                      <h4 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
                        {stage.name}
                        <span className="text-[10px] font-mono font-normal text-text-secondary bg-bg px-1.5 py-0.5 rounded border border-border">
                          ID: {stage.id}
                        </span>
                      </h4>
                      <p className="text-xs text-text-secondary mt-0.5">{stage.description}</p>
                    </div>

                    <span
                      className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${stage.type === "script"
                          ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                          : "bg-purple-500/10 border-purple-500/20 text-purple-400"
                        }`}
                    >
                      {stage.type}
                    </span>
                  </div>

                  {stage.type === "script" ? (
                    <div className="flex flex-col gap-1.5 bg-bg/60 p-3.5 rounded-xl border border-border/40 font-mono text-xs text-text-primary break-words">
                      <div className="flex items-center gap-1.5 text-text-secondary text-[10px] font-bold uppercase mb-1">
                        <FileCode2 className="w-3.5 h-3.5 text-blue-400" />
                        Script execution instruction:
                      </div>
                      <div>{stage.script}</div>
                      {/* Show script content if cached */}
                      {scripts[stage.script] && (
                        <pre className="mt-3 p-3 bg-bg border border-border rounded text-[10px] text-text-secondary max-h-40 overflow-y-auto whitespace-pre-wrap">
                          {scripts[stage.script]}
                        </pre>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-1.5 bg-bg/40 px-3 py-1.5 rounded-lg border border-border/40 text-xs font-mono text-text-secondary">
                        <Cpu className="w-3.5 h-3.5 text-purple-400" />
                        <span>Agent Assigned: {stage.agentId || "Default AI Assistant"}</span>
                      </div>
                      <div className="bg-bg/60 p-3.5 rounded-xl border border-border/40 text-xs text-text-primary whitespace-pre-wrap leading-relaxed">
                        <span className="text-[10px] font-bold text-text-secondary uppercase block mb-1">Prompt:</span>
                        {stage.prompt}
                      </div>
                    </div>
                  )}

                  {stage.outputSchema && stage.outputSchema.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/40">
                      <span className="text-[10px] font-bold text-text-secondary uppercase block mb-1.5">Output Schema:</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        {stage.outputSchema.map((field) => (
                          <span key={field.name} className="text-[10px] bg-bg border border-border px-2 py-0.5 rounded-md font-mono text-accent">
                            {field.name}: {field.type}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-1 space-y-6">
            {/* Sidebar metadata Card */}
            <div className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-4">
              <h3 className="font-bold text-sm text-text-primary uppercase tracking-wider">Pipeline Details</h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-1.5 border-b border-border/60">
                  <span className="text-text-secondary">Stages Count</span>
                  <span className="font-mono text-text-primary font-bold">{pipeline.stages.length}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-border/60">
                  <span className="text-text-secondary">Created At</span>
                  <span className="text-text-primary font-bold">
                    {pipeline.createdAt ? new Date(pipeline.createdAt).toLocaleDateString() : "—"}
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-text-secondary">Version</span>
                  <span className="font-mono text-text-primary font-bold">{pipeline.version}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Runs list content */
        <div className="space-y-4">
          {runs.length === 0 ? (
            <div className="bg-surface border border-border rounded-xl p-10 flex flex-col items-center justify-center text-center max-w-md mx-auto mt-6">
              <Clock className="w-12 h-12 text-border mb-3 animate-pulse" />
              <h4 className="font-bold text-text-primary mb-1">{l.emptyRuns}</h4>
              <button
                onClick={handleRun}
                className="text-xs text-accent hover:underline mt-2 font-bold"
              >
                Trigger First Run Now
              </button>
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-bg border-b border-border text-xs text-text-secondary font-bold uppercase tracking-wider">
                      <th className="p-4">{l.runId}</th>
                      <th className="p-4">{l.status}</th>
                      <th className="p-4">{l.startedAt}</th>
                      <th className="p-4">{l.duration}</th>
                      <th className="p-4 text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr key={run.id} className="border-b border-border/60 hover:bg-surface-hover/5 transition-all text-sm text-text-primary">
                        <td className="p-4 font-mono text-xs">{run.id.slice(0, 15)}...</td>
                        <td className="p-4">
                          <span
                            className={`text-xs px-2.5 py-0.5 rounded-full border font-bold ${run.status === "running"
                                ? "bg-accent/10 border-accent/20 text-accent animate-pulse"
                                : run.status === "completed"
                                  ? "bg-success/10 border-success/20 text-success"
                                  : "bg-error/10 border-error/20 text-error"
                              }`}
                          >
                            {run.status}
                          </span>
                        </td>
                        <td className="p-4 font-mono text-xs">
                          {run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}
                        </td>
                        <td className="p-4 text-xs font-mono">
                          {getDuration(run.startedAt, run.finishedAt)}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => onNavigate(`/pipelines/${pipelineId}/runs/${run.id}`)}
                            className="bg-bg hover:bg-surface-hover/20 text-text-primary text-xs font-semibold py-1.5 px-3 rounded-lg border border-border hover:border-accent/40 transition-all inline-flex items-center gap-1 cursor-pointer"
                          >
                            {l.viewRun}
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
