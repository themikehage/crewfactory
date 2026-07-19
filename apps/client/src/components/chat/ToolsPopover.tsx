import { useEffect, useRef, useState } from "react";
import { ALL_TOOLS } from "./ToolsSelector";
import { PortalPopover } from "./PortalPopover";
import { useLiterals } from "@/lib";
import { literals as u } from "./ChatInput.literals";

interface ToolsPopoverProps {
  activeTools: string[];
  onChange: (tools: string[], executionMode?: "readonly" | "standard" | "autonomous") => void;
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  toolStatus?: Record<string, "available" | "missing_key">;
  disabled?: boolean;
  executionMode?: "readonly" | "standard" | "autonomous";
}

export function ToolsPopover({
  activeTools,
  onChange,
  open,
  onClose,
  triggerRef,
  toolStatus = {},
  disabled = false,
  executionMode,
}: ToolsPopoverProps) {
  const l = useLiterals(u);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setSelectedIndex(0);
    }
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % ALL_TOOLS.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + ALL_TOOLS.length) % ALL_TOOLS.length);
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        const t = ALL_TOOLS[selectedIndex];
        const isGated = !!(t.gateKey && toolStatus?.[t.id] === "missing_key");
        if (!disabled && !isGated) {
          handleToggleTool(t.id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, selectedIndex, activeTools, toolStatus, disabled, onClose]);

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
      const available = ALL_TOOLS.filter(
        (t) => !(t.gateKey && toolStatus?.[t.id] === "missing_key")
      ).map((t) => t.id);
      onChange(available, "autonomous");
    } else if (preset === "standard") {
      onChange(["read", "write", "edit", "bash", "grep", "find", "ls", "request_approval", "ask_question", "render_html"], "standard");
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

  return (
    <PortalPopover triggerRef={triggerRef} open={open} onClose={onClose}>
      <div ref={popoverRef} className="w-80 max-h-96 overflow-hidden bg-[#171717] border border-border rounded-xl shadow-xl flex flex-col">
        <div className="flex gap-1.5 p-2 border-b border-border bg-[#171717] shrink-0">
          <button
            type="button"
            onClick={() => applyPreset("autonomous")}
            disabled={disabled}
            className={`flex-1 text-center py-1 rounded-lg text-[10px] font-semibold cursor-pointer transition-colors ${
              isAutonomous
                ? "bg-primary/20 text-primary border border-primary/20"
                : "bg-[#121212] border border-border/30 hover:bg-[#202020] text-muted-foreground"
            }`}
          >
            {l.fullAccess}
          </button>
          <button
            type="button"
            onClick={() => applyPreset("standard")}
            disabled={disabled}
            className={`flex-1 text-center py-1 rounded-lg text-[10px] font-semibold cursor-pointer transition-colors ${
              isStandard
                ? "bg-primary/20 text-primary border border-primary/20"
                : "bg-[#121212] border border-border/30 hover:bg-[#202020] text-muted-foreground"
            }`}
          >
            {l.standard || "Standard"}
          </button>
          <button
            type="button"
            onClick={() => applyPreset("readonly")}
            disabled={disabled}
            className={`flex-1 text-center py-1 rounded-lg text-[10px] font-semibold cursor-pointer transition-colors ${
              isReadOnly
                ? "bg-primary/20 text-primary border border-primary/20"
                : "bg-[#121212] border border-border/30 hover:bg-[#202020] text-muted-foreground"
            }`}
          >
            {l.readOnly}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 max-h-72">
          {ALL_TOOLS.map((t, idx) => {
            const isGated = !!(t.gateKey && toolStatus?.[t.id] === "missing_key");
            const checked = activeTools.includes(t.id);
            const isToolDisabled = disabled || isGated;
            const isFocused = idx === selectedIndex;

            return (
              <div
                key={t.id}
                onClick={() => !isToolDisabled && handleToggleTool(t.id)}
                className={`w-full p-2 rounded-lg transition-colors flex items-start gap-2.5 cursor-pointer text-left ${
                  isFocused
                    ? "bg-primary/10 border border-primary/20"
                    : "hover:bg-card-hover border border-transparent"
                } ${isToolDisabled ? "opacity-40 cursor-not-allowed" : ""}`}
                title={isGated ? `Requires ${t.gateKey} in Settings > Env Vars` : undefined}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={isToolDisabled}
                  readOnly
                  className="mt-0.5 accent-accent"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-mono font-bold text-xs text-text-primary flex items-center gap-1.5">
                    {t.id}
                    {isGated && (
                      <span className="px-1 py-0.2 bg-warning/10 text-warning text-[8px] font-semibold rounded">
                        Gated
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1 truncate w-full">
                    {t.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PortalPopover>
  );
}
