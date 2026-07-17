import { useState, useEffect } from "react";
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
import { HtmlPreview } from "../HtmlPreview";
import { ShareFileCard } from "./ShareFileCard";
import { ExaSearchResult } from "./ExaSearchResult";
import { WebFetchResult } from "./WebFetchResult";
import { MemoryResult } from "./MemoryResult";
import { DecomposeResult } from "./DecomposeResult";
import { useLiterals } from "@/lib";
import { literals } from "./ToolCallRow.literals";
import { CustomToolBody } from "./custom";

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
    totalResults?: number;
    searchType?: string;
    results?: Array<{ title?: string; url: string; publishedDate?: string }>;
    synthesizedOutput?: string;
    costDollars?: number;
    count?: number;
    memories?: Array<{ id: string; type: string; importance: number; content: string; tags?: string[] }>;
    status?: string;
    type?: string;
    importance?: number;
    tags?: string[];
    deletedId?: string;
    title?: string;
    cached?: boolean;
    truncated?: boolean;
    extractionMethod?: string;
    fetchDurationMs?: number;
    originalSize?: number;
    extractedSize?: number;
    url?: string;
  };
}

interface Props {
  toolName: string;
  args: Record<string, unknown>;
  result: ToolResultData | null;
  sessionId: string | null;
  toolCallId?: string;
  activeProjectName?: string | null;
  activeAgentId?: string | null;
  activeChannelId?: string | null;
  disabled?: boolean;
  serialTools?: string[];
  onOpenSubagentConsole?: (toolCallId: string, targetType?: string, targetId?: string) => void;
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
    label: "request_approval",
    colorClass: "text-warning",
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-1 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
    ),
  },
  ask_question: {
    label: "ask_question",
    colorClass: "text-warning",
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-1 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
    ),
  },
  render_images: {
    label: "render_images",
    colorClass: "text-primary",
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
      </svg>
    ),
  },
  render_html: {
    label: "render_html",
    colorClass: "text-primary",
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h8a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
      </svg>
    ),
  },
  render_chart: {
    label: "render_chart",
    colorClass: "text-primary",
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
        <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
      </svg>
    ),
  },
  refresh_ui: {
    label: "refresh_ui",
    colorClass: "text-primary",
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
      </svg>
    ),
  },
  spawn_subagent: {
    label: "spawn_subagent",
    colorClass: "text-primary",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="9" y1="3" x2="9" y2="21" />
      </svg>
    ),
  },
  delegate_task: {
    label: "delegate_task",
    colorClass: "text-primary",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  exa_search: {
    label: "exa_search",
    colorClass: "text-highlight",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <path d="M8 11h6" />
        <path d="M11 8v6" />
      </svg>
    ),
  },
  web_fetch: {
    label: "web_fetch",
    colorClass: "text-highlight",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
  memory_store: {
    label: "memory_store",
    colorClass: "text-accent",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a4 4 0 0 1 4 4v1a3 3 0 0 1 3 3v2a3 3 0 0 1-1.5 2.6A4 4 0 0 1 14 18h-4a4 4 0 0 1-3.5-3.4A3 3 0 0 1 5 12v-2a3 3 0 0 1 3-3V6a4 4 0 0 1 4-4z" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="9" y1="22" x2="15" y2="22" />
      </svg>
    ),
  },
  memory_recall: {
    label: "memory_recall",
    colorClass: "text-accent",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a4 4 0 0 1 4 4v1a3 3 0 0 1 3 3v2a3 3 0 0 1-1.5 2.6A4 4 0 0 1 14 18h-4a4 4 0 0 1-3.5-3.4A3 3 0 0 1 5 12v-2a3 3 0 0 1 3-3V6a4 4 0 0 1 4-4z" />
        <circle cx="18" cy="18" r="3" />
        <line x1="20.5" y1="20.5" x2="22" y2="22" />
      </svg>
    ),
  },
  memory_forget: {
    label: "memory_forget",
    colorClass: "text-error",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a4 4 0 0 1 4 4v1a3 3 0 0 1 3 3v2a3 3 0 0 1-1.5 2.6A4 4 0 0 1 14 18h-4a4 4 0 0 1-3.5-3.4A3 3 0 0 1 5 12v-2a3 3 0 0 1 3-3V6a4 4 0 0 1 4-4z" />
        <line x1="15" y1="15" x2="21" y2="21" />
        <line x1="21" y1="15" x2="15" y2="21" />
      </svg>
    ),
  },
  decompose_tasks: {
    label: "decompose_tasks",
    colorClass: "text-primary",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
  manage_custom_tools: {
    label: "manage_custom_tools",
    colorClass: "text-primary",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
  },
};

