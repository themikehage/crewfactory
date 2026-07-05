import { useState } from "react";
import { wsClient } from "@/lib/ws-client";

interface Props {
  toolCallId: string;
  args: {
    path: string;
    description?: string;
    originalContent?: string;
    proposedContent: string;
  };
  result: {
    content: Array<{ type: string; text?: string }>;
    isError: boolean;
  } | null;
  sessionId: string | null;
}

export function DiffApplyCard({ toolCallId, args, result, sessionId }: Props) {
  const [localAction, setLocalAction] = useState<"confirm" | "cancel" | null>(null);
  const { path, description, originalContent = "", proposedContent } = args;

  const resolvedStatus = result?.content?.[0]?.text; // "applied" | "discarded"
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

  // Simple line-by-line diff generator
  const getDiffLines = () => {
    const originalLines = originalContent.split("\n");
    const proposedLines = proposedContent.split("\n");

    if (!originalContent.trim()) {
      // New file
      return proposedLines.map((line, idx) => ({
        type: "addition" as const,
        leftNum: "",
        rightNum: idx + 1,
        content: line,
      }));
    }

    const lines: Array<{
      type: "normal" | "addition" | "deletion";
      leftNum: string | number;
      rightNum: string | number;
      content: string;
    }> = [];

    let i = 0;
    let j = 0;
    while (i < originalLines.length || j < proposedLines.length) {
      const orig = originalLines[i];
      const prop = proposedLines[j];

      if (orig === prop) {
        lines.push({ type: "normal", leftNum: i + 1, rightNum: j + 1, content: orig });
        i++;
        j++;
      } else if (i < originalLines.length && (j >= proposedLines.length || originalLines.indexOf(prop, i) > i)) {
        // Line was deleted or changed
        lines.push({ type: "deletion", leftNum: i + 1, rightNum: "", content: orig });
        i++;
      } else {
        // Line was added
        lines.push({ type: "addition", leftNum: "", rightNum: j + 1, content: prop });
        j++;
      }
    }
    return lines;
  };

  const diffLines = getDiffLines();

  return (
    <div className="w-full rounded-xl border border-input/40 bg-card/40 overflow-hidden font-sans shadow-md my-3 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-input/20">
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
          </svg>
          <div className="min-w-0">
            <span className="text-xs text-muted-foreground font-mono truncate block">propose_code_change</span>
            <span className="text-xs font-bold text-foreground font-mono truncate block">{path.split(/[\\/]/).pop()}</span>
          </div>
        </div>

        {isResolved && (
          <div>
            {resolvedStatus === "applied" ? (
              <span className="text-[10px] font-bold text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded uppercase">
                Aplicado
              </span>
            ) : (
              <span className="text-[10px] font-bold text-muted-foreground bg-muted border border-input px-2 py-0.5 rounded uppercase">
                Descartado
              </span>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {description && <p className="text-xs text-foreground/80 leading-relaxed">{description}</p>}
        <div className="text-[10px] text-muted-foreground font-mono truncate bg-muted/40 px-2 py-1 rounded">
          Ruta: {path}
        </div>

        {/* Diff Container */}
        <div className="border border-input/20 rounded-lg overflow-hidden bg-bg/60 font-mono text-[11px] max-h-80 overflow-y-auto">
          <table className="w-full border-collapse">
            <tbody>
              {diffLines.map((line, idx) => {
                let rowBg = "";
                let indicator = " ";
                let contentColor = "text-foreground/90";
                
                if (line.type === "addition") {
                  rowBg = "bg-accent/10 hover:bg-accent/15";
                  indicator = "+";
                  contentColor = "text-accent font-semibold";
                } else if (line.type === "deletion") {
                  rowBg = "bg-error/10 hover:bg-error/15";
                  indicator = "-";
                  contentColor = "text-error line-through";
                } else {
                  rowBg = "hover:bg-card-hover/20";
                }

                return (
                  <tr key={idx} className={`${rowBg} transition-colors leading-none`}>
                    <td className="w-8 select-none text-right pr-2 text-muted-foreground/40 border-r border-input/10 py-0.5">
                      {line.leftNum}
                    </td>
                    <td className="w-8 select-none text-right pr-2 text-muted-foreground/40 border-r border-input/10 py-0.5">
                      {line.rightNum}
                    </td>
                    <td className="w-4 select-none text-center text-muted-foreground/35 py-0.5 font-bold">
                      {indicator}
                    </td>
                    <td className={`pl-2 pr-4 py-0.5 whitespace-pre break-all ${contentColor}`}>
                      {line.content}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions */}
      {!isResolved && (
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-input/20 bg-card/20">
          <button
            onClick={() => handleAction("cancel")}
            disabled={localAction !== null}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-input text-foreground hover:bg-card-hover/80 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {localAction === "cancel" ? "Descartando..." : "Descartar"}
          </button>
          <button
            onClick={() => handleAction("confirm")}
            disabled={localAction !== null}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent text-background hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {localAction === "confirm" ? "Aplicando..." : "Aplicar cambio"}
          </button>
        </div>
      )}
    </div>
  );
}
