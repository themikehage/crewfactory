export interface ParsedResponse {
  content: string;
  stripped: string;
  thinking: string;
  toolCalls: any[];
  tokensIn: number;
  tokensOut: number;
  isSilent: boolean;
}

export function isSilentContent(content: string): boolean {
  if (!content) return true;
  const SILENT_REGEX = /^\s*[\(\[\*]*\s*silent(ioso)?\s*[\)\]\*]*[\s\.]*$/i;
  return SILENT_REGEX.test(content.trim());
}

export function stripThinkBlocks(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export function parseAgentResponse(
  messages: any[],
  channel: { showThinking?: boolean; showTools?: boolean },
  fullResponseFromStream: string
): ParsedResponse {
  let fullResponse = fullResponseFromStream;
  let tokensIn = 0;
  let tokensOut = 0;

  const lastMsg = [...messages].reverse().find((m) => m.role === "assistant") as any;
  if (lastMsg) {
    if (!fullResponse.trim()) {
      if (typeof lastMsg.content === "string") {
        fullResponse = lastMsg.content;
      } else if (Array.isArray(lastMsg.content)) {
        fullResponse = lastMsg.content.map((c: any) => c.text || "").join("\n");
      }
    }
    if (lastMsg.usage) {
      tokensIn = lastMsg.usage.input || 0;
      tokensOut = lastMsg.usage.output || 0;
    }
  }

  const stripped = channel.showThinking ? fullResponse : stripThinkBlocks(fullResponse);
  const trimmed = stripped.trim();
  const isSilent = isSilentContent(trimmed);

  let finalThinking = "";
  const finalToolCalls: any[] = [];

  if (channel.showThinking || channel.showTools) {
    if (lastMsg && Array.isArray(lastMsg.content)) {
      for (const block of lastMsg.content) {
        if (block.type === "thinking" && block.thinking && channel.showThinking) {
          finalThinking += block.thinking;
        }
        if (block.type === "toolCall" && channel.showTools) {
          const matchedResult = messages.find(
            (m) => m.role === "toolResult" && (m as any).toolCallId === block.id
          ) as any;
          finalToolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.arguments,
            result: matchedResult
              ? {
                  toolName: matchedResult.toolName ?? block.name,
                  content: Array.isArray(matchedResult.content)
                    ? matchedResult.content
                    : [{ type: "text", text: String(matchedResult.content) }],
                  isError: matchedResult.isError ?? false,
                  details: (matchedResult as any).details,
                }
              : null,
          });
        }
      }
    }
  }

  return {
    content: trimmed,
    stripped,
    thinking: finalThinking || "",
    toolCalls: finalToolCalls,
    tokensIn,
    tokensOut,
    isSilent,
  };
}