function getArgSummary(toolName: string, args: Record<string, unknown>, l: Record<string, string>): string {
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
    case "request_approval": return (args.title as string) || l.argApprovalRequest;
    case "ask_question": return (args.question as string) || l.argUserQuestion;
    case "render_images": return Array.isArray(args.images) ? `${args.images.length} ${l.argImages}` : "Images";
    case "render_html": return (args.title as string) || l.argHtmlDoc;
    case "render_chart": return (args.title as string) || (args.chartType as string) || l.argChart;
    case "refresh_ui": return `${l.argUiRefresh}: ${String(args.entityType)}`;
    case "create_experiment": return (args.name as string) || "Experimento";
    case "spawn_subagent": {
      const task = (args.task as string) || "";
      const role = (args.subagentRole as string) || "";
      const cleanTask = task.length > 40 ? task.slice(0, 40) + "…" : task;
      return role ? `[${role}] ${cleanTask}` : cleanTask;
    }
    case "delegate_task": {
      const type = (args.targetType as string) || "";
      const target = (args.targetId as string) || "";
      const task = (args.task as string) || "";
      const cleanTask = task.length > 35 ? task.slice(0, 35) + "…" : task;
      return `[${type}: ${target}] ${cleanTask}`;
    }
    case "exa_search": {
      const q = (args.query as string) || "";
      return q.length > 60 ? q.slice(0, 60) + "…" : q;
    }
    case "web_fetch": {
      const url = (args.url as string) || "";
      return url.length > 60 ? url.slice(0, 60) + "…" : url;
    }
    case "memory_recall": {
      const q = (args.query as string) || "";
      return q.length > 60 ? q.slice(0, 60) + "…" : q;
    }
    case "memory_store": {
      const c = (args.content as string) || "";
      return c.length > 50 ? c.slice(0, 50) + "…" : c;
    }
    case "memory_forget": return (args.id as string) || "";
    case "decompose_tasks": {
      const obj = (args.objective as string) || "";
      return obj.length > 50 ? obj.slice(0, 50) + "…" : obj;
    }
    default: {
      const keys = Object.keys(args || {});
      if (keys.length === 0) return "";
      const entries = Object.entries(args)
        .slice(0, 2)
        .map(([k, v]) => {
          const val = typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "";
          if (!val) return k;
          const short = val.length > 20 ? val.slice(0, 20) + "…" : val;
          return `${k}: ${short}`;
        })
        .join(", ");
      const more = keys.length > 2 ? ` +${keys.length - 2}` : "";
      return (entries + more).slice(0, 60);
    }
  }
}

function getResultSummary(toolName: string, result: ToolResultData, l: Record<string, string>): string {
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
    case "request_approval": return text || l.resWaiting;
    case "ask_question": return text || l.resWaiting;
    case "render_images": return l.resRendered;
    case "render_html": return l.resRendered;
    case "render_chart": return l.resRendered;
    case "share_file": return l.resShared;
    case "refresh_ui": return l.resRefreshed;
    case "create_experiment": return "creado/actualizado";
    case "spawn_subagent": return l.resCompleted;
    case "delegate_task": return l.resCompleted;
    case "exa_search": {
      const n = result.details?.totalResults ?? 0;
      return `${n} ${n !== 1 ? l.resExaResults : l.resExaResult}`;
    }
    case "web_fetch": {
      const title = result.details?.title || "";
      return title ? `"${title}"` : l.resCompleted;
    }
    case "memory_recall": {
      const n = result.details?.count ?? 0;
      return `${n} ${n !== 1 ? l.resMemories : l.resMemory}`;
    }
    case "memory_store": return l.resStored;
    case "memory_forget": return l.resForgotten;
    case "decompose_tasks": return l.resDecomposed;
    default: {
      const details = result.details as any;
      if (details?.ui) return "ui";
      if (details?.stepLogs) return `${details.stepLogs.length} steps`;
      return "done";
    }
  }
}

