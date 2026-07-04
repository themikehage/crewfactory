import { type FC, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { RichMarkdown } from "./RichMarkdown";
import { ToolCallRow, type ToolResultData } from "./tools/ToolCallRow";
import { resolveFileUrl, extractFileMarkers, isHtml, HtmlFileFetcher, getFileType, type MediaType } from "./ToolResultInspector";
import { HtmlPreview } from "./HtmlPreview";
import { ImageGrid } from "./ImageGrid";

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
  onNavigate?: (targetId: string) => void;
  sessionId: string | null;
  activeRepoName?: string | null;
  activeAgentId?: string | null;
  activeChannelId?: string | null;
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

function ThinkingBlock({ thinking }: { thinking: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-1.5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer select-none"
      >
        <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" className="flex-shrink-0">
          <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
        </svg>
        <span className="font-sans">{open ? "Hide" : "Show"} reasoning</span>
        <svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="mt-1.5 pl-4 border-l-2 border-primary/20 text-[11px] text-muted-foreground/60 font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
          {thinking}
        </div>
      )}
    </div>
  );
}

function BranchNav({ msg, onNavigate }: { msg: Message; onNavigate?: (id: string) => void }) {
  if (!msg.siblings || msg.siblings.length <= 1 || !msg.id || !onNavigate) return null;
  const idx = msg.siblings.indexOf(msg.id);
  return (
    <div className={clsx(
      "flex items-center gap-1.5 mt-2 pt-1.5 border-t select-none text-[10px] font-mono",
      msg.role === "user" ? "border-bg/10 text-background/60" : "border-input/30 text-muted-foreground/40"
    )}>
      <button
        onClick={() => { const i = msg.siblings!.indexOf(msg.id!); if (i > 0) onNavigate(msg.siblings![i - 1]); }}
        disabled={idx === 0}
        className={clsx("p-0.5 rounded transition-colors cursor-pointer", idx > 0 ? (msg.role === "user" ? "hover:bg-background/10 hover:text-background text-background/80" : "hover:bg-card-hover hover:text-foreground text-muted-foreground/80") : "opacity-30 cursor-not-allowed")}
        title="Previous version"
      >←</button>
      <span>{idx + 1} / {msg.siblings.length}</span>
      <button
        onClick={() => { const i = msg.siblings!.indexOf(msg.id!); if (i < msg.siblings!.length - 1) onNavigate(msg.siblings![i + 1]); }}
        disabled={idx === msg.siblings.length - 1}
        className={clsx("p-0.5 rounded transition-colors cursor-pointer", idx < msg.siblings.length - 1 ? (msg.role === "user" ? "hover:bg-background/10 hover:text-background text-background/80" : "hover:bg-card-hover hover:text-foreground text-muted-foreground/80") : "opacity-30 cursor-not-allowed")}
        title="Next version"
      >→</button>
    </div>
  );
}

