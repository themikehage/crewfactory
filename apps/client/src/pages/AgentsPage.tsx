import { apiFetch } from "@/lib/api";
import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAgents } from "@/hooks/useAgents";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { AgentAvatar } from "@/components/shared/AgentAvatar";
import { DEFAULT_AVATARS, DEFAULT_AVATAR_PREFIX, isDefaultAvatar } from "@/lib/defaultAvatars";
import type { AgentDefinition, AgentInfo } from "shared";
import { useLiterals } from "@/lib";
import { literals as u } from "./AgentsPage.literals";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/contexts/ToastContext";
import { AuthenticatedImage } from "@/components/chat/ImageGrid";

const STATUS_COLORS: Record<string, string> = {
  starting: "text-warning bg-warning/10 border-warning/30",
  idle: "text-primary bg-primary/10 border-primary/30",
  streaming: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  error: "text-destructive bg-destructive/10 border-error/30",
  stopped: "text-muted-foreground bg-card border-input"};

const STATUS_DOT: Record<string, string> = {
  starting: "bg-warning animate-pulse",
  idle: "bg-primary",
  streaming: "bg-blue-400 animate-pulse",
  error: "bg-destructive",
  stopped: "bg-text-secondary"};

const ROLE_COLORS: Record<string, string> = {
  "web-builder": "text-purple-400 bg-purple-400/10 border-purple-400/20",
  researcher: "text-sky-400 bg-sky-400/10 border-sky-400/20",
  supervisor: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  default: "text-muted-foreground bg-card border-input"};

function roleColor(role: string) {
  return ROLE_COLORS[role] ?? ROLE_COLORS.default;
}

const KNOWN_SERIAL_TOOLS = [
  { id: "request_approval", label: "request_approval", description: "Suspends execution for explicit user approval" },
  { id: "ask_question",     label: "ask_question",     description: "Prompts the user for a free-text answer" },
  { id: "spawn_subagent",   label: "spawn_subagent",   description: "Delegates to a child agent and waits for result" },
  { id: "delegate_task",    label: "delegate_task",    description: "Runs a task in an isolated session and awaits result" },
];

const DEFAULT_FORM: AgentDefinition = {
  id: "",
  name: "",
  role: "",
  systemPrompt: "",
  model: "",
  skills: [],
  port: undefined,
  serialTools: ["request_approval", "ask_question"]};

