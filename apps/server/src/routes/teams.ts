import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { CreateTeamSchema, UpdateTeamSchema } from "shared";
import { agentRegistry } from "../agents";
import { getUsername } from "../lib/auth-helpers";
import { authMiddleware } from "../middleware/auth";
import { TeamBusyError, teamExecutionStore, teamOrchestrator, teamStore } from "../teams";

export const teamsRouter = new Hono();
teamsRouter.use("/*", authMiddleware);
teamsRouter.use("/*", (c, next) => process.env.CREWFACTORY_TEAMS_ENABLED === "false" ? c.json({ error: "Teams are disabled" }, 404) : next());

function validateOwnedMembers(username: string, members: { agentId: string }[]): string | null {
  for (const member of members) {
    const agent = agentRegistry.get(member.agentId);
    if (!agent || agent.username !== username) return `Agent "${member.agentId}" is not registered or not owned by you`;
  }
  return null;
}

teamsRouter.get("/", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ teams: teamStore.list(username) });
});

teamsRouter.post("/", zValidator("json", CreateTeamSchema), (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const data = c.req.valid("json");
  const ownershipError = validateOwnedMembers(username, data.members);
  if (ownershipError) return c.json({ error: ownershipError }, 400);
  try { return c.json(teamStore.create(username, data), 201); } catch (error) { return c.json({ error: error instanceof Error ? error.message : "Invalid team" }, 400); }
});

teamsRouter.get("/:id", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const team = teamStore.get(username, c.req.param("id"));
  return team ? c.json(team) : c.json({ error: "Team not found" }, 404);
});

teamsRouter.patch("/:id", zValidator("json", UpdateTeamSchema), (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const data = c.req.valid("json");
  if (data.members) {
    const ownershipError = validateOwnedMembers(username, data.members);
    if (ownershipError) return c.json({ error: ownershipError }, 400);
  }
  try {
    const team = teamStore.update(username, c.req.param("id"), data);
    return team ? c.json(team) : c.json({ error: "Team not found" }, 404);
  } catch (error) { return c.json({ error: error instanceof Error ? error.message : "Invalid team" }, 400); }
});

teamsRouter.post("/:id/executions", zValidator("json", z.object({ task: z.string().min(1).max(100_000), requestId: z.string().min(1).max(200) })), async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const team = teamStore.get(username, c.req.param("id"));
  if (!team) return c.json({ error: "Team not found" }, 404);
  const data = c.req.valid("json");
  try { return c.json({ executionId: await teamOrchestrator.start(username, team, data.task, data.requestId) }, 202); }
  catch (error) { return c.json({ error: error instanceof Error ? error.message : "Unable to start execution", code: error instanceof TeamBusyError ? "team_busy" : undefined, executionId: error instanceof TeamBusyError ? error.executionId : undefined }, error instanceof TeamBusyError ? 409 : 500); }
});

teamsRouter.get("/:id/executions", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  if (!teamStore.get(username, c.req.param("id"))) return c.json({ error: "Team not found" }, 404);
  return c.json({ executions: teamExecutionStore.list(username, c.req.param("id")) });
});

teamsRouter.post("/:id/executions/:executionId/cancel", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  if (!teamStore.get(username, c.req.param("id"))) return c.json({ error: "Team not found" }, 404);
  return c.json({ success: teamOrchestrator.cancel(username, c.req.param("id"), c.req.param("executionId")) });
});

teamsRouter.get("/:id/executions/:executionId", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  if (!teamStore.get(username, c.req.param("id"))) return c.json({ error: "Team not found" }, 404);
  const execution = teamExecutionStore.get(username, c.req.param("id"), c.req.param("executionId"));
  return execution ? c.json({ execution }) : c.json({ error: "Execution not found" }, 404);
});

teamsRouter.get("/:id/executions/:executionId/events", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  if (!teamStore.get(username, c.req.param("id"))) return c.json({ error: "Team not found" }, 404);
  if (!teamExecutionStore.get(username, c.req.param("id"), c.req.param("executionId"))) return c.json({ error: "Execution not found" }, 404);
  const afterSequence = Number.parseInt(c.req.query("afterSequence") ?? "0", 10);
  return c.json({ events: teamExecutionStore.events(username, c.req.param("id"), c.req.param("executionId"), Number.isFinite(afterSequence) ? Math.max(0, afterSequence) : 0) });
});
