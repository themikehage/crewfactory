import { z } from "zod";
import type { Channel, ChannelMember, ChannelMessage, ChannelSchedulerMode, NegotiationProtocol } from "./schemas";

export const CHANNEL_TOPOLOGY_VERSION = "1";
export const ChannelTopologyKindSchema = z.enum(["leader_specialists", "sequential_review", "roundtable", "debate_with_arbiter", "mention_only", "legacy_custom"]);
export type ChannelTopologyKind = z.infer<typeof ChannelTopologyKindSchema>;

export const TopologyAssignmentSchema = z.object({
  agentId: z.string().min(1),
  role: z.enum(["leader", "specialist", "reviewer", "peer", "position", "arbiter", "participant"]),
  targets: z.array(z.string().min(1)).default([]),
  order: z.number().int().min(0).optional(),
});
export type TopologyAssignment = z.infer<typeof TopologyAssignmentSchema>;

export const ChannelTopologySchema = z.object({
  version: z.literal(CHANNEL_TOPOLOGY_VERSION),
  kind: ChannelTopologyKindSchema,
  schedulerMode: z.enum(["sequential", "parallel", "leader-gated"]),
  entryPointAgentId: z.string().min(1).optional(),
  terminalOwnerAgentId: z.string().min(1).optional(),
  arbiterAgentId: z.string().min(1).optional(),
  assignments: z.array(TopologyAssignmentSchema).default([]),
  expertModeAcknowledged: z.boolean().optional(),
});
export type ChannelTopology = z.infer<typeof ChannelTopologySchema>;

export type TopologyDiagnostic = { code: string; severity: "error" | "warning"; message: string; repair?: string };
export type TopologyValidation = { valid: boolean; diagnostics: TopologyDiagnostic[] };
export type TopologyPreview = { firstRecipients: string[]; turns: string[]; finalOwner?: string; description: string };

const defaultScheduler: Record<Exclude<ChannelTopologyKind, "legacy_custom">, ChannelSchedulerMode> = {
  leader_specialists: "leader-gated",
  sequential_review: "sequential",
  roundtable: "sequential",
  debate_with_arbiter: "sequential",
  mention_only: "sequential",
};

export function validateChannelTopology(topology: ChannelTopology, members: ChannelMember[], negotiationProtocol?: NegotiationProtocol): TopologyValidation {
  const diagnostics: TopologyDiagnostic[] = [];
  const memberIds = new Set(members.map((member) => member.agentId));
  const assignments = topology.assignments;
  const assignmentIds = new Set<string>();
  for (const assignment of assignments) {
    if (assignmentIds.has(assignment.agentId)) diagnostics.push({ code: "duplicate_assignment", severity: "error", message: `Agent ${assignment.agentId} has more than one topology assignment.`, repair: "Assign each agent one role." });
    assignmentIds.add(assignment.agentId);
    if (!memberIds.has(assignment.agentId)) diagnostics.push({ code: "assignment_not_member", severity: "error", message: `Assigned agent ${assignment.agentId} is not a channel member.`, repair: "Add the agent to the channel or remove the assignment." });
    for (const target of assignment.targets) {
      if (target === assignment.agentId) diagnostics.push({ code: "self_target", severity: "error", message: `Agent ${target} cannot target itself.`, repair: "Remove the self-target." });
      if (!memberIds.has(target)) diagnostics.push({ code: "unreachable_target", severity: "error", message: `Target ${target} is not a channel member.`, repair: "Choose an existing member." });
    }
  }
  if (topology.kind === "legacy_custom") {
    if (!topology.expertModeAcknowledged) diagnostics.push({ code: "expert_ack_required", severity: "warning", message: "This legacy routing can have surprising behaviour.", repair: "Review the routing and acknowledge expert mode before saving." });
    return { valid: !diagnostics.some((diagnostic) => diagnostic.severity === "error"), diagnostics };
  }
  if (members.length === 0) diagnostics.push({ code: "no_members", severity: "error", message: "A standard topology needs at least one member.", repair: "Add members before selecting this topology." });
  if (assignments.length !== members.length || members.some((member) => !assignmentIds.has(member.agentId))) diagnostics.push({ code: "incomplete_assignments", severity: "error", message: "Every channel member needs a topology assignment.", repair: "Assign all members in the guided setup." });
  if (topology.schedulerMode !== defaultScheduler[topology.kind] && !(topology.kind === "roundtable" && topology.schedulerMode === "parallel")) diagnostics.push({ code: "incompatible_scheduler", severity: "error", message: `${topology.kind} does not support ${topology.schedulerMode} scheduling.`, repair: `Use ${defaultScheduler[topology.kind]} scheduling.` });
  const leader = assignments.filter((assignment) => assignment.role === "leader");
  const arbiters = assignments.filter((assignment) => assignment.role === "arbiter");
  if (["leader_specialists", "sequential_review"].includes(topology.kind) && leader.length !== 1) diagnostics.push({ code: "leader_required", severity: "error", message: `${topology.kind} requires exactly one leader.`, repair: "Choose one leader." });
  if (topology.kind === "debate_with_arbiter") {
    if (arbiters.length !== 1 || !topology.arbiterAgentId || arbiters[0]?.agentId !== topology.arbiterAgentId) diagnostics.push({ code: "arbiter_required", severity: "error", message: "Debate requires one designated arbiter.", repair: "Choose one arbiter assignment." });
    if (assignments.filter((assignment) => assignment.role === "position").length < 2) diagnostics.push({ code: "positions_required", severity: "error", message: "Debate requires at least two positions.", repair: "Assign two or more position agents." });
    if (!negotiationProtocol) diagnostics.push({ code: "negotiation_required", severity: "error", message: "Debate requires the negotiation protocol.", repair: "Enable negotiation for this topology." });
  }
  const entry = topology.entryPointAgentId;
  if (entry && !memberIds.has(entry)) diagnostics.push({ code: "invalid_entry", severity: "error", message: "The entry agent is not a member.", repair: "Choose an existing member." });
  if (!entry && topology.kind !== "roundtable") diagnostics.push({ code: "entry_required", severity: "error", message: "This topology needs an entry agent for user messages.", repair: "Choose the first recipient." });
  if (topology.terminalOwnerAgentId && !memberIds.has(topology.terminalOwnerAgentId)) diagnostics.push({ code: "invalid_terminal_owner", severity: "error", message: "The final owner is not a member.", repair: "Choose an existing member." });
  return { valid: !diagnostics.some((diagnostic) => diagnostic.severity === "error"), diagnostics };
}

