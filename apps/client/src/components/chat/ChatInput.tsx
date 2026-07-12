import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import { useLiterals, type ContextUsage } from "@/lib";
import { literals as u } from "./ChatInput.literals";
import { useToast } from "@/contexts/ToastContext";
import { InputCard } from "./InputCard";
import { InputToolbar } from "./InputToolbar";
import { AutocompletePopover } from "./AutocompletePopover";
import type { SkillInfo } from "./SkillsSelector";

const DEFAULT_TOOLS = [
  "read", "write", "edit", "bash", "grep", "find", "ls",
  "request_approval", "ask_question", "render_images", "render_chart", "refresh_ui",
  "spawn_subagent", "delegate_task"
];

export interface MentionTarget {
  id: string;
  name: string;
}

interface Attachment {
  id: string;
  file: File;
  type: "image" | "document";
  previewUrl?: string;
}

interface AttachmentScope {
  activeProjectName?: string | null;
  activeAgentId?: string | null;
  activeChannelId?: string | null;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        const base64 = reader.result.split(",")[1];
        resolve(base64);
      } else {
        reject(new Error("Failed to read file as base64"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isTextFile(file: File): boolean {
  if (file.type.startsWith("text/")) return true;
  const textExtensions = [
    ".js", ".ts", ".jsx", ".tsx", ".py", ".go", ".rs", ".java", ".c", ".cpp",
    ".h", ".hpp", ".cs", ".sh", ".bash", ".sql", ".yaml", ".yml", ".json",
    ".md", ".txt", ".ini", ".conf", ".cfg", ".xml", ".css", ".html", ".htm"
  ];
  const name = file.name.toLowerCase();
  return textExtensions.some((ext) => name.endsWith(ext));
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        resolve("");
      }
    };
    reader.onerror = () => resolve("");
    reader.readAsText(file);
  });
}

function getMarkdownLanguage(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  const map: Record<string, string> = {
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".json": "json",
    ".md": "markdown",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".html": "html",
    ".css": "css",
    ".sql": "sql",
    ".sh": "bash",
    ".bash": "bash",
    ".xml": "xml",
  };
  return map[ext] || "";
}

export async function processAttachments(
  files: File[],
  scope: AttachmentScope
): Promise<{
  extraText: string;
  images: Array<{ type: "image"; data: string; mimeType: string }>;
}> {
  const imagesToPass: Array<{ type: "image"; data: string; mimeType: string }> = [];
  let extraPromptText = "";

  const imageFiles = files.filter((f) => f.type.startsWith("image/"));
  const docFiles = files.filter((f) => !f.type.startsWith("image/"));

  for (const file of imageFiles) {
    try {
      const base64Data = await fileToBase64(file);
      imagesToPass.push({
        type: "image",
        data: base64Data,
        mimeType: file.type,
      });

      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      if (scope.activeProjectName) params.append("project", scope.activeProjectName);
      if (scope.activeAgentId) params.append("agentId", scope.activeAgentId);
      if (scope.activeChannelId) params.append("channelId", scope.activeChannelId);
      const url = `/api/workspace/assets/uploads${params.toString() ? `?${params.toString()}` : ""}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        extraPromptText += `\n[Attached File: ${data.path}] (I have uploaded this image to your workspace at: ${data.path})`;
      } else {
        throw new Error(`Failed to upload image ${file.name}: ${res.statusText}`);
      }
    } catch (err) {
      console.error("Error processing image:", err);
      throw err;
    }
  }

  for (const file of docFiles) {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      if (scope.activeProjectName) params.append("project", scope.activeProjectName);
      if (scope.activeAgentId) params.append("agentId", scope.activeAgentId);
      if (scope.activeChannelId) params.append("channelId", scope.activeChannelId);
      const url = `/api/workspace/assets/uploads${params.toString() ? `?${params.toString()}` : ""}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        let textContent = "";
        if (isTextFile(file) && file.size < 100 * 1024) {
          const content = await readFileAsText(file);
          const lang = getMarkdownLanguage(file.name);
          textContent = `\n[File Content of ${file.name}]:\n\`\`\`${lang}\n${content}\n\`\`\``;
        }
        extraPromptText += `\n[Attached File: ${data.path}] (I have uploaded this file to your workspace at: ${data.path})${textContent}`;
      } else {
        console.error("Failed to upload file", file.name);
        throw new Error(`Failed to upload file ${file.name}: ${res.statusText}`);
      }
    } catch (err) {
      console.error("Error uploading file:", err);
      throw err;
    }
  }

  return { extraText: extraPromptText, images: imagesToPass };
}