function AssistantTextBlock({
  text,
  sessionId,
  activeRepoName,
  activeAgentId = null,
  activeChannelId = null,
}: {
  text: string;
  sessionId: string | null;
  activeRepoName?: string | null;
  activeAgentId?: string | null;
  activeChannelId?: string | null;
}) {
  const htmlOutput = isHtml(text) ? text : null;
  const markers = extractFileMarkers(text);
  const imageMarkers = markers.filter(m => m.type === "image");
  const htmlMarkers = markers.filter(m => m.type === "html");
  const pdfMarkers = markers.filter(m => m.type === "pdf");
  const audioMarkers = markers.filter(m => m.type === "audio");
  const videoMarkers = markers.filter(m => m.type === "video");
  const officeMarkers = markers.filter(m => m.type === "office" || m.type === "other");

  if (htmlOutput || markers.length > 0) {
    const token = localStorage.getItem("token");
    return (
      <div className="space-y-3">
        {htmlOutput && <HtmlPreview html={htmlOutput} />}
        {htmlMarkers.map((m, i) => (
          <HtmlFileFetcher
            key={`html-${i}`}
            url={m.url}
            title={m.title}
            sessionId={sessionId}
            activeRepoName={activeRepoName}
            activeAgentId={activeAgentId}
            activeChannelId={activeChannelId}
          />
        ))}
        {imageMarkers.length > 0 && (
          <ImageGrid
            images={imageMarkers.map(m => ({ url: m.url, title: m.title }))}
            sessionId={sessionId}
            activeRepoName={activeRepoName}
            activeAgentId={activeAgentId}
            activeChannelId={activeChannelId}
          />
        )}
        
        {pdfMarkers.map((m, i) => {
          const resolved = resolveFileUrl(m.url, sessionId, activeRepoName, activeAgentId, activeChannelId);
          const fileUrl = resolved.startsWith("/api/") && token ? `${resolved}&token=${token}` : resolved;
          return (
            <div key={`pdf-${i}`} className="w-full h-96 rounded-lg border border-input overflow-hidden bg-card flex flex-col font-sans">
              <div className="bg-card-hover/50 px-3 py-1.5 border-b border-input flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="font-medium truncate">PDF Preview: {m.title || "Document"}</span>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 hover:bg-primary/25 text-primary font-semibold transition-colors cursor-pointer"
                >
                  Open in New Tab
                </a>
              </div>
              <iframe
                src={fileUrl}
                className="w-full flex-1 border-0"
                title={m.title || "PDF document"}
              />
            </div>
          );
        })}

        {audioMarkers.map((m, i) => {
          const resolved = resolveFileUrl(m.url, sessionId, activeRepoName, activeAgentId, activeChannelId);
          const fileUrl = resolved.startsWith("/api/") && token ? `${resolved}&token=${token}` : resolved;
          return (
            <div key={`audio-${i}`} className="w-full p-3 bg-card border border-input rounded-lg flex flex-col gap-1.5 font-sans">
              <span className="text-[11px] font-semibold text-muted-foreground truncate">{m.title || "Audio output"}</span>
              <audio controls src={fileUrl} className="w-full h-8 outline-none animate-fade-in" />
            </div>
          );
        })}

        {videoMarkers.map((m, i) => {
          const resolved = resolveFileUrl(m.url, sessionId, activeRepoName, activeAgentId, activeChannelId);
          const fileUrl = resolved.startsWith("/api/") && token ? `${resolved}&token=${token}` : resolved;
          return (
            <div key={`video-${i}`} className="w-full p-2 bg-card border border-input rounded-lg flex flex-col gap-1.5 font-sans">
              <span className="text-[11px] font-semibold text-muted-foreground truncate">{m.title || "Video output"}</span>
              <video controls src={fileUrl} className="w-full rounded border border-input max-h-96" />
            </div>
          );
        })}

        {officeMarkers.map((m, i) => {
          const resolved = resolveFileUrl(m.url, sessionId, activeRepoName, activeAgentId, activeChannelId);
          const fileUrl = resolved.startsWith("/api/") && token ? `${resolved}&token=${token}` : resolved;
          const filename = m.title || m.url.split(/[\\/]/).pop() || "file";
          const extension = m.url.split(".").pop() || "file";
          return (
            <div key={`file-${i}`} className="flex items-center justify-between p-3 bg-card border border-input rounded-lg font-sans">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded bg-primary/15 flex items-center justify-center text-primary text-[10px] font-extrabold select-none shrink-0 border border-primary/20 uppercase">
                  {extension.substring(0, 3)}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-foreground truncate">{filename}</span>
                  <span className="text-[9px] text-muted-foreground/50 uppercase font-mono">{extension}</span>
                </div>
              </div>
              <a
                href={fileUrl}
                download={filename}
                className="px-3 py-1.5 text-[11px] font-semibold rounded bg-primary text-background hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center shrink-0"
              >
                Download
              </a>
            </div>
          );
        })}

        {!htmlOutput && <RichMarkdown content={text} />}
      </div>
    );
  }
  return <RichMarkdown content={text} />;
}