export function inferChannelTopology(members: ChannelMember[], negotiationProtocol?: NegotiationProtocol): ChannelTopology {
  const lead = members.find((member) => member.role === "lead");
  const arbiter = negotiationProtocol?.arbiterAgentId;
  const hasBroadcast = members.some((member) => member.replyMode === "broadcast");
  const allMentionOnly = members.length > 0 && members.every((member) => member.replyMode === "mention-only");
  const assignments = members.map((member, order) => ({ agentId: member.agentId, role: member.agentId === arbiter ? "arbiter" as const : member.agentId === lead?.agentId ? "leader" as const : "participant" as const, targets: member.targetAgentIds ?? [], order }));
  if (allMentionOnly) return { version: CHANNEL_TOPOLOGY_VERSION, kind: "mention_only", schedulerMode: "sequential", assignments, expertModeAcknowledged: true };
  if (arbiter && members.filter((member) => member.replyMode === "broadcast").length >= 2) return { version: CHANNEL_TOPOLOGY_VERSION, kind: "debate_with_arbiter", schedulerMode: "sequential", entryPointAgentId: members.find((member) => member.agentId !== arbiter)?.agentId, terminalOwnerAgentId: arbiter, arbiterAgentId: arbiter, assignments: assignments.map((item) => item.agentId === arbiter ? item : { ...item, role: "position" }), expertModeAcknowledged: true };
  if (lead && hasBroadcast) return { version: CHANNEL_TOPOLOGY_VERSION, kind: "leader_specialists", schedulerMode: "leader-gated", entryPointAgentId: lead.agentId, terminalOwnerAgentId: lead.agentId, assignments: assignments.map((item) => item.agentId === lead.agentId ? item : { ...item, role: "specialist" }), expertModeAcknowledged: true };
  return { version: CHANNEL_TOPOLOGY_VERSION, kind: "legacy_custom", schedulerMode: "sequential", assignments, expertModeAcknowledged: false };
}

export function previewChannelTopology(topology: ChannelTopology): TopologyPreview {
  const ordered = [...topology.assignments].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const names = ordered.map((item) => item.agentId);
  if (topology.kind === "roundtable") return { firstRecipients: names, turns: names, finalOwner: topology.terminalOwnerAgentId, description: `All peers contribute ${topology.schedulerMode === "parallel" ? "in parallel" : "one at a time"}.` };
  if (topology.kind === "mention_only") return { firstRecipients: [], turns: ["Only explicitly mentioned agents respond"], description: "The user chooses every recipient with @mentions." };
  return { firstRecipients: topology.entryPointAgentId ? [topology.entryPointAgentId] : [], turns: names, finalOwner: topology.terminalOwnerAgentId, description: `The first response comes from ${topology.entryPointAgentId ?? "the configured entry point"}; final ownership is ${topology.terminalOwnerAgentId ?? "shared"}.` };
}

export function resolveTopologyRecipients(channel: Channel, topology: ChannelTopology, incomingMsg: ChannelMessage): ChannelMember[] {
  const byId = new Map(channel.members.map((member) => [member.agentId, member]));
  const ordered = [...topology.assignments].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const select = (ids: string[]) => ids.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []);
  if (topology.kind === "mention_only") return select(incomingMsg.mentions ?? []);
  if (topology.kind === "roundtable") return incomingMsg.role === "user" ? select(ordered.map((assignment) => assignment.agentId)) : [];
  if (topology.kind === "debate_with_arbiter") return incomingMsg.role === "user" ? select(ordered.filter((assignment) => assignment.role === "position").map((assignment) => assignment.agentId)) : [];
  if (topology.kind === "sequential_review") {
    if (incomingMsg.role === "user") return select([topology.entryPointAgentId ?? ordered[0]?.agentId].filter((id): id is string => Boolean(id)));
    const index = ordered.findIndex((assignment) => assignment.agentId === incomingMsg.agentId);
    return index >= 0 ? select([ordered[index + 1]?.agentId].filter((id): id is string => Boolean(id))) : [];
  }
  if (incomingMsg.role === "user") return select([topology.entryPointAgentId].filter((id): id is string => Boolean(id)));
  if (incomingMsg.agentId === topology.entryPointAgentId) return select(ordered.filter((assignment) => assignment.role === "specialist").map((assignment) => assignment.agentId));
  if (incomingMsg.agentId !== topology.terminalOwnerAgentId) return select([topology.terminalOwnerAgentId].filter((id): id is string => Boolean(id)));
  return [];
}
