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

logsRouter.get("/llm-errors", (c) => {
  const { username } = getAuthPayload(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const logPath = "/tmp/crewfactory/logs/llm-errors.log";
  const { existsSync, readFileSync } = require("node:fs");
  if (!existsSync(logPath)) {
    return c.json({ errors: [] });
  }

  try {
    const raw = readFileSync(logPath, "utf-8");
    const errors = raw
      .split("\n")
      .filter((line: string) => line.trim().length > 0)
      .map((line: string) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((e: any) => e !== null && e.username === username)
      .reverse();

    return c.json({ errors });
  } catch (err: any) {
    console.error("[logsRouter] Failed to read llm-errors.log:", err);
    return c.json({ errors: [] });
  }
});
