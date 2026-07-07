import { type FC } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { useLiterals } from "@/lib";
import { literals as u } from "./MessageList.literals";
import { ToolCallRow, type ToolResultData } from "./tools/ToolCallRow";
import { resolveFileUrl, getFileType, type MediaType } from "./ToolResultInspector";
import { AgentAvatar } from "@/components/shared/AgentAvatar";
import { ImageGrid } from "./ImageGrid";
import { ThinkingBlock, AssistantTextBlock } from "./MessageBlocks";

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

interface MessageUsage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
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
  usage?: MessageUsage;
  stopReason?: string;
  timestamp?: number;
  responseId?: string;
  id?: string;
  parentId?: string | null;
  siblings?: string[];
  details?: {
    diff?: string;
    patch?: string;
    firstChangedLine?: number;
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
  onOpenSubagentConsole?: (toolCallId: string, task: string, role?: string) => void;
}

type RenderGroup =
  | { type: "user"; msg: Message }
  | { type: "agent"; messages: Message[] };

function buildGroups(messages: Message[]): RenderGroup[] {
  const groups: RenderGroup[] = [];
  let agentBuf: Message[] = [];

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
    } else {
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
  onOpenSubagentConsole?: (toolCallId: string, task: string, role?: string) => void;
}) {
  const toolResultMap = new Map<string, Message>();
  for (const m of messages) {
    if (m.role === "toolResult" && m.toolCallId) {
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

  return (
    <div className="flex flex-col gap-2">
      <AgentAvatar
        name={activeAgentName || "Agent"}
        avatarUrl={activeAgentAvatarUrl}
        size="sm"
      />

      <div className="flex-1 min-w-0 space-y-0.5">
        {assistantMessages.map((msg, msgIdx) => {
          const blocks = Array.isArray(msg.content) ? msg.content : [];
          const isLast = msgIdx === assistantMessages.length - 1;
          const isStreaming = !!msg.isStreaming;

          return (
            <div key={msgIdx}>
              {blocks.map((block, i) => {
                if (block.type === "thinking" && block.thinking) {
                  return <ThinkingBlock key={i} thinking={block.thinking} />;
                }
                if (block.type === "text" && block.text) {
                  return (
                    <div key={i} className="text-foreground text-sm leading-relaxed">
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

              {isLast && (msg.provider || msg.model || msg.usage) && !isStreaming && (
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
          <div className="bg-primary text-background rounded-2xl rounded-tr-md px-4 py-2.5 shadow-sm text-right w-fit">
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words font-sans text-left">{cleanText}</p>
            {msg.isError && (
              <div className="mt-1.5 text-xs text-background/80">Error sending message</div>
            )}
          </div>
        )}
        
        {images.length > 0 && (
          <div className="max-w-[400px] w-full">
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
        <BranchNav msg={msg} onNavigate={onNavigate} />
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
              <UserBubble
                msg={group.msg}
                onNavigate={onNavigate}
                sessionId={sessionId}
                activeProjectName={activeProjectName}
                activeAgentId={activeAgentId}
                activeChannelId={activeChannelId}
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
