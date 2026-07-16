import { motion } from "framer-motion";

interface Props {
  activeStep: "multi" | "single" | "judging" | null;
  judgeDelta?: string;
  onStop: () => void;
  literals: Record<string, string>;
}

export function BenchmarkProgressCard({ activeStep, judgeDelta, onStop, literals }: Props) {
  if (!activeStep) return null;

  const steps = [
    { key: "multi", label: literals.progressMulti },
    { key: "single", label: literals.progressSingle },
    { key: "judging", label: literals.progressJudging },
  ] as const;

  const activeIndex = steps.findIndex((s) => s.key === activeStep);

  return (
    <div className="bg-card border border-border p-6 rounded-2xl flex flex-col gap-6 max-w-xl mx-auto my-8 shadow-xl">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 bg-primary rounded-full animate-ping" />
          <h3 className="text-base font-bold text-foreground select-none">{literals.running}</h3>
        </div>
        <button
          onClick={onStop}
          className="px-3 py-1.5 text-xs bg-destructive/15 border border-destructive/30 hover:bg-destructive hover:text-white text-destructive rounded-lg transition-colors font-medium cursor-pointer select-none"
        >
          {literals.btnCancel}
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {steps.map((step, idx) => {
          const isPending = idx > activeIndex;
          const isCurrent = idx === activeIndex;
          const isDone = idx < activeIndex;

          return (
            <div key={step.key} className="flex items-start gap-4">
              <div className="mt-1 select-none">
                {isDone ? (
                  <div className="w-5 h-5 rounded-full bg-primary/20 border border-primary text-primary flex items-center justify-center text-xs">
                    ✓
                  </div>
                ) : isCurrent ? (
                  <div className="w-5 h-5 rounded-full border border-primary flex items-center justify-center relative">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full border border-border flex items-center justify-center text-xs text-muted-foreground">
                    {idx + 1}
                  </div>
                )}
              </div>
              <div className="flex-1 flex flex-col gap-1.5">
                <span className={`text-sm font-semibold select-none ${isCurrent ? "text-foreground font-bold" : isPending ? "text-muted-foreground" : "text-muted-foreground/80"}`}>
                  {step.label}
                </span>
                
                {isCurrent && step.key === "judging" && judgeDelta && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-3 bg-background border border-border rounded-lg max-h-40 overflow-y-auto text-xs text-muted-foreground font-mono whitespace-pre-wrap select-text leading-relaxed"
                  >
                    {judgeDelta}
                  </motion.div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
export default BenchmarkProgressCard;
