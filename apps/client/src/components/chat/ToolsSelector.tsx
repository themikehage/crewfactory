import { useState } from "react";
import { Modal } from "@/components/ui/Modal";

export const ALL_TOOLS = [
  { id: "read", name: "Read File", desc: "Read content of files on disk" },
  { id: "write", name: "Write File", desc: "Create new files on disk" },
  { id: "edit", name: "Edit File", desc: "Modify existing files on disk" },
  { id: "bash", name: "Bash Command", desc: "Execute shell commands on host" },
  { id: "grep", name: "Grep Search", desc: "Find pattern matches within files" },
  { id: "find", name: "Find Files", desc: "Locate files in directory structure" },
  { id: "ls", name: "Directory List", desc: "List directory contents" },
];

interface Props {
  activeTools: string[];
  onChange: (tools: string[]) => void;
  disabled?: boolean;
}

export function ToolsSelector({ activeTools, onChange, disabled = false }: Props) {
  const [open, setOpen] = useState(false);

  const handleToggleTool = (toolId: string) => {
    let next: string[];
    if (activeTools.includes(toolId)) {
      next = activeTools.filter((t) => t !== toolId);
    } else {
      next = [...activeTools, toolId];
    }
    onChange(next);
  };

  const applyPreset = (preset: "full" | "readonly") => {
    if (preset === "full") {
      onChange(ALL_TOOLS.map((t) => t.id));
    } else {
      onChange(["read", "grep", "find", "ls"]);
    }
  };

  const isReadOnly =
    activeTools.includes("read") &&
    activeTools.includes("grep") &&
    activeTools.includes("find") &&
    activeTools.includes("ls") &&
    !activeTools.includes("write") &&
    !activeTools.includes("edit") &&
    !activeTools.includes("bash");

  const isFullAccess = ALL_TOOLS.every((t) => activeTools.includes(t.id));

  let statusLabel = `${activeTools.length}/${ALL_TOOLS.length} tools`;
  if (isFullAccess) statusLabel = "Full Access";
  else if (isReadOnly) statusLabel = "Read-Only";
  else if (activeTools.length === 0) statusLabel = "Restricted (0 tools)";

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5 cursor-pointer ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M2.166 4.9L10 1.154l7.834 3.746A2 2 0 0119 6.707V13a6 6 0 01-9 5.2v-2.067a4 4 0 003-3.833V7.907l-3-1.434v8.86a2.001 2.001 0 01-2 0v-8.86L5 7.907v4.993a4 4 0 003 3.833V18.2A6 6 0 011 13V6.707a2 2 0 011.166-1.808z" clipRule="evenodd" />
        </svg>
        <span>Sandbox: {statusLabel}</span>
        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Allowed Tools"
      >
        <div className="p-2 bg-card">
          <div className="px-1.5 pb-2 flex gap-2 border-b border-input mb-2">
            <button
              onClick={() => applyPreset("full")}
              className={`px-2 py-0.5 rounded transition-colors cursor-pointer text-xs ${
                isFullAccess ? "bg-primary/20 text-primary font-semibold" : "text-muted-foreground hover:text-foreground bg-card-hover"
              }`}
            >
              Full
            </button>
            <button
              onClick={() => applyPreset("readonly")}
              className={`px-2 py-0.5 rounded transition-colors cursor-pointer text-xs ${
                isReadOnly ? "bg-primary/20 text-primary font-semibold" : "text-muted-foreground hover:text-foreground bg-card-hover"
              }`}
            >
              Read-Only
            </button>
          </div>
          <div className="space-y-2">
            {ALL_TOOLS.map((t) => {
              const checked = activeTools.includes(t.id);
              return (
                <label
                  key={t.id}
                  className="flex items-start gap-2.5 p-1.5 rounded-md hover:bg-card-hover/50 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleToggleTool(t.id)}
                    className="mt-0.5 accent-accent"
                  />
                  <div>
                    <div className="font-semibold text-foreground font-mono text-xs">{t.id}</div>
                    <div className="text-muted-foreground/70 text-[10px] leading-snug">{t.desc}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}
