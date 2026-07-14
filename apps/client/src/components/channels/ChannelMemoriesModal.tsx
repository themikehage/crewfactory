import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { useLiterals } from "@/lib";
import { literals as u } from "./ChannelMemoriesModal.literals";

interface MemoryItem {
  id: string;
  content: string;
  type: string;
  importance: number;
  tags?: string[];
}

interface Props {
  channelId: string;
  channelName: string;
  onClose: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  semantic: "text-accent bg-accent/10",
  episodic: "text-highlight bg-highlight/10",
  procedural: "text-warning bg-warning/10",
};

function ImportanceDots({ value }: { value: number }) {
  const filled = Math.round(value * 5);
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${i < filled ? "bg-accent" : "bg-border"}`}
        />
      ))}
    </span>
  );
}

export function ChannelMemoriesModal({ channelId, channelName, onClose }: Props) {
  const l = useLiterals(u);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleClear = async () => {
    if (!window.confirm(l.clearConfirm)) return;
    try {
      setClearing(true);
      setError(null);
      const res = await apiFetch(`/api/channels/${channelId}/memories`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMemories([]);
    } catch (err: any) {
      setError(err.message || "Failed to clear memories");
    } finally {
      setClearing(false);
    }
  };

  const fetchMemories = useCallback(async (searchQuery?: string) => {
    try {
      if (searchQuery?.trim()) {
        setSearching(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const url = searchQuery?.trim()
        ? `/api/channels/${channelId}/memories?q=${encodeURIComponent(searchQuery.trim())}`
        : `/api/channels/${channelId}/memories`;

      const res = await apiFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMemories(data.memories || []);
    } catch (err: any) {
      setError(err.message || "Failed to load memories");
    } finally {
      setLoading(false);
      setSearching(false);
    }
  }, [channelId]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMemories(query);
  };

  const handleClearSearch = () => {
    setQuery("");
    fetchMemories();
  };

  const activeCount = memories.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-2xl bg-card border border-input rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-input flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <span>{l.title}</span>
              <span className="text-xs text-primary font-normal">(#{channelName})</span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{l.subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card-hover transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="px-5 pt-3 pb-1 flex-shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={l.recall}
              className="flex-1 bg-background border border-input rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/50"
            />
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="px-3 py-1.5 text-xs font-medium bg-primary text-background rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {searching ? "..." : l.typeLabel}
            </button>
            {query.trim() && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="px-3 py-1.5 text-xs font-medium border border-input rounded-lg text-muted-foreground hover:text-foreground hover:bg-card-hover transition-colors"
              >
                Limpiar
              </button>
            )}
          </div>
        </form>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2.5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-error text-xs">{error}</div>
          ) : memories.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-xs">{l.empty}</div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground mb-2">
                {activeCount} {activeCount === 1 ? "memoria encontrada" : "memorias encontradas"}
              </div>
              {memories.map((m) => {
                const colorClass = TYPE_COLORS[m.type] ?? "text-text-secondary bg-surface";
                return (
                  <div key={m.id} className="rounded-lg border border-input/40 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-card border-b border-input/20">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${colorClass}`}>
                        {m.type}
                      </span>
                      <ImportanceDots value={m.importance} />
                      <span className="text-text-secondary text-[10px] ml-auto font-mono truncate max-w-[140px]">
                        {m.id.slice(0, 12)}...
                      </span>
                    </div>
                    <div className="px-3 py-2.5 text-text-secondary text-[12px] whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                      {m.content}
                    </div>
                    {m.tags && m.tags.length > 0 && (
                      <div className="flex items-center gap-1 px-3 py-1.5 border-t border-input/20 bg-bg flex-wrap">
                        {m.tags.map((tag) => (
                          <span key={tag} className="px-1.5 py-0.5 rounded bg-surface text-text-secondary text-[10px]">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-input flex-shrink-0 bg-card/40">
          {memories.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              disabled={clearing}
              className="px-4 py-2 text-xs font-medium text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              {clearing ? "..." : l.clearMemories}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 text-xs font-medium text-muted-foreground border border-input rounded-lg hover:bg-card-hover transition-colors"
          >
            Cerrar
          </button>
        </div>
      </motion.div>
    </div>
  );
}
