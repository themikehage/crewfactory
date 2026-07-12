export interface VariantConfig {
  variantKey: "single" | "multiNoLeader" | "multiWithLeader";
  replyMode: "user-only" | "broadcast" | "targeted";
  maxChainDepth: number;
  hasNegotiationProtocol: boolean;
  minAgents: number;
  sessionNameSuffix: string;
}
