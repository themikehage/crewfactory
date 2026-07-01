import { useState, useEffect, useCallback } from "react";
import type { AgentInfo, AgentDefinition } from "shared";

function getToken() {
  return localStorage.getItem("token") || "";
}

export function useAgents() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agents", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAgents(data.agents || []);
    } catch (err: any) {
      setError(err.message || "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const registerAgent = useCallback(async (definition: AgentDefinition): Promise<AgentInfo> => {
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(definition),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const agent = await res.json();
    await fetchAgents();
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "agent" } }));
    return agent;
  }, [fetchAgents]);

  const stopAgent = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/agents/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`HTTP ${res.status}`);
    }
    await fetchAgents();
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "agent" } }));
  }, [fetchAgents]);

  const promptAgent = useCallback(async (id: string, message: string): Promise<string> => {
    const res = await fetch(`/api/agents/${id}/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ message, stream: false }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const msgs: any[] = data.messages || [];
    const last = [...msgs].reverse().find((m: any) => m.role === "assistant");
    if (!last) return "";
    if (typeof last.content === "string") return last.content;
    if (Array.isArray(last.content)) {
      return last.content.map((c: any) => c.text || "").join("\n");
    }
    return "";
  }, []);

  const updateAgent = useCallback(async (id: string, updates: Partial<Omit<AgentDefinition, "id">>): Promise<AgentInfo> => {
    const res = await fetch(`/api/agents/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const agent = await res.json();
    await fetchAgents();
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "agent" } }));
    return agent;
  }, [fetchAgents]);

  return { agents, loading, error, fetchAgents, registerAgent, stopAgent, updateAgent, promptAgent };
}
