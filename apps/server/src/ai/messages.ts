import type { ImageContent, Message, TextContent } from "./vendor/ai/src/index.ts";

export const COMPACTION_SUMMARY_PREFIX = `The conversation history before this point was compacted into the following summary:

<summary>
`;

export const COMPACTION_SUMMARY_SUFFIX = `
</summary>`;

export const BRANCH_SUMMARY_PREFIX = `The following is a summary of a branch that this conversation came back from:

<summary>
`;

export const BRANCH_SUMMARY_SUFFIX = `</summary>`;

export interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode: number | undefined;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
  timestamp: number;
  excludeFromContext?: boolean;
}

export interface CustomMessage<T = unknown> {
  role: "custom";
  customType: string;
  content: string | (TextContent | ImageContent)[];
  display: boolean;
  details?: T;
  timestamp: number;
}

export interface BranchSummaryMessage {
  role: "branchSummary";
  summary: string;
  fromId: string;
  timestamp: number;
}

export interface CompactionSummaryMessage {
  role: "compactionSummary";
  summary: string;
  tokensBefore: number;
  timestamp: number;
}

export function bashExecutionToText(msg: BashExecutionMessage): string {
  let text = `Ran \`${msg.command}\`\n`;
  if (msg.output) {
    text += `\`\`\`\n${msg.output}\n\`\`\``;
  } else {
    text += "(no output)";
  }
  if (msg.cancelled) {
    text += "\n\n(command cancelled)";
  } else if (msg.exitCode !== null && msg.exitCode !== undefined && msg.exitCode !== 0) {
    text += `\n\nCommand exited with code ${msg.exitCode}`;
  }
  if (msg.truncated && msg.fullOutputPath) {
    text += `\n\n[Output truncated. Full output: ${msg.fullOutputPath}]`;
  }
  return text;
}

export function createBranchSummaryMessage(summary: string, fromId: string, timestamp: string): BranchSummaryMessage {
  return {
    role: "branchSummary",
    summary,
    fromId,
    timestamp: new Date(timestamp).getTime(),
  };
}

export function createCompactionSummaryMessage(
  summary: string,
  tokensBefore: number,
  timestamp: string,
): CompactionSummaryMessage {
  return {
    role: "compactionSummary",
    summary: summary,
    tokensBefore,
    timestamp: new Date(timestamp).getTime(),
  };
}

export function createCustomMessage<T>(
  customType: string,
  content: string | (TextContent | ImageContent)[],
  display: boolean,
  details: T | undefined,
  timestamp: string,
): CustomMessage<T> {
  return {
    role: "custom",
    customType,
    content,
    display,
    details,
    timestamp: new Date(timestamp).getTime(),
  };
}

export function convertToLlm(msg: any): Message[] {
  if (msg.role === "user" || msg.role === "assistant" || msg.role === "system") {
    return [msg];
  }
  if (msg.role === "bashExecution") {
    if (msg.excludeFromContext) return [];
    return [{
      role: "user",
      content: [{ type: "text", text: bashExecutionToText(msg) }],
      timestamp: msg.timestamp,
    }];
  }
  if (msg.role === "branchSummary") {
    return [{
      role: "user",
      content: [{ type: "text", text: `${BRANCH_SUMMARY_PREFIX}${msg.summary}${BRANCH_SUMMARY_SUFFIX}` }],
      timestamp: msg.timestamp,
    }];
  }
  if (msg.role === "compactionSummary") {
    return [{
      role: "user",
      content: [{ type: "text", text: `${COMPACTION_SUMMARY_PREFIX}${msg.summary}${COMPACTION_SUMMARY_SUFFIX}` }],
      timestamp: msg.timestamp,
    }];
  }
  if (msg.role === "custom") {
    const content = typeof msg.content === "string" ? [{ type: "text", text: msg.content }] : msg.content;
    return [{
      role: "user",
      content,
      timestamp: msg.timestamp,
    }];
  }
  return [];
}
