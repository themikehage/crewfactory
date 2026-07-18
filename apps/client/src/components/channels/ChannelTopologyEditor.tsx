import { useEffect, useMemo, useState } from "react";
import { CHANNEL_TOPOLOGY_VERSION, previewChannelTopology, validateChannelTopology, type AgentInfo, type Channel, type ChannelTopology, type ChannelTopologyKind } from "shared";
import { apiFetch } from "@/lib/api";

const kinds: Array<{ value: Exclude<ChannelTopologyKind, "legacy_custom">; label: string; detail: string }> = [
  { value: "leader_specialists", label: "Leader & specialists", detail: "A leader starts and owns the final response." },
  { value: "sequential_review", label: "Sequential review", detail: "Reviewers respond in a fixed, visible order." },
  { value: "roundtable", label: "Roundtable", detail: "Peers independently contribute to the same task." },
  { value: "debate_with_arbiter", label: "Debate with arbiter", detail: "Positions negotiate and an arbiter resolves divergence." },
  { value: "mention_only", label: "Mention only", detail: "Agents respond only when a person explicitly mentions them." },
];

function defaultTopology(kind: Exclude<ChannelTopologyKind, "legacy_custom">, channel: Channel): ChannelTopology {
  const first = channel.members[0]?.agentId;
  const assignments = channel.members.map((member, order) => ({ agentId: member.agentId, role: kind === "roundtable" ? "peer" as const : kind === "debate_with_arbiter" && order === channel.members.length - 1 ? "arbiter" as const : kind === "debate_with_arbiter" ? "position" as const : order === 0 ? "leader" as const : kind === "sequential_review" ? "reviewer" as const : kind === "mention_only" ? "participant" as const : "specialist" as const, targets: [], order }));
  const leader = assignments.find((assignment) => assignment.role === "leader")?.agentId;
  const arbiter = assignments.find((assignment) => assignment.role === "arbiter")?.agentId;
  return { version: CHANNEL_TOPOLOGY_VERSION, kind, schedulerMode: kind === "leader_specialists" ? "leader-gated" : "sequential", entryPointAgentId: kind === "roundtable" || kind === "mention_only" ? undefined : leader ?? first, terminalOwnerAgentId: kind === "leader_specialists" ? leader : kind === "debate_with_arbiter" ? arbiter : assignments[assignments.length - 1]?.agentId, arbiterAgentId: arbiter, assignments };
}

export function ChannelTopologyEditor({ channel, value, onChange }: { channel: Channel; value?: ChannelTopology; onChange: (topology: ChannelTopology) => void }) {
  const topology = value ?? defaultTopology("roundtable", channel);
  const [availableAgents, setAvailableAgents] = useState<AgentInfo[]>([]);
  useEffect(() => {
    if (!value) onChange(defaultTopology("roundtable", channel));
  }, [channel, onChange, value]);
  useEffect(() => { void apiFetch("/api/agents").then((response) => response.ok ? response.json() : null).then((data) => setAvailableAgents(data?.agents ?? [])).catch(() => {}); }, []);
  const validation = useMemo(() => validateChannelTopology(topology, channel.members, channel.negotiationProtocol), [channel.members, channel.negotiationProtocol, topology]);
  const preview = useMemo(() => previewChannelTopology(topology), [topology]);
  const setKind = (kind: Exclude<ChannelTopologyKind, "legacy_custom">) => onChange(defaultTopology(kind, channel));
  const setAssignmentRole = (agentId: string, role: ChannelTopology["assignments"][number]["role"]) => {
    const assignments = topology.assignments.map((assignment) => ({ ...assignment, role: assignment.agentId === agentId ? role : assignment.role }));
    const leader = assignments.find((assignment) => assignment.role === "leader")?.agentId;
    const arbiter = assignments.find((assignment) => assignment.role === "arbiter")?.agentId;
    onChange({ ...topology, assignments, entryPointAgentId: topology.kind === "roundtable" || topology.kind === "mention_only" ? undefined : leader ?? topology.entryPointAgentId, terminalOwnerAgentId: topology.kind === "leader_specialists" ? leader : topology.kind === "debate_with_arbiter" ? arbiter : topology.terminalOwnerAgentId, arbiterAgentId: arbiter });
  };
  const toggleMember = (agentId: string, selected: boolean) => {
    const role = topology.kind === "leader_specialists" ? "specialist" as const : topology.kind === "sequential_review" ? "reviewer" as const : topology.kind === "roundtable" ? "peer" as const : topology.kind === "debate_with_arbiter" ? "position" as const : "participant" as const;
    const assignments = selected ? [...topology.assignments, { agentId, role, targets: [], order: topology.assignments.length }] : topology.assignments.filter((assignment) => assignment.agentId !== agentId).map((assignment, order) => ({ ...assignment, order }));
    onChange({ ...topology, assignments });
  };

  return <div className="space-y-4">
    <div><p className="font-semibold text-foreground">How this team works</p><p className="mt-1 text-muted-foreground">Choose an outcome, not low-level routing rules.</p></div>
    <div className="grid gap-2 sm:grid-cols-2">{kinds.map((kind) => <button key={kind.value} type="button" onClick={() => setKind(kind.value)} className={`rounded-lg border p-3 text-left transition-colors ${topology.kind === kind.value ? "border-primary bg-primary/10" : "border-input hover:bg-card-hover"}`}><span className="block font-semibold text-foreground">{kind.label}</span><span className="mt-1 block text-[10px] text-muted-foreground">{kind.detail}</span></button>)}</div>
    <div className="rounded-lg border border-input bg-background/50 p-3"><p className="font-semibold text-foreground">Member assignments</p><div className="mt-2 space-y-2">{topology.assignments.map((assignment) => <label key={assignment.agentId} className="flex items-center justify-between gap-2 text-muted-foreground"><span className="truncate">{assignment.agentId}</span><select value={assignment.role} onChange={(event) => setAssignmentRole(assignment.agentId, event.target.value as typeof assignment.role)} className="rounded border border-input bg-card px-2 py-1 text-foreground"><option value="leader">Leader</option><option value="specialist">Specialist</option><option value="reviewer">Reviewer</option><option value="peer">Peer</option><option value="position">Position</option><option value="arbiter">Arbiter</option><option value="participant">Participant</option></select></label>)}</div></div>
    <div className="rounded-lg border border-input p-3"><p className="font-semibold text-foreground">Team members</p><div className="mt-2 max-h-28 space-y-1 overflow-y-auto">{availableAgents.map((agent) => <label key={agent.id} className="flex items-center gap-2 text-muted-foreground"><input type="checkbox" checked={topology.assignments.some((assignment) => assignment.agentId === agent.id)} onChange={(event) => toggleMember(agent.id, event.target.checked)} /><span>{agent.name}</span></label>)}</div></div>
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-[11px]"><p className="font-semibold text-foreground">Execution preview</p><p className="mt-1 text-muted-foreground">First: {preview.firstRecipients.join(", ") || "explicit @mention"}</p><p className="text-muted-foreground">Order: {preview.turns.join(" → ")}</p>{preview.finalOwner && <p className="text-muted-foreground">Final owner: {preview.finalOwner}</p>}</div>
    {validation.diagnostics.length > 0 && <div className="space-y-1">{validation.diagnostics.map((diagnostic) => <p key={diagnostic.code} className={diagnostic.severity === "error" ? "text-destructive" : "text-amber-500"}>{diagnostic.message} {diagnostic.repair && ` ${diagnostic.repair}`}</p>)}</div>}
  </div>;
}
