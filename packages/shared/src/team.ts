import { z } from "zod";

export const TeamTopologySchema = z.enum(["leader_specialists", "roundtable"]);
export type TeamTopology = z.infer<typeof TeamTopologySchema>;

export const TeamMemberRoleSchema = z.enum(["leader", "specialist", "participant", "facilitator"]);
export type TeamMemberRole = z.infer<typeof TeamMemberRoleSchema>;

export const TeamMemberSchema = z.object({
  agentId: z.string().min(1),
  role: TeamMemberRoleSchema,
});
export type TeamMember = z.infer<typeof TeamMemberSchema>;

export const TeamSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  topology: TeamTopologySchema,
  members: z.array(TeamMemberSchema).min(1),
  configurationVersion: z.number().int().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Team = z.infer<typeof TeamSchema>;

export const CreateTeamSchema = TeamSchema.pick({ name: true, description: true, topology: true, members: true });
export type CreateTeam = z.infer<typeof CreateTeamSchema>;
export const UpdateTeamSchema = CreateTeamSchema.partial();
export type UpdateTeam = z.infer<typeof UpdateTeamSchema>;

export const TeamExecutionStatusSchema = z.enum(["queued", "planning", "working", "synthesizing", "completed", "completed_with_warnings", "failed", "cancelled", "interrupted"]);
export type TeamExecutionStatus = z.infer<typeof TeamExecutionStatusSchema>;
export const TeamStepStatusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled", "skipped"]);
export type TeamStepStatus = z.infer<typeof TeamStepStatusSchema>;

export const TeamStepSchema = z.object({
  id: z.string(),
  index: z.number().int().min(0),
  agentId: z.string().min(1),
  role: TeamMemberRoleSchema,
  status: TeamStepStatusSchema,
  attempts: z.number().int().min(0),
  output: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});
export type TeamStep = z.infer<typeof TeamStepSchema>;

export const TeamExecutionSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  teamId: z.string(),
  task: z.string(),
  configurationVersion: z.number().int().min(1),
  topology: TeamTopologySchema,
  members: z.array(TeamMemberSchema),
  status: TeamExecutionStatusSchema,
  steps: z.array(TeamStepSchema),
  finalOutput: z.string().optional(),
  terminalReason: z.string().optional(),
  lastSequence: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
});
export type TeamExecution = z.infer<typeof TeamExecutionSchema>;

export const TeamEventTypeSchema = z.enum(["execution_started", "phase_changed", "step_planned", "step_started", "text_delta", "tool_started", "tool_updated", "tool_completed", "step_completed", "step_failed", "step_retried", "execution_completed", "execution_failed", "execution_cancelled", "execution_interrupted"]);
export type TeamEventType = z.infer<typeof TeamEventTypeSchema>;
export const TeamEventSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  executionId: z.string(),
  sequence: z.number().int().min(1),
  type: TeamEventTypeSchema,
  stepId: z.string().optional(),
  agentId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
});
export type TeamEvent = z.infer<typeof TeamEventSchema>;

export function validateTeamConfiguration(input: Pick<Team, "topology" | "members">): string | null {
  const ids = new Set(input.members.map((member) => member.agentId));
  if (ids.size !== input.members.length) return "Each team member must be unique";
  const leaders = input.members.filter((member) => member.role === "leader");
  const facilitators = input.members.filter((member) => member.role === "facilitator");
  if (input.topology === "leader_specialists") {
    if (leaders.length !== 1) return "Leader and specialists teams require exactly one leader";
    if (input.members.some((member) => member.role === "facilitator" || member.role === "participant")) return "Leader and specialists teams only allow leader and specialist roles";
  }
  if (input.topology === "roundtable") {
    if (facilitators.length !== 1) return "Roundtable teams require exactly one facilitator";
    if (input.members.some((member) => member.role === "leader" || member.role === "specialist")) return "Roundtable teams only allow facilitator and participant roles";
  }
  return null;
}
