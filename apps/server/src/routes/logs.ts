import { Hono } from "hono";
import { authMiddleware, getAuthPayload } from "../middleware/auth";
import { eventBroker } from "../lib/event-broker";

export const logsRouter = new Hono();

logsRouter.use("/*", authMiddleware);

logsRouter.get("/", (c) => {
  const { username } = getAuthPayload(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const logs = eventBroker.getHistory(username);
  return c.json({ logs });
});
