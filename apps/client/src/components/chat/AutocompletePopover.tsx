import { useRef } from "react";
import { PortalPopover } from "./PortalPopover";
import { useLiterals } from "@/lib";
import { literals as u } from "./ChatInput.literals";

interface AutocompleteItem {
  id: string;
  name: string;
  description?: string;
}

interface AutocompletePopoverProps {
  mode: "skill" | "mention" | null;
  items: AutocompleteItem[];
  selectedIndex: number;
  onSelect: (item: AutocompleteItem) => void;
  onClose: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function AutocompletePopover({
  mode,
  items,
  selectedIndex,
  onSelect,
  onClose,
  textareaRef,
}: AutocompletePopoverProps) {
  const l = useLiterals(u);
  const popoverRef = useRef<HTMLDivElement>(null);
  const open = mode !== null && items.length > 0;

  if (!open) return null;

  return (
    <PortalPopover triggerRef={textareaRef} open={open} onClose={onClose}>
      <div
        ref={popoverRef}
        className="w-64 max-h-48 bg-[#171717] border border-border rounded-xl shadow-xl flex flex-col"
      >
        <div className="px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground border-b border-border/40 tracking-wider uppercase bg-[#121212] select-none">
          {mode === "mention" ? l.mentionHeader : l.skillsHeader}
        </div>

        <div className="flex-1 overflow-y-auto p-1 max-h-40">
          {items.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <button
                key={item.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(item);
                }}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 cursor-pointer transition-colors text-xs ${
                  isSelected
                    ? "bg-primary/10 border border-primary/20 text-foreground"
                    : "text-muted-foreground hover:bg-card-hover hover:text-foreground border border-transparent"
                }`}
              >
                {mode === "mention" ? (
                  <>
                    <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-[10px] shrink-0">
                      {item.name[0]?.toUpperCase()}
                    </span>
                    <span className="font-medium truncate">@{item.name}</span>
                  </>
                ) : (
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-mono font-bold text-foreground">
                      /{item.name}
                    </span>
                    {item.description && (
                      <span className="text-[10px] text-muted-foreground truncate max-w-full">
                        {item.description}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </PortalPopover>
  );
}
