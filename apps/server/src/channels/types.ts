import type { ChannelMember, ChannelNegotiationProtocol, ChannelContextItem, ChannelMessage } from "shared";

export interface RunToCompletionConfig {
  channelId: string;
  channelName: string;
  description: string;
  members: ChannelMember[];
  maxChainDepth: number;
  showThinking: boolean;
  showTools: boolean;
  negotiationProtocol?: ChannelNegotiationProtocol;
  contextItems?: ChannelContextItem[];
  taskPrompt: string;
  sessionId: string;
  sessionName: string;
  signal?: AbortSignal;
}

export interface RunToCompletionResult {
  status: "completed" | "failed" | "aborted";
  messages: ChannelMessage[];
  tokensIn: number;
  tokensOut: number;
  negotiationRounds: number;
  escalationsToLeader: number;
  agreementReached: boolean;
}