function ToolBody({
  toolName,
  args,
  result,
  toolCallId,
  sessionId,
  activeProjectName,
  activeAgentId,
  activeChannelId,
  onOpenSubagentConsole,
  l,
}: {
  toolName: string;
  args: Record<string, unknown>;
  result: ToolResultData | null;
  toolCallId?: string;
  sessionId?: string | null;
  activeProjectName?: string | null;
  activeAgentId?: string | null;
  activeChannelId?: string | null;
  onOpenSubagentConsole?: (toolCallId: string, targetType?: string, targetId?: string) => void;
  l: Record<string, string>;
}) {
  const text = result?.content.find(b => b.type === "text")?.text ?? "";

  switch (toolName) {
    case "decompose_tasks":
      return <DecomposeResult text={text} details={result?.details} l={l} />;
    case "create_experiment": {
      const details = result?.details as any;
      const expId = details?.experimentId || args.experimentId;
      const expName = details?.name || args.name || "Experimento";
      const agentsCount = details?.agentsCount || (Array.isArray(args.agents) ? args.agents.length : 0);
      const crit = details?.criteria || args.criteria || [];

      return (
        <div className="flex flex-col gap-3 p-4 rounded-xl bg-surface border border-border/80 shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold">Experimento Multi-Agente</span>
              <h4 className="text-sm font-bold text-text-primary">{expName}</h4>
            </div>
            {expId && (
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("select-lab-experiment", { detail: { id: expId } }));
                }}
                className="px-3 py-1.5 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
              >
                Ver Configuración
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="flex flex-col gap-1 p-2 rounded-lg bg-bg/50 border border-border/30">
              <span className="text-text-secondary font-medium">Agentes Configuradores</span>
              <span className="text-sm font-bold text-text-primary">{agentsCount} agentes</span>
            </div>
            <div className="flex flex-col gap-1 p-2 rounded-lg bg-bg/50 border border-border/30">
              <span className="text-text-secondary font-medium">Criterios de Evaluación</span>
              <span className="text-sm font-bold text-text-primary whitespace-nowrap overflow-hidden text-ellipsis">
                {Array.isArray(crit) ? crit.join(", ") : "-"}
              </span>
            </div>
          </div>
        </div>
      );
    }
    case "spawn_subagent": {
      const task = (args.task as string) || "";
      return (
        <div className="p-1.5 rounded-lg bg-surface border border-border">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-primary truncate">
              {task}
            </span>
            {onOpenSubagentConsole && (
              <button
                onClick={() => onOpenSubagentConsole(encodeURIComponent(toolCallId || ""))}
                className="shrink-0 text-xs text-text-primary hover:text-accent transition-colors cursor-pointer underline underline-offset-2"
              >
                {l.bodySubagentView}
              </button>
            )}
          </div>
        </div>
      );
    }
    case "delegate_task":
      return (
        <div className="flex items-center justify-between p-1.5 rounded-lg bg-surface border border-border">
          <span className="text-xs font-semibold text-text-primary">
            {l.bodyDelegationTo} {String(args.targetType)}: <span className="text-primary font-mono font-normal">{String(args.targetId)}</span>
          </span>
          {onOpenSubagentConsole && (
            <button
              onClick={() => onOpenSubagentConsole(encodeURIComponent(toolCallId || ""), String(args.targetType || ""), String(args.targetId || ""))}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 font-semibold text-xs transition-opacity cursor-pointer shadow-xs select-none ring-2 ring-primary/30"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
              {l.bodyViewLiveConsole}
            </button>
          )}
        </div>
      );
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
          activeProjectName={activeProjectName}
          activeAgentId={activeAgentId}
          activeChannelId={activeChannelId}
        />
      );
    case "generate_image":
      return (
        <div className="flex flex-col gap-2">
          {text && (
            <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-words bg-bg p-3 rounded-md border border-border/40 max-h-48 overflow-y-auto">
              {text}
            </pre>
          )}
          {(result?.details as any)?.images && (
            <ImageGrid
              images={((result?.details as any)?.images as any) || []}
              sessionId={sessionId || null}
              activeProjectName={activeProjectName}
              activeAgentId={activeAgentId}
              activeChannelId={activeChannelId}
            />
          )}
        </div>
      );
    case "render_html":
      return (
        <HtmlPreview
          html={(args.html as string) || ""}
          title={args.title as string | undefined}
          fullBleed
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
    case "share_file":
      return (
        <ShareFileCard
          filePath={(args.filePath as string) || ""}
          title={args.title as string | undefined}
          sessionId={sessionId || null}
          activeProjectName={activeProjectName}
          activeAgentId={activeAgentId}
          activeChannelId={activeChannelId}
        />
      );
    case "refresh_ui":
      return (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-bg border border-primary/30 text-primary-foreground text-xs font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span>{l.bodyWorkspaceRefreshed}{String(args.entityType)}</span>
        </div>
      );
    case "exa_search":
      return <ExaSearchResult text={text} details={result?.details} l={l} />;
    case "web_fetch":
      return <WebFetchResult text={text} details={result?.details} l={l} />;
    case "memory_recall":
      return <MemoryResult mode="recall" details={result?.details} l={l} />;
    case "memory_store":
      return <MemoryResult mode="store" args={args} details={result?.details} l={l} />;
    case "memory_forget":
      return <MemoryResult mode="forget" details={result?.details} l={l} />;
    case "manage_custom_tools":
      return (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-bg border border-primary/30 text-xs font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          <span>{text || "Custom tools metadata updated"}</span>
        </div>
      );
    default: {
      const uiDef = (result?.details as any)?.ui || (args as any)?.ui;
      if (uiDef) {
        const presentation = (result?.details as any)?.presentation || (args as any)?.presentation;
        return <CustomToolBody ui={uiDef} presentation={presentation} sessionId={sessionId || null} />;
      }
      return (
        <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-words bg-muted p-3 rounded-md max-h-48 overflow-y-auto">
          {text}
        </pre>
      );
    }
  }
}