interface Props {
  onSend: (
    message: string,
    option?: "steer" | "follow_up",
    tools?: string[],
    images?: Array<{ type: "image"; data: string; mimeType: string }>
  ) => void;
  onAbort: () => void;
  streaming: boolean;
  sessionId: string | null;
  onToolsChange?: (tools: string[]) => void;
  runnerActive?: boolean;
  mentionTargets?: MentionTarget[];
  activeProjectName?: string | null;
  activeAgentId?: string | null;
  activeChannelId?: string | null;
  contextUsage?: ContextUsage | null;
  onCompact?: () => void;
  compacting?: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function ChatInput({
  onSend,
  onAbort,
  streaming,
  sessionId,
  onToolsChange,
  runnerActive = false,
  mentionTargets = [],
  activeProjectName,
  activeAgentId = null,
  activeChannelId = null,
  contextUsage = null,
  onCompact,
  compacting = false,
  textareaRef: externalTextareaRef,
}: Props) {
  const l = useLiterals(u);
  const { addToast } = useToast();
  const [input, setInput] = useState("");
  const [activeTools, setActiveTools] = useState<string[]>(DEFAULT_TOOLS);
  const [toolStatus, setToolStatus] = useState<Record<string, "available" | "missing_key">>({});
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [focused, setFocused] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const localTextareaRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalTextareaRef || localTextareaRef;

  // Autocomplete state
  const [autocompleteMode, setAutocompleteMode] = useState<"skill" | "mention" | null>(null);
  const [autocompleteSearch, setAutocompleteSearch] = useState("");
  const [autocompleteSelectedIndex, setAutocompleteSelectedIndex] = useState(0);

  const filteredMentions = mentionTargets.filter((t) =>
    t.name.toLowerCase().includes(autocompleteSearch.toLowerCase())
  );

  const filteredSkills = skills.filter((s) =>
    s.name.toLowerCase().includes(autocompleteSearch.toLowerCase())
  );

  const filteredItems =
    autocompleteMode === "mention"
      ? filteredMentions.map((t) => ({ id: t.id, name: t.name }))
      : filteredSkills.map((s) => ({ id: s.name, name: s.name, description: s.description }));

  const checkAutocomplete = (text: string, cursorPosition: number) => {
    const textBeforeCursor = text.slice(0, cursorPosition);

    if (mentionTargets.length > 0) {
      const mentionMatch = textBeforeCursor.match(/(?:^|\s)@(\S*)$/);
      if (mentionMatch) {
        setAutocompleteSearch(mentionMatch[1]);
        setAutocompleteMode("mention");
        setAutocompleteSelectedIndex(0);
        return;
      }
    }

    const lastWordMatch = textBeforeCursor.match(/(\/\S*)$/);
    if (lastWordMatch) {
      const triggerWord = lastWordMatch[1];
      setAutocompleteSearch(triggerWord.slice(1));
      setAutocompleteMode("skill");
      setAutocompleteSelectedIndex(0);
    } else {
      setAutocompleteMode(null);
    }
  };

  const insertMention = (targetName: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = input.slice(0, cursorPosition);
    const textAfterCursor = input.slice(cursorPosition);
    const replaced = textBeforeCursor.replace(/(?:^|(\s))@\S*$/, (_, space) => `${space ?? ""}@${targetName} `);
    const newVal = replaced + textAfterCursor;
    setInput(newVal);
    setAutocompleteMode(null);
    const newCursorPos = replaced.length;
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const insertSkillReference = (skillName: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = input.slice(0, cursorPosition);
    const textAfterCursor = input.slice(cursorPosition);
    const textBeforeCursorReplaced = textBeforeCursor.replace(/(\/\S*)$/, `/${skillName} `);
    const newVal = textBeforeCursorReplaced + textAfterCursor;
    setInput(newVal);
    setAutocompleteMode(null);
    const newCursorPos = textBeforeCursorReplaced.length;
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const newAttachments = files.map((file) => {
      const isImg = file.type.startsWith("image/");
      return {
        id: Math.random().toString(36).substring(2, 9),
        file,
        type: isImg ? ("image" as const) : ("document" as const),
        previewUrl: isImg ? URL.createObjectURL(file) : undefined,
      };
    });
    setAttachments((prev) => [...prev, ...newAttachments]);
    e.target.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
  };

  const handleSend = async (option?: "steer" | "follow_up") => {
    if ((!input.trim() && attachments.length === 0) || runnerActive) return;

    try {
      const files = attachments.map((a) => a.file);
      const result = await processAttachments(files, { activeProjectName, activeAgentId, activeChannelId });

      const finalMessage = input + result.extraText;
      onSend(finalMessage, option, activeTools, result.images.length > 0 ? result.images : undefined);

      attachments.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
      setAttachments([]);
      setInput("");
      setAutocompleteMode(null);
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : String(err));
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (autocompleteMode && filteredItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAutocompleteSelectedIndex((prev) => (prev + 1) % filteredItems.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setAutocompleteSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const selectedItem = filteredItems[autocompleteSelectedIndex];
        if (autocompleteMode === "mention") {
          insertMention(selectedItem.name);
        } else {
          insertSkillReference(selectedItem.name);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setAutocompleteMode(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (streaming) {
        handleSend("steer");
      } else {
        handleSend();
      }
    } else if (e.key === "Enter" && e.altKey) {
      e.preventDefault();
      if (streaming) {
        handleSend("follow_up");
      }
    }
  };

  const handleToolsChange = async (tools: string[]) => {
    setActiveTools(tools);
    onToolsChange?.(tools);
    if (!sessionId) return;
    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/sessions/${sessionId}/tools`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tools }),
      });
    } catch {}
  };

  // Focus tracking
  useEffect(() => {
    const handleFocus = () => setFocused(true);
    const handleBlur = () => setFocused(false);

    const el = textareaRef.current;
    if (el) {
      el.addEventListener("focus", handleFocus);
      el.addEventListener("blur", handleBlur);
    }
    return () => {
      if (el) {
        el.removeEventListener("focus", handleFocus);
        el.removeEventListener("blur", handleBlur);
      }
    };
  }, []);

  // Fetch tools
  useEffect(() => {
    if (!sessionId) {
      setActiveTools(DEFAULT_TOOLS);
      return;
    }
    const fetchTools = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/sessions/${sessionId}/tools`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setActiveTools(data.tools ?? DEFAULT_TOOLS);
          setToolStatus(data.toolStatus ?? {});
        }
      } catch {
        setActiveTools(DEFAULT_TOOLS);
      }
    };
    fetchTools();
  }, [sessionId]);

  // Fetch skills
  const fetchSessionSkills = useCallback(async () => {
    if (!sessionId) {
      setSkills([]);
      return;
    }
    setSkillsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/sessions/${sessionId}/skills`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSkills(data.skills ?? []);
      }
    } catch (err) {
      console.error("Error loading session skills:", err);
    } finally {
      setSkillsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSessionSkills();
  }, [fetchSessionSkills]);

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.type === "skill" || !customEvent.detail?.type) {
        fetchSessionSkills();
      }
    };
    window.addEventListener("entity-updated", handleUpdate);
    return () => window.removeEventListener("entity-updated", handleUpdate);
  }, [fetchSessionSkills]);

  const placeholderText = runnerActive
    ? l.placeholderRunnerActive
    : streaming
    ? l.placeholderSteer
    : l.placeholderSend;

  return (
    <div className="relative p-3 sm:p-4">
      <div className="relative max-w-3xl mx-auto">
        {/* AutocompleteDropdown */}
        <AutocompletePopover
          mode={autocompleteMode}
          items={filteredItems}
          selectedIndex={autocompleteSelectedIndex}
          onSelect={(item) => {
            if (autocompleteMode === "mention") {
              insertMention(item.name);
            } else {
              insertSkillReference(item.name);
            }
          }}
          onClose={() => setAutocompleteMode(null)}
          textareaRef={textareaRef}
        />

        {/* Floating Input Card */}
        <InputCard
          streaming={streaming}
          disabled={runnerActive}
          focused={focused}
          attachments={attachments}
          onRemoveAttachment={removeAttachment}
          input={input}
          onInputChange={(val) => {
            setInput(val);
            const textarea = textareaRef.current;
            if (textarea) {
              checkAutocomplete(val, textarea.selectionStart);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          textareaRef={textareaRef}
          contextUsage={contextUsage}
          toolbar={
            <InputToolbar
              sessionId={sessionId}
              streaming={streaming}
              disabled={runnerActive}
              activeTools={activeTools}
              onToolsChange={handleToolsChange}
              skills={skills}
              skillsLoading={skillsLoading}
              onSelectSkill={(skillName) => {
                insertSkillReference(skillName);
              }}
              onFileClick={() => fileInputRef.current?.click()}
              toolStatus={toolStatus}
              onSend={() => handleSend()}
              onStop={onAbort}
              contextUsage={contextUsage}
              onCompact={onCompact}
              compacting={compacting}
            />
          }
        />
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          multiple
          className="hidden"
        />
      </div>
    </div>
  );
}
