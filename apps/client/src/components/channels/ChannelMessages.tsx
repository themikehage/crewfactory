import { useEffect, useRef } from "react";
import type { ChannelMessage } from "shared";
import type { StreamingAgentState } from "@/hooks/useChannel";

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
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 min-h-0">
      {messages.length === 0 && activeStreamList.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-text-secondary text-sm gap-2">
          <svg width="32" height="32" viewBox="0 0 20 20" fill="currentColor" className="opacity-20">
            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9a1 1 0 100-2 1 1 0 000 2zm3 0a1 1 0 100-2 1 1 0 000 2zm3 0a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <p className="font-medium">No messages in this channel yet</p>
          <p className="text-xs text-text-secondary/60">Type a message below to start the conversation</p>
        </div>
      )}

      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
        >
          <div className="flex items-center gap-2 mb-1 px-1">
            <span className="text-xs font-semibold text-text-secondary">
              {msg.role === "user" ? "You" : msg.agentName || msg.agentId || "Agent"}
            </span>
            {msg.role === "agent" && (
              <span className="text-[10px] bg-purple-400/10 text-purple-400 border border-purple-400/20 px-1.5 py-0.2 rounded font-medium">
                BOT
              </span>
            )}
            <span className="text-[10px] text-text-secondary/50">
              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <div
            className={`max-w-[85%] sm:max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === "user"
                ? "bg-accent/15 text-text-primary border border-accent/20 rounded-tr-none"
                : "bg-surface text-text-primary border border-surface-hover rounded-tl-none shadow-sm"
            }`}
          >
            {msg.content}
          </div>
        </div>
      ))}

      {activeStreamList.map((stream) => (
        <div key={stream.agentId} className="flex flex-col items-start">
          <div className="flex items-center gap-2 mb-1 px-1">
            <span className="text-xs font-semibold text-text-secondary">
              {stream.agentName || stream.agentId}
            </span>
            <span className="text-[10px] bg-blue-400/10 text-blue-400 border border-blue-400/20 px-1.5 py-0.2 rounded font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              THINKING...
            </span>
          </div>

          <div className="max-w-[85%] sm:max-w-[75%] px-4 py-2.5 rounded-2xl rounded-tl-none bg-surface text-text-primary border border-surface-hover shadow-sm text-sm leading-relaxed whitespace-pre-wrap">
            {stream.text || (
              <div className="flex items-center gap-1.5 h-5 text-text-secondary/50 italic text-xs">
                <span>Generating response</span>
                <span className="w-1 h-1 rounded-full bg-accent/60 animate-ping" />
              </div>
            )}
          </div>
        </div>
      ))}

      <div ref={bottomRef} />
    </div>
  );
}
