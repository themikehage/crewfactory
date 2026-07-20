import { useRef } from "react";
import type { TeamMessage } from "shared";
import type { StreamingAgentState } from "@/hooks/useTeam";
import { MessageList } from "@/components/chat/MessageList";
import { useChatScroll } from "@/hooks/useChatScroll";

interface Props {
  messages: TeamMessage[];
  streamingAgents: Record<string, StreamingAgentState>;
  mentionNames?: string[];
  sessionId?: string | null;
  activeTeamId?: string | null;
  onOpenSubagentConsole?: (toolCallId: string, targetType?: string, targetId?: string) => void;
  agentAvatarMap?: Record<string, string | undefined>;
}

function mapTeamMessagesToStandard(
  messages: TeamMessage[],
  streamingAgents: Record<string, StreamingAgentState>,
  agentAvatarMap: Record<string, string | undefined> = {}
): any[] {
  const result: any[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      result.push({
        id: msg.id,
        role: "system",
        content: msg.content,
        timestamp: new Date(msg.createdAt).getTime(),
      });
    } else if (msg.role === "user") {
      result.push({
        id: msg.id,
        role: "user",
        content: msg.content,
        timestamp: new Date(msg.createdAt).getTime(),
      });
    } else if (msg.role === "agent") {
      const contentBlocks: any[] = [];

      if (msg.thinking) {
        contentBlocks.push({
          type: "thinking",
          thinking: msg.thinking,
        });
      }

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          const tcId = tc.toolCallId || tc.id;
          contentBlocks.push({
            type: "toolCall",
            id: tcId,
            name: tc.name,
            arguments: tc.arguments || {},
          });

          if (tc.result) {
            result.push({
              role: "toolResult",
              toolCallId: tcId,
              toolName: tc.name,
              content: Array.isArray(tc.result.content)
                ? tc.result.content
                : [{ type: "text", text: String(tc.result.content ?? "") }],
              isError: tc.result.isError ?? false,
              details: tc.result.details,
            });
          }
        }
      }

      if (msg.content) {
        contentBlocks.push({
          type: "text",
          text: msg.content,
        });
      }

      result.push({
        id: msg.id,
        role: "assistant",
        content: contentBlocks,
        agentName: msg.agentName || msg.agentId || "Agent",
        agentAvatarUrl: msg.agentId ? agentAvatarMap[msg.agentId] : undefined,
        timestamp: new Date(msg.createdAt).getTime(),
      });
    }
  }

  const latestAgentContent = new Map<string, string>();
  for (const msg of messages) {
    if (msg.role === "agent" && msg.agentId) {
      latestAgentContent.set(msg.agentId, msg.content);
    }
  }

  for (const [agentId, stream] of Object.entries(streamingAgents)) {
    const finalContent = latestAgentContent.get(agentId);
    if (finalContent !== undefined && stream.text === finalContent) {
      continue;
    }
    const contentBlocks: any[] = [];

    if (stream.thinking) {
      contentBlocks.push({
        type: "thinking",
        thinking: stream.thinking,
      });
    }

    if (stream.toolCalls) {
      for (const [tcId, tc] of Object.entries(stream.toolCalls)) {
        contentBlocks.push({
          type: "toolCall",
          id: tcId,
          name: tc.toolName,
          arguments: tc.args || {},
        });

        if (tc.result) {
          result.push({
            role: "toolResult",
            toolCallId: tcId,
            toolName: tc.toolName,
            content: Array.isArray(tc.result.content)
              ? tc.result.content
              : [{ type: "text", text: String(tc.result.content ?? "") }],
            isError: tc.result.isError ?? false,
            details: tc.result.details,
          });
        }
      }
    }

    if (stream.text) {
      contentBlocks.push({
        type: "text",
        text: stream.text,
      });
    } else if (!stream.thinking && !stream.toolCalls) {
      contentBlocks.push({
        type: "text",
        text: "",
      });
    }

    result.push({
      id: `stream-${agentId}`,
      role: "assistant",
      content: contentBlocks,
      agentName: stream.agentName || stream.agentId,
      isStreaming: !stream.text && !stream.thinking && !stream.toolCalls,
      timestamp: Date.now(),
    });
  }

  return result;
}

export function TeamMessageList({
  messages,
  streamingAgents,
  sessionId = null,
  activeTeamId = null,
  onOpenSubagentConsole,
  agentAvatarMap = {},
}: Props) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const mappedMessages = mapTeamMessagesToStandard(messages, streamingAgents, agentAvatarMap);
  const activeStreamList = Object.values(streamingAgents);
  const isStreaming = activeStreamList.length > 0;

  const {
    showScrollButton,
    scrollToBottom,
    handleScroll
  } = useChatScroll(scrollContainerRef, {
    messages,
    isStreaming
  });

  return (
    <div className="flex-1 min-h-0 relative">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto p-4 sm:p-6"
      >
        <div className="max-w-3xl mx-auto space-y-5 w-full">
          {messages.length === 0 && !isStreaming ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-3 pt-20">
              <div className="w-12 h-12 rounded-2xl bg-card border border-input flex items-center justify-center">
                <span className="text-primary font-bold text-lg">#</span>
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground text-sm">No messages in this team session yet</p>
                <p className="text-xs text-muted-foreground mt-1">Send a message below to trigger multi-agent debate</p>
              </div>
            </div>
          ) : (
            <MessageList
              messages={mappedMessages}
              sessionId={sessionId}
              activeChannelId={activeTeamId}
              onOpenSubagentConsole={onOpenSubagentConsole}
            />
          )}
        </div>
      </div>

      {showScrollButton && messages.length > 0 && (
        <button
          onClick={() => scrollToBottom("smooth")}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center w-9 h-9 rounded-full bg-surface border border-border text-accent shadow-xl hover:bg-surface-hover active:scale-95 transition-all duration-200"
        >
          <svg className="w-4 h-4 animate-bounce" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      )}
    </div>
  );
}
