import { useState, useRef } from "react";
import { Paperclip, BookOpen, Sliders } from "lucide-react";
import { ModelSelector } from "./ModelSelector";
import { SkillsPopover } from "./SkillsPopover";
import { ToolsPopover } from "./ToolsPopover";
import { SendStopButton } from "./SendStopButton";
import type { SkillInfo } from "./SkillsSelector";
import { useLiterals, type ContextUsage } from "@/lib";
import { literals as u } from "./ChatInput.literals";
import { ALL_TOOLS } from "./ToolsSelector";
import { ContextButton } from "./ContextButton";

interface InputToolbarProps {
  sessionId: string | null;
  streaming: boolean;
  disabled: boolean;
  activeTools: string[];
  onToolsChange: (tools: string[]) => void;
  skills: SkillInfo[];
  skillsLoading: boolean;
  onSelectSkill: (skillName: string) => void;
  onFileClick: () => void;
  toolStatus?: Record<string, "available" | "missing_key">;
  onSend: () => void;
  onStop: () => void;
  contextUsage?: ContextUsage | null;
  onCompact?: () => void;
  compacting?: boolean;
}

export function InputToolbar({
  sessionId,
  streaming,
  disabled,
  activeTools,
  onToolsChange,
  skills,
  skillsLoading,
  onSelectSkill,
  onFileClick,
  toolStatus = {},
  onSend,
  onStop,
  contextUsage = null,
  onCompact,
  compacting = false,
}: InputToolbarProps) {
  const l = useLiterals(u);
  const [openSkills, setOpenSkills] = useState(false);
  const [openTools, setOpenTools] = useState(false);

  const skillsTriggerRef = useRef<HTMLButtonElement>(null);
  const toolsTriggerRef = useRef<HTMLButtonElement>(null);

  const isReadOnly =
    activeTools.includes("read") &&
    activeTools.includes("grep") &&
    activeTools.includes("find") &&
    activeTools.includes("ls") &&
    !activeTools.includes("write") &&
    !activeTools.includes("edit") &&
    !activeTools.includes("bash");

  const isFullAccess = ALL_TOOLS.filter(
    (t) => !(t.gateKey && toolStatus?.[t.id] === "missing_key")
  ).every((t) => activeTools.includes(t.id));

  let toolsLabelText = `${activeTools.length} tools`;
  if (isFullAccess) toolsLabelText = l.fullAccess;
  else if (isReadOnly) toolsLabelText = l.readOnly;

  return (
    <div className="flex items-center justify-between px-3 py-2 bg-[#171717] border-t border-border/30">
      {/* Left controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onFileClick}
          disabled={disabled}
          className="p-1.5 rounded-lg border border-border/40 bg-[#171717] hover:bg-[#313131] text-muted-foreground hover:text-foreground transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title={l.attachFiles}
        >
          <Paperclip size={14} />
        </button>

        <ModelSelector sessionId={sessionId} disabled={disabled} compact={true} />

        {sessionId && (
          <div className="relative">
            <button
              ref={skillsTriggerRef}
              type="button"
              onClick={() => !disabled && setOpenSkills((prev) => !prev)}
              disabled={disabled}
              title={`${l.skillsLabel} (${skills.length})`}
              className={`p-1.5 rounded-lg border border-border/40 bg-[#171717] hover:bg-[#313131] text-muted-foreground hover:text-foreground transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                openSkills ? "text-primary border-primary/45" : ""
              }`}
            >
              <BookOpen size={14} />
            </button>
            <SkillsPopover
              skills={skills}
              loading={skillsLoading}
              open={openSkills}
              onClose={() => setOpenSkills(false)}
              onSelectSkill={onSelectSkill}
              triggerRef={skillsTriggerRef}
            />
          </div>
        )}

        <div className="relative">
          <button
            ref={toolsTriggerRef}
            type="button"
            onClick={() => !disabled && setOpenTools((prev) => !prev)}
            disabled={disabled}
            title={`${l.toolsLabel}: ${toolsLabelText}`}
            className={`p-1.5 rounded-lg border border-border/40 bg-[#171717] hover:bg-[#313131] text-muted-foreground hover:text-foreground transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              openTools ? "text-primary border-primary/45" : ""
            }`}
          >
            <Sliders size={14} />
          </button>
          <ToolsPopover
            activeTools={activeTools}
            onChange={onToolsChange}
            open={openTools}
            onClose={() => setOpenTools(false)}
            triggerRef={toolsTriggerRef}
            toolStatus={toolStatus}
            disabled={disabled}
          />
        </div>

        <ContextButton
          contextUsage={contextUsage}
          onCompact={onCompact}
          compacting={compacting}
          disabled={disabled}
        />
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        <SendStopButton
          streaming={streaming}
          disabled={disabled}
          onSend={onSend}
          onStop={onStop}
        />
      </div>
    </div>
  );
}
