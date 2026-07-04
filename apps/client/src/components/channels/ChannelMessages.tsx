import { useEffect, useRef } from "react";
import type { ChannelMessage } from "shared";
import type { StreamingAgentState } from "@/hooks/useChannel";
import { RichMarkdown } from "@/components/chat/RichMarkdown";

interface Props {
  messages: ChannelMessage[];
  streamingAgents: Record<string, StreamingAgentState>;
}

export function ChannelMessages({ messages, streamingAgents }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingAgents]);

  const activeStreamList = Object.values(streamingAgents);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 min-h-0">
      {messages.length === 0 && activeStreamList.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-3">
          <div className="w-12 h-12 rounded-2xl bg-card border border-input flex items-center justify-center">
            <span className="text-primary font-bold text-lg">#</span>
          </div>
          <div className="text-center">
            <p className="font-medium text-foreground text-sm">No messages in this channel yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Send a message below to trigger channel agents</p>
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
            <span className="text-xs font-semibold text-foreground">
              {msg.role === "user" ? "You" : msg.agentName || msg.agentId || "Agent"}
            </span>
            {msg.role === "agent" && (
              <span className="text-[9px] bg-purple-400/10 text-purple-400 border border-purple-400/20 px-1.5 py-0.2 rounded font-medium tracking-wide">
                AGENT
              </span>
            )}
            <span className="text-[10px] text-muted-foreground/50">
              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <div
            className={`max-w-[90%] sm:max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-primary/15 text-foreground border border-primary/20 rounded-tr-none"
                : "bg-card text-foreground border border-input rounded-tl-none shadow-sm"
            }`}
          >
            <RichMarkdown content={msg.content} />
          </div>
        </div>
      ))}

      {activeStreamList.map((stream) => (
        <div key={stream.agentId} className="flex flex-col items-start">
          <div className="flex items-center gap-2 mb-1 px-1">
            <div className="w-4 h-4 rounded-full bg-blue-400/20 border border-blue-400/40 flex items-center justify-center text-[9px] font-bold text-blue-400">
              A
            </div>
            <span className="text-xs font-semibold text-foreground">
              {stream.agentName || stream.agentId}
            </span>
            <span className="text-[10px] bg-blue-400/10 text-blue-400 border border-blue-400/20 px-2 py-0.5 rounded-full font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              STREAMING
            </span>
          </div>

          <div className="max-w-[90%] sm:max-w-[80%] px-4 py-3 rounded-2xl rounded-tl-none bg-card text-foreground border border-input shadow-sm text-sm leading-relaxed">
            {stream.text ? (
              <RichMarkdown content={stream.text} />
            ) : (
              <div className="flex items-center gap-2 h-6 text-muted-foreground/60 italic text-xs">
                <span>Generating response...</span>
                <div className="flex gap-1 items-center">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      <div ref={bottomRef} />
    </div>
  );
}
