import { useState, useEffect, useCallback } from "react";
import type { Channel, CreateChannel, UpdateChannel } from "shared";

function getToken() {
  return localStorage.getItem("token") || "";
}

export function useChannels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/channels", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
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
    const res = await fetch("/api/channels", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const channel = await res.json();
    await fetchChannels();
    return channel;
  }, [fetchChannels]);

  const updateChannel = useCallback(async (id: string, updates: UpdateChannel): Promise<Channel> => {
    const res = await fetch(`/api/channels/${id}`, {
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
    const channel = await res.json();
    await fetchChannels();
    return channel;
  }, [fetchChannels]);

  const deleteChannel = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/channels/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`HTTP ${res.status}`);
    }
    await fetchChannels();
  }, [fetchChannels]);

  return {
    channels,
    loading,
    error,
    fetchChannels,
    createChannel,
    updateChannel,
    deleteChannel,
  };
}
