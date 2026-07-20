import { existsSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { getUsername } from "../lib/auth-helpers";
import { applyCacheHeaders } from "../core/cache-headers";
import { teamStore, teamOrchestrator } from "../teams";
import { agentRegistry } from "../agents";
import { sessionManager } from "../core/session-manager";
import { CreateTeamSchema, UpdateTeamSchema, TeamMemberSchema, SessionPrefix, getTeamDir, getTeamWorkspaceDir } from "shared";

export const teamsRouter = new Hono();

teamsRouter.get("/:id/avatar", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const team = teamStore.getTeam(username, id);
  if (!team) return c.json({ error: "Team not found" }, 404);

  const teamDir = getTeamDir(username, id);
  if (!existsSync(teamDir)) return c.notFound();

  const files = readdirSync(teamDir);
  const avatarFile = files.find((f) => f.startsWith("avatar."));
  if (!avatarFile) return c.notFound();

  const avatarPath = join(teamDir, avatarFile);
  const cacheResponse = applyCacheHeaders(c, avatarPath);
  if (cacheResponse) {
    return cacheResponse;
  }

  const file = Bun.file(avatarPath);
  const responseHeaders: Record<string, string> = {
    "Content-Type": file.type || "application/octet-stream",
  };
  c.res.headers.forEach((val, key) => {
    responseHeaders[key] = val;
  });

  return new Response(file.stream(), {
    headers: responseHeaders,
  });
});

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

teamsRouter.post("/:id/orchestration-session", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const team = teamStore.getTeam(username, c.req.param("id"));
  if (!team) return c.json({ error: "Team not found" }, 404);
  if (team.teamType !== "Orchestration") return c.json({ error: "Only Orchestration teams have an owner session" }, 400);

  const leader = team.members.find((member) => member.role === "lead");
  if (!leader || !agentRegistry.get(leader.agentId, username)) {
    return c.json({ error: "The orchestration leader is not available" }, 400);
  }

  const sessionId = `${SessionPrefix.TEAM}${team.id}`;
  const now = new Date().toISOString();
  
  const meta = sessionManager.metadataStore.getSessionMetadata(username, sessionId);
  if (!meta) {
    sessionManager.metadataStore.saveSessionMetadata(username, sessionId, {
      name: `${team.name} — Orchestration`,
      createdAt: now,
      updatedAt: now,
      agentId: leader.agentId,
      teamId: team.id,
    });
  }

  await sessionManager.getOrCreateSession(username, sessionId, undefined, leader.agentId, undefined, {
    workspaceDir: getTeamWorkspaceDir(username, team.id),
  });
  return c.json({ sessionId, leaderAgentId: leader.agentId });
});

teamsRouter.get("/:id/orchestration-session", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const team = teamStore.getTeam(username, c.req.param("id"));
  if (!team) return c.json({ error: "Team not found" }, 404);
  if (team.teamType !== "Orchestration") return c.json({ error: "Only Orchestration teams have an owner session" }, 400);

  const leader = team.members.find((member) => member.role === "lead");
  if (!leader) {
    return c.json({ error: "The orchestration leader is not available" }, 400);
  }

  const sessionId = `${SessionPrefix.TEAM}${team.id}`;
  return c.json({ sessionId, leaderAgentId: leader.agentId });
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

  const sessions = await sessionManager.listSessions(username).catch(() => []);
  for (const session of sessions.filter((item) => item.teamId === id)) {
    await sessionManager.destroySession(username, session.id).catch(() => {});
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
  const { message } = c.req.valid("json");
  const team = teamStore.getTeam(username, id);
  if (!team) return c.json({ error: "Team not found" }, 404);

  if (team.teamType === "Orchestration") {
    const leader = team.members.find((member) => member.role === "lead");
    if (!leader) {
      return c.json({ error: "The orchestration leader is not available" }, 400);
    }
    const ownerSessionId = `${SessionPrefix.TEAM}${team.id}`;
    const session = await sessionManager.getOrCreateSession(username, ownerSessionId, undefined, leader.agentId, undefined, {
      workspaceDir: getTeamWorkspaceDir(username, team.id),
    });
    session.prompt(message).catch((err) => {
      console.error(`[TeamsRoute] Persistent session prompt error:`, err);
    });
  } else {
    // Trigger dispatch asynchronously for Negotiation
    teamOrchestrator.dispatchUserMessage(username, id, message, c.req.valid("json").sessionId).catch((err) => {
      console.error(`[TeamsRoute] Error dispatching message for team ${id}:`, err);
    });
  }

  return c.json({ success: true });
});

