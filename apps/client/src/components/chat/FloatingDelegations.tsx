import { useLiterals } from "@/lib";
import { literals as u } from "./FloatingDelegations.literals";

export interface PendingDelegation {
  toolCallId: string;
  subagentSessionId: string;
  task: string;
  targetType: "spawn" | "delegate";
  status: "running" | "success" | "error" | "blocked";
  startedAt: string;
  completedAt?: string;
  result?: any;
}

interface Props {
  delegations: PendingDelegation[];
  onNavigateToSession: (subSessionId: string) => void;
}

export function FloatingDelegations({ delegations, onNavigateToSession }: Props) {
  const l = useLiterals(u);

  if (delegations.length === 0) return null;

  return (
    <div className="mb-4 p-3 bg-surface border border-border rounded-lg shadow-sm flex flex-col gap-2 mx-4 mt-2">
      <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider font-mono">
          {l.title} ({delegations.length})
        </h3>
      </div>
      <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto pr-1">
        {delegations.map((d) => {
          const isRunning = d.status === "running";
          let statusColor = "bg-accent";
          let statusText = l.running;

          if (d.status === "success") {
            statusColor = "bg-green-500";
            statusText = l.success;
          } else if (d.status === "error") {
            statusColor = "bg-error";
            statusText = l.error;
          } else if (d.status === "blocked") {
            statusColor = "bg-warning";
            statusText = l.blocked;
          }

          return (
            <div
              key={d.toolCallId}
              onClick={() => onNavigateToSession(d.subagentSessionId)}
              className="flex items-center justify-between p-2 rounded bg-bg/50 border border-border/50 hover:bg-surface-hover hover:border-accent/40 cursor-pointer transition-all duration-150"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span className={`w-2.5 h-2.5 rounded-full ${statusColor} ${isRunning ? "animate-pulse" : ""}`} />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs text-text-primary font-medium truncate">
                    {d.task}
                  </span>
                  <span className="text-[10px] text-text-secondary">
                    {statusText}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-text-secondary uppercase px-1.5 py-0.5 rounded bg-surface border border-border">
                  {d.targetType}
                </span>
                <svg className="w-3.5 h-3.5 text-text-secondary" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
