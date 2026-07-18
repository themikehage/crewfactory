import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import type { TeamMember, TeamTopology } from "shared";

interface Props {
  onClose: () => void;
  onCreate: (payload: {
    name: string;
    description?: string;
    topology: TeamTopology;
    members: TeamMember[];
    showThinking?: boolean;
    showTools?: boolean;
  }) => Promise<any>;
}

interface AgentOption {
  id: string;
  name: string;
  avatarUrl?: string;
}

export function CreateTeamModal({ onClose, onCreate }: Props) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [topology, setTopology] = useState<TeamTopology>("leader_specialists");

  const [availableAgents, setAvailableAgents] = useState<AgentOption[]>([]);
  const [selectedLeader, setSelectedLeader] = useState<string>("");
  const [selectedSpecialists, setSelectedSpecialists] = useState<string[]>([]);
  const [roundtablePeers, setRoundtablePeers] = useState<string[]>([]);

  const [showThinking, setShowThinking] = useState(false);
  const [showTools, setShowTools] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAgents() {
      try {
        const res = await apiFetch("/api/agents");
        if (res.ok) {
          const data = await res.json();
          setAvailableAgents(data.agents || []);
        }
      } catch {}
    }
    loadAgents();
  }, []);

  const handleNext = () => {
    if (step === 1) {
      if (!name.trim()) {
        setError("Team name is required");
        return;
      }
      setError(null);
      setStep(2);
    } else if (step === 2) {
      if (topology === "leader_specialists") {
        if (!selectedLeader) {
          setError("A leader agent is required");
          return;
        }
        if (selectedSpecialists.length === 0) {
          setError("At least one specialist agent is required");
          return;
        }
      } else {
        if (roundtablePeers.length < 2) {
          setError("At least two peer agents are required");
          return;
        }
      }
      setError(null);
      setStep(3);
    }
  };

  const handleBack = () => {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 3) {
      handleNext();
      return;
    }
    setError(null);
    setSaving(true);

    const members: TeamMember[] = [];

    if (topology === "leader_specialists") {
      members.push({ agentId: selectedLeader, role: "leader", order: 0 });
      selectedSpecialists.forEach((id, index) => {
        members.push({ agentId: id, role: "specialist", order: index + 1 });
      });
    } else {
      roundtablePeers.forEach((id, index) => {
        members.push({ agentId: id, role: "peer", order: index });
      });
    }

    try {
      await onCreate({
        name,
        description: description || undefined,
        topology,
        members,
        showThinking,
        showTools,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create team");
    } finally {
      setSaving(false);
    }
  };

  const toggleSpecialist = (id: string) => {
    setSelectedSpecialists((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const togglePeer = (id: string) => {
    setRoundtablePeers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-md bg-card border border-input rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-input flex-shrink-0">
          <span className="font-semibold text-foreground text-sm">Create Team</span>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-card-hover transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
            {error && (
              <div className="p-3 bg-error/10 border border-error/20 text-error rounded-lg">
                {error}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-text-secondary font-medium">Team Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-background border border-input rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary transition-colors text-xs"
                    placeholder="Enter team name..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-text-secondary font-medium">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="w-full bg-background border border-input rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary transition-colors text-xs resize-none"
                    placeholder="Describe what this team does..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-text-secondary font-medium">Topology</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTopology("leader_specialists")}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        topology === "leader_specialists"
                          ? "border-primary bg-primary/5"
                          : "border-input hover:border-text-secondary bg-background"
                      }`}
                    >
                      <div className="font-semibold text-text-primary text-[11px]">Leader + Specialists</div>
                      <div className="text-[10px] text-text-secondary mt-1 leading-normal">
                        One coordinator directs the task flow and consolidates specialist agent replies.
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTopology("roundtable")}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        topology === "roundtable"
                          ? "border-primary bg-primary/5"
                          : "border-input hover:border-text-secondary bg-background"
                      }`}
                    >
                      <div className="font-semibold text-text-primary text-[11px]">Roundtable</div>
                      <div className="text-[10px] text-text-secondary mt-1 leading-normal">
                        Agents work sequentially in a pre-ordered loop. Ideal for flat feedback passes.
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                {topology === "leader_specialists" ? (
                  <>
                    <div className="space-y-1">
                      <label className="text-text-secondary font-medium">Select Leader Agent</label>
                      <select
                        value={selectedLeader}
                        onChange={(e) => setSelectedLeader(e.target.value)}
                        className="w-full bg-background border border-input rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary text-xs"
                      >
                        <option value="">Choose leader...</option>
                        {availableAgents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-text-secondary font-medium">Select Specialist Agents</label>
                      <div className="border border-input rounded-lg bg-background max-h-48 overflow-y-auto divide-y divide-white/[0.04]">
                        {availableAgents.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            disabled={a.id === selectedLeader}
                            onClick={() => toggleSpecialist(a.id)}
                            className={`w-full text-left px-3 py-2.5 flex items-center justify-between transition-colors ${
                              a.id === selectedLeader ? "opacity-30 cursor-not-allowed bg-black/10" : "hover:bg-surface-hover"
                            }`}
                          >
                            <span className="font-medium text-text-primary">{a.name}</span>
                            {selectedSpecialists.includes(a.id) && (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-1">
                    <label className="text-text-secondary font-medium">Select Roundtable Peers (in execution order)</label>
                    <div className="border border-input rounded-lg bg-background max-h-60 overflow-y-auto divide-y divide-white/[0.04]">
                      {availableAgents.map((a) => {
                        const idx = roundtablePeers.indexOf(a.id);
                        const isSelected = idx >= 0;
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => togglePeer(a.id)}
                            className="w-full text-left px-3 py-2.5 flex items-center justify-between hover:bg-surface-hover transition-colors"
                          >
                            <span className="font-medium text-text-primary">{a.name}</span>
                            {isSelected ? (
                              <div className="w-5 h-5 rounded-full bg-primary/20 border border-primary flex items-center justify-center text-[10px] font-bold text-primary">
                                {idx + 1}
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full border border-input" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="p-3 bg-surface rounded-lg border border-input space-y-1">
                  <div className="font-semibold text-text-primary">Topology Summary</div>
                  <div className="text-text-secondary">
                    {topology === "leader_specialists"
                      ? `Leader + Specialists topology. Leader: ${
                          availableAgents.find((a) => a.id === selectedLeader)?.name
                        }, Specialists: ${selectedSpecialists
                          .map((id) => availableAgents.find((a) => a.id === id)?.name)
                          .join(", ")}`
                      : `Roundtable topology. Peers in order: ${roundtablePeers
                          .map((id) => availableAgents.find((a) => a.id === id)?.name)
                          .join(" → ")}`}
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showThinking}
                      onChange={(e) => setShowThinking(e.target.checked)}
                      className="rounded border-input text-primary focus:ring-primary w-4 h-4 bg-background"
                    />
                    <div>
                      <div className="font-medium text-text-primary">Show thinking steps</div>
                      <div className="text-[10px] text-text-secondary mt-0.5">
                        Display the raw internal thought block of each agent during the execution run.
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showTools}
                      onChange={(e) => setShowTools(e.target.checked)}
                      className="rounded border-input text-primary focus:ring-primary w-4 h-4 bg-background"
                    />
                    <div>
                      <div className="font-medium text-text-primary">Show tool execution details</div>
                      <div className="text-[10px] text-text-secondary mt-0.5">
                        Stream live updates on tool names, arguments, and execution statuses.
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-input flex items-center justify-between flex-shrink-0 bg-background/25">
            {step > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-2 border border-input rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors font-medium text-xs cursor-pointer"
              >
                Back
              </button>
            ) : (
              <div />
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                className="px-4 py-2 bg-primary text-background font-semibold rounded-lg hover:opacity-90 transition-opacity text-xs cursor-pointer"
              >
                Continue
              </button>
            ) : (
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-accent text-background font-semibold rounded-lg hover:opacity-90 transition-opacity text-xs cursor-pointer disabled:opacity-50"
              >
                {saving ? "Creating..." : "Create Team"}
              </button>
            )}
          </div>
        </form>
      </motion.div>
    </div>
  );
}
