import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { RichMarkdown } from "./RichMarkdown";

export interface SkillInfo {
  name: string;
  description: string;
  filePath: string;
  disableModelInvocation: boolean;
  scope: "project" | "user" | "temporary";
  content: string;
}

interface Props {
  skills: SkillInfo[];
  loading: boolean;
  onSelectSkill?: (skillName: string) => void;
  disabled?: boolean;
}

export function SkillsSelector({ skills, loading, onSelectSkill, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [viewingSkill, setViewingSkill] = useState<SkillInfo | null>(null);

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5 cursor-pointer ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        }`}
        title="Session skills list"
      >
        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
          <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
        </svg>
        <span>
          Skills: {loading ? "loading..." : `${skills.length} active`}
        </span>
        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 11-1.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Session Skills (${skills.length} detected)`}
      >
        <div className="p-3 space-y-1.5 bg-card">
          {skills.map((s) => (
            <div
              key={s.name}
              onClick={() => {
                if (onSelectSkill) {
                  onSelectSkill(s.name);
                  setOpen(false);
                }
              }}
              className="group flex flex-col p-2 rounded-md hover:bg-card-hover/50 border border-transparent transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-mono font-bold text-foreground truncate max-w-[65%]">
                  {s.name}
                </span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`text-[8px] px-1 py-0.2 rounded font-semibold uppercase ${
                    s.scope === "project" ? "bg-primary/15 text-primary" : "bg-highlight/15 text-highlight"
                  }`}>
                    {s.scope === "project" ? "Proj" : "User"}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewingSkill(s);
                      setOpen(false);
                    }}
                    className="text-[10px] text-primary hover:underline px-1 py-0.5 cursor-pointer font-semibold"
                  >
                    View
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground/80 line-clamp-2 leading-relaxed">
                {s.description}
              </p>
            </div>
          ))}
          {skills.length === 0 && (
            <p className="text-muted-foreground text-[11px] text-center py-6">
              No active skills in this session.
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={viewingSkill !== null}
        onClose={() => setViewingSkill(null)}
        footer={
          <button
            onClick={() => setViewingSkill(null)}
            className="px-4 py-1.5 bg-card-hover hover:bg-card-hover/80 text-foreground font-semibold rounded-lg text-xs cursor-pointer transition-colors"
          >
            Close
          </button>
        }
      >
        {viewingSkill && (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="font-mono font-bold text-foreground text-sm">
                {viewingSkill.name}
              </span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                viewingSkill.scope === "project" ? "bg-primary/15 text-primary" : "bg-highlight/15 text-highlight"
              }`}>
                {viewingSkill.scope === "project" ? "Project-local" : "User-global"}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Description
              </span>
              <p className="text-xs text-muted-foreground bg-background/50 p-2.5 border border-input/30 rounded-lg mt-1 leading-relaxed">
                {viewingSkill.description}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Instructions
              </span>
              <div className="bg-background/40 p-4 border border-input/40 rounded-lg mt-1 max-w-none">
                <RichMarkdown content={viewingSkill.content || "*No instruction text*"} />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
