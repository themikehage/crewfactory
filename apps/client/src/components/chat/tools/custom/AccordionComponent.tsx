import { useState } from "react";
import type { ReactNode } from "react";

interface AccordionItem {
  title: string;
  content: any[];
  defaultOpen?: boolean;
}

interface AccordionProps {
  items: AccordionItem[];
  renderChild: (comp: any, idx: number) => ReactNode;
  defaultOpen?: boolean;
}

export function AccordionComponent({ items, renderChild, defaultOpen }: AccordionProps) {
  // By default, accordions are open (better UX for custom tools). 
  // Respects per-item defaultOpen if provided, otherwise uses global defaultOpen or true.
  const globalDefault = defaultOpen ?? true;
  const [openIndexes, setOpenIndexes] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {};
    items.forEach((item, idx) => {
      const shouldOpen = item.defaultOpen !== undefined ? item.defaultOpen : globalDefault;
      if (shouldOpen) {
        initial[idx] = true;
      }
    });
    return initial;
  });

  const toggleIndex = (idx: number) => {
    setOpenIndexes(prev => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  if (!items || items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 w-full">
      {items.map((item, idx) => {
        const isOpen = !!openIndexes[idx];
        return (
          <div key={idx} className="border border-border rounded-lg overflow-hidden bg-card shadow-sm">
            {/* Header Button */}
            <button
              onClick={() => toggleIndex(idx)}
              className="flex justify-between items-center w-full px-4 py-3 bg-muted/20 text-xs font-semibold text-foreground hover:bg-muted/40 transition-colors text-left cursor-pointer"
            >
              <span>{item.title}</span>
              <svg
                className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
                  isOpen ? "transform rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Collapsible Content */}
            {isOpen && (
              <div className="p-4 border-t border-border/60 flex flex-col gap-4 bg-card-hover/10">
                {item.content?.map((comp, cIdx) => renderChild(comp, cIdx))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
