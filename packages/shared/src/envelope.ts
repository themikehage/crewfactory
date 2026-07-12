import { z } from "zod";

export const EnvelopeResultSchema = z.object({
  status: z.enum(["success", "partial", "blocked", "error"]),
  executive_summary: z.string(),
  artifacts: z.string().default("none"),
  risks: z.string().default("None"),
  subagentSessionId: z.string().optional(),
});

export type EnvelopeResult = z.infer<typeof EnvelopeResultSchema>;

export const DELEGATION_NOTIFICATION_TYPE = "delegation_notification" as const;

export interface DelegationNotificationDetails {
  type: typeof DELEGATION_NOTIFICATION_TYPE;
  status: EnvelopeResult["status"];
  toolName: string;
  toolCallId: string;
  subagentSessionId: string;
  executiveSummary: string;
  artifacts: string;
  hasOutputText: boolean;
}
