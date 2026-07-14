import { apiFetch } from "@/lib/api";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { AgentAvatar } from "@/components/shared/AgentAvatar";
import { DEFAULT_AVATARS, DEFAULT_AVATAR_PREFIX, isDefaultAvatar } from "@/lib/defaultAvatars";
import type { AgentDefinition, AgentInfo } from "shared";
import { useLiterals } from "@/lib";
import { literals as u } from "./RegisterModal.literals";
import { Button } from "@/components/ui/Button";

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

interface RegisterModalProps {
  agent?: AgentInfo | null;
  onClose: () => void;
  onSubmit: (def: AgentDefinition) => Promise<unknown>;
  onUploadAvatar?: (id: string, file: File) => Promise<string>;
  onDeleteAvatar?: (id: string) => Promise<void>;
}

export function RegisterModal({
  agent,
  onClose,
  onSubmit,
  onUploadAvatar,
  onDeleteAvatar,
}: RegisterModalProps) {
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
              {agent ? l.editAgent : l.registerAgentTitle}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {agent ? l.editAgentDesc : l.registerAgentDesc}
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
                    port: e.target.value ? parseInt(e.target.value) : undefined}))}
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
              {submitting ? l.saving : agent ? l.saveChanges : l.registerAgentTitle}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