export function ToolCallRow({
  toolName,
  args,
  result,
  sessionId: _sessionId,
  toolCallId,
  activeProjectName: _activeProjectName,
  activeAgentId: _activeAgentId = null,
  activeChannelId: _activeChannelId = null,
  disabled = false,
  serialTools = ["request_approval", "ask_question"],
  onOpenSubagentConsole,
}: Props) {
  const l = useLiterals(literals);
  const isInteractive = serialTools.includes(toolName) || toolName === "spawn_subagent" || toolName === "delegate_task";

  const [partialResult, setPartialResult] = useState<any>(null);

  useEffect(() => {
    if (!toolCallId || result !== null) return;

    const handleUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.partialResult) {
        setPartialResult(detail.partialResult);
      }
    };

    window.addEventListener(`tool-update-${toolCallId}`, handleUpdate);
    return () => {
      window.removeEventListener(`tool-update-${toolCallId}`, handleUpdate);
    };
  }, [toolCallId, result]);

  const resultPresentation = (result?.details as any)?.presentation;
  const isCustomTool = ![
    "read", "write", "edit", "bash", "grep", "find", "ls",
    "request_approval", "ask_question", "render_images", "render_html", "render_chart",
    "share_file", "refresh_ui", "spawn_subagent", "delegate_task",
    "exa_search", "web_fetch", "decompose_tasks", "update_task_status", "complete_task_list",
    "memory_store", "memory_recall", "memory_forget", "create_experiment",
    "vision", "generate_image", "manage_factory", "manage_custom_tools"
  ].includes(toolName) && !toolName.startsWith("mcp_");

  const [expanded, setExpanded] = useState(() => {
    if (disabled) return false;
    if (resultPresentation?.defaultExpanded !== undefined) {
      return !!resultPresentation.defaultExpanded;
    }
    if (isCustomTool) {
      return true;
    }
    return (
      toolName === "edit" ||
      toolName === "bash" ||
      toolName === "request_approval" ||
      toolName === "ask_question" ||
      toolName === "render_images" ||
      toolName === "render_html" ||
      toolName === "render_chart" ||
      toolName === "share_file" ||
      toolName === "spawn_subagent" ||
      toolName === "delegate_task" ||
      toolName === "exa_search" ||
      toolName === "web_fetch" ||
      toolName === "memory_recall" ||
      toolName === "memory_store"
    );
  });

  const hasUiDetails = (result?.details as any)?.ui || (args as any)?.ui;
  const meta = TOOL_META[toolName] ?? {
    label: toolName,
    colorClass: "text-accent",
    icon: hasUiDetails ? (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ) : (
      <span className="w-3 h-3 rounded-full bg-text-secondary/30" />
    ),
  };

  const getToolLabel = (name: string): string => {
    switch (name) {
      case "request_approval": return l.labelApproval;
      case "ask_question": return l.labelQuestion;
      case "render_images": return l.labelImages;
      case "render_html": return l.labelHtml;
      case "render_chart": return l.labelChart;
      case "refresh_ui": return l.labelRefresh;
      case "spawn_subagent": return l.labelSubagent;
      case "delegate_task": return l.labelDelegation;
      case "exa_search": return l.labelExaSearch;
      case "web_fetch": return l.labelWebFetch;
      case "memory_recall":
      case "memory_store":
      case "memory_forget": return l.labelMemory;
      case "manage_custom_tools": return l.labelManageCustomTools;
      default: return name;
    }
  };

  const labelText = meta.label === toolName ? getToolLabel(toolName) : meta.label;

  const running = result === null;
  const activeResult = result || (partialResult ? {
    toolName,
    content: [{ type: "text", text: typeof partialResult === "string" ? partialResult : (partialResult.output || partialResult.text || JSON.stringify(partialResult)) }],
    isError: false,
    details: partialResult.details || partialResult,
  } : null);
  const hasError = result?.isError ?? false;
  const argSummary = getArgSummary(toolName, args, l);
  const resultSummary = activeResult ? getResultSummary(toolName, activeResult, l) : "";
  const isFullBleed = toolName === "render_html" || toolName === "render_chart";

  return (
    <div className={`my-1.5 rounded-lg border overflow-hidden transition-all ${disabled ? "border-input/30 bg-card/25 opacity-60 select-none pointer-events-none" :
        hasError ? "border-error/40 bg-destructive/5" : "border-input bg-card/50"
      }`}>
      <button
        onClick={() => !disabled && setExpanded(!expanded)}
        disabled={disabled}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-card-hover/40 transition-colors text-left cursor-pointer disabled:cursor-default"
      >
        <span className={`flex-shrink-0 ${meta.colorClass}`}>{meta.icon}</span>

        <span className={`font-mono font-bold text-xs flex-shrink-0 ${meta.colorClass}`}>
          {labelText}
        </span>

        {toolName === "spawn_subagent" && (
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-secondary bg-surface-hover px-1.5 py-0.5 rounded flex-shrink-0">
            {(args.subagentType as string) || "builder"}
          </span>
        )}

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
              <span className="flex items-center gap-1.5 text-xs text-warning">
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

      {(!running || isInteractive || partialResult !== null) && expanded && (
        <div className={`border-t border-border bg-card-hover/20 ${isFullBleed ? "p-0" : "p-3"}`}>
          <ToolBody
            toolName={toolName}
            args={args}
            result={activeResult}
            toolCallId={toolCallId}
            sessionId={_sessionId}
            activeProjectName={_activeProjectName}
            activeAgentId={_activeAgentId}
            activeChannelId={_activeChannelId}
            onOpenSubagentConsole={onOpenSubagentConsole}
            l={l}
          />
        </div>
      )}
    </div>
  );
}
