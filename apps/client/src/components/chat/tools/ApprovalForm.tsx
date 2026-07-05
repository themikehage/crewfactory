import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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

  const resolvedStatus = result?.content?.[0]?.text;
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

  const getSeverityStyles = () => {
    switch (severity) {
      case "critical":
        return {
          borderClass: "border-error/25 hover:border-error/40",
          bgClass: "bg-error/5",
          badgeBg: "bg-error/10 text-error border-error/20",
          accentColor: "text-error",
          pulseColor: "bg-error",
          icon: (
            <svg className="w-5 h-5 text-error shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ),
        };
      case "info":
        return {
          borderClass: "border-primary/25 hover:border-primary/40",
          bgClass: "bg-primary/5",
          badgeBg: "bg-primary/10 text-primary border-primary/20",
          accentColor: "text-primary",
          pulseColor: "bg-primary",
          icon: (
            <svg className="w-5 h-5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
        };
      case "warning":
      default:
        return {
          borderClass: "border-warning/25 hover:border-warning/40",
          bgClass: "bg-warning/5",
          badgeBg: "bg-warning/10 text-warning border-warning/20",
          accentColor: "text-warning",
          pulseColor: "bg-warning",
          icon: (
            <svg className="w-5 h-5 text-warning shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ),
        };
    }
  };

  const { borderClass, bgClass, badgeBg, pulseColor, icon } = getSeverityStyles();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`relative w-full rounded-xl border ${borderClass} ${bgClass} overflow-hidden font-sans shadow-md my-4 transition-all duration-300`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${
        severity === "critical" ? "bg-error" : severity === "info" ? "bg-primary" : "bg-warning"
      }`} />

      <div className="flex items-center justify-between gap-3 pl-5 pr-4 py-3 border-b border-border/40 bg-card/90">
        <div className="flex items-center gap-3 min-w-0">
          {icon}
          <div className="flex flex-col min-w-0">
            <h4 className="text-xs font-bold text-foreground truncate">{title}</h4>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`inline-flex items-center gap-1.5 text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md border ${badgeBg}`}>
                {!isResolved && (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${pulseColor} opacity-75`}></span>
                    <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${pulseColor}`}></span>
                  </span>
                )}
                Aprobación requerida
              </span>
            </div>
          </div>
        </div>

        {isResolved && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-1.5 shrink-0"
          >
            {resolvedStatus === "confirmed" ? (
              <span className="flex items-center gap-1 text-[11px] font-bold text-success bg-success/10 border border-success/20 px-2.5 py-1 rounded-full">
                <svg className="w-3.5 h-3.5 text-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Aprobado
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-bold text-error bg-error/10 border border-error/20 px-2.5 py-1 rounded-full">
                <svg className="w-3.5 h-3.5 text-error shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancelado
              </span>
            )}
          </motion.div>
        )}
      </div>

      <div className="pl-5 pr-4 py-4 space-y-4">
        <p className="text-xs text-foreground/80 leading-relaxed font-sans">{description}</p>

        {details && (
          <div className="border border-border/40 rounded-lg overflow-hidden bg-muted/20">
            <button
              onClick={() => setDetailsExpanded(!detailsExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 text-left text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors select-none cursor-pointer"
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
            <AnimatePresence initial={false}>
              {detailsExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                >
                  <div className="px-3 py-3 border-t border-border/40 bg-muted/40 text-xs text-foreground/75 leading-relaxed overflow-x-auto max-h-60">
                    <RichMarkdown content={details} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AnimatePresence>
        {!isResolved && (
          <motion.div
            initial={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-end gap-2.5 pl-5 pr-4 py-3 border-t border-border/40 bg-muted/30"
          >
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleAction("cancel")}
              disabled={localAction !== null}
              className="px-4 py-2 rounded-lg text-xs font-bold border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {localAction === "cancel" ? "Cancelando..." : cancelLabel}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleAction("confirm")}
              disabled={localAction !== null}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed shadow-sm"
            >
              {localAction === "confirm" ? "Aprobando..." : confirmLabel}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
