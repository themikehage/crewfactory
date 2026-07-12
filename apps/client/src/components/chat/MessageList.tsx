import { type FC } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { useLiterals, type MessageUsage } from "@/lib";
import { literals as u } from "./MessageList.literals";
import { ToolCallRow, type ToolResultData } from "./tools/ToolCallRow";
import { resolveFileUrl, getFileType, type MediaType } from "./ToolResultInspector";
import { AgentAvatar } from "@/components/shared/AgentAvatar";
import { ImageGrid } from "./ImageGrid";
import { ThinkingBlock, AssistantTextBlock } from "./MessageBlocks";
import { DELEGATION_NOTIFICATION_TYPE } from "shared";

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return time;
  const sameYear = d.getFullYear() === now.getFullYear();
  const month = d.toLocaleString([], { month: "short", day: "numeric" });
  return sameYear ? `${month}, ${time}` : `${month}, ${d.getFullYear()}, ${time}`;
}

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  thinkingSignature?: string;
  name?: string;
  id?: string;
  arguments?: Record<string, unknown>;
  data?: string;
  mimeType?: string;
  image?: { url: string; title?: string };
}

interface Message {
  role: string;
  content: string | ContentBlock[] | ContentBlock;
  toolName?: string;
  toolCallId?: string;
  isError?: boolean;
  isStreaming?: boolean;
  api?: string;
  provider?: string;
  model?: string;
  agentName?: string;
  agentAvatarUrl?: string;
  usage?: MessageUsage;
  stopReason?: string;
  timestamp?: number;
  responseId?: string;
  id?: string;
  parentId?: string | null;
  siblings?: string[];
  args?: Record<string, any>;
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
  };
}

interface Props {
  messages: Message[];
  onNavigate?: (id: string) => void;
  sessionId: string | null;
  activeProjectName?: string | null;
  activeAgentId?: string | null;
  activeAgentName?: string | null;
  activeAgentAvatarUrl?: string | null;
  activeChannelId?: string | null;
  serialTools?: string[];
  onOpenSubagentConsole?: (toolCallId: string) => void;
  settledApprovals?: Record<string, "confirm" | "deny">;
  onResolveApproval?: (toolCallId: string, action: "confirm" | "deny") => void;
}

type RenderGroup =
  | { type: "user"; msg: Message }
  | { type: "system"; msg: Message }
  | { type: "tool_approval_request"; msg: Message }
  | { type: "agent"; messages: Message[] };

function buildGroups(messages: Message[]): RenderGroup[] {
  const groups: RenderGroup[] = [];
  let agentBuf: Message[] = [];
  let currentAgentName: string | undefined = undefined;

  const flush = () => {
    if (agentBuf.length > 0) {
      groups.push({ type: "agent", messages: agentBuf });
      agentBuf = [];
    }
  };

  for (const msg of messages) {
    if (msg.role === "user") {
      flush();
      groups.push({ type: "user", msg });
      currentAgentName = undefined;
    } else if (msg.role === "system") {
      flush();
      groups.push({ type: "system", msg });
      currentAgentName = undefined;
    } else if (msg.role === "tool_approval_request") {
      flush();
      groups.push({ type: "tool_approval_request", msg });
      currentAgentName = undefined;
    } else {
      const msgAgentName = msg.agentName || msg.model || undefined;
      if (msg.role === "assistant" && currentAgentName !== undefined && currentAgentName !== msgAgentName) {
        flush();
      }
      if (msg.role === "assistant") {
        currentAgentName = msgAgentName;
      }
      agentBuf.push(msg);
    }
  }
  flush();
  return groups;
}

function BranchNav({ msg, onNavigate }: { msg: Message; onNavigate?: (id: string) => void }) {
  const l = useLiterals(u);
  if (!msg.siblings || msg.siblings.length <= 1 || !msg.id || !onNavigate) return null;
  const idx = msg.siblings.indexOf(msg.id);
  return (
    <div className={clsx(
      "flex items-center gap-1.5 mt-2 pt-1.5 border-t select-none text-xs font-mono",
      msg.role === "user" ? "border-bg/10 text-background/80" : "border-input/30 text-muted-foreground"
    )}>
      <button
        onClick={() => { const i = msg.siblings!.indexOf(msg.id!); if (i > 0) onNavigate(msg.siblings![i - 1]); }}
        disabled={idx === 0}
        className={clsx("p-0.5 rounded transition-colors cursor-pointer", idx > 0 ? (msg.role === "user" ? "hover:bg-background/10 hover:text-background text-background/80" : "hover:bg-card-hover hover:text-foreground text-muted-foreground/80") : "opacity-30 cursor-not-allowed")}
        title={l.prevVersion}
      >←</button>
      <span>{idx + 1} / {msg.siblings.length}</span>
      <button
        onClick={() => { const i = msg.siblings!.indexOf(msg.id!); if (i < msg.siblings!.length - 1) onNavigate(msg.siblings![i + 1]); }}
        disabled={idx === msg.siblings.length - 1}
        className={clsx("p-0.5 rounded transition-colors cursor-pointer", idx < msg.siblings.length - 1 ? (msg.role === "user" ? "hover:bg-background/10 hover:text-background text-background/80" : "hover:bg-card-hover hover:text-foreground text-muted-foreground/80") : "opacity-30 cursor-not-allowed")}
        title={l.nextVersion}
      >→</button>
    </div>
  );
}

