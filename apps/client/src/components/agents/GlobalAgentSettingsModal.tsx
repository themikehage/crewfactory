import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useLiterals } from "@/lib";
import { apiFetch } from "@/lib/api";
import { literals as u } from "./GlobalAgentSettingsModal.literals";
import { Button } from "@/components/ui/Button";
import { AvatarUploadField } from "@/components/shared/AvatarUploadField";
import { DEFAULT_AVATAR_PREFIX, isDefaultAvatar } from "@/lib/defaultAvatars";

interface Props {
  onClose: () => void;
  onSaveSuccess?: () => void;
}

export function GlobalAgentSettingsModal({ onClose, onSaveSuccess }: Props) {
  const l = useLiterals(u);
  const [factoryName, setFactoryName] = useState("Factory");
  const [factorySystemPrompt, setFactorySystemPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Avatar state
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [selectedDefaultAvatar, setSelectedDefaultAvatar] = useState<string | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await apiFetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          setFactoryName(data.factoryName || "Factory");
          setFactorySystemPrompt(data.factorySystemPrompt || "");
          const avUrl = data.factoryAvatarUrl || null;
          setAvatarPreview(avUrl);
          if (isDefaultAvatar(avUrl)) {
            setSelectedDefaultAvatar(avUrl.slice(DEFAULT_AVATAR_PREFIX.length));
          }
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
        setError(l.loadError);
      }
    };
    fetchSettings();
  }, [l.loadError]);

  const handleAvatarChange = (file: File | null, preview: string | null) => {
    setAvatarFile(file);
    setSelectedDefaultAvatar(null);
    setAvatarPreview(preview);
  };

  const handleSelectDefaultAvatar = (avatarId: string) => {
    setSelectedDefaultAvatar(avatarId);
    setAvatarFile(null);
    setAvatarPreview(DEFAULT_AVATAR_PREFIX + avatarId);
  };

  const handleClearAvatar = () => {
    setSelectedDefaultAvatar(null);
    setAvatarFile(null);
    setAvatarPreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const resolvedAvatarUrl = selectedDefaultAvatar
        ? DEFAULT_AVATAR_PREFIX + selectedDefaultAvatar
        : avatarPreview && !avatarPreview.startsWith("blob:") && !isDefaultAvatar(avatarPreview)
          ? avatarPreview
          : null;

      // Save general settings
      const res = await apiFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factoryName: factoryName.trim(),
          factorySystemPrompt: factorySystemPrompt.trim(),
          factoryAvatarUrl: resolvedAvatarUrl,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || l.saveError);
      }

      // Handle avatar file upload if selected
      if (avatarFile) {
        const formData = new FormData();
        formData.append("file", avatarFile);
        const avatarRes = await apiFetch("/api/settings/avatar", {
          method: "POST",
          body: formData,
        });
        if (!avatarRes.ok) {
          throw new Error("Failed to upload global agent avatar");
        }
      } else if (!selectedDefaultAvatar && avatarPreview === null) {
        // Delete avatar if cleared
        await apiFetch("/api/settings/avatar", {
          method: "DELETE",
        });
      }

      // Dispatch event to refresh layout & sidebars
      window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "settings" } }));

      if (onSaveSuccess) onSaveSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || l.saveError);
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
        className="relative w-full max-w-md bg-card border border-input rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-input flex-shrink-0">
          <div>
            <h3 className="font-bold text-foreground text-sm">{l.title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{l.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-text-secondary hover:text-foreground hover:bg-surface-hover transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <AvatarUploadField
            preview={avatarPreview}
            selectedDefault={selectedDefaultAvatar}
            onFileChange={handleAvatarChange}
            onSelectDefault={handleSelectDefaultAvatar}
            onClear={handleClearAvatar}
            entityName={factoryName}
            avatarType="agent"
          />

          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
              {l.factoryNameLabel}
            </label>
            <input
              type="text"
              required
              value={factoryName}
              onChange={(e) => setFactoryName(e.target.value)}
              placeholder={l.factoryNamePlaceholder}
              className="w-full px-3 py-1.5 bg-bg border border-input rounded-xl text-sm text-foreground focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
              {l.factorySystemPromptLabel}
            </label>
            <textarea
              value={factorySystemPrompt}
              onChange={(e) => setFactorySystemPrompt(e.target.value)}
              placeholder={l.factorySystemPromptPlaceholder}
              rows={6}
              className="w-full px-3 py-2 bg-bg border border-input rounded-xl text-sm text-foreground focus:outline-none focus:border-accent font-mono resize-none"
            />
          </div>

          {error && (
            <div className="p-3 bg-error/10 border border-error/20 text-error rounded-xl text-xs font-semibold">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-input">
            <Button variant="outline" type="button" onClick={onClose}>
              {l.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? l.saving : l.save}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
