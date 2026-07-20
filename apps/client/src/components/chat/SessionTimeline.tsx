import { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronUp,
  Play,
  User,
  Brain,
  Wrench,
  Bot,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";

interface Milestone {
  id: string;
  type: "create" | "user_prompt" | "thinking" | "tool_call" | "assistant_response";
  timestamp: string;
  title: string;
  subtitle?: string;
  content?: string | any;
  status?: "success" | "error" | "pending";
  durationMs?: number;
}

interface SessionTimelineProps {
  messages: any[];
  sessionCreatedAt?: string;
}

export function SessionTimeline({ messages, sessionCreatedAt }: SessionTimelineProps) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const milestones = useMemo(() => {
    const list: Milestone[] = [];

    if (sessionCreatedAt) {
      list.push({
        id: "session-create",
        type: "create",
        timestamp: sessionCreatedAt,
        title: "Session Started",
        subtitle: "Session workspace and database context initialized",
      });
    }

    // Keep track of tool result statuses
    const toolResults = new Map<string, { content: any; isError?: boolean }>();
    for (const msg of messages) {
      if (msg.role === "toolResult" && msg.toolCallId) {
        toolResults.set(msg.toolCallId, {
          content: msg.content,
          isError: msg.isError,
        });
      }
    }

    for (let index = 0; index < messages.length; index++) {
      const msg = messages[index];
      const timestamp = msg.timestamp || msg.createdAt || new Date().toISOString();
      const uniqueId = msg.id || `msg-${index}`;

      if (msg.role === "user") {
        list.push({
          id: uniqueId,
          type: "user_prompt",
          timestamp,
          title: "User Prompt",
          content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
        });
      } else if (msg.role === "assistant") {
        const content = msg.content;
        const agentName = msg.agentName || "Assistant";

        if (typeof content === "string") {
          list.push({
            id: uniqueId,
            type: "assistant_response",
            timestamp,
            title: `Agent Response (${agentName})`,
            content,
          });
        } else if (Array.isArray(content)) {
          content.forEach((block, bIdx) => {
            const blockId = `${uniqueId}-${bIdx}`;
            if (block.type === "thinking" && block.thinking) {
              list.push({
                id: blockId,
                type: "thinking",
                timestamp,
                title: `${agentName} Thought Process`,
                content: block.thinking,
              });
            } else if (block.type === "toolCall") {
              const res = toolResults.get(block.id);
              const status = res ? (res.isError ? "error" : "success") : "pending";
              list.push({
                id: block.id || blockId,
                type: "tool_call",
                timestamp,
                title: `Execute Tool: ${block.name}`,
                subtitle: `Call ID: ${block.id || "N/A"}`,
                status,
                content: {
                  arguments: block.arguments,
                  result: res?.content,
                },
                durationMs: block.durationMs,
              });
            } else if (block.type === "text" && block.text) {
              list.push({
                id: blockId,
                type: "assistant_response",
                timestamp,
                title: `Agent Response (${agentName})`,
                content: block.text,
              });
            }
          });
        }
      }
    }

    return list;
  }, [messages, sessionCreatedAt]);

  const formatTimestamp = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "";
    }
  };

  const getMilestoneStyle = (type: Milestone["type"]) => {
    switch (type) {
      case "create":
        return {
          icon: <Play className="w-3.5 h-3.5 text-blue-400" />,
          color: "border-blue-500/20 bg-blue-950/40 text-blue-400",
        };
      case "user_prompt":
        return {
          icon: <User className="w-3.5 h-3.5 text-emerald-400" />,
          color: "border-emerald-500/20 bg-emerald-950/40 text-emerald-400",
        };
      case "thinking":
        return {
          icon: <Brain className="w-3.5 h-3.5 text-purple-400" />,
          color: "border-purple-500/20 bg-purple-950/40 text-purple-400",
        };
      case "tool_call":
        return {
          icon: <Wrench className="w-3.5 h-3.5 text-amber-400" />,
          color: "border-amber-500/20 bg-amber-950/40 text-amber-400",
        };
      case "assistant_response":
        return {
          icon: <Bot className="w-3.5 h-3.5 text-blue-400" />,
          color: "border-blue-500/20 bg-blue-950/40 text-blue-400",
        };
    }
  };

  return (
    <div className="relative pl-6 space-y-6 before:absolute before:left-0 before:top-8 before:bottom-2 before:w-0.5 before:bg-border/30 max-w-3xl mx-auto py-4">
      {milestones.map((m) => {
        const style = getMilestoneStyle(m.type);
        const isExpanded = !!expandedIds[m.id];
        const hasContent = m.content !== undefined && m.content !== null;

        return (
          <div key={m.id} className="relative group animate-fade-in">
            {/* Timeline point */}
            <div
              className={`absolute -left-9.5 top-1.5 w-7 h-7 rounded-full border flex items-center justify-center transition-all group-hover:scale-105 shadow-md ${style?.color}`}
            >
              {style?.icon}
            </div>

            {/* Content card */}
            <div
              className={`bg-card border border-input/60 rounded-xl p-4 transition-all hover:border-input/100 ${
                isExpanded ? "shadow-md" : "shadow-sm"
              }`}
            >
              {/* Header */}
              <div
                className={`flex items-start justify-between gap-3 ${hasContent ? "cursor-pointer" : ""}`}
                onClick={() => hasContent && toggleExpand(m.id)}
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-xs text-foreground tracking-tight">{m.title}</span>
                    {m.status && (
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md uppercase flex items-center gap-1 ${
                          m.status === "success"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15"
                            : m.status === "error"
                            ? "bg-rose-500/10 text-rose-400 border border-rose-500/15"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/15"
                        }`}
                      >
                        {m.status === "success" && <CheckCircle size={10} />}
                        {m.status === "error" && <XCircle size={10} />}
                        {m.status === "pending" && <Clock size={10} />}
                        {m.status}
                      </span>
                    )}
                    {m.durationMs !== undefined && (
                      <span className="text-[10px] text-muted-foreground bg-card-hover px-1.5 py-0.2 rounded-md font-semibold">
                        {(m.durationMs / 1000).toFixed(2)}s
                      </span>
                    )}
                  </div>
                  {m.subtitle && (
                    <p className="text-[10px] text-muted-foreground font-medium truncate">{m.subtitle}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-semibold text-muted-foreground/80 font-mono">
                    {formatTimestamp(m.timestamp)}
                  </span>
                  {hasContent && (
                    <span className="text-muted-foreground">
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>
                  )}
                </div>
              </div>

              {/* Expansible Content */}
              {hasContent && isExpanded && (
                <div className="mt-3 pt-3 border-t border-input/40 text-xs text-muted-foreground leading-relaxed animate-slide-down">
                  {m.type === "tool_call" && typeof m.content === "object" ? (
                    <div className="space-y-3 font-mono text-[11px]">
                      <div>
                        <div className="text-[10px] uppercase font-bold text-muted-foreground/60 mb-1">
                          Arguments
                        </div>
                        <pre className="bg-background/50 border border-input/40 rounded-lg p-2.5 overflow-x-auto text-[10px]">
                          {JSON.stringify(m.content.arguments, null, 2)}
                        </pre>
                      </div>
                      {m.content.result !== undefined && (
                        <div>
                          <div className="text-[10px] uppercase font-bold text-muted-foreground/60 mb-1">
                            Result Output
                          </div>
                          <pre
                            className={`border rounded-lg p-2.5 overflow-x-auto max-h-48 text-[10px] ${
                              m.status === "error"
                                ? "bg-rose-950/15 border-rose-500/20 text-rose-300"
                                : "bg-background/50 border-input/40 text-muted-foreground"
                            }`}
                          >
                            {typeof m.content.result === "string"
                              ? m.content.result
                              : JSON.stringify(m.content.result, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : m.type === "thinking" ? (
                    <div className="bg-purple-950/5 border border-purple-500/10 rounded-lg p-3 italic text-muted-foreground/90 font-sans">
                      {m.content}
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap font-sans bg-background/25 border border-input/30 rounded-lg p-3">
                      {m.content}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