function AgentTurn({
  messages,
  sessionId,
  onNavigate,
  activeProjectName,
  activeAgentId,
  activeAgentName,
  activeAgentAvatarUrl,
  activeChannelId,
  serialTools = [],
  onOpenSubagentConsole,
}: {
  messages: Message[];
  sessionId: string | null;
  onNavigate?: (id: string) => void;
  activeProjectName?: string | null;
  activeAgentId?: string | null;
  activeAgentName?: string | null;
  activeAgentAvatarUrl?: string | null;
  activeChannelId?: string | null;
  serialTools?: string[];
  onOpenSubagentConsole?: (toolCallId: string) => void;
}) {
  const toolResultMap = new Map<string, Message>();
  for (const m of messages) {
    if ((m.role === "toolResult" || m.role === "tool_result") && m.toolCallId) {
      toolResultMap.set(m.toolCallId, m);
    }
  }

  const assistantMessages = messages.filter(m => m.role === "assistant");
  const lastAssistant = assistantMessages[assistantMessages.length - 1];

  // Encontrar todas las herramientas de flujo interactivo/serie pendientes de respuesta en este turno
  const pendingInteractiveIds: string[] = [];
  for (const msg of assistantMessages) {
    const blocks = Array.isArray(msg.content) ? msg.content : [];
    for (const block of blocks) {
      if (block.type === "toolCall" && block.name && block.id) {
        const isInteractive = serialTools.includes(block.name);
        const hasResult = toolResultMap.has(block.id);
        if (isInteractive && !hasResult) {
          pendingInteractiveIds.push(block.id);
        }
      }
    }
  }

  const firstAssistant = assistantMessages[0];
  const displayName = firstAssistant?.agentName || firstAssistant?.model || activeAgentName || "Agent";
  const displayAvatar = firstAssistant?.agentAvatarUrl || activeAgentAvatarUrl;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <AgentAvatar
          name={displayName}
          avatarUrl={displayAvatar}
          size="sm"
        />
        <span className="text-xs font-semibold text-foreground truncate">
          {displayName}
        </span>
        {firstAssistant?.timestamp && (
          <span className="text-xs text-muted-foreground font-mono shrink-0">
            {formatTimestamp(firstAssistant.timestamp)}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-0.5">
        {assistantMessages.map((msg, msgIdx) => {
          const blocks = Array.isArray(msg.content) ? msg.content : [];
          const isLast = msgIdx === assistantMessages.length - 1;
          const isStreaming = !!msg.isStreaming;

          return (
            <div key={msgIdx}>
              {blocks.map((block, i) => {
                if (block.type === "thinking" && block.thinking) {
                  return <ThinkingBlock key={i} thinking={block.thinking} isStreaming={isStreaming} />;
                }
                if (block.type === "text" && block.text) {
                  return (
                    <div key={i} className="text-foreground text-base md:text-sm leading-relaxed break-word">
                      <AssistantTextBlock
                        text={block.text}
                        sessionId={sessionId}
                        activeProjectName={activeProjectName}
                        activeAgentId={activeAgentId}
                        activeChannelId={activeChannelId}
                      />
                    </div>
                  );
                }
                if (block.type === "toolCall" && block.name && block.id) {
                  const matchedResult = toolResultMap.get(block.id);
                  const resultData: ToolResultData | null = matchedResult
                    ? {
                        toolName: matchedResult.toolName ?? block.name,
                        content: Array.isArray(matchedResult.content)
                          ? (matchedResult.content as Array<{ type: string; text?: string; data?: string; mimeType?: string }>)
                          : [{ type: "text", text: String(matchedResult.content) }],
                        isError: matchedResult.isError ?? false,
                        details: matchedResult.details,
                      }
                    : null;

                  const isPending = pendingInteractiveIds.includes(block.id);
                  const isFirstPending = pendingInteractiveIds[0] === block.id;
                  const disabled = isPending && !isFirstPending;

                  return (
                    <ToolCallRow
                      key={i}
                      toolName={block.name}
                      args={block.arguments ?? {}}
                      result={resultData}
                      sessionId={sessionId}
                      toolCallId={block.id}
                      activeProjectName={activeProjectName}
                      activeAgentId={activeAgentId}
                      activeChannelId={activeChannelId}
                      disabled={disabled}
                      serialTools={serialTools}
                      onOpenSubagentConsole={onOpenSubagentConsole}
                    />
                  );
                }
                return null;
              })}

              {isLast && isStreaming && (
                <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse rounded-sm" />
              )}

              {(msg.provider || msg.model || msg.usage || msg.timestamp) && !isStreaming && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-2 text-xs text-muted-foreground font-mono">
                  {msg.provider && <span>provider: <span className="text-muted-foreground">{msg.provider}</span></span>}
                  {msg.model && <span>• model: <span className="text-muted-foreground">{msg.model}</span></span>}
                  {msg.usage && (
                    <>
                      <span>• tokens: <span className="text-muted-foreground">{msg.usage.totalTokens ?? (msg.usage.input + msg.usage.output)}</span></span>
                      {typeof msg.usage.cost?.total === "number" && (
                        <span>• cost: <span className="text-muted-foreground">${msg.usage.cost.total.toFixed(6)}</span></span>
                      )}
                    </>
                  )}
                  {msg.timestamp && (
                    <span>• <span className="text-muted-foreground">{formatTimestamp(msg.timestamp)}</span></span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {lastAssistant && <BranchNav msg={lastAssistant} onNavigate={onNavigate} />}
      </div>
    </div>
  );
}

interface UserAttachment {
  path: string;
  name: string;
  type: MediaType;
}

function extractUserAttachments(text: string): UserAttachment[] {
  const attachments: UserAttachment[] = [];
  const regex = /\[Attached File:\s*([^\n\]]+)\]/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const path = match[1].trim();
    const name = path.split(/[\\/]/).pop() || "file";
    attachments.push({
      path,
      name,
      type: getFileType(path),
    });
  }
  return attachments;
}

function cleanUserMessageText(text: string): string {
  return text.replace(/\[Attached File:\s*([^\n\]]+)\]\s*\([^\n)]+\)/gi, "").trim();
}

function DelegationNotification({ msg }: { msg: Message }) {
  const d = msg.details;
  if (!d || d.type !== DELEGATION_NOTIFICATION_TYPE) return null;

  const borderColors: Record<string, string> = {
    success: "border-l-green-500/60",
    error: "border-l-red-500/60",
    blocked: "border-l-yellow-500/60",
    partial: "border-l-yellow-500/60",
  };
  const dotColors: Record<string, string> = {
    success: "bg-green-500",
    error: "bg-red-500",
    blocked: "bg-yellow-500",
    partial: "bg-yellow-500",
  };
  const statusLabels: Record<string, string> = {
    success: "Completed",
    error: "Error",
    blocked: "Blocked",
    partial: "Partial",
  };

  const status = (d.status as string) || "success";
  const borderColor = borderColors[status] || "border-l-accent/60";
  const dotColor = dotColors[status] || "bg-accent";
  const statusLabel = statusLabels[status] || status;
  const summary = (d as any).executiveSummary || "";
  const artifacts = (d as any).artifacts || "";
  const hasOutputText = (d as any).hasOutputText || false;
  const toolName = (d as any).toolName || "";

  const text = typeof msg.content === "string"
    ? msg.content
    : Array.isArray(msg.content)
    ? (msg.content as ContentBlock[]).map(b => b.text ?? "").join(" ")
    : "";

  const bodyLines = text.split("\n").filter(l => l.trim());
  const outputText = hasOutputText ? bodyLines.slice(1).join("\n").trim() : "";

  return (
    <div className="flex justify-start my-2 w-full">
      <div className={`bg-surface/20 border border-border/50 border-l-2 ${borderColor} text-text-secondary text-xs rounded-lg rounded-l-sm px-4 py-3 max-w-[85%] shadow-xs flex flex-col gap-2`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
          <span className="text-[10px] font-mono uppercase font-semibold tracking-wider text-text-secondary">
            {toolName} {statusLabel}
          </span>
        </div>
        {summary && (
          <p className="text-xs text-text-primary leading-relaxed line-clamp-2">{summary}</p>
        )}
        {artifacts && artifacts !== "none" && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono uppercase text-text-secondary tracking-wider">Artifacts</span>
            <span className="text-[10px] text-text-primary font-mono px-1.5 py-0.5 rounded bg-surface border border-border/50 truncate max-w-[200px]">
              {artifacts}
            </span>
          </div>
        )}
        {outputText && (
          <details className="group">
            <summary className="text-[10px] font-mono text-accent hover:text-accent-hover cursor-pointer select-none">
              View output
            </summary>
            <div className="mt-2 p-2.5 bg-bg/50 border border-border/30 rounded text-[11px] text-text-secondary leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-y-auto font-mono">
              {outputText}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function UserBubble({
  msg,
  onNavigate,
  sessionId,
  activeProjectName,
  activeAgentId = null,
  activeChannelId = null,
}: {
  msg: Message;
  onNavigate?: (id: string) => void;
  sessionId: string | null;
  activeProjectName?: string | null;
  activeAgentId?: string | null;
  activeChannelId?: string | null;
}) {
  const rawText = typeof msg.content === "string"
    ? msg.content
    : Array.isArray(msg.content)
    ? (msg.content as ContentBlock[]).map(b => b.text ?? "").join(" ")
    : "";

  const attachments = extractUserAttachments(rawText);
  const cleanText = cleanUserMessageText(rawText);

  const images = attachments.filter(a => a.type === "image");
  const nonImages = attachments.filter(a => a.type !== "image");

  const token = localStorage.getItem("token");

  return (
    <div className="flex gap-3 justify-end my-1">
      <div className="max-w-[80%] sm:max-w-[75%] space-y-2 flex flex-col items-end">
        {cleanText && (
          <div className="bg-card border border-border rounded-2xl rounded-tr-md px-4 py-2.5 shadow-sm text-right max-w-full overflow-hidden">
            <p className="text-base md:text-sm leading-relaxed whitespace-pre-wrap break-all break-word font-sans text-left">{cleanText}</p>
            {msg.isError && (
              <div className="mt-1.5 text-xs text-error">Error sending message</div>
            )}
          </div>
        )}
        
        {images.length > 0 && (
          <div className="max-w-[550px] w-full">
            <ImageGrid
              images={images.map(img => ({ url: img.path, title: img.name }))}
              sessionId={sessionId}
              activeProjectName={activeProjectName}
              activeAgentId={activeAgentId}
              activeChannelId={activeChannelId}
            />
          </div>
        )}

        {nonImages.length > 0 && (
          <div className="space-y-1.5 w-64">
            {nonImages.map((att, idx) => {
              const resolved = resolveFileUrl(att.path, sessionId, activeProjectName, activeAgentId, activeChannelId);
              const fileUrl = resolved.startsWith("/api/") && token ? `${resolved}&token=${token}` : resolved;
              return (
                <div key={idx} className="flex items-center justify-between p-2.5 bg-card border border-input rounded-lg font-sans text-left w-full">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded bg-primary/15 flex items-center justify-center text-primary text-xs font-extrabold select-none shrink-0 border border-primary/20 uppercase">
                      {att.name.split(".").pop()?.substring(0, 3) || "doc"}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[11px] font-semibold text-foreground truncate">{att.name}</span>
                      <span className="text-xs text-muted-foreground uppercase font-mono">{att.name.split(".").pop()}</span>
                    </div>
                  </div>
                  <a
                    href={fileUrl}
                    download={att.name}
                    className="px-2 py-1 text-xs font-semibold rounded bg-primary text-background hover:opacity-90 transition-opacity cursor-pointer shrink-0"
                  >
                    Download
                  </a>
                </div>
              );
            })}
          </div>
        )}
        {msg.timestamp && !msg.isStreaming && (
          <span className="text-[10px] text-muted-foreground font-mono">
            {formatTimestamp(msg.timestamp)}
          </span>
        )}
        <BranchNav msg={msg} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

function ToolApprovalCard({
  msg,
  onResolve,
  settledAction,
}: {
  msg: Message;
  onResolve?: (toolCallId: string, action: "confirm" | "deny") => void;
  settledAction?: "confirm" | "deny";
}) {
  const toolCallId = msg.toolCallId!;
  const toolName = msg.toolName || "tool";
  const reason = typeof msg.content === "string" ? msg.content : "Action requires approval";
  const args = msg.args || {};

  return (
    <div className="flex justify-start my-3 w-full">
      <div className="bg-[#171717] border border-yellow-500/30 border-l-2 border-l-yellow-500 text-text-secondary text-sm rounded-xl px-4 py-3.5 max-w-[85%] sm:max-w-[70%] shadow-lg flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse shrink-0" />
          <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-yellow-500">
            Security Permission Request
          </span>
        </div>

        <div className="space-y-1">
          <h4 className="text-text-primary font-semibold text-sm">
            Agent wants to run <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-[#121212] text-yellow-400">{toolName}</code>
          </h4>
          <p className="text-xs text-text-secondary leading-relaxed">{reason}</p>
        </div>

        {Object.keys(args).length > 0 && (
          <div className="p-2.5 bg-[#121212] border border-border/50 rounded-lg text-xs font-mono overflow-x-auto max-w-full text-text-primary">
            {toolName === "bash" && args.command ? (
              <pre className="whitespace-pre-wrap break-all text-xs text-green-400">$ {args.command}</pre>
            ) : (
              <pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(args, null, 2)}</pre>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 mt-1">
          {settledAction ? (
            <div className={`text-xs font-semibold px-3 py-1.5 rounded-lg border font-mono ${
              settledAction === "confirm"
                ? "bg-green-500/10 text-green-400 border-green-500/20"
                : "bg-red-500/10 text-red-400 border-red-500/20"
            }`}>
              {settledAction === "confirm" ? "✓ Approved" : "✗ Denied"}
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onResolve?.(toolCallId, "confirm")}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[#4ade80] text-[#121212] hover:opacity-90 active:scale-95 transition-all cursor-pointer font-sans"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => onResolve?.(toolCallId, "deny")}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[#202020] hover:bg-[#2a2a2a] text-text-primary border border-border hover:border-border-hover active:scale-95 transition-all cursor-pointer font-sans"
              >
                Deny
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export const MessageList: FC<Props> = ({
  messages,
  onNavigate,
  sessionId,
  activeProjectName,
  activeAgentId = null,
  activeAgentName = null,
  activeAgentAvatarUrl = null,
  activeChannelId = null,
  serialTools,
  onOpenSubagentConsole,
  settledApprovals,
  onResolveApproval,
}) => {
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-30">
          <path d="M4 17L10 11L4 5" />
          <path d="M12 19H20" />
        </svg>
        <p className="text-sm font-sans">Send a message to start</p>
      </div>
    );
  }

  const groups = buildGroups(messages);

  const toolResultMap = new Map<string, Message>();
  for (const m of messages) {
    if ((m.role === "toolResult" || m.role === "tool_result") && m.toolCallId) {
      toolResultMap.set(m.toolCallId, m);
    }
  }

  return (
    <div className="space-y-4">
      <AnimatePresence>
        {groups.map((group, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
          >
            {group.type === "user" ? (
              group.msg.details?.type === DELEGATION_NOTIFICATION_TYPE ? (
                <DelegationNotification msg={group.msg} />
              ) : (
                <UserBubble
                  msg={group.msg}
                  onNavigate={onNavigate}
                  sessionId={sessionId}
                  activeProjectName={activeProjectName}
                  activeAgentId={activeAgentId}
                  activeChannelId={activeChannelId}
                />
              )
            ) : group.type === "system" ? (
              <div className="flex justify-center my-2 w-full">
                <div className="bg-card/30 border border-input/40 text-muted-foreground text-xs px-4 py-2 rounded-full max-w-[85%] text-center font-medium shadow-xs">
                  {typeof group.msg.content === "string" ? group.msg.content : ""}
                </div>
              </div>
            ) : group.type === "tool_approval_request" ? (
              <ToolApprovalCard
                msg={group.msg}
                onResolve={onResolveApproval}
                settledAction={
                  (group.msg.toolCallId && toolResultMap.has(group.msg.toolCallId))
                    ? (
                        (
                          typeof toolResultMap.get(group.msg.toolCallId!)?.content === "string" &&
                          (toolResultMap.get(group.msg.toolCallId!)?.content as string).includes("[Permission Denied]")
                        ) || (
                          Array.isArray(toolResultMap.get(group.msg.toolCallId!)?.content) &&
                          (toolResultMap.get(group.msg.toolCallId!)?.content as any[]).some(c => c.text && c.text.includes("[Permission Denied]"))
                        ) ? "deny" : "confirm"
                      )
                    : (group.msg.toolCallId ? settledApprovals?.[group.msg.toolCallId] : undefined)
                }
              />
            ) : (
              <AgentTurn
                messages={group.messages}
                sessionId={sessionId}
                onNavigate={onNavigate}
                activeProjectName={activeProjectName}
                activeAgentId={activeAgentId}
                activeAgentName={activeAgentName}
                activeAgentAvatarUrl={activeAgentAvatarUrl}
                activeChannelId={activeChannelId}
                serialTools={serialTools}
                onOpenSubagentConsole={onOpenSubagentConsole}
              />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
