import { useState } from "react";
import type { Experiment } from "@/types/laboratory";
import { apiFetch } from "@/lib/api";
import { useLiterals } from "@/lib";
import { literals as u } from "@/pages/LaboratoryPage.literals";
import { motion } from "framer-motion";

interface Props {
  experiment: Experiment;
  onUpdate: (updated: Experiment) => void;
}

export function ExperimentConfigTab({ experiment, onUpdate }: Props) {
  const l = useLiterals(u);
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(experiment.name);
  const [taskPrompt, setTaskPrompt] = useState(experiment.taskPrompt);
  const [criteria, setCriteria] = useState<string[]>(experiment.judge?.criteria || []);
  const [newCriterion, setNewCriterion] = useState("");
  const [saving, setSaving] = useState(false);

  // Obtener agentes de la variante con líder
  const agents = experiment.variants?.multiWithLeader?.agents || [];

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/experiments/${experiment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          taskPrompt,
          criteria,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        onUpdate(data.experiment);
        setIsEditing(false);
      }
    } catch (e) {
      console.error("Error updating experiment:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleAddCriterion = () => {
    if (newCriterion.trim() && !criteria.includes(newCriterion.trim())) {
      setCriteria([...criteria, newCriterion.trim()]);
      setNewCriterion("");
    }
  };

  const handleRemoveCriterion = (index: number) => {
    setCriteria(criteria.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto py-2">
      {/* Header Info */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-xl font-bold bg-bg border border-border rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            />
          ) : (
            <h2 className="text-xl font-bold text-text-primary truncate">{experiment.name}</h2>
          )}
          <p className="text-xs text-text-secondary mt-1">ID: <span className="font-mono">{experiment.id}</span></p>
        </div>
        <div className="ml-4">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setName(experiment.name);
                  setTaskPrompt(experiment.taskPrompt);
                  setCriteria(experiment.judge?.criteria || []);
                  setIsEditing(false);
                }}
                className="px-3.5 py-1.5 rounded-lg border border-border text-xs text-text-primary hover:bg-surface-hover transition-colors font-semibold cursor-pointer"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="px-3.5 py-1.5 rounded-lg bg-accent text-bg text-xs hover:opacity-90 transition-opacity font-bold flex items-center gap-1.5 cursor-pointer"
                disabled={saving}
              >
                {saving && <div className="w-3 h-3 border-2 border-bg border-t-transparent rounded-full animate-spin" />}
                {l.saveBtn}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 rounded-lg bg-surface border border-border text-xs text-text-primary hover:bg-surface-hover font-semibold transition-colors cursor-pointer"
            >
              {l.editBtn}
            </button>
          )}
        </div>
      </div>

      {/* Main Task Prompt */}
      <div className="flex flex-col gap-2 p-5 rounded-xl bg-surface border border-border/60">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{l.configObjective}</h3>
        {isEditing ? (
          <textarea
            rows={4}
            value={taskPrompt}
            onChange={(e) => setTaskPrompt(e.target.value)}
            className="w-full text-sm bg-bg border border-border rounded-lg p-3 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent font-sans whitespace-pre-wrap"
          />
        ) : (
          <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed font-sans">{experiment.taskPrompt}</p>
        )}
      </div>

      {/* Judge Evaluation Criteria */}
      <div className="flex flex-col gap-2 p-5 rounded-xl bg-surface border border-border/60">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{l.configCriteria}</h3>
        {isEditing ? (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Añadir criterio..."
                value={newCriterion}
                onChange={(e) => setNewCriterion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCriterion())}
                className="flex-1 text-sm bg-bg border border-border rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="button"
                onClick={handleAddCriterion}
                className="px-3.5 py-1.5 rounded-lg bg-surface border border-border text-xs text-text-primary hover:bg-surface-hover font-semibold cursor-pointer"
              >
                Añadir
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mt-1">
              {criteria.map((c, idx) => (
                <span
                  key={idx}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-bg border border-border text-xs font-medium text-text-primary"
                >
                  {c}
                  <button
                    type="button"
                    onClick={() => handleRemoveCriterion(idx)}
                    className="text-text-secondary hover:text-error text-sm font-bold cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 mt-1">
            {experiment.judge?.criteria.map((c, idx) => (
              <span
                key={idx}
                className="px-3 py-1 rounded-lg bg-bg border border-border/80 text-xs font-medium text-text-primary"
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Specialist Agents Config */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider px-1">{l.configAgents}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((ag: any, idx: number) => (
            <motion.div
              key={ag.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="flex flex-col p-4 rounded-xl bg-surface border border-border/60 hover:border-border transition-colors relative min-w-0 overflow-hidden"
            >
              <div className="flex items-start justify-between gap-2 min-w-0">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-bg border border-border flex items-center justify-center font-bold text-sm text-accent uppercase flex-shrink-0">
                    {ag.name.slice(0, 2)}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold text-text-primary truncate">{ag.name}</span>
                    <span className="text-xs text-text-secondary truncate">{ag.role}</span>
                  </div>
                </div>
                {ag.leader && (
                  <span className="px-2 py-0.5 rounded-md bg-accent/15 border border-accent/25 text-[10px] font-bold text-accent uppercase tracking-wider">
                    {l.leaderBadge}
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px] text-text-secondary bg-bg/50 px-2.5 py-1 rounded-md border border-border/30">
                  <span className="font-medium">Model:</span>
                  <span className="font-mono font-semibold truncate max-w-[180px]">{ag.model}</span>
                </div>
                <div className="flex flex-col gap-1 mt-1">
                  <span className="text-[10px] text-text-secondary uppercase font-semibold">Prompt de Sistema:</span>
                  <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-all bg-bg/70 p-3 rounded-lg border border-border/40 max-h-36 overflow-y-auto leading-relaxed font-sans">
                    {ag.systemPrompt}
                  </pre>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
