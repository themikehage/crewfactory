import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import { useLiterals } from "@/lib";
import { literals as u } from "./PipelinesPage.literals";
import { PipelineCard } from "@/components/pipelines/PipelineCard";
import { Button } from "@/components/ui/Button";
import { Layers, Plus, Trash, AlertCircle, X } from "lucide-react";
import type { PipelineDefinition } from "shared";
import { useNavigate } from "react-router-dom";

interface AgentListItem {
  id: string;
  name: string;
  role: string;
}

export function PipelinesPage() {
  const l = useLiterals(u);
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [pipelines, setPipelines] = useState<PipelineDefinition[]>([]);
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [runningId, setRunningId] = useState<string | null>(null);

  // Form State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pipelineId, setPipelineId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [stages, setStages] = useState<any[]>([
    { id: "lint", name: "Lint", type: "script", script: "lint.sh", prompt: "", agentId: "" }
  ]);
  const [scripts, setScripts] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchPipelines = useCallback(async () => {
    setLoading(true);
    try {
      const [pipeRes, agentRes] = await Promise.all([
        apiFetch("/api/pipelines"),
        apiFetch("/api/agents")
      ]);
      const pipeData = await pipeRes.json();
      const agentData = await agentRes.json();
      
      setPipelines(pipeData.pipelines || []);
      setAgents(agentData.agents || []);
      setError("");
    } catch (e: any) {
      setError(e.message || "Failed to load pipelines");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPipelines();
  }, [fetchPipelines]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this pipeline?")) return;
    try {
      await apiFetch(`/api/pipelines/${id}`, { method: "DELETE" });
      addToast("info", "Pipeline deleted");
      
      // AI Agent UI Refresh call
      await apiFetch("/api/factory", {
        method: "POST",
        body: JSON.stringify({ entity: "pipelines", action: "delete", id }),
      }).catch(() => {});

      fetchPipelines();
    } catch (e: any) {
      addToast("error", e.message || "Failed to delete pipeline");
    }
  };

  const handleRun = async (id: string) => {
    setRunningId(id);
    try {
      await apiFetch(`/api/pipelines/${id}/run`, { method: "POST" });
      addToast("success", l.triggerSuccess);
      // Go to runs page, or detail page
    } catch (e: any) {
      addToast("error", e.message || l.triggerError);
    } finally {
      setRunningId(null);
    }
  };

  const handleAddStage = () => {
    const nextIdx = stages.length + 1;
    setStages([
      ...stages,
      { id: `stage_${nextIdx}`, name: `Stage ${nextIdx}`, type: "script", script: "", prompt: "", agentId: "" }
    ]);
  };

  const handleRemoveStage = (idx: number) => {
    if (stages.length === 1) return;
    setStages(stages.filter((_, i) => i !== idx));
  };

  const handleStageChange = (idx: number, field: string, val: any) => {
    setStages(
      stages.map((stage, i) => (i === idx ? { ...stage, [field]: val } : stage))
    );
  };

  const handleScriptChange = (filename: string, content: string) => {
    setScripts({
      ...scripts,
      [filename]: content,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pipelineId.trim() || !name.trim()) {
      addToast("error", "Pipeline ID and Name are required");
      return;
    }

    setIsSubmitting(true);
    try {
      const cleanStages = stages.map(s => {
        const stage: any = {
          id: s.id,
          name: s.name,
          description: s.description || "",
          type: s.type,
          timeoutMs: s.timeoutMs ? parseInt(s.timeoutMs) : undefined
        };
        if (s.type === "script") {
          stage.script = s.script;
        } else {
          stage.agentId = s.agentId || undefined;
          stage.prompt = s.prompt;
        }
        return stage;
      });

      const body = {
        id: pipelineId.toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
        name,
        description,
        stages: cleanStages,
        scripts,
      };

      await apiFetch("/api/pipelines", {
        method: "POST",
        body: JSON.stringify(body),
      });

      // UI Entity Refresh Trigger
      await apiFetch("/api/factory", {
        method: "POST",
        body: JSON.stringify({ entity: "pipelines", action: "upsert", id: body.id, params: body }),
      }).catch(() => {});

      addToast("success", "Pipeline created successfully");
      setShowCreateModal(false);
      
      // Reset form
      setPipelineId("");
      setName("");
      setDescription("");
      setStages([{ id: "lint", name: "Lint", type: "script", script: "lint.sh", prompt: "", agentId: "" }]);
      setScripts({});

      fetchPipelines();
    } catch (e: any) {
      addToast("error", e.message || l.createError);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto h-full overflow-y-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-text-primary flex items-center gap-2">
            <Layers className="w-7 h-7 text-accent" />
            {l.pageTitle}
          </h1>
          <p className="text-text-secondary text-sm mt-1">{l.pageSubtitle}</p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-accent text-bg hover:bg-accent/90 transition-all font-bold px-4 py-2 rounded-xl flex items-center gap-2 text-sm shadow-lg shadow-accent/15 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          {l.createPipeline}
        </button>
      </div>

      {error && (
        <div className="bg-error/10 border border-error/20 text-error rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-text-secondary">
          <ActivityLoader />
        </div>
      ) : pipelines.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-12 flex flex-col items-center justify-center text-center max-w-lg mx-auto mt-10">
          <Layers className="w-16 h-16 text-border mb-4 animate-pulse" />
          <h3 className="text-lg font-bold text-text-primary mb-2">{l.emptyTitle}</h3>
          <p className="text-text-secondary text-sm mb-6">{l.emptyDescription}</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-accent text-bg hover:bg-accent/90 transition-all font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {l.emptyButton}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pipelines.map((pipe) => (
            <PipelineCard
              key={pipe.id}
              pipeline={pipe}
              onDelete={handleDelete}
              onRun={handleRun}
              onNavigate={navigate}
              runningId={runningId}
            />
          ))}
        </div>
      )}

      {/* Creation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-bg/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-3xl overflow-hidden max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-border/80 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-text-primary">{l.createTitle}</h2>
                <p className="text-text-secondary text-xs mt-0.5">{l.createSubtitle}</p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-text-secondary hover:text-text-primary p-1.5 rounded-lg hover:bg-surface-hover/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-primary uppercase tracking-wider">
                    {l.pipelineNameLabel}
                  </label>
                  <input
                    type="text"
                    required
                    value={pipelineId}
                    onChange={(e) => setPipelineId(e.target.value)}
                    placeholder={l.pipelineNamePlaceholder}
                    className="bg-bg border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:border-accent outline-none font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-primary uppercase tracking-wider">
                    Display Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Production Deployment Pipeline"
                    className="bg-bg border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:border-accent outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-primary uppercase tracking-wider">
                  {l.descriptionLabel}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={l.descriptionPlaceholder}
                  className="bg-bg border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:border-accent outline-none min-h-[80px]"
                />
              </div>

              {/* Stages List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
                    {l.stagesLabel}
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddStage}
                    className="text-xs text-accent hover:bg-accent/5 px-3 py-1.5 rounded-lg border border-accent/20 hover:border-accent transition-all font-bold"
                  >
                    + {l.addStage}
                  </button>
                </div>

                <div className="space-y-4">
                  {stages.map((stage, idx) => (
                    <div key={idx} className="bg-bg/40 border border-border rounded-xl p-4 relative flex flex-col gap-4">
                      {stages.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveStage(idx)}
                          className="absolute top-3 right-3 text-error/85 hover:text-error hover:bg-error/5 p-1 rounded-lg transition-colors"
                        >
                          <Trash className="w-4 h-4" />
                        </button>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-text-secondary uppercase">
                            Stage ID *
                          </label>
                          <input
                            type="text"
                            required
                            value={stage.id}
                            onChange={(e) => handleStageChange(idx, "id", e.target.value)}
                            placeholder="e.g. lint"
                            className="bg-bg border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary outline-none font-mono"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-text-secondary uppercase">
                            Display Name *
                          </label>
                          <input
                            type="text"
                            required
                            value={stage.name}
                            onChange={(e) => handleStageChange(idx, "name", e.target.value)}
                            placeholder="e.g. Code Linter"
                            className="bg-bg border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary outline-none"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-text-secondary uppercase">
                            {l.stageType}
                          </label>
                          <select
                            value={stage.type}
                            onChange={(e) => handleStageChange(idx, "type", e.target.value)}
                            className="bg-bg border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary outline-none"
                          >
                            <option value="script">Script (deterministic bash)</option>
                            <option value="agent">Agent (LLM Reasoning)</option>
                          </select>
                        </div>
                      </div>

                      {stage.type === "script" ? (
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-text-secondary uppercase">
                            {l.scriptName} *
                          </label>
                          <input
                            type="text"
                            required
                            value={stage.script}
                            onChange={(e) => handleStageChange(idx, "script", e.target.value)}
                            placeholder="e.g. lint.sh or bash command inline"
                            className="bg-bg border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary outline-none font-mono"
                          />
                          {/* Inline Script Content editor if it ends with .sh */}
                          {stage.script.endsWith(".sh") && (
                            <div className="flex flex-col gap-1 mt-2">
                              <label className="text-[10px] font-bold text-text-secondary uppercase">
                                Inline Bash Script Content
                              </label>
                              <textarea
                                value={scripts[stage.script] || ""}
                                onChange={(e) => handleScriptChange(stage.script, e.target.value)}
                                placeholder={"#!/bin/bash\npnpm lint && echo '---OUTPUT---\\n{\\\"passed\\\":true}\\n---END OUTPUT---'"}
                                className="bg-bg border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary font-mono outline-none min-h-[80px]"
                              />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-text-secondary uppercase">
                              {l.agentName}
                            </label>
                            <select
                              value={stage.agentId}
                              onChange={(e) => handleStageChange(idx, "agentId", e.target.value)}
                              className="bg-bg border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary outline-none"
                            >
                              <option value="">Default AI Assistant</option>
                              {agents.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name} ({a.role})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-text-secondary uppercase">
                              {l.prompt} *
                            </label>
                            <textarea
                              required
                              value={stage.prompt}
                              onChange={(e) => handleStageChange(idx, "prompt", e.target.value)}
                              placeholder="Describe the instructions for the agent. You can read outputs of previous stages using {{stages.stageId.output.field}}."
                              className="bg-bg border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary outline-none min-h-[80px]"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-6 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateModal(false)}
                >
                  {l.cancel}
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-accent text-bg hover:bg-accent/90 font-bold"
                >
                  {isSubmitting ? l.creating : l.createPipeline}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityLoader() {
  return (
    <div className="flex items-center justify-center p-4">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