function AgentCard({
  agent,
  onDelete,
  onEdit,
  onChat,
  onExecutions}: {
  agent: AgentInfo;
  onDelete: (id: string) => void;
  onEdit: (agent: AgentInfo) => void;
  onChat: (agent: { id: string; name: string; avatarUrl?: string }) => void;
  onExecutions: (agent: { id: string; name: string }) => void;
}) {
  const l = useLiterals(u);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const executeDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(agent.id);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className="bg-card border border-input rounded-xl p-4 flex flex-col gap-3 hover:border-primary/20 transition-colors"
    >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size="md" />
            <div className="min-w-0">
              <p className="font-medium text-foreground text-sm truncate">{agent.name}</p>
              <p className="text-muted-foreground text-xs font-mono truncate">{agent.id}</p>
            </div>
          </div>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${
            STATUS_COLORS[agent.status] ?? STATUS_COLORS.stopped
          }`}
        >
          <span className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[agent.status] ?? "bg-text-secondary"}`} />
            {agent.status}
          </span>
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${roleColor(agent.role)}`}>
          {agent.role}
        </span>
        {agent.port && (
          <span className="text-xs font-mono text-muted-foreground bg-background border border-input px-2 py-0.5 rounded-full">
            :{agent.port}
          </span>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {new Date(agent.createdAt).toLocaleTimeString()}
        </span>
      </div>

      <div className="flex items-center gap-2 mt-1">
        <button
          onClick={() => onChat({ id: agent.id, name: agent.name, avatarUrl: agent.avatarUrl })}
          disabled={agent.status === "stopped" || agent.status === "error"}
          className="flex-1 py-1.5 px-2 text-[11px] font-medium bg-primary/10 text-primary border border-primary/20 rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Chat
        </button>
        <button
          onClick={() => onExecutions({ id: agent.id, name: agent.name })}
          className="flex-1 py-1.5 px-2 text-[11px] font-medium bg-card-hover text-foreground border border-input rounded-lg hover:bg-card-hover/80 transition-colors"
        >
          Historial
        </button>
        <button
          onClick={() => onEdit(agent)}
          className="py-1.5 px-2 text-[11px] font-medium text-blue-400 border border-blue-400/20 rounded-lg hover:bg-blue-400/10 transition-colors"
        >
          Editar
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="py-1.5 px-2 text-[11px] font-medium text-destructive border border-error/20 rounded-lg hover:bg-destructive/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {deleting ? l.deleting : l.delete}
        </button>
      </div>
      <ConfirmModal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={executeDelete}
        title={l.deleteTitle ?? "Delete Agent"}
        message={`${l.deleteConfirm_1}${agent.name}${l.deleteConfirm_2}`}
        confirmLabel={l.delete ?? "Delete"}
        destructive
        loading={deleting}
      />
    </motion.div>
  );
}

function RegisterModal({
  agent,
  onClose,
  onSubmit,
  onUploadAvatar,
  onDeleteAvatar}: {
  agent?: AgentInfo | null;
  onClose: () => void;
  onSubmit: (def: AgentDefinition) => Promise<unknown>;
  onUploadAvatar?: (id: string, file: File) => Promise<string>;
  onDeleteAvatar?: (id: string) => Promise<void>;
}) {
  const l = useLiterals(u);
  const [form, setForm] = useState<AgentDefinition>(DEFAULT_FORM);
  const [skillsInput, setSkillsInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [selectedDefaultAvatar, setSelectedDefaultAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (agent) {
      const fetchDetail = async () => {
        try {
          const res = await apiFetch(`/api/agents/${agent.id}`);
          if (res.ok) {
            const data = await res.json();
            if (data.definition) {
              setForm({
                ...data.definition,
                serialTools: data.definition.serialTools && data.definition.serialTools.length > 0
                  ? data.definition.serialTools
                  : ["request_approval", "ask_question"]
              });
              setSkillsInput(data.definition.skills?.join(", ") || "");
              const avUrl = data.definition.avatarUrl || null;
              setAvatarPreview(avUrl);
              if (isDefaultAvatar(avUrl)) {
                setSelectedDefaultAvatar(avUrl!.slice(DEFAULT_AVATAR_PREFIX.length));
              }
            }
          }
        } catch (err) {
          console.error("Failed to load agent detail:", err);
        }
      };
      fetchDetail();
    }
  }, [agent]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setAvatarFile(file);
    setSelectedDefaultAvatar(null);
    if (file) {
      setAvatarPreview(URL.createObjectURL(file));
    } else if (agent?.avatarUrl) {
      setAvatarPreview(agent.avatarUrl);
    } else {
      setAvatarPreview(null);
    }
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
    setSubmitting(true);
    try {
      const def: AgentDefinition = {
        ...form,
        id: form.id.trim().toLowerCase().replace(/\s+/g, "-"),
        skills: skillsInput
          ? skillsInput
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
        model: form.model?.trim() || undefined,
        port: form.port || undefined,
        avatarUrl: selectedDefaultAvatar
          ? DEFAULT_AVATAR_PREFIX + selectedDefaultAvatar
          : avatarPreview && !avatarPreview.startsWith("blob:") && !isDefaultAvatar(avatarPreview)
            ? avatarPreview
            : undefined};
      const result = await onSubmit(def);
      const agentId = agent?.id || (result as AgentInfo)?.id;
      if (avatarFile && agentId && onUploadAvatar) {
        await onUploadAvatar(agentId, avatarFile);
      }
      if (!avatarFile && !selectedDefaultAvatar && avatarPreview === null && agent?.id && onDeleteAvatar) {
        await onDeleteAvatar(agent.id);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || l.saveError);
    } finally {
      setSubmitting(false);
    }
  };

  const set = (key: keyof AgentDefinition) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const toggleSerialTool = (toolId: string) => {
    setForm((prev) => {
      const current = prev.serialTools ?? [];
      const updated = current.includes(toolId)
        ? current.filter((t) => t !== toolId)
        : [...current, toolId];
      return { ...prev, serialTools: updated };
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-lg bg-card border border-input rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-input">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {agent ? "Editar Agente" : "Register Agent"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {agent ? "Modificá la configuración del agente" : "Define a new programmatic agent"}
            </p>
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

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center gap-3">
            <AgentAvatar
              name={form.name || agent?.name || "Agent"}
              avatarUrl={avatarPreview}
              size="lg"
            />
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Avatar</label>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="text-xs text-muted-foreground file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-card-hover file:text-foreground hover:file:bg-card-hover/80 file:cursor-pointer"
                />
                {avatarPreview && (
                  <button
                    type="button"
                    onClick={handleClearAvatar}
                    className="text-xs text-destructive hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">Default Avatars</label>
            <div className="grid grid-cols-8 gap-1.5">
              {DEFAULT_AVATARS.map((av) => {
                const AvComp = av.component;
                const isSelected = selectedDefaultAvatar === av.id;
                return (
                  <button
                    key={av.id}
                    type="button"
                    onClick={() => handleSelectDefaultAvatar(av.id)}
                    className={`w-8 h-8 rounded-full overflow-hidden border-2 transition-all cursor-pointer ${
                      isSelected
                        ? "border-primary scale-110"
                        : "border-transparent hover:border-primary/40"
                    }`}
                    title={av.label}
                  >
                    <AvComp width={32} height={32} viewBox="0 0 40 40" />
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{l.idField}</label>
              <input
                required
                disabled={!!agent}
                value={form.id}
                onChange={set("id")}
                placeholder={l.idPlaceholder}
                pattern="[a-z0-9-]+"
                title={l.idPatternTitle}
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 font-mono disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{l.nameField}</label>
              <input
                required
                value={form.name}
                onChange={set("name")}
                placeholder={l.namePlaceholder}
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{l.roleField}</label>
              <input
                required
                value={form.role}
                onChange={set("role")}
                placeholder={l.idPlaceholder}
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{l.portField}</label>
              <input
                type="number"
                min={1024}
                max={65535}
                value={form.port || ""}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    port: e.target.value ? parseInt(e.target.value) : undefined}))
                }
                placeholder={l.portPlaceholder}
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">{l.modelField}</label>
            <input
              value={form.model || ""}
              onChange={set("model")}
              placeholder={l.modelPlaceholder}
              className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">{l.skillsField}</label>
            <input
              value={skillsInput}
              onChange={(e) => setSkillsInput(e.target.value)}
              placeholder={l.skillsPlaceholder}
              className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">{l.systemPromptField}</label>
            <textarea
              required
              value={form.systemPrompt}
              onChange={set("systemPrompt")}
              rows={5}
              placeholder={l.systemPromptPlaceholder}
              className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none font-mono leading-relaxed"
            />
          </div>

          <details className="group border border-input rounded-lg bg-background/30 overflow-hidden">
            <summary className="flex items-center justify-between px-3 py-2 cursor-pointer select-none hover:bg-card-hover/40 transition-colors text-xs font-semibold text-foreground">
              <span>{l.advancedConfig}</span>
              <svg
                className="w-3.5 h-3.5 text-muted-foreground transform transition-transform group-open:rotate-180"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="px-3 py-3 border-t border-input space-y-3 bg-card/10 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  {l.serialToolsLabel}
                </label>
                <p className="text-[10px] text-muted-foreground mb-2">
                  {l.serialToolsDescription}
                </p>
                <div className="space-y-1.5">
                  {KNOWN_SERIAL_TOOLS.map((tool) => {
                    const isChecked = form.serialTools?.includes(tool.id) ?? false;
                    return (
                      <label
                        key={tool.id}
                        className="flex items-start gap-2.5 p-2 rounded-lg border border-input/30 bg-background/50 hover:bg-card-hover/30 transition-colors cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSerialTool(tool.id)}
                          className="mt-0.5 rounded border-input text-primary focus:ring-primary accent-primary"
                        />
                        <div>
                          <span className="font-mono text-[11px] font-medium text-foreground block">
                            {tool.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground block">
                            {tool.description}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {agent && form.blueprintId && (
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                    {l.blueprintIdLabel}
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={form.blueprintId}
                    className="w-full bg-card-hover/25 border border-input/50 rounded-lg px-2.5 py-1.5 text-[11px] text-muted-foreground font-mono focus:outline-none"
                  />
                </div>
              )}

              {agent && agent.createdAt && (
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                    {l.createdAtLabel}
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={new Date(agent.createdAt).toLocaleString()}
                    className="w-full bg-card-hover/25 border border-input/50 rounded-lg px-2.5 py-1.5 text-[11px] text-muted-foreground focus:outline-none"
                  />
                </div>
              )}
            </div>
          </details>

          {error && (
            <div className="bg-destructive/10 border border-error/30 text-destructive text-xs px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" type="button" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? l.saving : agent ? l.saveChanges : l.registerAgent}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
function BlueprintDetailModal({
  blueprint,
  onClose,
  onInstall,
  isInstalled,
  installing}: {
  blueprint: any;
  onClose: () => void;
  onInstall: (id: string) => Promise<void>;
  isInstalled: boolean;
  installing: boolean;
}) {
  const l = useLiterals(u);
  const [showPrompt, setShowPrompt] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-2xl max-h-[85vh] bg-card border border-input rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-input flex-shrink-0">
          <div className="flex items-center gap-2.5">
            {blueprint.hasIcon ? (
              <div className="w-8 h-8 rounded-lg overflow-hidden border border-input">
                <AuthenticatedImage
                  src={`/api/gallery/blueprints/${blueprint.id}/icon`}
                  alt={blueprint.metadata.title}
                  className="w-8 h-8 object-cover"
                />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs border border-primary/20">
                {blueprint.metadata.title.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {blueprint.metadata.title}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {blueprint.type === "agent" ? l.filterAgents : l.filterChannels} • {l.version} {blueprint.metadata.version}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card-hover transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 11-1.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0 text-xs">
          <div className="space-y-1.5">
            <h3 className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
              {l.execSubtitle}
            </h3>
            <p className="text-foreground text-sm leading-relaxed">
              {blueprint.metadata.description}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-background/50 border border-input rounded-xl p-3 flex flex-col">
              <span className="text-muted-foreground text-[10px] uppercase font-semibold tracking-wider">
                {l.author}
              </span>
              <span className="text-foreground font-medium mt-1">
                {blueprint.metadata.author}
              </span>
            </div>
            {blueprint.metadata.compatibility && (
              <div className="bg-background/50 border border-input rounded-xl p-3 flex flex-col">
                <span className="text-muted-foreground text-[10px] uppercase font-semibold tracking-wider">
                  {l.compatibility}
                </span>
                <span className="text-foreground font-medium mt-1">
                  {blueprint.metadata.compatibility}
                </span>
              </div>
            )}
          </div>

          {blueprint.type === "agent" ? (
            <>
              {blueprint.definition.skills && blueprint.definition.skills.length > 0 && (
                <div>
                  <h3 className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px] mb-1.5">
                    {l.skillsTitle}
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {blueprint.definition.skills.map((s: string) => (
                      <span key={s} className="px-2.5 py-1 bg-primary/10 border border-primary/20 text-primary rounded-lg font-medium text-[11px]">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {blueprint.definition.model && (
                <div>
                  <h3 className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px] mb-1">
                    {l.modelTitle}
                  </h3>
                  <span className="font-mono text-foreground bg-background px-2 py-1 rounded border border-input inline-block">
                    {blueprint.definition.model}
                  </span>
                </div>
              )}

              <div className="border border-input rounded-xl overflow-hidden bg-background/30">
                <button
                  type="button"
                  onClick={() => setShowPrompt(!showPrompt)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-card-hover/40 transition-colors text-left"
                >
                  <span className="font-semibold text-foreground">{l.systemPromptPreview}</span>
                  <svg
                    className={`w-4 h-4 text-muted-foreground transform transition-transform ${showPrompt ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <AnimatePresence initial={false}>
                  {showPrompt && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      className="overflow-hidden border-t border-input"
                    >
                      <pre className="p-4 overflow-x-auto text-[11px] leading-relaxed font-mono whitespace-pre-wrap text-foreground bg-background/50 max-h-60 overflow-y-auto">
                        {blueprint.definition.systemPrompt}
                      </pre>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          ) : (
            <>
              {blueprint.definition.members && blueprint.definition.members.length > 0 && (
                <div>
                  <h3 className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px] mb-2">
                    {l.channelMembersTitle}
                  </h3>
                  <div className="space-y-1.5">
                    {blueprint.definition.members.map((m: any) => (
                      <div key={m.agentId} className="flex items-center justify-between p-2.5 rounded-xl border border-input bg-background/50">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px] border border-primary/20">
                            {m.agentId.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-medium text-foreground text-xs">{m.agentId}</span>
                            {m.role && (
                              <span className="ml-1.5 px-1.5 py-0.5 bg-card text-muted-foreground text-[9px] rounded-md border border-input uppercase font-bold">
                                {m.role}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {l.replyModeTitle}: <strong className="text-foreground">{m.replyMode}</strong>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {blueprint.definition.context && blueprint.definition.context.length > 0 && (
                <div>
                  <h3 className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px] mb-2">
                    Variables de Contexto
                  </h3>
                  <div className="space-y-1">
                    {blueprint.definition.context.map((ctx: any) => (
                      <div key={ctx.key} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-background border border-input font-mono text-[10px]">
                        <span className="text-primary font-semibold">{ctx.key}:</span>
                        <span className="text-muted-foreground">{ctx.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {blueprint.metadata.tags && blueprint.metadata.tags.length > 0 && (
            <div>
              <h3 className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px] mb-1.5">
                {l.tagsTitle}
              </h3>
              <div className="flex flex-wrap gap-1">
                {blueprint.metadata.tags.map((t: string) => (
                  <span key={t} className="text-[9px] bg-background/50 border border-input px-2 py-0.5 rounded-md text-muted-foreground font-medium">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 p-5 border-t border-input bg-background/30 flex-shrink-0">
          <Button variant="outline" onClick={onClose} className="flex-1">
            {l.cancel}
          </Button>
          <Button
            disabled={isInstalled || installing}
            onClick={async () => {
              await onInstall(blueprint.id);
              onClose();
            }}
            className="flex-1"
          >
            {installing ? l.installing : isInstalled ? l.installed : l.install}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

interface AgentsPageProps {
  onSelectAgent?: (agent: { id: string; name: string; avatarUrl?: string }) => void;
}

export function AgentsPage({ onSelectAgent }: AgentsPageProps) {
  const l = useLiterals(u);
  const { addToast } = useToast();
  const { agents, loading, error, fetchAgents, registerAgent, stopAgent, updateAgent, uploadAvatar, deleteAvatar } = useAgents();
  const [showRegister, setShowRegister] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentInfo | null>(null);
  const [selectedAgentForExecutions, setSelectedAgentForExecutions] = useState<{ id: string; name: string } | null>(null);

  // Gallery-specific state
  const [activeTab, setActiveTab] = useState<"my-agents" | "gallery">("my-agents");
  const [blueprints, setBlueprints] = useState<any[]>([]);
  const [loadingBlueprints, setLoadingBlueprints] = useState(false);
  const [blueprintsError, setBlueprintsError] = useState<string | null>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [galleryFilter, setGalleryFilter] = useState<"all" | "agent" | "channel">("all");
  const [gallerySearch, setGallerySearch] = useState("");
  const [selectedBlueprint, setSelectedBlueprint] = useState<any | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);

  const fetchBlueprints = useCallback(async () => {
    setLoadingBlueprints(true);
    setBlueprintsError(null);
    try {
      const res = await apiFetch("/api/gallery/blueprints");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBlueprints(data.blueprints || []);
    } catch (err: any) {
      setBlueprintsError(err.message || "Failed to load blueprints");
    } finally {
      setLoadingBlueprints(false);
    }
  }, []);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await apiFetch("/api/channels");
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
      }
    } catch (e) {
      console.error("Failed to fetch channels:", e);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "gallery") {
      fetchBlueprints();
      fetchChannels();
    }
  }, [activeTab, fetchBlueprints, fetchChannels]);

  const handleInstall = useCallback(async (bpId: string) => {
    setInstallingId(bpId);
    try {
      const res = await apiFetch(`/api/gallery/blueprints/${bpId}/install`, {
        method: "POST"});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to install");
      
      addToast("success", data.type === "agent" ? l.installSuccessAgent : l.installSuccessChannel);
      
      await fetchAgents();
      await fetchChannels();
      window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: data.type } }));
    } catch (err: any) {
      console.error(err);
      addToast("error", err.message || l.installError);
    } finally {
      setInstallingId(null);
    }
  }, [fetchAgents, fetchChannels, addToast, l]);

  const handleEditClick = (agent: AgentInfo) => {
    setEditingAgent(agent);
    setShowRegister(true);
  };

  const handleRegisterOrUpdate = async (def: AgentDefinition) => {
    if (editingAgent) {
      const { id, ...updates } = def;
      await updateAgent(editingAgent.id, updates);
    } else {
      await registerAgent(def);
    }
  };

  const filteredBlueprints = useMemo(() => {
    return blueprints.filter((bp) => {
      const matchesSearch =
        bp.metadata.title.toLowerCase().includes(gallerySearch.toLowerCase()) ||
        bp.metadata.description.toLowerCase().includes(gallerySearch.toLowerCase()) ||
        bp.metadata.tags.some((tag: string) => tag.toLowerCase().includes(gallerySearch.toLowerCase()));
      
      const matchesType =
        galleryFilter === "all" ||
        (galleryFilter === "agent" && bp.type === "agent") ||
        (galleryFilter === "channel" && bp.type === "channel");
      
      return matchesSearch && matchesType;
    });
  }, [blueprints, gallerySearch, galleryFilter]);

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-border flex-shrink-0">
        <div>
          <h1 className="text-base font-semibold text-foreground">{l.pageTitle}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {l.pageSubtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "my-agents" ? (
            <>
              <button
                onClick={fetchAgents}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-card-hover rounded-lg transition-colors"
                title={l.refresh}
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
              </button>
              <button
                onClick={() => {
                  setEditingAgent(null);
                  setShowRegister(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-background rounded-lg hover:bg-primary/90 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Register Agent
              </button>
            </>
          ) : (
            <button
              onClick={fetchBlueprints}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-card-hover rounded-lg transition-colors"
              title={l.refresh}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex border-b border-border px-6 flex-shrink-0 bg-card/10">
        <button
          onClick={() => setActiveTab("my-agents")}
          className={`px-4 py-3 text-xs font-medium border-b-2 transition-all cursor-pointer ${
            activeTab === "my-agents"
              ? "border-primary text-foreground animate-none"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {l.tabMyAgents}
        </button>
        <button
          onClick={() => setActiveTab("gallery")}
          className={`px-4 py-3 text-xs font-medium border-b-2 transition-all cursor-pointer ${
            activeTab === "gallery"
              ? "border-primary text-foreground animate-none"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {l.tabGallery}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {activeTab === "my-agents" ? (
          <>
            {loading && (
              <div className="flex items-center justify-center h-32">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!loading && error && (
              <div className="flex flex-col items-center justify-center h-32 text-destructive text-sm gap-2">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="opacity-60">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            {!loading && !error && agents.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
                <div className="w-12 h-12 rounded-2xl bg-card border border-input flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="text-muted-foreground">
                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">{l.emptyTitle}</p>
                  <p className="text-xs mt-1">{l.emptyDescription}</p>
                </div>
                <button
                  onClick={() => {
                    setEditingAgent(null);
                    setShowRegister(true);
                  }}
                  className="px-4 py-2 text-xs font-medium bg-primary/10 text-primary border border-primary/20 rounded-lg hover:bg-primary/20 transition-colors"
                >
                  Register Agent
                </button>
              </div>
            )}

            {!loading && !error && agents.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <AnimatePresence mode="popLayout">
                  {agents.map((agent) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      onDelete={stopAgent}
                      onEdit={handleEditClick}
                      onChat={(agentObj) => onSelectAgent?.(agentObj)}
                      onExecutions={(agentObj) => setSelectedAgentForExecutions(agentObj)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </>
        ) : (
          /* Gallery tab view */
          <div className="space-y-4">
            {/* Search & Filter Controls */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder={l.searchPlaceholder}
                  value={gallerySearch}
                  onChange={(e) => setGallerySearch(e.target.value)}
                  className="w-full bg-card border border-input rounded-xl pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
                <svg
                  className="absolute left-3 top-2.5 text-muted-foreground w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              <div className="flex gap-1.5 border border-input rounded-xl p-1 bg-card/40 flex-shrink-0 self-start">
                <button
                  onClick={() => setGalleryFilter("all")}
                  className={`px-3 py-1 rounded-lg text-[10px] font-medium transition-all cursor-pointer ${
                    galleryFilter === "all"
                      ? "bg-primary text-background"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {l.filterAll}
                </button>
                <button
                  onClick={() => setGalleryFilter("agent")}
                  className={`px-3 py-1 rounded-lg text-[10px] font-medium transition-all cursor-pointer ${
                    galleryFilter === "agent"
                      ? "bg-primary text-background"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {l.filterAgents}
                </button>
                <button
                  onClick={() => setGalleryFilter("channel")}
                  className={`px-3 py-1 rounded-lg text-[10px] font-medium transition-all cursor-pointer ${
                    galleryFilter === "channel"
                      ? "bg-primary text-background"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {l.filterChannels}
                </button>
              </div>
            </div>

            {loadingBlueprints && blueprints.length === 0 ? (
              <div className="flex items-center justify-center h-48">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : blueprintsError && blueprints.length === 0 ? (
              <div className="text-center py-10 text-destructive text-sm bg-card border border-input rounded-xl p-4">
                {blueprintsError}
              </div>
            ) : filteredBlueprints.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground text-xs bg-card border border-input rounded-xl">
                No templates found.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredBlueprints.map((item) => {
                  const isInstalled =
                    item.type === "agent"
                      ? agents.some((a) => a.blueprintId === item.id || a.id === item.id)
                      : channels.some((c) => c.blueprintId === item.id || c.id === item.id);

                  return (
                    <div
                      key={item.id}
                      className="bg-card border border-input rounded-xl p-4 flex flex-col gap-3 justify-between hover:border-primary/20 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {item.hasIcon ? (
                            <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-background/50 flex items-center justify-center border border-input">
                              <AuthenticatedImage
                                src={`/api/gallery/blueprints/${item.id}/icon`}
                                alt={item.metadata.title}
                                className="w-10 h-10 object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-lg flex-shrink-0 bg-primary/10 text-primary flex items-center justify-center font-bold text-sm border border-primary/20">
                              {item.metadata.title.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <h3 className="font-semibold text-foreground text-sm truncate">
                              {item.metadata.title}
                            </h3>
                            <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider mt-0.5">
                              {item.type === "agent" ? l.filterAgents : l.filterChannels}
                            </p>
                          </div>
                        </div>
                        {isInstalled && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary flex-shrink-0">
                            {l.installed}
                          </span>
                        )}
                      </div>

                      <p className="text-muted-foreground text-xs line-clamp-2 h-8 leading-normal">
                        {item.metadata.description}
                      </p>

                      <div className="flex flex-wrap gap-1">
                        {item.metadata.tags.slice(0, 3).map((t: string) => (
                          <span
                            key={t}
                            className="text-[9px] bg-background/50 border border-input px-1.5 py-0.5 rounded-md text-muted-foreground font-medium"
                          >
                            {t}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center justify-between border-t border-input pt-3 mt-1 gap-2">
                        <span className="text-[10px] text-muted-foreground">
                          {l.author}: <strong className="text-foreground">{item.metadata.author}</strong>
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setSelectedBlueprint(item)}
                            className="px-2.5 py-1 text-[10px] font-medium bg-card-hover hover:bg-card-hover/80 text-foreground border border-input rounded-lg transition-colors cursor-pointer"
                          >
                            {l.viewDetail}
                          </button>
                          <button
                            disabled={isInstalled || installingId === item.id}
                            onClick={() => handleInstall(item.id)}
                            className={`px-2.5 py-1 text-[10px] font-medium rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                              isInstalled
                                ? "bg-background text-muted-foreground border border-input cursor-not-allowed"
                                : "bg-primary text-background hover:bg-primary/90"
                            }`}
                          >
                            {installingId === item.id ? (
                              <div className="w-2.5 h-2.5 border border-background border-t-transparent rounded-full animate-spin" />
                            ) : (
                              isInstalled ? l.installed : l.install
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showRegister && (
          <RegisterModal
            agent={editingAgent}
            onClose={() => {
              setShowRegister(false);
              setEditingAgent(null);
            }}
            onSubmit={handleRegisterOrUpdate}
            onUploadAvatar={uploadAvatar}
            onDeleteAvatar={deleteAvatar}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedAgentForExecutions && (
          <ExecutionsModal
            agent={selectedAgentForExecutions}
            onClose={() => setSelectedAgentForExecutions(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedBlueprint && (
          <BlueprintDetailModal
            blueprint={selectedBlueprint}
            onClose={() => setSelectedBlueprint(null)}
            onInstall={handleInstall}
            isInstalled={
              selectedBlueprint.type === "agent"
                ? agents.some((a) => a.blueprintId === selectedBlueprint.id || a.id === selectedBlueprint.id)
                : channels.some((c) => c.blueprintId === selectedBlueprint.id || c.id === selectedBlueprint.id)
            }
            installing={installingId === selectedBlueprint.id}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ExecutionsModal({
  agent,
  onClose}: {
  agent: { id: string; name: string };
  onClose: () => void;
}) {
  const l = useLiterals(u);
  const [executions, setExecutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedExec, setSelectedExec] = useState<any | null>(null);
  const [execDetail, setExecDetail] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    const fetchExecs = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`/api/agents/${agent.id}/executions`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setExecutions(data.executions || []);
      } catch (err: any) {
        setError(err.message || l.loadExecError);
      } finally {
        setLoading(false);
      }
    };
    fetchExecs();
  }, [agent.id]);

  const loadDetail = async (execId: string) => {
    setLoadingDetail(true);
    try {
      const res = await apiFetch(`/api/agents/${agent.id}/executions/${execId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setExecDetail(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSelectExec = (exec: any) => {
    setSelectedExec(exec);
    setExecDetail(null);
    loadDetail(exec.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-4xl h-[80vh] bg-card border border-input rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-input flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{l.execTitle}: {agent.name}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{l.execSubtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card-hover transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 11-1.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Execution List */}
          <div className="w-1/3 border-r border-input overflow-y-auto p-3 flex flex-col gap-2 bg-background/50 flex-shrink-0">
            {loading && (
              <div className="flex items-center justify-center py-10">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!loading && error && (
              <p className="text-xs text-destructive p-3">{error}</p>
            )}
            {!loading && !error && executions.length === 0 && (
              <p className="text-xs text-muted-foreground p-3 text-center">{l.noExecutions}</p>
            )}
            {!loading && !error && executions.map((exec) => (
              <button
                key={exec.id}
                onClick={() => handleSelectExec(exec)}
                className={`text-left p-3 rounded-xl border text-xs flex flex-col gap-1 transition-all ${
                  selectedExec?.id === exec.id
                    ? "bg-primary/10 border-primary/30 text-foreground"
                    : "bg-card border-input text-muted-foreground hover:border-input/80 hover:text-foreground"
                }`}
              >
                <div className="flex justify-between items-center w-full">
                  <span className="font-mono text-xs text-muted-foreground">
                    {exec.id.slice(0, 8)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(exec.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <p className="font-medium text-foreground truncate w-full mt-0.5">{exec.prompt}</p>
                <div className="flex gap-2 text-xs text-muted-foreground mt-1">
                  <span>{(exec.durationMs / 1000).toFixed(1)}s</span>
                  {exec.errors && exec.errors.length > 0 && (
                    <span className="text-destructive font-medium">⚠️ {exec.errors.length} {l.errors}</span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Details Pane */}
          <div className="flex-1 overflow-y-auto p-5 bg-card flex flex-col gap-4">
            {!selectedExec && (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mb-2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
                <p className="text-xs">{l.selectExecHint}</p>
              </div>
            )}

            {selectedExec && (
              <>
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{l.prompt}</h3>
                  <p className="text-sm font-medium text-foreground bg-background p-3 rounded-lg border border-input mt-1.5 leading-relaxed">
                    {selectedExec.prompt}
                  </p>
                </div>

                {loadingDetail && (
                  <div className="flex items-center justify-center py-10">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}

                {!loadingDetail && execDetail && (
                  <>
                    {/* Metrics */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-background/50 border border-input rounded-xl p-3 flex flex-col">
                        <span className="text-xs text-muted-foreground">{l.execDuration}</span>
                        <span className="text-sm font-semibold text-foreground mt-0.5">
                          {(execDetail.durationMs / 1000).toFixed(2)}{l.seconds}
                        </span>
                      </div>
                      <div className="bg-background/50 border border-input rounded-xl p-3 flex flex-col">
                        <span className="text-xs text-muted-foreground">{l.execStatus}</span>
                        <span className={`text-sm font-semibold mt-0.5 ${execDetail.errors?.length > 0 ? "text-destructive" : "text-primary"}`}>
                          {execDetail.errors?.length > 0 ? `${execDetail.errors.length} {l.errors}` : "{l.success}"}
                        </span>
                      </div>
                    </div>

                    {/* Errors if any */}
                    {execDetail.errors && execDetail.errors.length > 0 && (
                      <div className="border border-error/20 bg-destructive/5 rounded-xl p-4 flex flex-col gap-2">
                        <h4 className="text-xs font-bold text-destructive flex items-center gap-1.5">
                          ⚠️ {l.errorsFound}
                        </h4>
                        <ul className="list-disc pl-4 text-xs text-destructive/90 space-y-1.5 font-mono">
                          {execDetail.errors.map((err: string, i: number) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Tool Calls */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{l.executedTools}</h4>
                      {(!execDetail.toolCalls || execDetail.toolCalls.length === 0) ? (
                        <p className="text-xs text-muted-foreground italic">{l.noTools}</p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {execDetail.toolCalls.map((tc: any, i: number) => (
                            <details key={i} className="border border-input rounded-xl bg-background/30 overflow-hidden text-xs">
                              <summary className="p-3 font-mono font-medium hover:bg-card-hover cursor-pointer flex justify-between items-center select-none text-foreground">
                                <div className="flex items-center gap-2">
                                  <span className={tc.isError ? "text-destructive" : "text-primary"}>●</span>
                                  <span>{tc.name}</span>
                                </div>
                                <span className="text-xs text-muted-foreground font-sans">
                                  {tc.endedAt ? `${((new Date(tc.endedAt).getTime() - new Date(tc.startedAt).getTime()) / 1000).toFixed(2)}s` : "{l.running}"}
                                </span>
                              </summary>
                              <div className="p-4 border-t border-input bg-background/50 flex flex-col gap-3 font-mono">
                                <div>
                                  <span className="text-xs text-muted-foreground uppercase block mb-1">{l.arguments}</span>
                                  <pre className="text-xs bg-background p-2.5 rounded-lg overflow-x-auto text-foreground max-h-40">
                                    {JSON.stringify(tc.args, null, 2)}
                                  </pre>
                                </div>
                                {tc.result && (
                                  <div>
                                    <span className="text-xs text-muted-foreground uppercase block mb-1">{l.result}</span>
                                    <pre className="text-xs bg-background p-2.5 rounded-lg overflow-x-auto text-foreground max-h-60 whitespace-pre-wrap">
                                      {typeof tc.result === "string" ? tc.result : JSON.stringify(tc.result, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </details>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Message Logs */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{l.sessionMessages}</h4>
                      <div className="flex flex-col gap-2 border border-input rounded-xl p-3 bg-background/20">
                        {execDetail.messages?.filter((m: any) => m.role !== "system").map((m: any, i: number) => (
                          <div key={i} className={`p-2.5 rounded-lg text-xs leading-relaxed ${m.role === "user" ? "bg-primary/5 ml-8 border border-primary/10" : "bg-card-hover mr-8 border border-input"}`}>
                            <div className="font-semibold text-foreground mb-1 uppercase tracking-wider text-xs text-muted-foreground">
                              {m.role}
                            </div>
                            <div className="whitespace-pre-wrap text-foreground font-mono text-[11px] leading-normal bg-background/30 p-1.5 rounded border border-input/30 mt-1">
                              {typeof m.content === "string" ? m.content : JSON.stringify(m.content)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
