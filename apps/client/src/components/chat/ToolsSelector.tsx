import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useLiterals } from "@/lib";
import { literals as u } from "./ToolsSelector.literals";

export interface ToolDefinition {
  id: string;
  name: string;
  desc: string;
  gateKey?: string;
}

export const ALL_TOOLS: ToolDefinition[] = [
  { id: "read", name: "Read File", desc: "Read content of files on disk" },
  { id: "write", name: "Write File", desc: "Create new files on disk" },
  { id: "edit", name: "Edit File", desc: "Modify existing files on disk" },
  { id: "bash", name: "Bash Command", desc: "Execute shell commands on host" },
  { id: "grep", name: "Grep Search", desc: "Find pattern matches within files" },
  { id: "find", name: "Find Files", desc: "Locate files in directory structure" },
  { id: "ls", name: "Directory List", desc: "List directory contents" },
  { id: "request_approval", name: "Request Approval", desc: "Require explicit authorization for critical actions" },
  { id: "ask_question", name: "Ask Question", desc: "Ask single/multi-choice or custom text questions" },
  { id: "render_images", name: "Render Images", desc: "Display a responsive grid of generated drawings/images" },
  { id: "render_chart", name: "Render Charts", desc: "Visualize metrics via line/bar/pie/area charts" },
  { id: "share_file", name: "Share File", desc: "Share downloadable files with the user (PDF, DOC, XLSX, ZIP, etc.)" },
  { id: "refresh_ui", name: "Refresh UI", desc: "Notify the interface to reload sidebars and lists after changes" },
  { id: "spawn_subagent", name: "Spawn Subagent", desc: "Delegate a task to a fresh subagent with isolated context" },
  { id: "delegate_task", name: "Delegate Task", desc: "Delegate task to another agent, project, channel, or session" },
  { id: "exa_search", name: "Exa Search", desc: "Search the web using Exa AI (semantic search engine)", gateKey: "EXA_API_KEY" },
  { id: "web_fetch", name: "Web Fetch", desc: "Fetch and extract content from any URL as clean Markdown" },
];

interface Props {
  activeTools: string[];
  onChange: (tools: string[], executionMode?: "readonly" | "standard" | "autonomous") => void;
  disabled?: boolean;
  toolStatus?: Record<string, "available" | "missing_key">;
  executionMode?: "readonly" | "standard" | "autonomous";
}

export function ToolsSelector({ activeTools, onChange, disabled = false, toolStatus, executionMode }: Props) {
  const l = useLiterals(u);
  const [open, setOpen] = useState(false);

  const handleToggleTool = (toolId: string) => {
    let next: string[];
    if (activeTools.includes(toolId)) {
      next = activeTools.filter((t) => t !== toolId);
    } else {
      next = [...activeTools, toolId];
    }
    onChange(next, executionMode);
  };

  const applyPreset = (preset: "autonomous" | "standard" | "readonly") => {
    if (preset === "autonomous") {
      const available = ALL_TOOLS.filter((t) => !(t.gateKey && toolStatus?.[t.id] === "missing_key")).map((t) => t.id);
      onChange(available, "autonomous");
    } else if (preset === "standard") {
      const standardTools = ["read", "write", "edit", "bash", "grep", "find", "ls", "request_approval", "ask_question"];
      onChange(standardTools, "standard");
    } else {
      onChange(["read", "grep", "find", "ls"], "readonly");
    }
  };

  const isReadOnly = executionMode === "readonly" || (
    activeTools.includes("read") &&
    activeTools.includes("grep") &&
    activeTools.includes("find") &&
    activeTools.includes("ls") &&
    !activeTools.includes("write") &&
    !activeTools.includes("edit") &&
    !activeTools.includes("bash")
  );

  const isAutonomous = executionMode === "autonomous";
  const isStandard = executionMode === "standard" || (!isReadOnly && !isAutonomous);

  let statusLabel = `${activeTools.length}/${ALL_TOOLS.length} tools`;
  if (isAutonomous) statusLabel = l.fullAccess; // displays Autonomous
  else if (isStandard) statusLabel = l.standard || "Standard";
  else if (isReadOnly) statusLabel = l.readOnly;
  else if (activeTools.length === 0) statusLabel = l.restricted;

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
              onClick={() => applyPreset("autonomous")}
              className={`px-2 py-0.5 rounded transition-colors cursor-pointer text-xs ${
                isAutonomous ? "bg-primary/20 text-primary font-semibold" : "text-muted-foreground hover:text-foreground bg-card-hover"
              }`}
            >
              {l.fullAccess}
            </button>
            <button
              onClick={() => applyPreset("standard")}
              className={`px-2 py-0.5 rounded transition-colors cursor-pointer text-xs ${
                isStandard ? "bg-primary/20 text-primary font-semibold" : "text-muted-foreground hover:text-foreground bg-card-hover"
              }`}
            >
              {l.standard || "Standard"}
            </button>
            <button
              onClick={() => applyPreset("readonly")}
              className={`px-2 py-0.5 rounded transition-colors cursor-pointer text-xs ${
                isReadOnly ? "bg-primary/20 text-primary font-semibold" : "text-muted-foreground hover:text-foreground bg-card-hover"
              }`}
            >
              {l.readOnly}
            </button>
          </div>
          <div className="space-y-2">
            {ALL_TOOLS.map((t) => {
              const isGated = !!(t.gateKey && toolStatus?.[t.id] === "missing_key");
              const checked = activeTools.includes(t.id);
              const isToolDisabled = disabled || isGated;

              return (
                <label
                  key={t.id}
                  className={`flex items-start gap-2.5 p-1.5 rounded-md transition-colors ${
                    isToolDisabled
                      ? "opacity-40 cursor-not-allowed"
                      : "hover:bg-card-hover/50 cursor-pointer"
                  }`}
                  title={isGated ? `Requires ${t.gateKey} in Settings > Env Vars` : undefined}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isToolDisabled}
                    onChange={() => !isToolDisabled && handleToggleTool(t.id)}
                    className="mt-0.5 accent-accent"
                  />
                  <div>
                    <div className="font-semibold text-foreground font-mono text-xs flex items-center gap-1.5">
                      {t.id}
                      {isGated && (
                        <span className="px-1 py-0.2 bg-warning/10 text-warning text-[8px] font-semibold rounded">
                          Gated
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground text-xs leading-snug">
                      {t.desc}
                      {isGated && (
                        <span className="block text-warning text-[8px] mt-0.5 font-medium">
                          Requires {t.gateKey}
                        </span>
                      )}
                    </div>
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
