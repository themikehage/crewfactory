import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { getUsername } from "../lib/auth-helpers";
import { teamStore, teamOrchestrator } from "../teams";
import { agentRegistry } from "../agents";
import { sessionManager } from "../core/session-manager";
import { CreateTeamSchema, UpdateTeamSchema, TeamMemberSchema } from "shared";

export const teamsRouter = new Hono();

teamsRouter.use("/*", authMiddleware);

function cleanTeamGhostMembers(team: any, username: string): any {
  if (!team || !team.members) return team;

  const cleanedMembers = team.members.filter((m: any) => {
    return !!agentRegistry.get(m.agentId, username);
  });

  return {
    ...team,
    members: cleanedMembers,
  };
}

function validateTeamMembers(members: any[]): string | null {
  const leaders = members.filter((m) => m.role === "lead");
  if (leaders.length === 0) {
    return "A team must have at least one leader.";
  }
  if (leaders.length > 1) {
    return "A team cannot have more than one leader.";
  }
  return null;
}

teamsRouter.get("/", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const teams = teamStore.listTeams(username);
  const cleanedTeams = teams.map((t) => cleanTeamGhostMembers(t, username));
  return c.json({ teams: cleanedTeams });
});

teamsRouter.post("/", zValidator("json", CreateTeamSchema), (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const data = c.req.valid("json");
  const validationError = validateTeamMembers(data.members || []);
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  const team = teamStore.createTeam(username, data);
  return c.json(team, 201);
});

teamsRouter.get("/:id", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const team = teamStore.getTeam(username, id);
  if (!team) return c.json({ error: "Team not found" }, 404);
  return c.json(cleanTeamGhostMembers(team, username));
});

teamsRouter.patch("/:id", zValidator("json", UpdateTeamSchema), (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const data = c.req.valid("json");

  if (data.members !== undefined) {
    const validationError = validateTeamMembers(data.members);
    if (validationError) {
      return c.json({ error: validationError }, 400);
    }
  }

  const arbiterAgentId = data.negotiationProtocol?.arbiterAgentId;
  if (arbiterAgentId) {
    const team = teamStore.getTeam(username, id);
    if (team) {
      const valid = team.members.some((m) => m.agentId === arbiterAgentId);
      if (!valid) {
        return c.json({ error: "arbiterAgentId must be an existing team member" }, 400);
      }
    }
  }

  const updated = teamStore.updateTeam(username, id, data);
  if (!updated) return c.json({ error: "Team not found" }, 404);
  return c.json(updated);
});

teamsRouter.delete("/:id", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const team = teamStore.getTeam(username, id);
  if (!team) return c.json({ error: "Team not found" }, 404);

  // Cascading delete: destroy all chat sessions associated with this team
  const sessions = await sessionManager.listSessions(username).catch(() => []);
  for (const s of sessions) {
    if (s.channelId === id) { // For simplicity, we bind team sessions using channelId internally in the session metadata
      await sessionManager.destroySession(username, s.id).catch((err) =>
        console.error(`[TeamsRoute] Failed to destroy session ${s.id}:`, err)
      );
    }
  }

  const deleted = teamStore.deleteTeam(username, id);
  if (!deleted) return c.json({ error: "Team not found" }, 404);
  return c.body(null, 204);
});

teamsRouter.post("/:id/members", zValidator("json", TeamMemberSchema), (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const team = teamStore.getTeam(username, id);
  if (!team) return c.json({ error: "Team not found" }, 404);

  const data = c.req.valid("json");
  const agentEntry = agentRegistry.get(data.agentId);
  if (!agentEntry || agentEntry.username !== username) {
    return c.json({ error: `Agent "${data.agentId}" not registered or not owned by you` }, 400);
  }

  if (data.role === "lead") {
    const existingLead = team.members.find((m) => m.role === "lead" && m.agentId !== data.agentId);
    if (existingLead) {
      return c.json({ error: "Team already has a leader. Remove or reassign the current leader first." }, 409);
    }
  }

  const existingIndex = team.members.findIndex((m) => m.agentId === data.agentId);
  const updatedMembers = [...team.members];
  const memberWithRole = {
    ...data,
    role: data.role || "member",
  };

  if (existingIndex >= 0) {
    updatedMembers[existingIndex] = memberWithRole;
  } else {
    updatedMembers.push(memberWithRole);
  }

  const validationError = validateTeamMembers(updatedMembers);
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  const updatedTeam = teamStore.updateMembers(username, id, updatedMembers);
  return c.json(updatedTeam);
});

