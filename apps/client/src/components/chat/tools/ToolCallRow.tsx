import { useState } from "react";
import { LsResult } from "./LsResult";
import { FindResult } from "./FindResult";
import { WriteResult } from "./WriteResult";
import { ReadResult } from "./ReadResult";
import { EditResult } from "./EditResult";
import { GrepResult } from "./GrepResult";
import { BashResult } from "./BashResult";
import { ApprovalForm } from "./ApprovalForm";
import { ChartView } from "./ChartView";
import { AskQuestionForm } from "./AskQuestionForm";
import { ImageGrid } from "../ImageGrid";

export interface ToolContentBlock {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface ToolResultData {
  toolName: string;
  content: ToolContentBlock[];
  isError: boolean;
  details?: {
    diff?: string;
    patch?: string;
    firstChangedLine?: number;
  };
}

interface Props {
  toolName: string;
  args: Record<string, unknown>;
  result: ToolResultData | null;
  sessionId: string | null;
  toolCallId?: string;
  activeRepoName?: string | null;
  activeAgentId?: string | null;
  activeChannelId?: string | null;
  disabled?: boolean;
  serialTools?: string[];
}

const TOOL_META: Record<string, { label: string; colorClass: string; icon: React.ReactNode }> = {
  ls: {
    label: "ls",
    colorClass: "text-primary",
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      </svg>
    ),
  },
  find: {
    label: "find",
    colorClass: "text-primary",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  write: {
    label: "write",
    colorClass: "text-primary",
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
      </svg>
    ),
  },
  read: {
    label: "read",
    colorClass: "text-muted-foreground",
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
        <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
      </svg>
    ),
  },
  edit: {
    label: "edit",
    colorClass: "text-warning",
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
      </svg>
    ),
  },
  grep: {
    label: "grep",
    colorClass: "text-highlight",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="8" y1="11" x2="14" y2="11" />
        <line x1="11" y1="8" x2="11" y2="14" />
      </svg>
    ),
  },
  bash: {
    label: "bash",
    colorClass: "text-primary",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    ),
  },
  request_approval: {
    label: "aprobación",
    colorClass: "text-warning",
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-1 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
    ),
  },
  ask_question: {
    label: "pregunta",
    colorClass: "text-warning",
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-1 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
    ),
  },
  render_images: {
    label: "imágenes",
    colorClass: "text-accent",
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
      </svg>
    ),
  },
  render_chart: {
    label: "gráfico",
    colorClass: "text-accent",
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
        <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
      </svg>
    ),
  },
};

function getArgSummary(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case "ls": return (args.path as string) || ".";
    case "find": return (args.pattern as string) || "";
    case "write": return (args.path as string) || "";
    case "read": return (args.path as string) || "";
    case "edit": {
      const path = (args.path as string) || "";
      const edits = Array.isArray(args.edits) ? args.edits.length : 0;
      return edits > 1 ? `${path} · ${edits} edits` : path;
    }
    case "grep": {
      const pat = (args.pattern as string) || "";
      const glob = (args.glob as string) || "*";
      return glob !== "*" ? `/${pat}/ in ${glob}` : `/${pat}/`;
    }
    case "bash": {
      const cmd = (args.command as string) || "";
      return cmd.length > 55 ? cmd.slice(0, 55) + "…" : cmd;
    }
    case "request_approval": return (args.title as string) || "Petición de aprobación";
    case "ask_question": return (args.question as string) || "Pregunta al usuario";
    case "render_images": return Array.isArray(args.images) ? `${args.images.length} imágenes` : "Imágenes";
    case "render_chart": return (args.title as string) || (args.chartType as string) || "Gráfico";
    default: return JSON.stringify(args).slice(0, 50);
  }
}

function getResultSummary(toolName: string, result: ToolResultData): string {
  const text = result.content.find(b => b.type === "text")?.text ?? "";
  if (result.isError) return "error";
  switch (toolName) {
    case "ls": {
      const n = text.trim().split("\n").filter(Boolean).length;
      return `${n} item${n !== 1 ? "s" : ""}`;
    }
    case "find": {
      const n = text.trim().split("\n").filter(Boolean).length;
      return `${n} file${n !== 1 ? "s" : ""}`;
    }
    case "write": {
      const m = text.match(/(\d+)\s+bytes/);
      return m ? `${m[1]} B` : "written";
    }
    case "read": {
      if (result.content.some(b => b.type === "image")) return "image";
      const n = text.split("\n").length;
      return `${n} line${n !== 1 ? "s" : ""}`;
    }
    case "edit": {
      const m = text.match(/(\d+)\s+block/);
      return m ? `${m[1]} change${Number(m[1]) !== 1 ? "s" : ""}` : "edited";
    }
    case "grep": {
      const n = text.split("\n").filter(l => /:[\d]+:/.test(l)).length;
      return `${n} match${n !== 1 ? "es" : ""}`;
    }
    case "bash": return "done";
    case "request_approval": return text || "esperando...";
    case "ask_question": return text || "esperando...";
    case "render_images": return "renderizado";
    case "render_chart": return "renderizado";
    default: return "done";
  }
}

