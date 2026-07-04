import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import { ModelSelector } from "./ModelSelector";
import { ToolsSelector } from "./ToolsSelector";
import { SkillsSelector, type SkillInfo } from "./SkillsSelector";

const DEFAULT_TOOLS = ["read", "write", "edit", "bash", "grep", "find", "ls"];

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

function fileToBase64(file: File): Promise<string> {
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

interface Props {
  onSend: (message: string, option?: "steer" | "follow_up", tools?: string[], images?: Array<{ type: "image"; data: string; mimeType: string }>) => void;
  onAbort: () => void;
  streaming: boolean;
  sessionId: string | null;
  onToolsChange?: (tools: string[]) => void;
  runnerActive?: boolean;
  mentionTargets?: MentionTarget[];
  activeRepoName?: string | null;
  activeAgentId?: string | null;
  activeChannelId?: string | null;
}

export function InputArea({
  onSend,
  onAbort,
  streaming,
  sessionId,
  onToolsChange,
  runnerActive = false,
  mentionTargets = [],
  activeRepoName,
  activeAgentId = null,
  activeChannelId = null,
}: Props) {
  const [input, setInput] = useState("");
  const [activeTools, setActiveTools] = useState<string[]>(DEFAULT_TOOLS);
  const [showOptions, setShowOptions] = useState(false);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const newAttachments = files.map((file) => {
      const isImg = file.type.startsWith("image/");
      return {
        id: Math.random().toString(36).substring(2, 9),
        file,
        type: isImg ? "image" as const : "document" as const,
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

  // Skill autocomplete (/ prefix)
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteSearch, setAutocompleteSearch] = useState("");
  const [selectedAutocompleteIndex, setSelectedAutocompleteIndex] = useState(0);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  // @mention autocomplete
  const [showMentionAC, setShowMentionAC] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const mentionACRef = useRef<HTMLDivElement>(null);

  const filteredMentions = mentionTargets.filter((t) =>
    t.name.toLowerCase().includes(mentionSearch.toLowerCase())
  );

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
        }
      } catch {
        setActiveTools(DEFAULT_TOOLS);
      }
    };
    fetchTools();
  }, [sessionId]);

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

  // Fetch session skills when sessionId changes
  useEffect(() => {
    fetchSessionSkills();
  }, [fetchSessionSkills]);

  // Listen for entity-updated events to refresh skills
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

  // Click outside to close options
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setShowOptions(false);
      }
    };
    if (showOptions) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [showOptions]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  const filteredSkillsForAutocomplete = skills.filter((s) =>
    s.name.toLowerCase().includes(autocompleteSearch.toLowerCase())
  );

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        autocompleteRef.current &&
        !autocompleteRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setShowAutocomplete(false);
      }
    };
    if (showAutocomplete) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [showAutocomplete]);

  const checkAutocomplete = (text: string, cursorPosition: number) => {
    const textBeforeCursor = text.slice(0, cursorPosition);

    // @mention detection (only when mentionTargets provided)
    if (mentionTargets.length > 0) {
      const mentionMatch = textBeforeCursor.match(/(?:^|\s)@(\S*)$/);
      if (mentionMatch) {
        setMentionSearch(mentionMatch[1]);
        setShowMentionAC(true);
        setSelectedMentionIndex(0);
        setShowAutocomplete(false);
        return;
      } else {
        setShowMentionAC(false);
      }
    }

    // Skill autocomplete (/ prefix)
    const lastWordMatch = textBeforeCursor.match(/(\/\S*)$/);
    if (lastWordMatch) {
      const triggerWord = lastWordMatch[1];
      setAutocompleteSearch(triggerWord.slice(1));
      setShowAutocomplete(true);
      setSelectedAutocompleteIndex(0);
    } else {
      setShowAutocomplete(false);
    }
  };

  const insertMention = (target: MentionTarget) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = input.slice(0, cursorPosition);
    const textAfterCursor = input.slice(cursorPosition);
    const replaced = textBeforeCursor.replace(/(?:^|(\s))@\S*$/, (_, space) => `${space ?? ""}@${target.name} `);
    const newVal = replaced + textAfterCursor;
    setInput(newVal);
    setShowMentionAC(false);
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
    setShowAutocomplete(false);

    const newCursorPos = textBeforeCursorReplaced.length;
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleSend = async (option?: "steer" | "follow_up") => {
    if ((!input.trim() && attachments.length === 0) || runnerActive) return;

    const imagesToPass: Array<{ type: "image"; data: string; mimeType: string }> = [];
    let extraPromptText = "";

    const imageAttachments = attachments.filter((a) => a.type === "image");
    const docAttachments = attachments.filter((a) => a.type === "document");

    for (const img of imageAttachments) {
      try {
        const base64Data = await fileToBase64(img.file);
        imagesToPass.push({
          type: "image",
          data: base64Data,
          mimeType: img.file.type,
        });

        // Upload image to workspace for persistence in chat bubble
        const formData = new FormData();
        formData.append("file", img.file);
        
        const token = localStorage.getItem("token");
        const params = new URLSearchParams();
        if (activeRepoName) params.append("repo", activeRepoName);
        if (activeAgentId) params.append("agentId", activeAgentId);
        if (activeChannelId) params.append("channelId", activeChannelId);
        const url = `/api/workspace/assets/uploads${params.toString() ? `?${params.toString()}` : ""}`;
        
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          extraPromptText += `\n[Attached File: ${data.path}] (I have uploaded this image to your workspace at: ${data.path})`;
        }
      } catch (err) {
        console.error("Error converting/uploading image:", err);
      }
    }

    for (const doc of docAttachments) {
      try {
        const formData = new FormData();
        formData.append("file", doc.file);
        
        const token = localStorage.getItem("token");
        const params = new URLSearchParams();
        if (activeRepoName) params.append("repo", activeRepoName);
        if (activeAgentId) params.append("agentId", activeAgentId);
        if (activeChannelId) params.append("channelId", activeChannelId);
        const url = `/api/workspace/assets/uploads${params.toString() ? `?${params.toString()}` : ""}`;
        
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          extraPromptText += `\n[Attached File: ${data.path}] (I have uploaded this file to your workspace at: ${data.path})`;
        } else {
          console.error("Failed to upload document", doc.file.name);
        }
      } catch (err) {
        console.error("Error uploading document:", err);
      }
    }

    const finalMessage = input + extraPromptText;
    onSend(finalMessage, option, activeTools, imagesToPass.length > 0 ? imagesToPass : undefined);
    
    attachments.forEach((a) => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    });
    setAttachments([]);
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // @mention autocomplete keyboard nav
    if (showMentionAC && filteredMentions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedMentionIndex((prev) => (prev + 1) % filteredMentions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedMentionIndex((prev) => (prev - 1 + filteredMentions.length) % filteredMentions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filteredMentions[selectedMentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentionAC(false);
        return;
      }
    }

    if (showAutocomplete && filteredSkillsForAutocomplete.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedAutocompleteIndex((prev) => (prev + 1) % filteredSkillsForAutocomplete.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedAutocompleteIndex((prev) => (prev - 1 + filteredSkillsForAutocomplete.length) % filteredSkillsForAutocomplete.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        insertSkillReference(filteredSkillsForAutocomplete[selectedAutocompleteIndex].name);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowAutocomplete(false);
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
    } catch {
      /* silent — tools still applied client-side for current prompt */
    }
  };

  return (
    <div className="border-t border-border p-3 sm:p-4 bg-background">
      <div className="max-w-3xl mx-auto flex flex-col gap-2">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-1.5 p-1.5 bg-card/30 border border-input rounded-lg max-h-32 overflow-y-auto">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="relative group flex items-center gap-2 bg-card border border-input rounded-md p-1.5 pr-2.5 max-w-[200px] text-[11px] shrink-0"
              >
                {att.type === "image" && att.previewUrl ? (
                  <img
                    src={att.previewUrl}
                    alt="preview"
                    className="w-8 h-8 object-cover rounded border border-input"
                  />
                ) : (
                  <div className="w-8 h-8 rounded bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-[9px] font-bold">
                    DOC
                  </div>
                )}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <span className="text-foreground truncate font-sans font-medium">
                    {att.file.name}
                  </span>
                  <span className="text-muted-foreground/60 text-[9px]">
                    {(att.file.size / 1024).toFixed(1)} KB
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-white hover:bg-destructive/95 flex items-center justify-center cursor-pointer shadow-sm text-[9px] font-bold"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 sm:gap-3 relative items-end">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={runnerActive}
            className="p-2 sm:p-3 bg-card border border-input rounded-lg hover:border-primary hover:text-primary transition-colors flex items-center justify-center flex-shrink-0 cursor-pointer text-muted-foreground h-[42px] sm:h-[46px] w-[42px] sm:w-[46px]"
            title="Attach files"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            className="hidden"
          />
          {/* @mention autocomplete dropdown */}
          {showMentionAC && filteredMentions.length > 0 && (
            <div
              ref={mentionACRef}
              className="absolute bottom-full left-0 mb-1.5 w-56 bg-card border border-primary/30 rounded-lg shadow-xl z-50 overflow-hidden text-xs max-h-48 overflow-y-auto"
            >
              <div className="px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground border-b border-input tracking-wide uppercase">
                Mention
              </div>
              {filteredMentions.map((t, idx) => (
                <button
                  key={t.id}
                  onMouseDown={(e) => { e.preventDefault(); insertMention(t); }}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                    idx === selectedMentionIndex
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-card-hover/50 hover:text-foreground"
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-[9px] shrink-0">
                    {t.name[0]?.toUpperCase()}
                  </span>
                  <span className="font-medium">@{t.name}</span>
                </button>
              ))}
            </div>
          )}
          {showAutocomplete && filteredSkillsForAutocomplete.length > 0 && (
            <div
              ref={autocompleteRef}
              className="absolute bottom-full left-0 mb-1.5 w-64 bg-card border border-input rounded-lg shadow-xl z-50 overflow-hidden text-xs max-h-48 overflow-y-auto"
            >
              {filteredSkillsForAutocomplete.map((s, idx) => (
                <button
                  key={s.name}
                  onClick={() => insertSkillReference(s.name)}
                  className={`w-full text-left px-3 py-2 flex flex-col gap-0.5 cursor-pointer transition-colors ${
                    idx === selectedAutocompleteIndex ? "bg-card-hover text-foreground" : "text-muted-foreground hover:bg-card-hover/50 hover:text-foreground"
                  }`}
                >
                  <span className="font-mono font-bold text-foreground">{`/${s.name}`}</span>
                  <span className="text-[10px] text-muted-foreground truncate max-w-full">{s.description}</span>
                </button>
              ))}
            </div>
          )}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            const val = e.target.value;
            setInput(val);
            checkAutocomplete(val, e.target.selectionStart);
          }}
          onKeyUp={(e) => {
            const target = e.currentTarget;
            checkAutocomplete(target.value, target.selectionStart);
          }}
          onClick={(e) => {
            const target = e.currentTarget;
            checkAutocomplete(target.value, target.selectionStart);
          }}
          onKeyDown={handleKeyDown}
          disabled={runnerActive}
          placeholder={
            runnerActive
              ? "Task runner is active. Pause execution to send messages manually."
              : streaming
              ? "Steer agent... (Enter to steer, Alt+Enter to enqueue follow-up)"
              : "Send a message... (Enter to send, Shift+Enter for new line)"
          }
          rows={1}
          className="flex-1 px-3 sm:px-4 py-2 sm:py-3 bg-card border border-input rounded-lg
                     text-foreground placeholder-text-secondary outline-none
                     resize-none focus:border-primary transition-colors
                     font-mono text-xs sm:text-sm"
        />
        {streaming ? (
          <div className="flex gap-1.5 sm:gap-2 flex-shrink-0 relative" ref={optionsRef}>
            <button
              onClick={onAbort}
              className="px-3 sm:px-4 py-2 sm:py-3 bg-destructive text-white rounded-lg hover:opacity-90
                         transition-opacity flex-shrink-0 font-semibold text-xs sm:text-sm cursor-pointer"
            >
              Stop
            </button>
            <div className="flex rounded-lg overflow-hidden">
              <button
                onClick={() => handleSend("steer")}
                disabled={!input.trim() || runnerActive}
                className="px-3 sm:px-4 py-2 sm:py-3 bg-primary text-background hover:opacity-90
                           disabled:opacity-50 transition-opacity flex-shrink-0 font-semibold text-xs sm:text-sm cursor-pointer border-r border-bg/10"
              >
                Steer
              </button>
              <button
                onClick={() => setShowOptions(!showOptions)}
                disabled={!input.trim() || runnerActive}
                className="px-2 py-2 sm:py-3 bg-primary text-background hover:opacity-90
                           disabled:opacity-50 transition-opacity flex items-center justify-center cursor-pointer"
              >
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            {showOptions && (
              <div className="absolute bottom-full right-0 mb-1 w-32 bg-card border border-input rounded-lg shadow-lg z-50 overflow-hidden text-xs">
                <button
                  onClick={() => {
                    handleSend("follow_up");
                    setShowOptions(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-card-hover text-foreground transition-colors cursor-pointer"
                >
                  Follow-up
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || runnerActive}
            className="px-3 sm:px-4 py-2 sm:py-3 bg-primary text-background rounded-lg hover:opacity-90
                       disabled:opacity-50 transition-opacity flex-shrink-0 font-semibold text-xs sm:text-sm cursor-pointer"
          >
            Send
          </button>
        )}
      </div>
    </div>
      <div className="max-w-3xl mx-auto mt-2 flex items-center justify-between relative px-1">
        <ModelSelector sessionId={mentionTargets.length > 0 ? null : sessionId} disabled={runnerActive} />
        <div className="flex items-center gap-3">
          {sessionId && (
            <SkillsSelector
              skills={skills}
              loading={skillsLoading}
              disabled={runnerActive}
              onSelectSkill={(skillName) => {
                const textarea = textareaRef.current;
                if (!textarea) return;

                const cursorPosition = textarea.selectionStart;
                const textBeforeCursor = input.slice(0, cursorPosition);
                const textAfterCursor = input.slice(cursorPosition);

                const ref = `/${skillName} `;
                const needsLeadingSpace = cursorPosition > 0 && textBeforeCursor[cursorPosition - 1] !== " ";
                const insertText = needsLeadingSpace ? " " + ref : ref;

                const newVal = textBeforeCursor + insertText + textAfterCursor;
                setInput(newVal);

                const newCursorPos = cursorPosition + insertText.length;
                setTimeout(() => {
                  textarea.focus();
                  textarea.setSelectionRange(newCursorPos, newCursorPos);
                }, 0);
              }}
            />
          )}
          <ToolsSelector
            activeTools={activeTools}
            onChange={handleToolsChange}
            disabled={runnerActive}
          />
        </div>
      </div>
    </div>
  );
}