function AgentTurn({
  messages,
  sessionId,
  onNavigate,
  activeRepoName,
  activeAgentId = null,
  activeChannelId = null,
}: {
  messages: Message[];
  sessionId: string | null;
  onNavigate?: (id: string) => void;
  activeRepoName?: string | null;
  activeAgentId?: string | null;
  activeChannelId?: string | null;
}) {
  const toolResultMap = new Map<string, Message>();
  for (const m of messages) {
    if (m.role === "toolResult" && m.toolCallId) {
      toolResultMap.set(m.toolCallId, m);
    }
  }

  const assistantMessages = messages.filter(m => m.role === "assistant");
  const lastAssistant = assistantMessages[assistantMessages.length - 1];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-card border border-input flex items-center justify-center">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
          <path d="M4 17L10 11L4 5" />
          <path d="M12 19H20" />
        </svg>
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
                  return <ThinkingBlock key={i} thinking={block.thinking} />;
                }
                if (block.type === "text" && block.text) {
                  return (
                    <div key={i} className="text-foreground text-sm leading-relaxed">
                      <AssistantTextBlock
                        text={block.text}
                        sessionId={sessionId}
                        activeRepoName={activeRepoName}
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

                  return (
                    <ToolCallRow
                      key={i}
                      toolName={block.name}
                      args={block.arguments ?? {}}
                      result={resultData}
                      sessionId={sessionId}
                      activeRepoName={activeRepoName}
                      activeAgentId={activeAgentId}
                      activeChannelId={activeChannelId}
                    />
                  );
                }
                return null;
              })}

              {isLast && isStreaming && (
                <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse rounded-sm" />
              )}

              {isLast && (msg.provider || msg.model || msg.usage) && !isStreaming && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-2 text-[10px] text-muted-foreground/40 font-mono">
                  {msg.provider && <span>provider: <span className="text-muted-foreground/60">{msg.provider}</span></span>}
                  {msg.model && <span>• model: <span className="text-muted-foreground/60">{msg.model}</span></span>}
                  {msg.usage && (
                    <>
                      <span>• tokens: <span className="text-muted-foreground/60">{msg.usage.totalTokens ?? (msg.usage.input + msg.usage.output)}</span></span>
                      {msg.usage.cost?.total !== undefined && (
                        <span>• cost: <span className="text-muted-foreground/60">${msg.usage.cost.total.toFixed(6)}</span></span>
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
  activeRepoName,
  activeAgentId = null,
  activeChannelId = null,
}: {
  msg: Message;
  onNavigate?: (id: string) => void;
  sessionId: string | null;
  activeRepoName?: string | null;
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
              <div className="mt-1.5 text-xs text-background/60">Error sending message</div>
            )}
          </div>
        )}
        
        {images.length > 0 && (
          <div className="max-w-[400px] w-full">
            <ImageGrid
              images={images.map(img => ({ url: img.path, title: img.name }))}
              sessionId={sessionId}
              activeRepoName={activeRepoName}
              activeAgentId={activeAgentId}
              activeChannelId={activeChannelId}
            />
          </div>
        )}

        {nonImages.length > 0 && (
          <div className="space-y-1.5 w-64">
            {nonImages.map((att, idx) => {
              const resolved = resolveFileUrl(att.path, sessionId, activeRepoName, activeAgentId, activeChannelId);
              const fileUrl = resolved.startsWith("/api/") && token ? `${resolved}&token=${token}` : resolved;
              return (
                <div key={idx} className="flex items-center justify-between p-2.5 bg-card border border-input rounded-lg font-sans text-left w-full">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded bg-primary/15 flex items-center justify-center text-primary text-[9px] font-extrabold select-none shrink-0 border border-primary/20 uppercase">
                      {att.name.split(".").pop()?.substring(0, 3) || "doc"}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[11px] font-semibold text-foreground truncate">{att.name}</span>
                      <span className="text-[8px] text-muted-foreground/50 uppercase font-mono">{att.name.split(".").pop()}</span>
                    </div>
                  </div>
                  <a
                    href={fileUrl}
                    download={att.name}
                    className="px-2 py-1 text-[10px] font-semibold rounded bg-primary text-background hover:opacity-90 transition-opacity cursor-pointer shrink-0"
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
  activeRepoName,
  activeAgentId = null,
  activeChannelId = null,
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
                activeRepoName={activeRepoName}
                activeAgentId={activeAgentId}
                activeChannelId={activeChannelId}
              />
            ) : (
              <AgentTurn
                messages={group.messages}
                sessionId={sessionId}
                onNavigate={onNavigate}
                activeRepoName={activeRepoName}
                activeAgentId={activeAgentId}
                activeChannelId={activeChannelId}
              />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
