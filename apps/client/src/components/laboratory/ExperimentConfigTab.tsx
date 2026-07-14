import { useState } from "react";
import type { Experiment, Stance } from "@/types/laboratory";
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
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(experiment.name);
  const [taskPrompt, setTaskPrompt] = useState(experiment.taskPrompt);
  const [criteria, setCriteria] = useState<string[]>(experiment.judge?.criteria || []);
  const [newCriterion, setNewCriterion] = useState("");
  const [autoEvaluate, setAutoEvaluate] = useState(experiment.judge?.autoEvaluate ?? true);

  const [maxChainDepth, setMaxChainDepth] = useState({
    single: experiment.maxChainDepth?.single ?? 3,
    multiNoLeader: experiment.maxChainDepth?.multiNoLeader ?? 8,
    multiWithLeader: experiment.maxChainDepth?.multiWithLeader ?? 15,
  });

  const [positions, setPositions] = useState<Stance[]>(experiment.positions || []);

  const agents = experiment.variants?.multiWithLeader?.agents || [];
  const [editedAgents, setEditedAgents] = useState(
    agents.map((ag) => ({ ...ag }))
  );

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (key: string) =>
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleCancel = () => {
    setName(experiment.name);
    setTaskPrompt(experiment.taskPrompt);
    setCriteria(experiment.judge?.criteria || []);
    setAutoEvaluate(experiment.judge?.autoEvaluate ?? true);
    setMaxChainDepth({
      single: experiment.maxChainDepth?.single ?? 3,
      multiNoLeader: experiment.maxChainDepth?.multiNoLeader ?? 8,
      multiWithLeader: experiment.maxChainDepth?.multiWithLeader ?? 15,
    });
    setPositions(experiment.positions || []);
    setEditedAgents(agents.map((ag) => ({ ...ag })));
    setIsEditing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/experiments/${experiment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          taskPrompt,
          judge: {
            criteria,
            autoEvaluate,
          },
          maxChainDepth,
          positions,
          variants: {
            ...experiment.variants,
            multiWithLeader: {
              ...experiment.variants.multiWithLeader,
              agents: editedAgents,
            },
          },
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

  const handleAgentChange = (idx: number, field: string, value: string) => {
    setEditedAgents((prev) =>
      prev.map((ag, i) => (i === idx ? { ...ag, [field]: value } : ag))
    );
  };

  const handlePositionChange = (idx: number, field: string, value: string) => {
    setPositions((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p))
    );
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
                onClick={handleCancel}
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

        {isEditing && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/40">
            <span className="text-xs font-medium text-text-secondary">Auto-evaluación al finalizar:</span>
            <button
              type="button"
              onClick={() => setAutoEvaluate(!autoEvaluate)}
              className={`relative w-10 h-5 rounded-full transition-colors ${autoEvaluate ? "bg-accent" : "bg-border"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-bg transition-transform ${autoEvaluate ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
            <span className={`text-xs font-semibold ${autoEvaluate ? "text-accent" : "text-text-secondary"}`}>
              {autoEvaluate ? "Activado" : "Desactivado"}
            </span>
          </div>
        )}
      </div>

      {/* Advanced Config: Max Chain Depth */}
      {isEditing && (
        <div className="flex flex-col gap-2 p-5 rounded-xl bg-surface border border-border/60">
          <button
            type="button"
            onClick={() => toggleSection("depth")}
            className="flex items-center justify-between w-full text-left"
          >
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Límite de Profundidad (maxChainDepth)
            </h3>
            <span className={`text-text-secondary text-xs transition-transform ${expandedSections["depth"] ? "rotate-180" : ""}`}>
              ▼
            </span>
          </button>
          {expandedSections["depth"] && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
              <div>
                <label className="text-[10px] uppercase font-bold text-text-secondary tracking-wider block mb-1">Single</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={maxChainDepth.single}
                  onChange={(e) => setMaxChainDepth((prev) => ({ ...prev, single: Number(e.target.value) }))}
                  className="w-full text-sm bg-bg border border-border rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-text-secondary tracking-wider block mb-1">Multi (sin líder)</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={maxChainDepth.multiNoLeader}
                  onChange={(e) => setMaxChainDepth((prev) => ({ ...prev, multiNoLeader: Number(e.target.value) }))}
                  className="w-full text-sm bg-bg border border-border rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-text-secondary tracking-wider block mb-1">Multi (con líder)</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={maxChainDepth.multiWithLeader}
                  onChange={(e) => setMaxChainDepth((prev) => ({ ...prev, multiWithLeader: Number(e.target.value) }))}
                  className="w-full text-sm bg-bg border border-border rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Positions / Stances */}
      {positions.length > 0 && (
        <div className="flex flex-col gap-2 p-5 rounded-xl bg-surface border border-border/60">
          <button
            type="button"
            onClick={() => toggleSection("positions")}
            className="flex items-center justify-between w-full text-left"
          >
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Posturas (Stances)
            </h3>
            <span className={`text-text-secondary text-xs transition-transform ${expandedSections["positions"] ? "rotate-180" : ""}`}>
              ▼
            </span>
          </button>
          {expandedSections["positions"] && (
            <div className="flex flex-col gap-4 mt-2">
              {positions.map((pos, idx) => (
                <motion.div
                  key={pos.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col gap-2 p-4 rounded-lg bg-bg border border-border/60"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: pos.color }}
                    />
                    <span className="text-sm font-bold text-text-primary">{pos.name}</span>
                    <span className="text-[10px] uppercase font-bold text-text-secondary bg-surface px-2 py-0.5 rounded">
                      {pos.position}
                    </span>
                  </div>
                  {isEditing ? (
                    <div className="flex flex-col gap-2 mt-1">
                      <input
                        type="text"
                        value={pos.template}
                        onChange={(e) => handlePositionChange(idx, "template", e.target.value)}
                        placeholder="Template"
                        className="text-xs bg-surface border border-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                      <textarea
                        rows={3}
                        value={pos.briefing}
                        onChange={(e) => handlePositionChange(idx, "briefing", e.target.value)}
                        placeholder="Briefing"
                        className="text-xs bg-surface border border-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent font-sans"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <p className="text-[11px] text-text-secondary">
                        <span className="font-semibold">Template:</span> {pos.template}
                      </p>
                      <p className="text-[11px] text-text-secondary">
                        <span className="font-semibold">Briefing:</span> {pos.briefing}
                      </p>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Specialist Agents Config */}
      {agents.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider px-1">{l.configAgents}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(isEditing ? editedAgents : agents).map((ag: any, idx: number) => (
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
                      {isEditing ? (
                        <input
                          type="text"
                          value={ag.role}
                          onChange={(e) => handleAgentChange(idx, "role", e.target.value)}
                          className="text-xs bg-bg border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent w-full"
                        />
                      ) : (
                        <>
                          <span className="text-sm font-bold text-text-primary truncate">{ag.name}</span>
                          <span className="text-xs text-text-secondary truncate">{ag.role}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {ag.leader && (
                    <span className="px-2 py-0.5 rounded-md bg-accent/15 border border-accent/25 text-[10px] font-bold text-accent uppercase tracking-wider">
                      {l.leaderBadge}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-[11px] text-text-secondary bg-bg/50 px-2.5 py-1 rounded-md border border-border/30">
                    <span className="font-medium flex-shrink-0">Model:</span>
                    {isEditing ? (
                      <input
                        type="text"
                        value={ag.model || ""}
                        onChange={(e) => handleAgentChange(idx, "model", e.target.value)}
                        className="flex-1 bg-surface border border-border rounded px-2 py-0.5 text-xs font-mono text-text-primary focus:outline-none focus:ring-2 focus:ring-accent min-w-0"
                      />
                    ) : (
                      <span className="font-mono font-semibold truncate">{ag.model}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 mt-1">
                    <span className="text-[10px] text-text-secondary uppercase font-semibold">Prompt de Sistema:</span>
                    {isEditing ? (
                      <textarea
                        rows={4}
                        value={ag.systemPrompt || ""}
                        onChange={(e) => handleAgentChange(idx, "systemPrompt", e.target.value)}
                        className="text-[11px] bg-bg border border-border rounded-lg p-2.5 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent font-sans w-full"
                      />
                    ) : (
                      <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-all bg-bg/70 p-3 rounded-lg border border-border/40 max-h-36 overflow-y-auto leading-relaxed font-sans">
                        {ag.systemPrompt}
                      </pre>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
