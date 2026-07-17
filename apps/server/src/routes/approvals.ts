import { Hono } from "hono";
import { authMiddleware, getAuthPayload } from "../middleware/auth";
import { approvalManager } from "../core/approvals/approval-manager";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

export const approvalsRouter = new Hono();

approvalsRouter.use("/*", authMiddleware);

approvalsRouter.get("/", async (c) => {
  const { username } = getAuthPayload(c);
  const pending = approvalManager.getAll(username);
  return c.json({ pending });
});

const ResolveApprovalSchema = z.object({
  action: z.enum(["approve", "deny"]),
  payload: z.record(z.any()).optional(),
});

approvalsRouter.post("/:id", zValidator("json", ResolveApprovalSchema), async (c) => {
  const { id } = c.req.param();
  const { action, payload } = c.req.valid("json");
  const success = approvalManager.resolve(id, { action, payload });

  if (success) {
    return c.json({ success: true });
  } else {
    return c.json({ error: "Approval request not found or already completed" }, 404);
  }
});
