import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Experiment, ExportResult } from "@/types/laboratory";
import { apiFetch } from "@/lib/api";
import { useLiterals } from "@/lib";
import { literals as u } from "./ExportExperimentModal.literals";
import { Check, Loader2, ArrowRight, ExternalLink } from "lucide-react";

interface ExportExperimentModalProps {
  experiment: Experiment;
  onClose: () => void;
  onNavigate: (path: string) => void;
}

export function ExportExperimentModal({
  experiment,
  onClose,
  onNavigate,
}: ExportExperimentModalProps) {
  const l = useLiterals(u);
  const [selectedVariant, setSelectedVariant] = useState<"single" | "multiNoLeader" | "multiWithLeader">("multiWithLeader");
  const [teamName, setTeamName] = useState("");
  const [existingAgentIds, setExistingAgentIds] = useState<Set<string>>(new Set());
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadAgents() {
      try {
        const res = await apiFetch("/api/agents");
        if (res.ok) {
          const data = await res.json();
          const ids = new Set<string>((data.agents || []).map((a: any) => a.id));
          setExistingAgentIds(ids);
        }
      } catch (err) {
        console.error("Error loading existing agents:", err);
      } finally {
        setLoadingAgents(false);
      }
    }
    loadAgents();
  }, []);

  useEffect(() => {
    if (selectedVariant === "multiNoLeader") {
      setTeamName(`${experiment.name} (Horizontal)`);
    } else if (selectedVariant === "multiWithLeader") {
      setTeamName(`${experiment.name} (Jerárquico)`);
    } else {
      setTeamName("");
    }
  }, [selectedVariant, experiment.name]);

  const activeAgents = experiment.variants[selectedVariant]?.agents || [];
  const isVariantCompleted = experiment.variants[selectedVariant]?.result?.status === "completed";

  const handleExport = async () => {
    if (!isVariantCompleted) return;
    setIsExporting(true);
    setErrorMessage(null);
    try {
      const res = await apiFetch(`/api/experiments/${experiment.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantKey: selectedVariant,
          teamName: selectedVariant !== "single" ? teamName : undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setExportResult(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMessage(errData.error || "Export failed");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-55 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface border border-border rounded-2xl w-full max-w-2xl p-6 shadow-2xl flex flex-col text-left max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between border-b border-border/60 pb-4 mb-4">
          <div>
            <h3 className="text-base font-bold text-text-primary tracking-wide">
              {l.exportTitle}
            </h3>
            <p className="text-xs text-text-secondary mt-1">
              {l.exportSubtitle}
            </p>
          </div>
          {!exportResult && (
            <button
              onClick={onClose}
              className="text-text-secondary hover:text-text-primary text-sm font-semibold transition-colors cursor-pointer"
            >
              ×
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {!exportResult ? (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-5"
            >
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider block">
                  {l.variantLabel}
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {(["single", "multiNoLeader", "multiWithLeader"] as const).map((key) => {
                    const isComp = experiment.variants[key]?.result?.status === "completed";
                    const isSelected = selectedVariant === key;
                    let title = l.variantSingleTitle;
                    let desc = l.variantSingleDesc;

                    if (key === "multiNoLeader") {
                      title = l.variantHorizontalTitle;
                      desc = l.variantHorizontalDesc;
                    } else if (key === "multiWithLeader") {
                      title = l.variantHierarchicalTitle;
                      desc = l.variantHierarchicalDesc;
                    }

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => isComp && setSelectedVariant(key)}
                        disabled={!isComp}
                        className={`flex flex-col text-left p-3.5 rounded-xl border transition-all relative ${
                          !isComp
                            ? "opacity-40 border-border bg-bg/50 cursor-not-allowed"
                            : isSelected
                            ? "border-accent bg-accent/5 ring-1 ring-accent"
                            : "border-border hover:border-border/80 bg-bg cursor-pointer"
                        }`}
                      >
                        <span className="text-xs font-bold text-text-primary block">
                          {title}
                        </span>
                        <span className="text-[10px] text-text-secondary mt-1 block leading-relaxed">
                          {desc}
                        </span>
                        {!isComp && (
                          <span className="absolute bottom-2 right-2 text-[9px] px-1 py-0.5 rounded bg-error/10 border border-error/20 text-error font-bold font-sans">
                            {l.variantNotCompleted}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedVariant !== "single" && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider block">
                    {l.channelNameLabel}
                  </label>
                  <input
                    type="text"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder={l.channelNamePlaceholder}
                    className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-accent text-text-primary"
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider block">
                  {l.previewTitle}
                </label>
                <div className="border border-border/60 rounded-xl bg-bg/50 divide-y divide-border/40 overflow-hidden">
                  {selectedVariant !== "single" && (
                    <div className="p-3 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <span className="font-bold text-text-primary truncate max-w-[280px]">
                          {teamName || `${experiment.name} (Equipo)`}
                        </span>
                      </div>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 uppercase">
                        {l.previewChannel}
                      </span>
                    </div>
                  )}

                  {loadingAgents ? (
                    <div className="p-4 flex items-center justify-center text-xs text-text-secondary gap-2">
                      <Loader2 size={12} className="animate-spin" />
                      <span>Cargando estado de agentes...</span>
                    </div>
                  ) : (
                    activeAgents.map((ag) => {
                      const exists = existingAgentIds.has(ag.id);
                      return (
                        <div key={ag.id} className="p-3 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-6 h-6 rounded bg-surface border border-border flex items-center justify-center text-[10px] font-bold text-accent uppercase">
                              {ag.name.slice(0, 2)}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-semibold text-text-primary truncate">
                                {ag.name}
                              </span>
                              <span className="text-[10px] text-text-secondary truncate">
                                {ag.role}
                              </span>
                            </div>
                          </div>
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase ${
                              exists
                                ? "bg-warning/10 border-warning/20 text-warning"
                                : "bg-success/10 border-success/20 text-success"
                            }`}
                          >
                            {exists ? l.statusExisting : l.statusNew}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-xs">
                  {errorMessage}
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-border/60 pt-4 mt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isExporting}
                  className="px-4 py-2 bg-bg border border-border hover:bg-surface rounded-xl text-xs font-bold text-text-primary transition-colors cursor-pointer"
                >
                  {l.btnCancel}
                </button>
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={isExporting || loadingAgents || !isVariantCompleted}
                  className="px-4 py-2 bg-accent text-bg hover:opacity-95 disabled:opacity-50 rounded-xl text-xs font-bold transition-all shadow cursor-pointer flex items-center gap-1.5"
                >
                  {isExporting && <Loader2 size={12} className="animate-spin" />}
                  {isExporting ? l.btnExporting : l.btnExport}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              <div className="text-center py-4 space-y-2">
                <div className="w-12 h-12 rounded-full bg-success/15 border border-success/30 flex items-center justify-center mx-auto text-success">
                  <Check size={24} />
                </div>
                <h4 className="text-sm font-bold text-text-primary">
                  {l.successTitle}
                </h4>
                <p className="text-xs text-text-secondary">
                  {l.successSubtitle}
                </p>
              </div>

              <div className="space-y-2.5">
                {exportResult.team && (
                  <div className="p-4 rounded-xl border border-border bg-bg/40 flex items-center justify-between gap-3">
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] text-text-secondary uppercase font-semibold">
                        Equipo Creado
                      </span>
                      <span className="text-xs font-bold text-text-primary truncate mt-0.5">
                        {exportResult.team.name}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        onClose();
                        onNavigate(`/teams/${exportResult.team!.id}`);
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-accent/10 border border-accent/25 hover:bg-accent/20 rounded-lg text-[10px] font-bold text-accent transition-colors cursor-pointer"
                    >
                      <span>{l.btnGoToChannel}</span>
                      <ArrowRight size={10} />
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  <span className="text-[10px] text-text-secondary uppercase font-semibold block px-1">
                    Agentes Exportados
                  </span>
                  <div className="border border-border/60 rounded-xl bg-bg/30 divide-y divide-border/40 overflow-hidden">
                    {exportResult.agents.map((ag) => (
                      <div key={ag.id} className="p-3 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded bg-surface border border-border flex items-center justify-center text-[10px] font-bold text-accent uppercase">
                            {ag.name.slice(0, 2)}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-semibold text-text-primary">
                              {ag.name}
                            </span>
                            <span className="text-[10px] text-text-secondary font-mono">
                              {ag.id}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${
                              ag.created
                                ? "bg-success/10 border-success/20 text-success"
                                : "bg-warning/10 border-warning/20 text-warning"
                            }`}
                          >
                            {ag.created ? l.statusNew : l.statusExisting}
                          </span>
                          <button
                            onClick={() => {
                              onClose();
                              onNavigate(`/agents/${ag.id}`);
                            }}
                            className="text-text-secondary hover:text-accent p-1 cursor-pointer"
                            title={l.btnGoToAgent}
                          >
                            <ExternalLink size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end border-t border-border/60 pt-4 mt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-accent text-bg hover:opacity-95 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  {l.btnClose}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
