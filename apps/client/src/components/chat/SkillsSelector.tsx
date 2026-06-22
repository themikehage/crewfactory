import { useState, useEffect, useRef } from "react";
import { RichMarkdown } from "./RichMarkdown";

interface SkillInfo {
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
}

export function SkillsSelector({ skills, loading }: Props) {
  const [open, setOpen] = useState(false);
  const [viewingSkill, setViewingSkill] = useState<SkillInfo | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors px-1 py-0.5 cursor-pointer"
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

      {open && (
        <div className="absolute bottom-full right-0 mb-1 w-72 bg-surface border border-surface-hover rounded-lg shadow-lg z-50 overflow-hidden text-xs">
          <div className="p-3 border-b border-surface-hover flex items-center justify-between bg-surface">
            <span className="font-semibold text-text-primary">Session Skills</span>
            <span className="text-[10px] text-text-secondary">
              {skills.length} detected
            </span>
          </div>

          <div className="max-h-60 overflow-y-auto p-2 space-y-1.5 bg-surface">
            {skills.map((s) => (
              <div
                key={s.name}
                className="group flex flex-col p-2 rounded-md hover:bg-surface-hover/50 border border-transparent transition-all"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-mono font-bold text-text-primary truncate max-w-[65%]">
                    {s.name}
                  </span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`text-[8px] px-1 py-0.2 rounded font-semibold uppercase ${
                      s.scope === "project" ? "bg-accent/15 text-accent" : "bg-highlight/15 text-highlight"
                    }`}>
                      {s.scope === "project" ? "Proj" : "User"}
                    </span>
                    <button
                      onClick={() => {
                        setViewingSkill(s);
                        setOpen(false);
                      }}
                      className="text-[10px] text-accent hover:underline px-1 py-0.5 cursor-pointer font-semibold"
                    >
                      View
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-text-secondary/80 line-clamp-2 leading-relaxed">
                  {s.description}
                </p>
              </div>
            ))}
            {skills.length === 0 && (
              <p className="text-text-secondary text-[11px] text-center py-6">
                No active skills in this session.
              </p>
            )}
          </div>
        </div>
      )}

      {viewingSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-surface border border-surface-hover rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <header className="px-4 py-3 border-b border-surface-hover flex items-center justify-between flex-shrink-0 bg-surface">
              <div className="flex items-center gap-2.5">
                <span className="font-mono font-bold text-text-primary text-sm">
                  {viewingSkill.name}
                </span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                  viewingSkill.scope === "project" ? "bg-accent/15 text-accent" : "bg-highlight/15 text-highlight"
                }`}>
                  {viewingSkill.scope === "project" ? "Project-local" : "User-global"}
                </span>
              </div>
              <button
                onClick={() => setViewingSkill(null)}
                className="text-text-secondary hover:text-text-primary transition-colors cursor-pointer p-1"
                title="Close modal"
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                  Description
                </span>
                <p className="text-xs text-text-secondary bg-bg/50 p-2.5 border border-surface-hover/30 rounded-lg mt-1 leading-relaxed">
                  {viewingSkill.description}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                  Instructions
                </span>
                <div className="bg-bg/40 p-4 border border-surface-hover/40 rounded-lg mt-1 max-w-none">
                  <RichMarkdown content={viewingSkill.content || "*No instruction text*"} />
                </div>
              </div>
            </div>
            <footer className="px-4 py-2.5 border-t border-surface-hover bg-surface flex justify-end flex-shrink-0">
              <button
                onClick={() => setViewingSkill(null)}
                className="px-4 py-1.5 bg-surface-hover hover:bg-surface-hover/80 text-text-primary font-semibold rounded-lg text-xs cursor-pointer transition-colors"
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
