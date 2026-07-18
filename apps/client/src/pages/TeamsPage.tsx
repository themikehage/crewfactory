import { useEffect, useState } from "react";
import type { AgentInfo, CreateTeam, TeamTopology } from "shared";
import { apiFetch } from "@/lib/api";
import { useTeams } from "@/hooks/useTeams";

export function TeamsPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { teams, loading, error, create } = useTeams();
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  useEffect(() => { void apiFetch("/api/agents").then(async (response) => response.ok ? response.json() : { agents: [] }).then((data: { agents: AgentInfo[] }) => setAgents(data.agents)); }, []);
  return <div className="h-full overflow-y-auto bg-background p-4 sm:p-6">
    <div className="mx-auto max-w-5xl">
      <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
        <div><h1 className="text-xl font-semibold text-foreground">Teams</h1><p className="mt-1 text-sm text-muted-foreground">Reliable multi-agent delivery with a single final outcome.</p></div>
        <button onClick={() => setShowCreate(true)} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-background">Create team</button>
      </div>
      {loading && <div className="py-16 text-center text-sm text-muted-foreground">Loading teams…</div>}
      {error && <div className="py-8 text-sm text-destructive">{error}</div>}
      {!loading && !error && teams.length === 0 && <div className="py-16 text-center text-sm text-muted-foreground">Create a team to run its first task.</div>}
      <div className="grid gap-3 py-5 sm:grid-cols-2">{teams.map((team) => <button key={team.id} onClick={() => onNavigate(`/teams/${team.id}`)} className="rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:bg-surface-hover"><div className="flex items-center justify-between gap-3"><span className="font-medium text-foreground">{team.name}</span><span className="rounded-full bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent">{team.topology === "leader_specialists" ? "Leader + specialists" : "Roundtable"}</span></div><p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{team.description || "No description"}</p><p className="mt-4 text-xs text-muted-foreground">{team.members.length} agents</p></button>)}</div>
    </div>
    {showCreate && <CreateTeamModal agents={agents} onClose={() => setShowCreate(false)} onCreate={async (input) => { const team = await create(input); setShowCreate(false); onNavigate(`/teams/${team.id}`); }} />}
  </div>;
}

function CreateTeamModal({ agents, onClose, onCreate }: { agents: AgentInfo[]; onClose: () => void; onCreate: (team: CreateTeam) => Promise<void> }) {
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [topology, setTopology] = useState<TeamTopology>("leader_specialists"); const [ids, setIds] = useState<string[]>([]); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setSaving(true); setError(null); try { await onCreate({ name, description: description || undefined, topology, members: ids.map((agentId, index) => ({ agentId, role: topology === "leader_specialists" ? index === 0 ? "leader" : "specialist" : index === 0 ? "facilitator" : "participant" })) }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create team"); } finally { setSaving(false); } };
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60"/><form onSubmit={submit} className="relative w-full max-w-md space-y-4 rounded-xl border border-border bg-surface p-5 shadow-xl"><div><h2 className="font-semibold text-foreground">Create team</h2><p className="mt-1 text-sm text-muted-foreground">Choose a stable collaboration topology.</p></div><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Team name" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"/><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description (optional)" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"/><select value={topology} onChange={(event) => setTopology(event.target.value as TeamTopology)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"><option value="leader_specialists">Leader + specialists</option><option value="roundtable">Roundtable</option></select><div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-border p-3">{agents.map((agent) => <label key={agent.id} className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={ids.includes(agent.id)} onChange={(event) => setIds((current) => event.target.checked ? [...current, agent.id] : current.filter((id) => id !== agent.id))}/>{agent.name}</label>)}</div>{error && <p className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-2 text-sm text-foreground">Cancel</button><button disabled={saving || !name || !ids.length} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-background">{saving ? "Creating…" : "Create team"}</button></div></form></div>;
}
