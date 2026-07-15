import { useRef, useState, useMemo } from "react";
import { Zap } from "lucide-react";
import { useLiterals, type ContextUsage } from "@/lib";
import { literals as u } from "./ContextMeter.literals";
import { PortalPopover } from "./PortalPopover";

interface ContextButtonProps {
  contextUsage?: ContextUsage | null;
  onCompact?: () => void;
  compacting?: boolean;
  disabled?: boolean;
}

export function ContextButton({
  contextUsage = null,
  onCompact,
  compacting = false,
  disabled = false,
}: ContextButtonProps) {
  const l = useLiterals(u);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const hasData =
    contextUsage &&
    contextUsage.totalTokens !== null &&
    contextUsage.limit !== null &&
    contextUsage.limit > 0;

  const pct = useMemo(() => {
    if (!hasData) return 0;
    return Math.min(Math.max(contextUsage!.totalTokens! / contextUsage!.limit!, 0), 1);
  }, [contextUsage, hasData]);

  const angle = pct * 360;
  const remainingPct = 100 - pct * 100;

  const progressColor =
    remainingPct <= 10 ? "#ca3214" : remainingPct <= 30 ? "#fbbf24" : "#4ade80";

  const formatted = useMemo(() => {
    if (!hasData) return { total: "-", limit: "-", pctLabel: "0%" };
    const formatter = new Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: 1,
    });
    return {
      total: formatter.format(contextUsage!.totalTokens!),
      limit: formatter.format(contextUsage!.limit!),
      pctLabel: `${Math.round(pct * 100)}%`,
      input: contextUsage!.inputTokens != null ? formatter.format(contextUsage!.inputTokens!) : null,
      output: contextUsage!.outputTokens != null ? formatter.format(contextUsage!.outputTokens!) : null,
    };
  }, [contextUsage, hasData, pct]);

  const conicBackground = hasData
    ? `conic-gradient(from 0deg, ${progressColor} 0deg, ${progressColor} ${angle}deg, rgba(255,255,255,0.08) ${angle}deg, rgba(255,255,255,0.08) 360deg)`
    : "rgba(255,255,255,0.08)";

  if (!hasData) {
    return null;
  }

  return (
    <div className="relative">
      <div
        className="rounded-lg transition-all"
        style={{
          padding: "1.5px",
          background: conicBackground,
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          onClick={() => !disabled && setOpen((o) => !o)}
          disabled={disabled}
          aria-label={l.title}
          title={`${l.title}: ${formatted.pctLabel} (${formatted.total} / ${formatted.limit})`}
          className={`p-1.5 rounded-[6px] bg-[#171717] hover:bg-[#212121] text-muted-foreground hover:text-foreground transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center ${
            open ? "text-primary bg-[#212121]" : ""
          } ${remainingPct <= 10 ? "text-error" : remainingPct <= 30 ? "text-warning" : ""}`}
        >
          <Zap size={14} className={`${compacting ? "animate-pulse" : ""} ${pct > 0.7 ? "" : ""}`} />
        </button>
      </div>

      <PortalPopover triggerRef={triggerRef} open={open} onClose={() => setOpen(false)}>
        <div className="w-80 overflow-hidden bg-[#171717] border border-border rounded-xl shadow-xl flex flex-col">
          <div className="p-3 border-b border-border/40 bg-[#171717]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="p-1.5 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${progressColor}18`, color: progressColor }}
                >
                  <Zap size={14} />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-foreground">{l.title}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatted.pctLabel} {l.usedLabel}
                  </span>
                </div>
              </div>
              <span
                className="text-[10px] font-mono px-2 py-1 rounded-full border"
                style={{
                  backgroundColor: `${progressColor}12`,
                  color: progressColor,
                  borderColor: `${progressColor}30`,
                }}
              >
                {formatted.total} / {formatted.limit}
              </span>
            </div>

            <div className="mt-3 w-full h-2 bg-[#121212] rounded-full overflow-hidden border border-border/20">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${Math.min(pct * 100, 100)}%`,
                  backgroundColor: progressColor,
                }}
              />
            </div>


          </div>

          <div className="p-3">
            {onCompact && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onCompact();
                    setOpen(false);
                  }}
                  disabled={compacting}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-[#121212] border border-border/40 hover:bg-[#212121] hover:border-primary/20 text-xs font-medium text-foreground hover:text-primary transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Zap size={12} className={compacting ? "animate-pulse" : ""} />
                  {compacting ? l.compactingAction : l.compactAction}
                </button>
                <p className="mt-1.5 text-[10px] text-muted-foreground/70 text-center leading-tight">
                  {l.compactDesc}
                </p>
              </div>
            )}
          </div>
        </div>
      </PortalPopover>
    </div>
  );
}
