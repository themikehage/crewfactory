import { useEffect, useRef } from "react";
import type { TeamMessage } from "shared";
import type { StreamingAgentState } from "@/hooks/useTeam";
import { MessageList } from "@/components/chat/MessageList";

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

  // Track the latest content per agent to detect when a team_message
  // arrives before its team_agent_end (race condition)
  const latestAgentContent = new Map<string, string>();
  for (const msg of messages) {
    if (msg.role === "agent" && msg.agentId) {
      latestAgentContent.set(msg.agentId, msg.content);
    }
  }

  // Handle active streaming agents
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
  const bottomRef = useRef<HTMLDivElement>(null);

  const mappedMessages = mapTeamMessagesToStandard(messages, streamingAgents, agentAvatarMap);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingAgents]);

  const activeStreamList = Object.values(streamingAgents);
  const isStreaming = activeStreamList.length > 0;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0">
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
          activeChannelId={activeTeamId} // We can reuse activeChannelId prop on MessageList for team session scopes
          onOpenSubagentConsole={onOpenSubagentConsole}
        />
      )}
      <div ref={bottomRef} />
      </div>
    </div>
  );
}
