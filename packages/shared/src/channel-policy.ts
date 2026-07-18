import { z } from "zod";
import type { Channel, ChannelMember } from "./schemas";

export const CHANNEL_POLICY_VERSION = "1";
export const ContributionBudgetSchema = z.object({ maxWords: z.number().int().min(20).max(4000).default(500) });
export const ChannelBehaviourPolicySchema = z.object({
  version: z.literal(CHANNEL_POLICY_VERSION).default(CHANNEL_POLICY_VERSION),
  contributionBudget: ContributionBudgetSchema.default({ maxWords: 500 }),
  requireResponse: z.enum(["eligible", "mentioned", "never"]).default("eligible"),
  handoff: z.enum(["free", "next-topology-member", "final-owner"]).default("free"),
  finalOwnerAgentId: z.string().min(1).optional(),
  negotiation: z.enum(["none", "structured"]).default("none"),
  outputContract: z.enum(["normal", "concise-contribution", "final-synthesis"]).default("normal"),
});
export type ChannelBehaviourPolicy = z.infer<typeof ChannelBehaviourPolicySchema>;

export type PolicyDiagnostic = { code: string; severity: "error" | "warning"; message: string; repair?: string };
export type CompiledChannelPolicy = ChannelBehaviourPolicy & { checksum: string; diagnostics: PolicyDiagnostic[] };

function checksum(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return `cp_${(hash >>> 0).toString(16)}`;
}

export function defaultChannelPolicy(channel: Pick<Channel, "topology" | "negotiationProtocol">): ChannelBehaviourPolicy {
  const finalOwnerAgentId = channel.topology?.terminalOwnerAgentId;
  return {
    version: CHANNEL_POLICY_VERSION,
    contributionBudget: { maxWords: finalOwnerAgentId ? 350 : 500 },
    requireResponse: channel.topology?.kind === "mention_only" ? "mentioned" : "eligible",
    handoff: finalOwnerAgentId ? "final-owner" : "free",
    finalOwnerAgentId,
    negotiation: channel.negotiationProtocol ? "structured" : "none",
    outputContract: finalOwnerAgentId ? "concise-contribution" : "normal",
  };
}

export function compileChannelPolicy(channel: Pick<Channel, "members" | "topology" | "negotiationProtocol" | "policy">): CompiledChannelPolicy {
  const policy = ChannelBehaviourPolicySchema.parse({ ...defaultChannelPolicy(channel), ...channel.policy, contributionBudget: { ...defaultChannelPolicy(channel).contributionBudget, ...channel.policy?.contributionBudget } });
  const diagnostics: PolicyDiagnostic[] = [];
  const memberIds = new Set(channel.members.map((member) => member.agentId));
  if (policy.finalOwnerAgentId && !memberIds.has(policy.finalOwnerAgentId)) diagnostics.push({ code: "final_owner_not_member", severity: "error", message: "The final owner must be a channel member.", repair: "Choose an active channel member." });
  if (channel.topology?.terminalOwnerAgentId && policy.finalOwnerAgentId && channel.topology.terminalOwnerAgentId !== policy.finalOwnerAgentId) diagnostics.push({ code: "final_owner_conflict", severity: "error", message: "The policy final owner conflicts with the topology terminal owner.", repair: "Use the topology terminal owner or update the topology." });
  if (policy.outputContract === "final-synthesis" && !policy.finalOwnerAgentId) diagnostics.push({ code: "missing_final_owner", severity: "error", message: "Final synthesis requires a final owner.", repair: "Select a final owner." });
  if (policy.negotiation === "structured" && !channel.negotiationProtocol) diagnostics.push({ code: "missing_negotiation_protocol", severity: "error", message: "Structured negotiation requires a channel negotiation protocol.", repair: "Configure the negotiation protocol." });
  return { ...policy, diagnostics, checksum: checksum(JSON.stringify(policy)) };
}

export function channelPolicyPrompt(policy: CompiledChannelPolicy, member: ChannelMember): string {
  const isFinalOwner = policy.finalOwnerAgentId === member.agentId;
  const output = isFinalOwner ? "You own the final team answer. Synthesize the team work; do not defer the final answer." : policy.finalOwnerAgentId ? "You are a contributor. Do not present a final team answer; provide only your bounded contribution for the configured final owner." : "Provide the response required by your role.";
  const envelope = !isFinalOwner && policy.outputContract === "concise-contribution" ? "Use this envelope: CONTRIBUTION: <content>\nCONFIDENCE: <low|medium|high>\nEVIDENCE: <brief evidence>\nHANDOFF: <next owner or none>\nBLOCKER: <optional blocker or none>." : "";
  return ["## Channel policy (non-overridable)", `Contribution limit: ${policy.contributionBudget.maxWords} words.`, `Response condition: ${policy.requireResponse}.`, `Handoff: ${policy.handoff}.`, `Negotiation: ${policy.negotiation}.`, output, envelope, "These channel rules take precedence over agent style preferences and task-local formatting requests."].filter(Boolean).join("\n");
}
