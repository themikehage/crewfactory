import { useState } from "react";
import { wsClient } from "@/lib/ws-client";
import { RichMarkdown } from "../RichMarkdown";

interface Props {
  toolCallId: string;
  args: {
    title: string;
    description: string;
    severity?: "info" | "warning" | "critical";
    confirmLabel?: string;
    cancelLabel?: string;
    details?: string;
  };
  result: {
    content: Array<{ type: string; text?: string }>;
    isError: boolean;
  } | null;
  sessionId: string | null;
}

export function ApprovalForm({ toolCallId, args, result, sessionId }: Props) {
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [localAction, setLocalAction] = useState<"confirm" | "cancel" | null>(null);

  const {
    title = "Aprobación",
    description = "",
    severity = "warning",
    confirmLabel = "Confirmar",
    cancelLabel = "Cancelar",
    details,
  } = args || {};

  // Si ya hay un resultado de la herramienta, leemos el resultado
  const resolvedStatus = result?.content?.[0]?.text; // "confirmed" | "cancelled"
  const isResolved = !!resolvedStatus;

  const handleAction = (action: "confirm" | "cancel") => {
    if (isResolved || !sessionId) return;
    setLocalAction(action);
    wsClient.send({
      type: "ui_action",
      sessionId,
      componentId: toolCallId,
      action,
    });
  };

  // Clases CSS dinámicas según severidad
  const getSeverityStyles = () => {
    switch (severity) {
      case "critical":
        return {
          borderClass: "border-error/50",
          bgClass: "bg-error/5",
          badgeBg: "bg-error/10 text-error border-error/20",
          icon: (
            <svg className="w-5 h-5 text-error shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ),
        };
      case "info":
        return {
          borderClass: "border-accent/50",
          bgClass: "bg-accent/5",
          badgeBg: "bg-accent/10 text-accent border-accent/20",
          icon: (
            <svg className="w-5 h-5 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
        };
      case "warning":
      default:
        return {
          borderClass: "border-warning/50",
          bgClass: "bg-warning/5",
          badgeBg: "bg-warning/10 text-warning border-warning/20",
          icon: (
            <svg className="w-5 h-5 text-warning shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ),
        };
    }
  };

  const { borderClass, bgClass, badgeBg, icon } = getSeverityStyles();

  return (
    <div className={`w-full rounded-xl border ${borderClass} ${bgClass} overflow-hidden font-sans shadow-lg my-3 transition-all duration-300`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-input/20">
        {icon}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-foreground truncate">{title}</h4>
          <span className={`inline-block mt-0.5 text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${badgeBg}`}>
            Aprobación requerida
          </span>
        </div>
        {isResolved && (
          <div className="flex items-center gap-1.5">
            {resolvedStatus === "confirmed" ? (
              <span className="flex items-center gap-1 text-xs font-semibold text-accent bg-accent/10 border border-accent/20 px-2.5 py-0.5 rounded-full">
                ✓ Aprobado
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs font-semibold text-error bg-error/10 border border-error/20 px-2.5 py-0.5 rounded-full">
                ✕ Cancelado
              </span>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        <p className="text-xs text-foreground/80 leading-relaxed font-sans">{description}</p>

        {/* Details Accordeon */}
        {details && (
          <div className="border border-input/20 rounded-lg overflow-hidden bg-card/40">
            <button
              onClick={() => setDetailsExpanded(!detailsExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 text-left text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-card-hover/40 transition-colors select-none cursor-pointer"
            >
              <span>Detalles técnicos</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`transition-transform duration-200 ${detailsExpanded ? "rotate-180" : ""}`}
              >
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            {detailsExpanded && (
              <div className="px-3 py-2.5 border-t border-input/20 bg-muted/30 text-xs text-foreground/75 leading-relaxed overflow-x-auto max-h-60">
                <RichMarkdown content={details} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {!isResolved && (
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-input/20 bg-card/20">
          <button
            onClick={() => handleAction("cancel")}
            disabled={localAction !== null}
            className="px-4 py-2 rounded-lg text-xs font-semibold border border-input text-foreground hover:bg-card-hover/80 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {localAction === "cancel" ? "Cancelando..." : cancelLabel}
          </button>
          <button
            onClick={() => handleAction("confirm")}
            disabled={localAction !== null}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-accent text-background hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {localAction === "confirm" ? "Aprobando..." : confirmLabel}
          </button>
        </div>
      )}
    </div>
  );
}
