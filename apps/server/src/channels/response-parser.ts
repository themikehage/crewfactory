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

  let cleanContent = trimmed;

  // If the LLM returned structured content blocks (array), extract clean text
  // from only the 'text' type blocks — ignoring any tool call output mixed into the stream buffer.
  if (lastMsg && Array.isArray(lastMsg.content) && lastMsg.content.some((b: any) => b.type === "toolCall")) {
    const textFromBlocks = lastMsg.content
      .filter((b: any) => b.type === "text" && b.text)
      .map((b: any) => b.text as string)
      .join("\n")
      .trim();
    if (textFromBlocks) {
      cleanContent = channel.showThinking ? textFromBlocks : stripThinkBlocks(textFromBlocks);
    } else {
      cleanContent = "";
    }
  }

  return {
    content: cleanContent,
    stripped,
    thinking: finalThinking || "",
    toolCalls: finalToolCalls,
    tokensIn,
    tokensOut,
    isSilent: cleanContent ? isSilentContent(cleanContent) : isSilent,
  };
}

export function enforceDiffFormat(response: string, outputMode: "full-proposal" | "diff-suggestion" | "normal"): string {
  if (outputMode !== "diff-suggestion") return response;

  // Stripear automaticamente cualquier cortesia/felicitacion inicial
  return response.replace(
    /^(excelente|perfecto|gracias|buen|muy buena|me gusta|estoy de acuerdo|coincido|de acuerdo|buena idea|me parece bien)[^.!?\n]*[.!?]?\s*/i,
    ""
  ).trim();
}
