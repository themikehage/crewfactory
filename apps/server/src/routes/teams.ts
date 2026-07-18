import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { teamStore, teamRunStore, teamRunner, TeamBusyError } from "../teams";
import { CreateTeamSchema, UpdateTeamSchema } from "shared";

export const teamsRouter = new Hono();
teamsRouter.use("*", authMiddleware);

teamsRouter.get("/", (c) => {
  const user = c.get("user");
  const teams = teamStore.listTeams(user.username);
  return c.json({ teams });
});

teamsRouter.post("/", zValidator("json", CreateTeamSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const team = teamStore.createTeam(user.username, body);
  try {
    const { broadcastToUser } = await import("../ws/handler");
    broadcastToUser(user.username, { type: "entity-updated", entityType: "team" });
  } catch {}
  return c.json(team, 201);
});

teamsRouter.get("/:teamId", (c) => {
  const user = c.get("user");
  const { teamId } = c.req.param();
  const team = teamStore.getTeam(user.username, teamId);
  if (!team) return c.json({ error: "Team not found" }, 404);
  return c.json(team);
});

teamsRouter.put("/:teamId", zValidator("json", UpdateTeamSchema), async (c) => {
  const user = c.get("user");
  const { teamId } = c.req.param();
  const body = c.req.valid("json");
  const updated = teamStore.updateTeam(user.username, teamId, body);
  if (!updated) return c.json({ error: "Team not found" }, 404);
  try {
    const { broadcastToUser } = await import("../ws/handler");
    broadcastToUser(user.username, { type: "entity-updated", entityType: "team" });
  } catch {}
  return c.json(updated);
});

teamsRouter.delete("/:teamId", async (c) => {
  const user = c.get("user");
  const { teamId } = c.req.param();
  const ok = teamStore.deleteTeam(user.username, teamId);
  if (!ok) return c.json({ error: "Team not found" }, 404);
  try {
    const { broadcastToUser } = await import("../ws/handler");
    broadcastToUser(user.username, { type: "entity-updated", entityType: "team" });
  } catch {}
  return c.json({ success: true });
});

teamsRouter.get("/:teamId/sessions", (c) => {
  const user = c.get("user");
  const { teamId } = c.req.param();
  if (!teamStore.getTeam(user.username, teamId)) return c.json({ error: "Team not found" }, 404);
  const sessions = teamStore.listSessions(user.username, teamId);
  return c.json({ sessions });
});

teamsRouter.post("/:teamId/sessions", zValidator("json", z.object({ name: z.string().min(1).max(200) })), (c) => {
  const user = c.get("user");
  const { teamId } = c.req.param();
  if (!teamStore.getTeam(user.username, teamId)) return c.json({ error: "Team not found" }, 404);
  const { name } = c.req.valid("json");
  const session = teamStore.createSession(user.username, teamId, name);
  return c.json(session, 201);
});

teamsRouter.get("/:teamId/sessions/:sessionId", (c) => {
  const user = c.get("user");
  const { teamId, sessionId } = c.req.param();
  const session = teamStore.getSession(user.username, teamId, sessionId);
  if (!session) return c.json({ error: "Session not found" }, 404);
  return c.json(session);
});

teamsRouter.put(
  "/:teamId/sessions/:sessionId",
  zValidator("json", z.object({ name: z.string().min(1).max(200) })),
  (c) => {
    const user = c.get("user");
    const { teamId, sessionId } = c.req.param();
    const { name } = c.req.valid("json");
    const updated = teamStore.updateSession(user.username, teamId, sessionId, { name });
    if (!updated) return c.json({ error: "Session not found" }, 404);
    return c.json(updated);
  }
);

teamsRouter.get("/:teamId/sessions/:sessionId/messages", (c) => {
  const user = c.get("user");
  const { teamId, sessionId } = c.req.param();
  const limit = Number(c.req.query("limit") ?? "100");
  const messages = teamStore.getSessionMessages(user.username, teamId, sessionId, limit);
  return c.json({ messages });
});

teamsRouter.get("/:teamId/runs", (c) => {
  const user = c.get("user");
  const { teamId } = c.req.param();
  const sessionId = c.req.query("sessionId");
  const limit = Number(c.req.query("limit") ?? "20");
  const runs = teamRunStore.listRuns(user.username, teamId, sessionId, limit);
  return c.json({ runs });
});

teamsRouter.get("/:teamId/runs/active", (c) => {
  const user = c.get("user");
  const { teamId } = c.req.param();
  const sessionId = c.req.query("sessionId");
  if (!sessionId) return c.json({ error: "sessionId query param required" }, 400);
  const run = teamRunStore.getActiveRun(user.username, teamId, sessionId);
  return c.json({ run: run ?? null });
});

teamsRouter.get("/:teamId/runs/:runId", (c) => {
  const user = c.get("user");
  const { teamId, runId } = c.req.param();
  const run = teamRunStore.getRun(user.username, teamId, runId);
  if (!run) return c.json({ error: "Run not found" }, 404);
  return c.json(run);
});

teamsRouter.delete("/:teamId/runs/:runId", async (c) => {
  const user = c.get("user");
  const { teamId, runId } = c.req.param();
  const run = teamRunStore.getRun(user.username, teamId, runId);
  if (!run) return c.json({ error: "Run not found" }, 404);
  const aborted = await teamRunner.abort(user.username, teamId, run.sessionId);
  return c.json({ aborted });
});

teamsRouter.get("/:teamId/runs/:runId/events", (c) => {
  const user = c.get("user");
  const { teamId, runId } = c.req.param();
  const afterSequence = Number(c.req.query("afterSequence") ?? "0");
  const limit = Number(c.req.query("limit") ?? "500");
  const events = teamRunStore.getEvents(user.username, teamId, runId, afterSequence, limit);
  return c.json({ events });
});