teamsRouter.patch("/:id/members/:agentId", zValidator("json", z.object({
  role: z.enum(["lead", "member", "observer"]).optional(),
  outputMode: z.enum(["full-proposal", "diff-suggestion", "normal"]).optional(),
})), (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const agentId = c.req.param("agentId");
  const team = teamStore.getTeam(username, id);
  if (!team) return c.json({ error: "Team not found" }, 404);

  const data = c.req.valid("json");

  if (data.role === "lead") {
    const existingLead = team.members.find((m) => m.role === "lead" && m.agentId !== agentId);
    if (existingLead) {
      return c.json({ error: "Team already has a leader. Remove or reassign the current leader first." }, 409);
    }
  }

  const index = team.members.findIndex((m) => m.agentId === agentId);
  if (index === -1) return c.json({ error: "Member not found in team" }, 404);

  const updatedMembers = [...team.members];
  updatedMembers[index] = {
    ...updatedMembers[index],
    ...(data.role !== undefined && { role: data.role }),
    ...(data.outputMode !== undefined && { outputMode: data.outputMode }),
  };

  const validationError = validateTeamMembers(updatedMembers);
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  const updatedTeam = teamStore.updateMembers(username, id, updatedMembers);
  return c.json(updatedTeam);
});

teamsRouter.delete("/:id/members/:agentId", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const agentId = c.req.param("agentId");
  const team = teamStore.getTeam(username, id);
  if (!team) return c.json({ error: "Team not found" }, 404);

  const updatedMembers = team.members.filter((m) => m.agentId !== agentId);
  const validationError = validateTeamMembers(updatedMembers);
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  const updatedTeam = teamStore.updateMembers(username, id, updatedMembers);
  return c.json(updatedTeam);
});

teamsRouter.get("/:id/messages", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const limit = c.req.query("limit") ? parseInt(c.req.query("limit")!) : 100;
  const sessionId = c.req.query("sessionId");
  const team = teamStore.getTeam(username, id);
  if (!team) return c.json({ error: "Team not found" }, 404);

  const messages = teamStore.getMessages(username, id, limit, sessionId);
  return c.json({ messages });
});

teamsRouter.get("/:id/negotiation-state", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const team = teamStore.getTeam(username, id);
  if (!team) return c.json({ error: "Team not found" }, 404);

  const state = teamStore.getNegotiationState(username, id);
  return c.json({ state });
});

teamsRouter.get("/:id/active-streamings", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const sessionId = c.req.query("sessionId");
  const team = teamStore.getTeam(username, id);
  if (!team) return c.json({ error: "Team not found" }, 404);

  const streams = teamOrchestrator.getActiveStreams(id, sessionId);
  return c.json({ streamingAgents: streams });
});

teamsRouter.post("/:id/send", zValidator("json", z.object({ message: z.string().min(1), sessionId: z.string().optional() })), async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const { message, sessionId } = c.req.valid("json");
  const team = teamStore.getTeam(username, id);
  if (!team) return c.json({ error: "Team not found" }, 404);

  // Trigger dispatch asynchronously
  teamOrchestrator.dispatchUserMessage(username, id, message, sessionId).catch((err) => {
    console.error(`[TeamsRoute] Error dispatching message for team ${id}:`, err);
  });

  return c.json({ success: true });
});

teamsRouter.post("/:id/abort", zValidator("json", z.object({ sessionId: z.string().optional() }).optional()), async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const body = c.req.valid("json");
  teamOrchestrator.abortDispatch(username, id, body?.sessionId);
  return c.json({ success: true });
});

teamsRouter.get("/:id/agents", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ agents: agentRegistry.list(username) });
});
