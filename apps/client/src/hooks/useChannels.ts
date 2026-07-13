import { apiFetch } from "@/lib/api";
import { useState, useEffect, useCallback } from "react";
import type { Channel, CreateChannel, UpdateChannel } from "shared";



export function useChannels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/channels");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setChannels(data.channels || []);
    } catch (err: any) {
      setError(err.message || "Failed to load channels");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const createChannel = useCallback(async (data: CreateChannel): Promise<Channel> => {
    const res = await apiFetch("/api/channels", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"},
      body: JSON.stringify(data)});
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const channel = await res.json();
    await fetchChannels();
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "channel" } }));
    return channel;
  }, [fetchChannels]);

  const updateChannel = useCallback(async (id: string, updates: UpdateChannel): Promise<Channel> => {
    const res = await apiFetch(`/api/channels/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"},
      body: JSON.stringify(updates)});
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const channel = await res.json();
    await fetchChannels();
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "channel" } }));
    return channel;
  }, [fetchChannels]);

  const deleteChannel = useCallback(async (id: string): Promise<void> => {
    const res = await apiFetch(`/api/channels/${id}`, {
      method: "DELETE"});
    if (!res.ok && res.status !== 404) {
      throw new Error(`HTTP ${res.status}`);
    }
    await fetchChannels();
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "channel" } }));
  }, [fetchChannels]);

  return {
    channels,
    loading,
    error,
    fetchChannels,
    createChannel,
    updateChannel,
    deleteChannel};
}
