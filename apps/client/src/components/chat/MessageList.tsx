import { type FC } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { RichMarkdown } from "./RichMarkdown";
import { ToolResultInspector, isHtml, extractFileMarkers, HtmlFileFetcher } from "./ToolResultInspector";
import { HtmlPreview } from "./HtmlPreview";
import { ImageGrid } from "./ImageGrid";

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  arguments?: Record<string, unknown>;
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
}

interface Props {
  messages: Message[];
  onNavigate?: (targetId: string) => void;
  sessionId: string | null;
}

function renderBlock(block: ContentBlock | string | unknown, i: number, sessionId: string | null) {
  if (typeof block === "string") {
    return <RichMarkdown key={i} content={block} />;
  }

  if (block && typeof block === "object") {
    const b = block as ContentBlock;
    if (b.type === "text" && b.text) {
      return <RichMarkdown key={i} content={b.text} />;
    }
    if (b.type === "thinking" && b.thinking) {
      return (
        <details key={i} className="mb-2 bg-[#171717]/40 border border-surface-hover/30 rounded-md p-2 font-sans">
          <summary className="text-text-secondary text-xs cursor-pointer hover:text-text-primary transition-colors select-none font-semibold">
            Thinking process...
          </summary>
          <div className="mt-2 text-text-secondary/70 text-xs whitespace-pre-wrap border-l-2 border-accent/40 pl-3 font-mono leading-relaxed">
            {b.thinking}
          </div>
        </details>
      );
    }
    if (b.type === "toolCall" && b.name) {
      return (
        <ToolResultInspector
          key={i}
          toolName={b.name}
          args={b.arguments}
          result={undefined}
          sessionId={sessionId}
        />
      );
    }
    if (b.type === "image" && b.image) {
      return <ImageGrid key={i} images={[b.image]} sessionId={sessionId} />;
    }
  }

  return (
    <pre key={i} className="text-xs overflow-x-auto text-error font-mono bg-error/5 p-2 rounded">
      {JSON.stringify(block, null, 2)}
    </pre>
  );
}

function renderContent(msg: Message, sessionId: string | null) {
  const content = msg.content;

  if (msg.toolName) {
    return (
      <ToolResultInspector
        toolName={msg.toolName}
        result={content}
        sessionId={sessionId}
      />
    );
  }

  if (typeof content === "string") {
    if (msg.role === "user") {
      return <p className="whitespace-pre-wrap break-words font-sans">{content}</p>;
    }

    const htmlOutput = isHtml(content) ? content : null;
    const markers = extractFileMarkers(content);
    const imageMarkers = markers.filter((m) => m.type === "image");
    const htmlMarkers = markers.filter((m) => m.type === "html");

    if (htmlOutput || markers.length > 0) {
      return (
        <div className="space-y-3">
          {htmlOutput && <HtmlPreview html={htmlOutput} />}
          {htmlMarkers.map((m, i) => (
            <HtmlFileFetcher key={`html-${i}`} url={m.url} title={m.title} sessionId={sessionId} />
          ))}
          {imageMarkers.length > 0 && (
            <ImageGrid
              images={imageMarkers.map((m) => ({ url: m.url, title: m.title }))}
              sessionId={sessionId}
            />
          )}
          {!htmlOutput && <RichMarkdown content={content} />}
        </div>
      );
    }

    return <RichMarkdown content={content} />;
  }

  if (Array.isArray(content)) {
    return content.map((block, i) => renderBlock(block, i, sessionId));
  }

  if (content && typeof content === "object") {
    return renderBlock(content as ContentBlock, 0, sessionId);
  }

  return null;
}

export const MessageList: FC<Props> = ({ messages, onNavigate, sessionId }) => {
  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-text-secondary text-sm font-sans">
        Send a message to start
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnimatePresence>
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={clsx(
              "flex gap-3",
              msg.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={clsx(
                "max-w-[90%] sm:max-w-[85%] rounded-lg px-3 sm:px-4 py-2 sm:py-3 shadow-sm",
                msg.role === "user"
                  ? "bg-accent text-bg"
                  : msg.toolName
                    ? "bg-surface border border-warning/30"
                    : "bg-surface",
                msg.isError && "border border-error/50"
              )}
            >
              <div className={clsx(msg.role === "user" ? "text-inherit" : "text-text-primary")}>
                {renderContent(msg, sessionId)}
              </div>
              {msg.role === "assistant" && (msg.provider || msg.model || msg.usage) && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-2 pt-1.5 border-t border-surface-hover/30 text-[10px] text-text-secondary/50 font-mono">
                  {msg.provider && (
                    <span>
                      provider: <span className="text-text-secondary/80">{msg.provider}</span>
                    </span>
                  )}
                  {msg.model && (
                    <span>
                      • model: <span className="text-text-secondary/80">{msg.model}</span>
                    </span>
                  )}
                  {msg.usage && (
                    <>
                      <span>
                        • tokens: <span className="text-text-secondary/80">{msg.usage.totalTokens || (msg.usage.input + msg.usage.output)}</span>
                      </span>
                      {msg.usage.cost?.total !== undefined && (
                        <span>
                          • cost: <span className="text-text-secondary/80">${msg.usage.cost.total.toFixed(6)}</span>
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
              {msg.isStreaming && (
                <span className="inline-block w-2 h-4 ml-1 bg-accent animate-pulse" />
              )}
              {msg.siblings && msg.siblings.length > 1 && msg.id && onNavigate && (
                <div
                  className={clsx(
                    "flex items-center gap-1.5 mt-2 pt-1.5 border-t select-none text-[10px] font-mono",
                    msg.role === "user"
                      ? "border-bg/10 text-bg/60"
                      : "border-surface-hover/30 text-text-secondary/40"
                  )}
                >
                  <button
                    onClick={() => {
                      const idx = msg.siblings!.indexOf(msg.id!);
                      if (idx > 0) onNavigate(msg.siblings![idx - 1]);
                    }}
                    disabled={msg.siblings.indexOf(msg.id) === 0}
                    className={clsx(
                      "p-0.5 rounded transition-colors cursor-pointer",
                      msg.siblings.indexOf(msg.id) > 0
                        ? msg.role === "user"
                          ? "hover:bg-bg/10 hover:text-bg text-bg/80"
                          : "hover:bg-surface-hover hover:text-text-primary text-text-secondary/80"
                        : "opacity-30 cursor-not-allowed"
                    )}
                    title="Previous version"
                  >
                    ←
                  </button>
                  <span>
                    {msg.siblings.indexOf(msg.id) + 1} / {msg.siblings.length}
                  </span>
                  <button
                    onClick={() => {
                      const idx = msg.siblings!.indexOf(msg.id!);
                      if (idx < msg.siblings!.length - 1) onNavigate(msg.siblings![idx + 1]);
                    }}
                    disabled={msg.siblings.indexOf(msg.id) === msg.siblings.length - 1}
                    className={clsx(
                      "p-0.5 rounded transition-colors cursor-pointer",
                      msg.siblings.indexOf(msg.id) < msg.siblings.length - 1
                        ? msg.role === "user"
                          ? "hover:bg-bg/10 hover:text-bg text-bg/80"
                          : "hover:bg-surface-hover hover:text-text-primary text-text-secondary/80"
                        : "opacity-30 cursor-not-allowed"
                    )}
                    title="Next version"
                  >
                    →
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
