import { useState } from "react";
import { motion } from "framer-motion";
import type { Channel } from "shared";

interface Props {
  channel: Channel;
  onClose: () => void;
  onSave: (updates: { name?: string; description?: string; maxChainDepth?: number }) => Promise<void>;
}

export function ChannelSettingsModal({ channel, onClose, onSave }: Props) {
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description || "");
  const [maxChainDepth, setMaxChainDepth] = useState(channel.maxChainDepth ?? 5);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        maxChainDepth: Number(maxChainDepth),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to update channel settings");
    } finally {
      setSaving(false);
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
        className="relative w-full max-w-md bg-surface border border-surface-hover rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-hover flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="font-semibold text-text-primary text-sm">Configuración del Canal</h3>
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary p-1 rounded-lg hover:bg-surface-hover transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-error/10 border border-error/20 text-error rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-text-secondary font-medium mb-1">Nombre del Canal</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 bg-bg border border-surface-hover rounded-lg text-text-primary outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-text-secondary font-medium mb-1">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-bg border border-surface-hover rounded-lg text-text-primary outline-none focus:border-accent resize-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-text-secondary font-medium">Límite de Profundidad (MAX_CHAIN_DEPTH)</label>
              <span className="font-mono font-bold text-accent">{maxChainDepth} saltos</span>
            </div>
            <input
              type="range"
              min={1}
              max={20}
              value={maxChainDepth}
              onChange={(e) => setMaxChainDepth(Number(e.target.value))}
              className="w-full accent-accent cursor-pointer"
            />
            <p className="text-[10px] text-text-secondary/60 mt-1">
              Número máximo de respuestas seguidas entre agentes por cada mensaje del usuario antes de frenar la cadena.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-surface border border-surface-hover text-text-secondary hover:text-text-primary rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-accent text-bg font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
            >
              {saving ? "Guardando..." : "Guardar Ajustes"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
