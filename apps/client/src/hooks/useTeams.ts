import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import type { TeamDefinition } from "shared";

export function useTeams() {
  const [teams, setTeams] = useState<TeamDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTeams = useCallback(async () => {
    try {
      const res = await apiFetch("/api/teams");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTeams(data.teams ?? []);
    } catch (err: any) {
      setError(err.message ?? "Failed to load teams");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const createTeam = useCallback(
    async (payload: {
      name: string;
      description?: string;
      topology: "leader_specialists" | "roundtable";
      members: Array<{ agentId: string; role: "leader" | "specialist" | "peer"; order: number }>;
      showThinking?: boolean;
      showTools?: boolean;
    }) => {
      const res = await apiFetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Failed to create team: ${res.status}`);
      const team: TeamDefinition = await res.json();
      setTeams((prev) => [team, ...prev]);
      window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "team" } }));
      return team;
    },
    []
  );

  const deleteTeam = useCallback(async (teamId: string) => {
    const res = await apiFetch(`/api/teams/${teamId}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Failed to delete team: ${res.status}`);
    setTeams((prev) => prev.filter((t) => t.id !== teamId));
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "team" } }));
  }, []);

  return { teams, loading, error, refetch: fetchTeams, createTeam, deleteTeam };
}
