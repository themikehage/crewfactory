import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import type { Channel } from "shared";
import { useLiterals } from "@/lib";
import { apiFetch } from "@/lib/api";
import { literals as u } from "./ChannelSettingsModal.literals";

interface Props {
  channel: Channel;
  onClose: () => void;
  onSave: (updates: {
    name?: string;
    description?: string;
    channelType?: "debate" | "leader-specialist";
    maxChainDepth?: number;
    showThinking?: boolean;
    showTools?: boolean;
    streamingRenderMode?: "live" | "complete";
    negotiationProtocol?: any;
    delegationPattern?: any;
  }) => Promise<void>;
}

export function ChannelSettingsModal({ channel, onClose, onSave }: Props) {
  const l = useLiterals(u);
  const [activeTab, setActiveTab] = useState<"general" | "negotiation">("general");

  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description || "");
  const [maxChainDepth, setMaxChainDepth] = useState(channel.maxChainDepth ?? 5);
  const [showThinking, setShowThinking] = useState(channel.showThinking ?? false);
  const [showTools, setShowTools] = useState(channel.showTools ?? false);
  const [streamingRenderMode, setStreamingRenderMode] = useState<"live" | "complete">(channel.streamingRenderMode ?? "live");
  const [channelType, setChannelType] = useState<"debate" | "leader-specialist">(channel.channelType ?? "debate");
  
  // Structured negotiation states
  const [negotiationEnabled, setNegotiationEnabled] = useState(
    channel.negotiationProtocol !== undefined
  );
  const [agreementPattern, setAgreementPattern] = useState(
    channel.negotiationProtocol?.agreementPattern || "(ACUERDO ALCANZADO:|ACEPTO)"
  );
  const [rejectPattern, setRejectPattern] = useState(
    channel.negotiationProtocol?.rejectPattern || ""
  );
  const [maxRounds, setMaxRounds] = useState(
    channel.negotiationProtocol?.maxRounds ?? 3
  );
  const [arbiterAgentId, setArbiterAgentId] = useState(
    channel.negotiationProtocol?.arbiterAgentId || "__none__"
  );

  const [delegationRaw, setDelegationRaw] = useState(
    channel.delegationPattern ? JSON.stringify(channel.delegationPattern, null, 2) : ""
  );
  
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [negState, setNegState] = useState<any>(null);

  useEffect(() => {
    const fetchNegState = async () => {
      try {
        const res = await apiFetch(`/api/channels/${channel.id}/negotiation-state`);
        if (res.ok) {
          const data = await res.json();
          setNegState(data.state || {});
        }
      } catch (err) {
        console.error("Failed to fetch negotiation state:", err);
      }
    };
    fetchNegState();
  }, [channel.id]);

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

  // Strip experimental agent prefix for display if applicable
  const displayAgentId = (id: string) => {
    return id.replace(/^lab_[a-zA-Z0-9-]+_(single|multiNoLeader|multiWithLeader)_/, "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    let negotiationProtocol: any = undefined;
    let delegationPattern: any = undefined;

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
      if (delegationRaw.trim()) {
        delegationPattern = JSON.parse(delegationRaw);
      }
    } catch {
      setError(l.invalidJsonDelegation);
      setSaving(false);
      return;
    }

    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        channelType,
        maxChainDepth: Number(maxChainDepth),
        showThinking,
        showTools,
        streamingRenderMode,
        negotiationProtocol,
        delegationPattern,
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-lg bg-card border border-input rounded-2xl shadow-2xl flex flex-col overflow-visible"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-input flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="font-semibold text-foreground text-sm">Configuración del Canal</h3>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-card-hover transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-input/60 flex-shrink-0 bg-background/20">
          <button
            type="button"
            onClick={() => setActiveTab("general")}
            className={`flex-1 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "general"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {l.tabGeneral}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("negotiation")}
            className={`flex-1 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "negotiation"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {l.tabNegotiation}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col max-h-[75vh] overflow-visible rounded-2xl">
          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
            {error && (
              <div className="p-3 bg-destructive/10 border border-error/20 text-destructive rounded-lg">
                {error}
              </div>
            )}

            {activeTab === "general" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-muted-foreground font-medium mb-1">Nombre del Canal</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-muted-foreground font-medium mb-1">Descripción</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground outline-none focus:border-primary resize-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-muted-foreground font-medium">Límite de Profundidad (MAX_CHAIN_DEPTH)</label>
                    <span className="font-mono font-bold text-primary">{maxChainDepth} saltos</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    value={maxChainDepth}
                    onChange={(e) => setMaxChainDepth(Number(e.target.value))}
                    className="w-full accent-accent cursor-pointer"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Número máximo de respuestas seguidas entre agentes por cada mensaje del usuario antes de frenar la cadena.
                  </p>
                </div>

                <div className="flex flex-col gap-2.5 pt-2 border-t border-input/40">
                  <label className="flex items-center gap-2.5 text-muted-foreground font-medium cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showThinking}
                      onChange={(e) => setShowThinking(e.target.checked)}
                      className="w-4 h-4 accent-accent rounded border-input bg-background cursor-pointer"
                    />
                    <span>Mostrar pensamientos de agentes</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-muted-foreground font-medium cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showTools}
                      onChange={(e) => setShowTools(e.target.checked)}
                      className="w-4 h-4 accent-accent rounded border-input bg-background cursor-pointer"
                    />
                    <span>Mostrar uso de herramientas (tools)</span>
                  </label>
                </div>

                <div className="pt-3 border-t border-input/40">
                  <label className="block text-muted-foreground font-medium mb-1">
                    {l.channelType}
                  </label>
                  <select
                    value={channelType}
                    onChange={(e) => setChannelType(e.target.value as "debate" | "leader-specialist")}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="debate">{l.typeDebate}</option>
                    <option value="leader-specialist">{l.typeLeaderSpecialist}</option>
                  </select>
                </div>

                <div className="pt-3 border-t border-input/40">
                  <label className="block text-muted-foreground font-medium mb-1">
                    {l.streamingRenderMode}
                  </label>
                  <select
                    value={streamingRenderMode}
                    onChange={(e) => setStreamingRenderMode(e.target.value as "live" | "complete")}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="live">{l.renderModeLive}</option>
                    <option value="complete">{l.renderModeComplete}</option>
                  </select>
                </div>
              </div>
            )}

            {activeTab === "negotiation" && (
              <div className="space-y-4">
                <div className="p-3 bg-surface border border-input rounded-lg flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-foreground">{l.enableNegotiation}</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Permite que los agentes cooperen y negocien usando el protocolo formal.
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
                      <label className="block text-muted-foreground font-medium mb-1">{l.rejectionPattern}</label>
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
                        <span className="font-mono font-bold text-primary">{maxRounds} rondas</span>
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
                      <label className="block text-muted-foreground font-medium mb-1">{l.arbiterAgent}</label>
                      <select
                        value={arbiterAgentId}
                        onChange={(e) => setArbiterAgentId(e.target.value)}
                        className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground outline-none focus:border-primary"
                      >
                        <option value="__none__">{l.noArbiter}</option>
                        {channel.members.map((member) => (
                          <option key={member.agentId} value={member.agentId}>
                            {displayAgentId(member.agentId)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-muted-foreground font-semibold mb-1">
                    Delegation Pattern (JSON)
                  </label>
                  <textarea
                    value={delegationRaw}
                    onChange={(e) => setDelegationRaw(e.target.value)}
                    placeholder='{ "token": "DELEGATE: @(\\w+) — (.+)", "applyToRole": "lead" }'
                    rows={2}
                    className="w-full px-2.5 py-2 bg-background border border-input rounded-lg text-foreground font-mono text-[11px] outline-none focus:border-primary resize-none"
                  />
                </div>

                {negStats && (
                  <div className="pt-3 border-t border-input/40">
                    <h4 className="font-semibold text-foreground mb-2 text-xs">{l.liveActivity}</h4>
                    <div className="grid grid-cols-2 gap-2 bg-surface/50 p-2.5 border border-input/40 rounded-xl">
                      <div className="flex justify-between border-b border-input/20 pb-1.5">
                        <span className="text-muted-foreground">{l.activePairs}:</span>
                        <span className="font-mono font-bold text-foreground">{negStats.activePairs}</span>
                      </div>
                      <div className="flex justify-between border-b border-input/20 pb-1.5">
                        <span className="text-muted-foreground">{l.agreements}:</span>
                        <span className="font-mono font-bold text-accent">{negStats.agreements}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{l.divergences}:</span>
                        <span className="font-mono font-bold text-amber-500">{negStats.divergences}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{l.arbitrations}:</span>
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
              className="px-4 py-2 bg-card border border-input text-muted-foreground hover:text-foreground rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-primary text-background font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
            >
              {saving ? l.saving : l.saveSettings}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
