import { type FC } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  arguments?: Record<string, unknown>;
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
}

interface Props {
  messages: Message[];
}

function renderBlock(block: ContentBlock | string | unknown, i: number) {
  if (typeof block === "string") {
    return (
      <p key={i} className="whitespace-pre-wrap break-words mb-1">
        {block}
      </p>
    );
  }

  if (block && typeof block === "object") {
    const b = block as ContentBlock;
    if (b.type === "text") {
      return (
        <p key={i} className="whitespace-pre-wrap break-words mb-1">
          {b.text}
        </p>
      );
    }
    if (b.type === "thinking") {
      return (
        <details key={i} className="mb-2">
          <summary className="text-text-secondary text-sm cursor-pointer hover:text-text-primary transition-colors">
            Thinking...
          </summary>
          <p className="mt-1 text-text-secondary/70 text-sm whitespace-pre-wrap border-l-2 border-surface-hover pl-3 ml-1">
            {b.thinking}
          </p>
        </details>
      );
    }
    if (b.type === "toolCall") {
      return (
        <div
          key={i}
          className="my-2 px-3 py-2 bg-surface rounded-lg border border-surface-hover"
        >
          <div className="text-accent text-sm font-mono">{b.name}</div>
          {b.arguments && (
            <pre className="text-text-secondary text-xs mt-1 overflow-x-auto">
              {JSON.stringify(b.arguments, null, 2)}
            </pre>
          )}
        </div>
      );
    }
  }

  return (
    <pre key={i} className="text-xs overflow-x-auto text-error">
      {JSON.stringify(block, null, 2)}
    </pre>
  );
}

function renderContent(msg: Message) {
  const content = msg.content;

  if (typeof content === "string") {
    return <p className="whitespace-pre-wrap break-words">{content}</p>;
  }

  if (Array.isArray(content)) {
    return content.map((block, i) => renderBlock(block, i));
  }

  if (content && typeof content === "object") {
    return renderBlock(content as ContentBlock, 0);
  }

  return null;
}

export const MessageList: FC<Props> = ({ messages }) => {
  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-text-secondary text-sm">
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
                "max-w-[90%] sm:max-w-[85%] rounded-lg px-3 sm:px-4 py-2 sm:py-3",
                msg.role === "user"
                  ? "bg-accent text-bg"
                  : msg.toolName
                    ? "bg-surface border border-warning/30"
                    : "bg-surface",
                msg.isError && "border border-error/50"
              )}
            >
              <div className={clsx(msg.role === "user" ? "text-inherit" : "text-text-primary")}>
                {renderContent(msg)}
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
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
