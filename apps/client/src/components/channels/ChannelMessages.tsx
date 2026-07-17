import { useEffect, useRef } from "react";
import type { ChannelMessage } from "shared";
import type { StreamingAgentState } from "@/hooks/useChannel";
import { RichMarkdown } from "@/components/chat/RichMarkdown";
import { AgentAvatar } from "@/components/shared/AgentAvatar";

interface Props {
  messages: ChannelMessage[];
  streamingAgents: Record<string, StreamingAgentState>;
  agentAvatarMap?: Record<string, string | undefined>;
  streamingRenderMode?: "live" | "complete";
}

export function ChannelMessages({
  messages,
  streamingAgents,
  agentAvatarMap = {},
  streamingRenderMode = "live",
}: Props) {
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
            <p className="text-xs text-muted-foreground mt-1">Send a message below to trigger channel agents</p>
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
              <AgentAvatar
                name={msg.agentName || msg.agentId || "Agent"}
                avatarUrl={msg.agentId ? agentAvatarMap[msg.agentId] : null}
                size="xs"
              />
            )}
            <span className="text-xs font-semibold text-foreground">
              {msg.role === "user" ? "You" : msg.agentName || msg.agentId || "Agent"}
            </span>
            {msg.role === "agent" && (
              <span className="text-xs bg-purple-400/10 text-purple-400 border border-purple-400/20 px-1.5 py-0.2 rounded font-medium tracking-wide">
                AGENT
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <div
            className={`max-w-[90%] sm:max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === "user"
                ? "bg-primary/15 text-foreground border border-primary/20 rounded-tr-none"
                : "bg-card text-foreground border border-input rounded-tl-none shadow-sm"
              }`}
          >
            <RichMarkdown content={msg.content} />
            {msg.role === "agent" && msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="mt-3 space-y-2 border-t border-border/20 pt-2 text-left">
                {msg.toolCalls.map((tc: any, tcIdx: number) => {
                  const isError = tc.result?.isError || tc.isError;
                  const hasResult = !!tc.result;
                  const resultObj = tc.result;
                  return (
                    <div
                      key={tcIdx}
                      className={`p-2.5 rounded-lg border text-xs font-mono bg-bg/40 ${isError ? "border-error/30 text-error bg-error/5" : "border-border/50 text-text-secondary"
                        }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${isError ? "bg-error" : hasResult ? "bg-primary" : "bg-warning animate-pulse"}`} />
                        <span className="font-bold text-foreground">{tc.name || tc.toolName}</span>
                        <span className="text-[10px] opacity-70">
                          {hasResult ? (isError ? "error" : "completed") : "running"}
                        </span>
                      </div>
                      {tc.arguments && Object.keys(tc.arguments).length > 0 && (
                        <div className="mt-1 opacity-80 text-[10px] truncate max-w-full">
                          Args: {JSON.stringify(tc.arguments)}
                        </div>
                      )}
                      {resultObj && (resultObj.content || resultObj.text) && (
                        <div className="mt-1.5 pt-1.5 border-t border-border/20 text-[10px] opacity-90 max-h-24 overflow-y-auto whitespace-pre-wrap break-words">
                          {Array.isArray(resultObj.content)
                            ? resultObj.content.find((b: any) => b.type === "text")?.text || ""
                            : String(resultObj.content || resultObj.text || "")}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ))}

      {streamingRenderMode !== "complete" && activeStreamList.map((stream) => (
        <div key={stream.agentId} className="flex flex-col items-start">
          <div className="flex items-center gap-2 mb-1 px-1">
            <AgentAvatar
              name={stream.agentName || stream.agentId}
              avatarUrl={agentAvatarMap[stream.agentId]}
              size="xs"
            />
            <span className="text-xs font-semibold text-foreground">
              {stream.agentName || stream.agentId}
            </span>
            <span className="text-xs bg-blue-400/10 text-blue-400 border border-blue-400/20 px-2 py-0.5 rounded-full font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              STREAMING
            </span>
          </div>

          <div className="max-w-[90%] sm:max-w-[80%] px-4 py-3 rounded-2xl rounded-tl-none bg-card text-foreground border border-input shadow-sm text-sm leading-relaxed">
            {stream.text ? (
              <RichMarkdown content={stream.text} />
            ) : (
              <div className="flex items-center gap-2 h-6 text-muted-foreground italic text-xs">
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

      {streamingRenderMode === "complete" && activeStreamList.length > 0 && (
        <div className="flex items-center gap-2 p-2 bg-card/30 border border-input/30 rounded-xl text-xs text-muted-foreground self-start animate-fadeIn">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span>
            {activeStreamList.map((a) => a.agentName || a.agentId).join(", ")} responding...
          </span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
