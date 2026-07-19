import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import type { Team } from "shared";
import { useLiterals } from "@/lib";
import { apiFetch } from "@/lib/api";
import { literals as u } from "./TeamSettingsModal.literals";

interface Props {
  team: Team;
  onClose: () => void;
  onSave: (updates: {
    name?: string;
    description?: string;
    maxRounds?: number;
    showThinking?: boolean;
    showTools?: boolean;
    streamingEnabled?: boolean;
    negotiationProtocol?: any;
  }) => Promise<void>;
}

export function TeamSettingsModal({ team, onClose, onSave }: Props) {
  const l = useLiterals(u);
  const [activeTab, setActiveTab] = useState<"general" | "negotiation">("general");

  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description || "");
  const [maxRounds, setMaxRounds] = useState(team.maxRounds ?? 5);
  const [showThinking, setShowThinking] = useState(team.showThinking ?? false);
  const [showTools, setShowTools] = useState(team.showTools ?? false);
  const [streamingEnabled, setStreamingEnabled] = useState(team.streamingEnabled ?? true);
  const teamType = team.teamType || "Negotiation";
  const isNegotiation = teamType === "Negotiation";

  const [negotiationEnabled, setNegotiationEnabled] = useState(
    team.negotiationProtocol !== undefined
  );
  const [agreementPattern, setAgreementPattern] = useState(
    team.negotiationProtocol?.agreementPattern || "(ACUERDO ALCANZADO:|ACEPTO)"
  );
  const [rejectPattern, setRejectPattern] = useState(
    team.negotiationProtocol?.rejectPattern || ""
  );
  const [arbiterAgentId, setArbiterAgentId] = useState(
    team.negotiationProtocol?.arbiterAgentId || "__none__"
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [negState, setNegState] = useState<any>(null);

  useEffect(() => {
    const fetchNegState = async () => {
      try {
        const res = await apiFetch(`/api/teams/${team.id}/negotiation-state`);
        if (res.ok) {
          const data = await res.json();
          setNegState(data.state || {});
        }
      } catch (err) {
        console.error("Failed to fetch negotiation state:", err);
      }
    };
    fetchNegState();
  }, [team.id]);

  const negStats = useMemo(() => {
    if (!negState) return null;
    let activePairs = 0;
    let agreements = 0;
    let divergences = negState._divergences || 0;
    let arbitrations = negState._arbitrations || 0;

    for (const [key, val] of Object.entries(negState)) {
      if (key.startsWith("_")) continue;
      activePairs++;
      const pair = val as any;
      if (pair.status === "agreed") agreements++;
    }

    return {
      activePairs,
      agreements,
      divergences,
      arbitrations,
    };
  }, [negState]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    let negotiationProtocol: any = undefined;
    if (negotiationEnabled) {
      negotiationProtocol = {
        agreementPattern: agreementPattern.trim() || "(ACUERDO ALCANZADO:|ACEPTO)",
        maxRounds: Number(maxRounds),
      };
      if (rejectPattern.trim()) {
        negotiationProtocol.rejectPattern = rejectPattern.trim();
      }
      if (arbiterAgentId && arbiterAgentId !== "__none__") {
        negotiationProtocol.arbiterAgentId = arbiterAgentId;
      }
    }

    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        maxRounds: Number(maxRounds),
        showThinking,
        showTools,
        streamingEnabled,
        negotiationProtocol,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || l.updateError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-lg bg-card border border-input rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-input flex-shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground text-sm">{l.title}</h3>
            <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${
              teamType === "Orchestration"
                ? "bg-accent/15 text-accent border border-accent/25"
                : "bg-primary/15 text-primary border border-primary/25"
            }`}>
              {teamType}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-card-hover transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-input/60 flex-shrink-0 bg-background/20">
          <button
            type="button"
            onClick={() => setActiveTab("general")}
            className={`flex-1 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === "general"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {l.tabGeneral}
          </button>
          {isNegotiation && (
            <button
              type="button"
              onClick={() => setActiveTab("negotiation")}
              className={`flex-1 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === "negotiation"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {l.tabNegotiation}
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
            {error && (
              <div className="p-3 bg-destructive/10 border border-error/20 text-destructive rounded-lg">
                {error}
              </div>
            )}

            {activeTab === "general" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-muted-foreground font-medium mb-1">{l.name}</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-muted-foreground font-medium mb-1">{l.description}</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground outline-none focus:border-primary resize-none"
                  />
                </div>

                <div>
                  <label className="block text-muted-foreground font-medium mb-2">{l.teamType}</label>
                  <div className="p-3 rounded-xl border border-input bg-background">
                    <span className="font-semibold text-xs text-foreground">{teamType}</span>
                    <p className="text-[10px] leading-tight text-muted-foreground mt-1">
                      {isNegotiation ? l.negotiationDesc : l.orchestrationDesc}
                    </p>
                    <p className="text-[10px] leading-tight text-muted-foreground mt-2">{l.teamTypeImmutable}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-2.5 pt-2 border-t border-input/40">
                  <label className="flex items-center gap-2.5 text-muted-foreground font-medium cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showThinking}
                      onChange={(e) => setShowThinking(e.target.checked)}
                      className="w-4 h-4 accent-accent rounded border-input bg-background cursor-pointer"
                    />
                    <span>{l.showThinking}</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-muted-foreground font-medium cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showTools}
                      onChange={(e) => setShowTools(e.target.checked)}
                      className="w-4 h-4 accent-accent rounded border-input bg-background cursor-pointer"
                    />
                    <span>{l.showTools}</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-muted-foreground font-medium cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={streamingEnabled}
                      onChange={(e) => setStreamingEnabled(e.target.checked)}
                      className="w-4 h-4 accent-accent rounded border-input bg-background cursor-pointer"
                    />
                    <span>{l.streamingEnabled}</span>
                  </label>
                </div>
              </div>
            )}

            {isNegotiation && activeTab === "negotiation" && (
              <div className="space-y-4">
                <div className="p-3 bg-surface border border-input rounded-lg flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-foreground">{l.negotiationEnabled}</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Debating agents will seek consensus automatically and escalate to an arbiter if deadlocked.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={negotiationEnabled}
                    onChange={(e) => setNegotiationEnabled(e.target.checked)}
                    className="w-4 h-4 accent-accent rounded border-input bg-background cursor-pointer"
                  />
                </div>

                {negotiationEnabled && (
                  <div className="space-y-3 p-3 bg-background/50 border border-input/60 rounded-xl animate-fadeIn">
                    <div>
                      <label className="block text-muted-foreground font-medium mb-1">{l.agreementPattern}</label>
                      <input
                        type="text"
                        value={agreementPattern}
                        onChange={(e) => setAgreementPattern(e.target.value)}
                        placeholder="(ACUERDO ALCANZADO:|ACEPTO)"
                        className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-foreground outline-none font-mono text-xs focus:border-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-muted-foreground font-medium mb-1">{l.rejectPattern}</label>
                      <input
                        type="text"
                        value={rejectPattern}
                        onChange={(e) => setRejectPattern(e.target.value)}
                        placeholder="Rechazo opcional (regex)"
                        className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-foreground outline-none font-mono text-xs focus:border-primary"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-muted-foreground font-medium">{l.maxRounds}</label>
                        <span className="font-mono font-bold text-primary">{maxRounds} rounds</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={maxRounds}
                        onChange={(e) => setMaxRounds(Number(e.target.value))}
                        className="w-full accent-accent cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="block text-muted-foreground font-medium mb-1">{l.arbiterAgentId}</label>
                      <select
                        value={arbiterAgentId}
                        onChange={(e) => setArbiterAgentId(e.target.value)}
                        className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground outline-none focus:border-primary cursor-pointer"
                      >
                        <option value="__none__">{l.none}</option>
                        {team.members.map((member) => (
                          <option key={member.agentId} value={member.agentId}>
                            {member.agentId}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {negStats && (
                  <div className="pt-3 border-t border-input/40">
                    <h4 className="font-semibold text-foreground mb-2 text-xs">Live Negotiation Statistics</h4>
                    <div className="grid grid-cols-2 gap-2 bg-surface/50 p-2.5 border border-input/40 rounded-xl">
                      <div className="flex justify-between border-b border-input/20 pb-1.5">
                        <span className="text-muted-foreground">Active Pairs:</span>
                        <span className="font-mono font-bold text-foreground">{negStats.activePairs}</span>
                      </div>
                      <div className="flex justify-between border-b border-input/20 pb-1.5">
                        <span className="text-muted-foreground">Agreements:</span>
                        <span className="font-mono font-bold text-accent">{negStats.agreements}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Divergences:</span>
                        <span className="font-mono font-bold text-amber-500">{negStats.divergences}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Arbitrations:</span>
                        <span className="font-mono font-bold text-primary">{negStats.arbitrations}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 px-5 py-4 border-t border-input bg-card flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-card border border-input text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
            >
              {l.cancel}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-primary text-background font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
            >
              {saving ? l.saving : l.save}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