teamsRouter.post("/:id/abort", zValidator("json", z.object({ sessionId: z.string().optional() }).optional()), async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const body = c.req.valid("json");
  const team = teamStore.getTeam(username, id);

  if (team && team.teamType === "Orchestration") {
    const ownerSessionId = `${SessionPrefix.TEAM}${team.id}`;
    const session = sessionManager.getSession(username, ownerSessionId);
    if (session) {
      await session.abort().catch(() => {});
    }
    const { delegationRegistry } = await import("../core/delegation-registry");
    delegationRegistry.abortAllRecursive(ownerSessionId);
  } else {
    teamOrchestrator.abortDispatch(username, id, body?.sessionId);
  }
  return c.json({ success: true });
});

teamsRouter.get("/:id/agents", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ agents: agentRegistry.list(username) });
});

teamsRouter.put("/:id/context", zValidator("json", z.object({ context: z.array(z.object({ key: z.string().min(1), value: z.string() })) })), (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const { context } = c.req.valid("json");
  const updated = teamStore.updateTeamContext(username, id, context);
  if (!updated) return c.json({ error: "Team not found" }, 404);
  return c.json(updated);
});

teamsRouter.post("/:id/avatar", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const team = teamStore.getTeam(username, id);
  if (!team) return c.json({ error: "Team not found" }, 404);

  const body = await c.req.parseBody();
  const file = body.file as File | undefined;
  if (!file) return c.json({ error: "No file provided" }, 400);

  const teamDir = getTeamDir(username, id);
  if (!existsSync(teamDir)) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(teamDir, { recursive: true });
  }

  try {
    const files = readdirSync(teamDir);
    for (const f of files) {
      if (f.startsWith("avatar.")) {
        unlinkSync(join(teamDir, f));
      }
    }
  } catch {}

  const ext = file.name.split(".").pop() || "png";
  const avatarPath = join(teamDir, `avatar.${ext}`);
  const buffer = await file.arrayBuffer();
  writeFileSync(avatarPath, Buffer.from(buffer));

  const avatarUrl = `/api/teams/${id}/avatar`;
  teamStore.updateTeam(username, id, { avatarUrl });

  return c.json({ avatarUrl });
});

teamsRouter.delete("/:id/avatar", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const team = teamStore.getTeam(username, id);
  if (!team) return c.json({ error: "Team not found" }, 404);

  const teamDir = getTeamDir(username, id);
  if (existsSync(teamDir)) {
    try {
      const files = readdirSync(teamDir);
      for (const f of files) {
        if (f.startsWith("avatar.")) {
          unlinkSync(join(teamDir, f));
        }
      }
    } catch {}
  }

  teamStore.updateTeam(username, id, { avatarUrl: "" });
  return c.body(null, 204);
});

teamsRouter.get("/:id/analytics", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const team = teamStore.getTeam(username, id);
  if (!team) return c.json({ error: "Team not found" }, 404);

  const msgs = teamStore.getMessages(username, id, 1000);

  const turnsMap: Record<string, { agentId: string, agentName: string, count: number }> = {};
  let vetoCount = 0;

  for (const m of msgs) {
    if (m.role === "agent" && m.agentId) {
      if (!turnsMap[m.agentId]) {
        turnsMap[m.agentId] = { agentId: m.agentId, agentName: m.agentName || m.agentId, count: 0 };
      }
      turnsMap[m.agentId].count++;
    }

    if (m.role === "agent" && m.content?.includes("VETO:")) {
      vetoCount++;
    }
  }

  const turnsPerAgent = Object.values(turnsMap);
  const totalTurns = msgs.filter(m => m.role === "agent").length;
  const vetoRate = totalTurns > 0 ? parseFloat((vetoCount / totalTurns).toFixed(2)) : 0;

  const negState = teamStore.getNegotiationState(username, id);
  const arbitrationRounds = negState._arbitrations || 0;
  const divergenceCount = negState._divergences || 0;

  let totalResponseTime = 0;
  let responseCount = 0;
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].role === "user") {
      for (let j = i + 1; j < msgs.length; j++) {
        if (msgs[j].role === "agent") {
          const timeDiff = new Date(msgs[j].createdAt).getTime() - new Date(msgs[i].createdAt).getTime();
          if (timeDiff > 0 && timeDiff < 30 * 60 * 1000) {
            totalResponseTime += timeDiff;
            responseCount++;
          }
          break;
        }
      }
    }
  }
  const avgResponseTimeMs = responseCount > 0 ? Math.round(totalResponseTime / responseCount) : 0;

  const sessions = await sessionManager.listSessions(username, { teamId: id });
  let totalSessions = sessions.length;

  return c.json({
    turnsPerAgent,
    vetoRate,
    vetoCount,
    arbitrationRounds,
    divergenceCount,
    avgResponseTimeMs,
    totalSessions,
  });
});
