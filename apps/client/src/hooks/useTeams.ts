import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { CreateTeam, Team } from "shared";

export function useTeams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch("/api/teams");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as { teams: Team[] };
      setTeams(data.teams);
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Failed to load teams"); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const create = useCallback(async (input: CreateTeam) => {
    const response = await apiFetch("/api/teams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
      throw new Error(data.error ?? `HTTP ${response.status}`);
    }
    const team = await response.json() as Team;
    await refresh();
    return team;
  }, [refresh]);
  return { teams, loading, error, refresh, create };
}
