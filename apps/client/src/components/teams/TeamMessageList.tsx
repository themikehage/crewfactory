import { useEffect, useRef } from "react";
import type { TeamMessage } from "shared";
import type { StreamingAgentState } from "@/hooks/useTeam";
import { MessageList } from "@/components/chat/MessageList";

interface Props {
  messages: TeamMessage[];
  streamingAgents: Record<string, StreamingAgentState>;
  sessionId?: string | null;
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

  // Handle active streaming agents
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
    const toolResults: any[] = [];

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
          const contents = (tc.result as any)?.content;
          toolResults.push({
            role: "toolResult",
            toolCallId: tcId,
            toolName: tc.toolName,
            content: Array.isArray(contents)
              ? contents
              : [{ type: "text", text: String((tc.result as any)?.partialResult ?? tc.result ?? "") }],
            isError: tc.isError ?? false,
          });
        }
      }
    }

    if (stream.text) {
      contentBlocks.push({
        type: "text",
        text: stream.text,
      });
    }

    if (contentBlocks.length > 0) {
      result.push({
        id: `streaming-${agentId}`,
        role: "assistant",
        content: contentBlocks,
        agentName: stream.agentName || agentId,
        agentAvatarUrl: agentAvatarMap[agentId],
        timestamp: Date.now(),
        isStreaming: true,
      });
      result.push(...toolResults);
    }
  }

  return result;
}

export function TeamMessageList({
  messages,
  streamingAgents,
  sessionId,
  agentAvatarMap = {},
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const mappedMessages = mapTeamMessagesToStandard(
    messages,
    streamingAgents,
    agentAvatarMap
  );

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [mappedMessages.length]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
      <MessageList
        messages={mappedMessages}
        sessionId={sessionId || null}
        serialTools={["request_approval", "ask_question"]}
      />
    </div>
  );
}
