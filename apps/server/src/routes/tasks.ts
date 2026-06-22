import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware, getAuthPayload } from "../middleware/auth";
import { piSessionManager } from "../pi/session-manager";
import { taskRunner } from "../pi/task-runner";
import { CreateTaskRunSchema } from "shared";
import { wsUserSend } from "../ws/handler";

export const tasksRouter = new Hono();
tasksRouter.use("/*", authMiddleware);

tasksRouter.post("/:id/task", zValidator("json", CreateTaskRunSchema), async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);
  const body = c.req.valid("json");

  const session = piSessionManager.getSession(username, sessionId);
  if (!session) {
    return c.json({ error: "Session not found or not initialized" }, 404);
  }

  const workspaceDir = piSessionManager.getWorkspaceDir(username, sessionId);
  if (!workspaceDir) {
    return c.json({ error: "Session workspace not found" }, 404);
  }

  const input = "tasks" in body && body.tasks
    ? { objective: body.objective, tasks: body.tasks }
    : { objective: (body as { objective: string }).objective };

  const wsSend = wsUserSend(username);

  try {
    const taskRun = await taskRunner.start(username, sessionId, workspaceDir, session, input, wsSend);
    return c.json(taskRun, 201);
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

tasksRouter.get("/:id/tasks", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);

  const active = taskRunner.getStatus(username, sessionId);
  if (active) return c.json(active);

  const workspaceDir = piSessionManager.getWorkspaceDir(username, sessionId);
  if (!workspaceDir) return c.json(null);

  const fromDisk = taskRunner.loadFromDisk(workspaceDir);
  return c.json(fromDisk);
});

tasksRouter.post("/:id/task/pause", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);
  const ok = taskRunner.pause(username, sessionId);
  return c.json({ success: ok });
});

tasksRouter.post("/:id/task/resume", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);

  const session = piSessionManager.getSession(username, sessionId);
  if (!session) return c.json({ error: "Session not found" }, 404);

  const wsSend = wsUserSend(username);
  const ok = await taskRunner.resume(username, sessionId, session, wsSend);
  return c.json({ success: ok });
});

tasksRouter.delete("/:id/task", async (c) => {
  const sessionId = c.req.param("id");
  const { username } = getAuthPayload(c);
  const ok = taskRunner.cancel(username, sessionId);
  return c.json({ success: ok });
});
