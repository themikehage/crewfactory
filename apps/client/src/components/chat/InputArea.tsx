import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { ModelSelector } from "./ModelSelector";
import { ToolsSelector } from "./ToolsSelector";
import { SkillsSelector } from "./SkillsSelector";

interface Props {
  onSend: (message: string, option?: "steer" | "follow_up", tools?: string[]) => void;
  onAbort: () => void;
  streaming: boolean;
  sessionId: string | null;
}

export function InputArea({ onSend, onAbort, streaming, sessionId }: Props) {
  const [input, setInput] = useState("");
  const [activeTools, setActiveTools] = useState<string[]>(() => {
    if (!sessionId) return ["read", "write", "edit", "bash", "grep", "find", "ls"];
    try {
      const raw = localStorage.getItem(`pi-tools-${sessionId}`);
      return raw ? JSON.parse(raw) : ["read", "write", "edit", "bash", "grep", "find", "ls"];
    } catch {
      return ["read", "write", "edit", "bash", "grep", "find", "ls"];
    }
  });
  const [showOptions, setShowOptions] = useState(false);
  const [skills, setSkills] = useState<any[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);

  // Sync tools when sessionId changes
  useEffect(() => {
    if (!sessionId) return;
    try {
      const raw = localStorage.getItem(`pi-tools-${sessionId}`);
      if (raw) {
        setActiveTools(JSON.parse(raw));
      } else {
        const defaults = ["read", "write", "edit", "bash", "grep", "find", "ls"];
        setActiveTools(defaults);
        localStorage.setItem(`pi-tools-${sessionId}`, JSON.stringify(defaults));
      }
    } catch {
      setActiveTools(["read", "write", "edit", "bash", "grep", "find", "ls"]);
    }
  }, [sessionId]);

  // Fetch session skills when sessionId changes
  useEffect(() => {
    if (!sessionId) {
      setSkills([]);
      return;
    }
    const fetchSessionSkills = async () => {
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
    };
    fetchSessionSkills();
  }, [sessionId]);

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

  const handleSend = (option?: "steer" | "follow_up") => {
    if (!input.trim()) return;
    onSend(input, option, activeTools);
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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

  const handleToolsChange = (tools: string[]) => {
    setActiveTools(tools);
    if (sessionId) {
      localStorage.setItem(`pi-tools-${sessionId}`, JSON.stringify(tools));
    }
  };

  return (
    <div className="border-t border-surface p-3 sm:p-4 bg-bg">
      <div className="max-w-3xl mx-auto flex gap-2 sm:gap-3">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            streaming
              ? "Steer agent... (Enter to steer, Alt+Enter to enqueue follow-up)"
              : "Send a message... (Enter to send, Shift+Enter for new line)"
          }
          rows={1}
          className="flex-1 px-3 sm:px-4 py-2 sm:py-3 bg-surface border border-surface-hover rounded-lg
                     text-text-primary placeholder-text-secondary outline-none
                     resize-none focus:border-accent transition-colors
                     font-mono text-xs sm:text-sm"
        />
        {streaming ? (
          <div className="flex gap-1.5 sm:gap-2 flex-shrink-0 relative" ref={optionsRef}>
            <button
              onClick={onAbort}
              className="px-3 sm:px-4 py-2 sm:py-3 bg-error text-white rounded-lg hover:opacity-90
                         transition-opacity flex-shrink-0 font-semibold text-xs sm:text-sm cursor-pointer"
            >
              Stop
            </button>
            <div className="flex rounded-lg overflow-hidden">
              <button
                onClick={() => handleSend("steer")}
                disabled={!input.trim()}
                className="px-3 sm:px-4 py-2 sm:py-3 bg-accent text-bg hover:opacity-90
                           disabled:opacity-50 transition-opacity flex-shrink-0 font-semibold text-xs sm:text-sm cursor-pointer border-r border-bg/10"
              >
                Steer
              </button>
              <button
                onClick={() => setShowOptions(!showOptions)}
                disabled={!input.trim()}
                className="px-2 py-2 sm:py-3 bg-accent text-bg hover:opacity-90
                           disabled:opacity-50 transition-opacity flex items-center justify-center cursor-pointer"
              >
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            {showOptions && (
              <div className="absolute bottom-full right-0 mb-1 w-32 bg-surface border border-surface-hover rounded-lg shadow-lg z-50 overflow-hidden text-xs">
                <button
                  onClick={() => {
                    handleSend("follow_up");
                    setShowOptions(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-surface-hover text-text-primary transition-colors cursor-pointer"
                >
                  Follow-up
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => handleSend()}
            disabled={!input.trim()}
            className="px-3 sm:px-4 py-2 sm:py-3 bg-accent text-bg rounded-lg hover:opacity-90
                       disabled:opacity-50 transition-opacity flex-shrink-0 font-semibold text-xs sm:text-sm cursor-pointer"
          >
            Send
          </button>
        )}
      </div>
      <div className="max-w-3xl mx-auto mt-2 flex items-center justify-between relative px-1">
        <ModelSelector sessionId={sessionId} />
        <div className="flex items-center gap-3">
          {sessionId && (
            <SkillsSelector skills={skills} loading={skillsLoading} />
          )}
          <ToolsSelector
            activeTools={activeTools}
            onChange={handleToolsChange}
          />
        </div>
      </div>
    </div>
  );
}
