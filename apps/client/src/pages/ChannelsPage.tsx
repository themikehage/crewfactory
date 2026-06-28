import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useChannels } from "@/hooks/useChannels";
import { ChannelCard } from "@/components/channels/ChannelCard";
import type { CreateChannel } from "shared";

function CreateChannelModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (data: CreateChannel) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({ name: name.trim(), description: description.trim() || undefined });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create channel");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-md bg-surface border border-surface-hover rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-hover">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Create Channel</h2>
            <p className="text-xs text-text-secondary mt-0.5">Start a new multi-agent conversation space</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Channel Name *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. project-planning"
              className="w-full bg-bg border border-surface-hover rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent/50"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Description (optional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Discuss and coordinate feature implementations"
              className="w-full bg-bg border border-surface-hover rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent/50"
            />
          </div>

          {error && (
            <div className="bg-error/10 border border-error/30 text-error text-xs px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-sm font-medium text-text-secondary border border-surface-hover rounded-lg hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="flex-1 py-2 text-sm font-medium bg-accent text-bg rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Channel"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

interface Props {
  onNavigate: (path: string) => void;
}

export function ChannelsPage({ onNavigate }: Props) {
  const { channels, loading, error, fetchChannels, createChannel, deleteChannel } = useChannels();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="h-full flex flex-col bg-bg overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-surface flex-shrink-0">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Channels</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Multi-agent group channels for collaborative agent execution
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchChannels}
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
            title="Refresh"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent text-bg rounded-lg hover:bg-accent/90 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Create Channel
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading && (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center h-32 text-error text-sm gap-2">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="opacity-60">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}

        {!loading && !error && channels.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-text-secondary gap-3">
            <div className="w-12 h-12 rounded-2xl bg-surface border border-surface-hover flex items-center justify-center">
              <span className="text-text-secondary/50 font-bold text-lg">#</span>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-text-primary">No channels created</p>
              <p className="text-xs mt-1">Create a channel to bring multiple agents together</p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 text-xs font-medium bg-accent/10 text-accent border border-accent/20 rounded-lg hover:bg-accent/20 transition-colors"
            >
              Create Channel
            </button>
          </div>
        )}

        {!loading && !error && channels.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <AnimatePresence mode="popLayout">
              {channels.map((ch) => (
                <ChannelCard
                  key={ch.id}
                  channel={ch}
                  onOpen={(id) => onNavigate(`/channel/${id}`)}
                  onDelete={deleteChannel}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCreate && (
          <CreateChannelModal
            onClose={() => setShowCreate(false)}
            onCreate={async (data) => {
              const ch = await createChannel(data);
              onNavigate(`/channel/${ch.id}`);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
