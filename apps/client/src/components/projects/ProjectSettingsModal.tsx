import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useLiterals } from "@/lib";
import { literals as u } from "./ProjectSettingsModal.literals";
import { Button } from "@/components/ui/Button";
import { AvatarUploadField } from "@/components/shared/AvatarUploadField";
import { DEFAULT_AVATAR_PREFIX, isDefaultAvatar } from "@/lib/defaultAvatars";

interface Project {
  id: string;
  name: string;
  cloneUrl?: string | null;
  avatarUrl?: string | null;
  createdAt?: string | null;
  diskPath?: string;
}

interface Props {
  project: Project;
  onClose: () => void;
  onSave: (updates: {
    name: string;
    cloneUrl: string | null;
    avatarUrl: string | null;
  }) => Promise<void>;
  onUploadAvatar?: (id: string, file: File) => Promise<string>;
  onDeleteAvatar?: (id: string) => Promise<void>;
  onDeleteProject?: (id: string) => Promise<void>;
}

export function ProjectSettingsModal({
  project,
  onClose,
  onSave,
  onUploadAvatar,
  onDeleteAvatar,
  onDeleteProject,
}: Props) {
  const l = useLiterals(u);
  const [name, setName] = useState(project.name);
  const [cloneUrl, setCloneUrl] = useState(project.cloneUrl || "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  // Danger zone state
  const [confirmDeleteName, setConfirmDeleteName] = useState("");

  // Avatar state
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(project.avatarUrl || null);
  const [selectedDefaultAvatar, setSelectedDefaultAvatar] = useState<string | null>(() => {
    if (project.avatarUrl && isDefaultAvatar(project.avatarUrl)) {
      return project.avatarUrl.slice(DEFAULT_AVATAR_PREFIX.length);
    }
    return null;
  });

  useEffect(() => {
    setName(project.name);
    setCloneUrl(project.cloneUrl || "");
    setAvatarPreview(project.avatarUrl || null);
    if (project.avatarUrl && isDefaultAvatar(project.avatarUrl)) {
      setSelectedDefaultAvatar(project.avatarUrl.slice(DEFAULT_AVATAR_PREFIX.length));
    } else {
      setSelectedDefaultAvatar(null);
    }
  }, [project]);

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

      await onSave({
        name: name.trim(),
        cloneUrl: cloneUrl.trim() || null,
        avatarUrl: resolvedAvatarUrl,
      });

      if (avatarFile && onUploadAvatar) {
        await onUploadAvatar(project.id, avatarFile);
      }

      if (!avatarFile && !selectedDefaultAvatar && avatarPreview === null && onDeleteAvatar) {
        await onDeleteAvatar(project.id);
      }

      onClose();
    } catch (err: any) {
      setError(err.message || l.updateError);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(project.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmDeleteName !== project.name || !onDeleteProject) return;
    setError(null);
    setDeleting(true);

    try {
      await onDeleteProject(project.id);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to delete project");
    } finally {
      setDeleting(false);
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
          <h3 className="font-bold text-foreground text-sm">{l.title}</h3>
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

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4">
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
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                {l.projectNameLabel}
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-1.5 bg-bg border border-input rounded-xl text-sm text-foreground focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
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

            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                ID
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={project.id}
                  className="flex-1 px-3 py-1.5 bg-bg/50 border border-input rounded-xl text-xs text-text-secondary font-mono focus:outline-none select-all"
                />
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="px-3 py-1.5 bg-bg hover:bg-surface-hover text-xs rounded-xl font-semibold transition-colors border border-input/30 cursor-pointer"
                >
                  {copiedId ? l.copied : l.copyId}
                </button>
              </div>
            </div>

            {project.createdAt && (
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                  {l.createdAtLabel}
                </label>
                <input
                  type="text"
                  readOnly
                  value={new Date(project.createdAt).toLocaleString()}
                  className="w-full px-3 py-1.5 bg-bg/50 border border-input rounded-xl text-xs text-text-secondary focus:outline-none"
                />
              </div>
            )}

            {project.diskPath && (
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                  {l.diskPathLabel}
                </label>
                <input
                  type="text"
                  readOnly
                  value={project.diskPath}
                  className="w-full px-3 py-1.5 bg-bg/50 border border-input rounded-xl text-[10px] text-text-secondary font-mono focus:outline-none overflow-x-auto"
                />
              </div>
            )}

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
                {saving ? l.saving : l.saveChanges}
              </Button>
            </div>
          </form>

          {onDeleteProject && (
            <div className="pt-4 mt-4 border-t border-error/20 space-y-3">
              <h4 className="text-xs font-bold text-error uppercase tracking-wider">{l.deleteProject}</h4>
              <p className="text-[11px] text-text-secondary leading-relaxed font-body">{l.deleteProjectDescription}</p>
              <form onSubmit={handleDelete} className="space-y-3">
                <div>
                  <label className="block text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
                    {l.deleteConfirmLabel.replace("{name}", project.name)}
                  </label>
                  <input
                    type="text"
                    required
                    value={confirmDeleteName}
                    onChange={(e) => setConfirmDeleteName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-bg border border-error/30 rounded-xl text-sm text-foreground focus:outline-none focus:border-error"
                  />
                </div>
                <Button
                  variant="destructive"
                  type="submit"
                  className="w-full"
                  disabled={confirmDeleteName !== project.name || deleting}
                >
                  {deleting ? l.deleting : l.deleteButton}
                </Button>
              </form>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
