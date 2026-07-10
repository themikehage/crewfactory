import { useState, useRef, useCallback } from "react";
import { PortalPopover } from "@/components/chat/PortalPopover";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface DropdownProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: DropdownOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  matchWidth?: boolean;
  size?: "xs" | "sm";
  renderOption?: (option: DropdownOption<T>, selected: boolean) => React.ReactNode;
}

const sizes = {
  xs: "px-2 py-1 text-[11px]",
  sm: "px-2.5 py-1.5 text-xs",
};

export function Dropdown<T extends string>({
  value,
  onChange,
  options,
  placeholder = "Select...",
  disabled = false,
  className = "",
  matchWidth = false,
  size = "sm",
  renderOption,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selected = options.find((o) => o.value === value);

  const handleSelect = useCallback(
    (opt: DropdownOption<T>) => {
      if (opt.disabled) return;
      onChange(opt.value);
      setOpen(false);
    },
    [onChange]
  );

  return (
    <>
      <button
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          setOpen(!open);
        }}
        disabled={disabled}
        className={`flex items-center justify-between gap-2 bg-background border border-input hover:border-primary/40 focus:border-primary outline-none text-foreground rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${sizes[size]} ${className}`}
      >
        <span className={`truncate ${selected ? "text-foreground" : "text-muted-foreground"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`text-muted-foreground flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      <PortalPopover
        triggerRef={triggerRef}
        open={open}
        onClose={() => setOpen(false)}
        matchWidth={matchWidth}
      >
        <div className={`bg-[#171717] border border-border rounded-xl shadow-xl overflow-y-auto py-1 ${matchWidth ? "" : "min-w-[140px]"}`}
          style={matchWidth ? undefined : { maxHeight: "240px" }}>
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                onClick={() => handleSelect(opt)}
                disabled={opt.disabled}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  isSelected
                    ? "bg-primary/15 text-primary font-semibold"
                    : "text-foreground hover:bg-card-hover"
                }`}
              >
                {renderOption ? renderOption(opt, isSelected) : opt.label}
              </button>
            );
          })}
        </div>
      </PortalPopover>
    </>
  );
}
