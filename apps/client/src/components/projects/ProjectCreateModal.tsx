import { useState } from "react";
import { motion } from "framer-motion";
import { useLiterals } from "@/lib";
import { literals as u } from "./ProjectCreateModal.literals";
import { Button } from "@/components/ui/Button";
import { AvatarUploadField } from "@/components/shared/AvatarUploadField";
import { DEFAULT_AVATAR_PREFIX } from "@/lib/defaultAvatars";

interface ProjectCreateModalProps {
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    cloneUrl?: string;
    avatarUrl?: string;
  }) => Promise<any>;
  onUploadAvatar?: (id: string, file: File) => Promise<string>;
}

export function ProjectCreateModal({
  onClose,
  onSubmit,
  onUploadAvatar,
}: ProjectCreateModalProps) {
  const l = useLiterals(u);
  const [name, setName] = useState("");
  const [cloneUrl, setCloneUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Avatar state
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [selectedDefaultAvatar, setSelectedDefaultAvatar] = useState<string | null>(null);

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
    if (!name.trim()) return;

    setError(null);
    setSubmitting(true);

    try {
      const resolvedAvatarUrl = selectedDefaultAvatar
        ? DEFAULT_AVATAR_PREFIX + selectedDefaultAvatar
        : avatarPreview && !avatarPreview.startsWith("blob:")
          ? avatarPreview
          : undefined;

      const project = await onSubmit({
        name: name.trim(),
        cloneUrl: cloneUrl.trim() || undefined,
        avatarUrl: resolvedAvatarUrl,
      });

      const projectId = project?.id;
      if (avatarFile && projectId && onUploadAvatar) {
        await onUploadAvatar(projectId, avatarFile);
      }

      onClose();
    } catch (err: any) {
      setError(err.message || l.createError);
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
        className="relative w-full max-w-md bg-card border border-input rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-input">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{l.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{l.subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card-hover transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <AvatarUploadField
            preview={avatarPreview}
            selectedDefault={selectedDefaultAvatar}
            onFileChange={handleAvatarChange}
            onSelectDefault={handleSelectDefaultAvatar}
            onClear={handleClearAvatar}
            entityName={name}
            avatarType="entity"
            entityAvatarEntityType="project"
          />

          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              {l.projectNameLabel}
            </label>
            <input
              type="text"
              required
              placeholder={l.projectNamePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-bg border border-input rounded-xl text-sm text-foreground focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              {l.cloneUrlLabel}
            </label>
            <input
              type="text"
              placeholder={l.cloneUrlPlaceholder}
              value={cloneUrl}
              onChange={(e) => setCloneUrl(e.target.value)}
              className="w-full px-3 py-2 bg-bg border border-input rounded-xl text-sm text-foreground focus:outline-none focus:border-accent"
            />
          </div>

          {error && (
            <div className="bg-destructive/10 border border-error/30 text-destructive text-xs px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" type="button" onClick={onClose} className="flex-1">
              {l.cancel}
            </Button>
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? l.creating : l.create}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
