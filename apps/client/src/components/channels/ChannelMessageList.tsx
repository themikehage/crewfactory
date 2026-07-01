import { useEffect, useRef, useState } from "react";
import type { ChannelMessage } from "shared";
import type { StreamingAgentState } from "@/hooks/useChannel";
import { RichMarkdown } from "@/components/chat/RichMarkdown";
import { ToolCallRow } from "@/components/chat/tools/ToolCallRow";

interface Props {
  messages: ChannelMessage[];
  streamingAgents: Record<string, StreamingAgentState>;
  mentionNames?: string[];
  sessionId?: string | null;
}

function ThinkingBlock({ thinking }: { thinking: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-1.5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] text-text-secondary/50 hover:text-text-secondary transition-colors cursor-pointer select-none"
      >
        <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" className="flex-shrink-0">
          <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
        </svg>
        <span className="font-sans">{open ? "Ocultar" : "Mostrar"} razonamiento</span>
        <svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="mt-1.5 pl-4 border-l-2 border-accent/20 text-[11px] text-text-secondary/60 font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
          {thinking}
        </div>
      )}
    </div>
  );
}

function highlightMentions(content: string, names: string[]): string {
  if (names.length === 0) return content;
  // Replace @name patterns with a markdown-safe bold highlight
  // We use HTML spans since RichMarkdown renders raw HTML in code blocks
  let result = content;
  for (const name of names) {
    const pattern = new RegExp(`@(${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`, "gi");
    result = result.replace(pattern, `**@$1**`);
  }
  return result;
}

export function ChannelMessageList({ messages, streamingAgents, mentionNames = [], sessionId = null }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingAgents]);

  const activeStreamList = Object.values(streamingAgents);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 min-h-0">
      {messages.length === 0 && activeStreamList.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-text-secondary text-sm gap-3">
          <div className="w-12 h-12 rounded-2xl bg-surface border border-surface-hover flex items-center justify-center">
            <span className="text-accent font-bold text-lg">#</span>
          </div>
          <div className="text-center">
            <p className="font-medium text-text-primary text-sm">No messages in this channel session</p>
            <p className="text-xs text-text-secondary/60 mt-1">Send a message below to trigger multi-agent collaboration</p>
          </div>
        </div>
      )}

      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
        >
          <div className="flex items-center gap-2 mb-1 px-1">
            {msg.role === "agent" && (
              <div className="w-4 h-4 rounded-full bg-purple-400/20 border border-purple-400/40 flex items-center justify-center text-[9px] font-bold text-purple-400">
                A
              </div>
            )}
            <span className="text-xs font-semibold text-text-primary">
              {msg.role === "user" ? "You" : msg.agentName || msg.agentId || "Agent"}
            </span>
            {msg.role === "agent" && (
              <span className="text-[9px] bg-purple-400/10 text-purple-400 border border-purple-400/20 px-1.5 py-0.2 rounded font-medium tracking-wide">
                AGENT
              </span>
            )}
            <span className="text-[10px] text-text-secondary/50">
              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <div
            className={`max-w-[90%] sm:max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-accent/15 text-text-primary border border-accent/20 rounded-tr-none"
                : "bg-surface text-text-primary border border-surface-hover rounded-tl-none shadow-sm"
            }`}
          >
            {msg.thinking && <ThinkingBlock thinking={msg.thinking} />}
            {msg.toolCalls && msg.toolCalls.map((tc, idx) => (
              <ToolCallRow
                key={idx}
                toolName={tc.name}
                args={tc.arguments}
                result={tc.result}
                sessionId={msg.sessionId || null}
              />
            ))}
            <RichMarkdown content={highlightMentions(msg.content, mentionNames)} />
          </div>
        </div>
      ))}

      {activeStreamList.map((stream) => (
        <div key={stream.agentId} className="flex flex-col items-start">
          <div className="flex items-center gap-2 mb-1 px-1">
            <div className="w-4 h-4 rounded-full bg-blue-400/20 border border-blue-400/40 flex items-center justify-center text-[9px] font-bold text-blue-400">
              A
            </div>
            <span className="text-xs font-semibold text-text-primary">
              {stream.agentName || stream.agentId}
            </span>
            <span className="text-[10px] bg-blue-400/10 text-blue-400 border border-blue-400/20 px-2 py-0.5 rounded-full font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              STREAMING
            </span>
          </div>

          <div className="max-w-[90%] sm:max-w-[80%] px-4 py-3 rounded-2xl rounded-tl-none bg-surface text-text-primary border border-surface-hover shadow-sm text-sm leading-relaxed">
            {stream.thinking && <ThinkingBlock thinking={stream.thinking} />}
            {stream.toolCalls && Object.entries(stream.toolCalls).map(([id, tc]) => (
              <ToolCallRow
                key={id}
                toolName={tc.toolName}
                args={tc.args}
                result={tc.result}
                sessionId={sessionId}
              />
            ))}
            {stream.text ? (
              <RichMarkdown content={stream.text} />
            ) : (
              !stream.thinking && !stream.toolCalls && (
                <div className="flex items-center gap-2 h-6 text-text-secondary/60 italic text-xs">
                  <span>Generating response...</span>
                  <div className="flex gap-1 items-center">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      ))}

      <div ref={bottomRef} />
    </div>
  );
}
