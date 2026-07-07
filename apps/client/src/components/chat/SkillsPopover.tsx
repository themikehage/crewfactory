import { useState, useEffect, useRef } from "react";
import type { SkillInfo } from "./SkillsSelector";
import { PortalPopover } from "./PortalPopover";
import { useLiterals } from "@/lib";
import { literals as u } from "./ChatInput.literals";

interface SkillsPopoverProps {
  skills: SkillInfo[];
  loading: boolean;
  open: boolean;
  onClose: () => void;
  onSelectSkill: (skillName: string) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

export function SkillsPopover({
  skills,
  loading,
  open,
  onClose,
  onSelectSkill,
  triggerRef,
}: SkillsPopoverProps) {
  const l = useLiterals(u);
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = skills.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (open) {
      setSearch("");
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      if (filtered.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        onSelectSkill(filtered[selectedIndex].name);
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, filtered, selectedIndex, onClose, onSelectSkill]);

  return (
    <PortalPopover triggerRef={triggerRef} open={open} onClose={onClose}>
      <div className="w-80 max-h-96 overflow-hidden bg-[#171717] border border-border rounded-xl shadow-xl flex flex-col">
        <div className="p-2 border-b border-border bg-[#171717]">
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder={l.searchSkills}
            className="w-full px-3 py-1.5 bg-[#121212] border border-border/40 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 max-h-72">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
              <span>Loading...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground select-none">
              {l.noSkills}
            </div>
          ) : (
            filtered.map((s, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => {
                    onSelectSkill(s.name);
                    onClose();
                  }}
                  className={`w-full text-left p-2 rounded-lg transition-colors flex flex-col gap-1 cursor-pointer ${
                    isSelected
                      ? "bg-primary/10 border border-primary/20"
                      : "hover:bg-card-hover border border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <span className="font-mono font-bold text-sm text-text-primary truncate">
                      /{s.name}
                    </span>
                    <span
                      className={`text-[9px] px-1 py-0.2 rounded font-semibold uppercase ${
                        s.scope === "project"
                          ? "bg-primary/15 text-primary border border-primary/20"
                          : "bg-orange-500/15 text-orange-400 border border-orange-500/20"
                      }`}
                    >
                      {s.scope === "project" ? "Proj" : "User"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1 truncate w-full">
                    {s.description}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </div>
    </PortalPopover>
  );
}
