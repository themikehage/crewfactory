import { apiFetch } from "@/lib/api";
import { useState, useEffect, useCallback } from "react";
import type { Team, CreateTeam, UpdateTeam } from "shared";

export function useTeams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/teams");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTeams(data.teams || []);
    } catch (err: any) {
      setError(err.message || "Failed to load teams");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const createTeam = useCallback(async (data: CreateTeam): Promise<Team> => {
    const res = await apiFetch("/api/teams", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"},
      body: JSON.stringify(data)});
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const team = await res.json();
    await fetchTeams();
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "team" } }));
    return team;
  }, [fetchTeams]);

  const updateTeam = useCallback(async (id: string, updates: UpdateTeam): Promise<Team> => {
    const res = await apiFetch(`/api/teams/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"},
      body: JSON.stringify(updates)});
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const team = await res.json();
    await fetchTeams();
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "team" } }));
    return team;
  }, [fetchTeams]);

  const deleteTeam = useCallback(async (id: string): Promise<void> => {
    const res = await apiFetch(`/api/teams/${id}`, {
      method: "DELETE"});
    if (!res.ok && res.status !== 404) {
      throw new Error(`HTTP ${res.status}`);
    }
    await fetchTeams();
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "team" } }));
  }, [fetchTeams]);

  return {
    teams,
    loading,
    error,
    fetchTeams,
    createTeam,
    updateTeam,
    deleteTeam};
}
