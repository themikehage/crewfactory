import { z } from "zod";

export const EnvelopeResultSchema = z.object({
  status: z.enum(["success", "partial", "blocked", "error"]),
  executive_summary: z.string(),
  artifacts: z.string().default("none"),
  risks: z.string().default("None"),
  subagentSessionId: z.string().optional(),
});

export type EnvelopeResult = z.infer<typeof EnvelopeResultSchema>;