function ToolBody({
  toolName,
  args,
  result,
  toolCallId,
  sessionId,
  activeRepoName,
  activeAgentId,
  activeChannelId,
}: {
  toolName: string;
  args: Record<string, unknown>;
  result: ToolResultData | null;
  toolCallId?: string;
  sessionId?: string | null;
  activeRepoName?: string | null;
  activeAgentId?: string | null;
  activeChannelId?: string | null;
}) {
  const text = result?.content.find(b => b.type === "text")?.text ?? "";

  switch (toolName) {
    case "ls": return <LsResult text={text} />;
    case "find": return <FindResult text={text} />;
    case "write": return <WriteResult text={text} isError={result?.isError ?? false} />;
    case "read": return <ReadResult content={result?.content ?? []} args={args} />;
    case "edit": return <EditResult text={text} filePath={(args.path as string) || undefined} details={result?.details} isError={result?.isError ?? false} />;
    case "grep": return <GrepResult text={text} args={args} />;
    case "bash": return <BashResult text={text} command={(args.command as string) || ""} isError={result?.isError ?? false} />;
    case "request_approval":
      return (
        <ApprovalForm
          toolCallId={toolCallId || ""}
          args={args as any}
          result={result as any}
          sessionId={sessionId || null}
        />
      );
    case "ask_question":
      return (
        <AskQuestionForm
          toolCallId={toolCallId || ""}
          args={args as any}
          result={result as any}
          sessionId={sessionId || null}
        />
      );
    case "render_images":
      return (
        <ImageGrid
          images={(args.images as any) || []}
          sessionId={sessionId || null}
          activeRepoName={activeRepoName}
          activeAgentId={activeAgentId}
          activeChannelId={activeChannelId}
        />
      );
    case "render_chart":
      return (
        <ChartView
          chartType={args.chartType as any}
          title={args.title as any}
          data={args.data as any}
          config={args.config as any}
        />
      );
    default:
      return (
        <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-all bg-muted p-3 rounded-md max-h-48 overflow-y-auto">
          {text}
        </pre>
      );
  }
}

export function ToolCallRow({
  toolName,
  args,
  result,
  sessionId: _sessionId,
  toolCallId,
  activeRepoName: _activeRepoName,
  activeAgentId: _activeAgentId = null,
  activeChannelId: _activeChannelId = null,
  disabled = false,
  serialTools = ["request_approval", "ask_question"],
}: Props) {
  const isInteractive = serialTools.includes(toolName);

  const [expanded, setExpanded] = useState(
    !disabled && (
      toolName === "edit" ||
      toolName === "bash" ||
      toolName === "request_approval" ||
      toolName === "ask_question" ||
      toolName === "render_images" ||
      toolName === "render_chart"
    )
  );

  const meta = TOOL_META[toolName] ?? {
    label: toolName,
    colorClass: "text-muted-foreground",
    icon: <span className="w-3 h-3 rounded-full bg-text-secondary/30" />,
  };

  const running = result === null;
  const hasError = result?.isError ?? false;
  const argSummary = getArgSummary(toolName, args);
  const resultSummary = result ? getResultSummary(toolName, result) : "";

  return (
    <div className={`my-1.5 rounded-lg border overflow-hidden transition-all ${
      disabled ? "border-input/30 bg-card/25 opacity-60 select-none pointer-events-none" :
      hasError ? "border-error/40 bg-destructive/5" : "border-input bg-card/50"
    }`}>
      <button
        onClick={() => !disabled && !running && setExpanded(!expanded)}
        disabled={disabled || (running && isInteractive)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-card-hover/40 transition-colors text-left cursor-pointer disabled:cursor-default"
      >
        <span className={`flex-shrink-0 ${meta.colorClass}`}>{meta.icon}</span>

        <span className={`font-mono font-bold text-xs flex-shrink-0 ${meta.colorClass}`}>
          {meta.label}
        </span>

        <span className="font-mono text-[11px] text-muted-foreground truncate min-w-0 flex-1">
          {argSummary}
        </span>

        <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
          {running ? (
            disabled ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/20 animate-pulse" />
                esperando respuesta anterior...
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-warning/70">
                <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                {isInteractive ? "pendiente" : "running"}
              </span>
            )
          ) : hasError ? (
            <span className="flex items-center gap-1.5 text-xs text-destructive">
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              error
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" className="text-primary/70">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              {resultSummary}
            </span>
          )}

          {!running && !disabled && (
            <svg
              width="11" height="11" viewBox="0 0 20 20" fill="currentColor"
              className={`text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
            >
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </div>
      </button>

      {expanded && !disabled && (result || isInteractive) && (
        <div className="px-3 pb-3 pt-1 border-t border-input/40">
          <ToolBody
            toolName={toolName}
            args={args}
            result={result}
            toolCallId={toolCallId}
            sessionId={_sessionId}
            activeRepoName={_activeRepoName}
            activeAgentId={_activeAgentId}
            activeChannelId={_activeChannelId}
          />
        </div>
      )}
    </div>
  );
}
