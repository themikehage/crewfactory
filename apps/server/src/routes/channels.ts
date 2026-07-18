import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { getUsername } from "../lib/auth-helpers";
import { ChannelBusyError, channelExecutionStore, channelStore, channelOrchestrator } from "../channels";
import { agentRegistry } from "../agents";
import { sessionManager } from "../core/session-manager";
import { ChannelBehaviourPolicySchema, CreateChannelSchema, UpdateChannelSchema, AddMemberSchema, UpdateMemberSchema, ChannelTopologySchema, compileChannelPolicy, inferChannelTopology, previewChannelTopology, validateChannelTopology } from "shared";
import { scopeConfigManager } from "../core/scope";
import { eventBroker } from "../lib/event-broker";

export const channelsRouter = new Hono();

channelsRouter.use("/*", authMiddleware);

channelsRouter.use("/*", async (c, next) => {
  if (!["PATCH", "POST", "PUT", "DELETE"].includes(c.req.method)) return next();
  if (c.req.path.endsWith("/send") || c.req.path.endsWith("/abort")) return next();
  const pathParts = c.req.path.split("/").filter(Boolean);
  const channelsIndex = pathParts.lastIndexOf("channels");
  const id = channelsIndex >= 0 ? pathParts[channelsIndex + 1] : undefined;
  const username = getUsername(c);
  if (id && username && channelOrchestrator.hasActiveDispatch(username, id)) {
    return c.json({ error: "Channel configuration cannot change during an active execution", code: "channel_busy", executionId: channelOrchestrator.getActiveExecutionId(username, id) }, 409);
  }
  await next();
});

function cleanChannelGhostMembers(channel: any, username: string): any {
  if (!channel || !channel.members) return channel;

  const cleanedMembers = channel.members.filter((m: any) => {
    return !!agentRegistry.get(m.agentId, username);
  });
  
  const finalMembers = cleanedMembers.map((m: any) => {
    if (m.targetAgentIds) {
      return {
        ...m,
        targetAgentIds: m.targetAgentIds.filter((tid: string) => {
          return !!agentRegistry.get(tid, username);
        }),
      };
    }
    return m;
  });

  return {
    ...channel,
    members: finalMembers,
  };
}

channelsRouter.get("/", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const channels = channelStore.listChannels(username);
  const cleanedChannels = channels.map((ch) => cleanChannelGhostMembers(ch, username));
  return c.json({ channels: cleanedChannels });
});

channelsRouter.post("/", zValidator("json", CreateChannelSchema), (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const data = c.req.valid("json");
  if (data.topology) {
    const members = data.members ?? [];
    for (const member of members) {
      const agent = agentRegistry.get(member.agentId);
      if (!agent || agent.username !== username) return c.json({ error: `Agent "${member.agentId}" not registered or not owned by you` }, 400);
    }
    const validation = validateChannelTopology(data.topology, members, data.negotiationProtocol);
    if (!validation.valid) return c.json({ error: "Invalid channel topology", diagnostics: validation.diagnostics }, 400);
  }
  const channel = channelStore.createChannel(username, data);
  return c.json(channel, 201);
});

channelsRouter.get("/:id", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  let channel = channelStore.getChannel(username, id);
  if (!channel && id.startsWith("lab_")) {
    const parts = id.split("_");
    if (parts.length >= 3) {
      const variantKey = parts[parts.length - 1];
      const experimentId = parts.slice(1, parts.length - 1).join("_");
      try {
        const { ExperimentStore } = await import("../laboratory/experiment-store");
        const exp = await ExperimentStore.getExperiment(username, experimentId);
        if (exp) {
          if (variantKey === "single") {
            channel = channelStore.createChannel(username, {
              id: id,
              name: `${exp.name} (Single)`,
              description: "Laboratory single agent run",
              maxChainDepth: 3,
              showThinking: false,
              showTools: false
            } as any);
          } else {
            channel = channelStore.createChannel(username, {
              id: id,
              name: variantKey === "multiNoLeader" ? `${exp.name} (Horizontal)` : `${exp.name} (Jerárquico)`,
              description: `Laboratory multi agent run (${variantKey})`,
              maxChainDepth: 5,
              showThinking: true,
              showTools: true
            } as any);
          }
        }
      } catch (err) {
        console.error(`[ChannelsRoute] Failed to dynamically recreate channel ${id}:`, err);
      }
    }
  }

  if (!channel) return c.json({ error: "Channel not found" }, 404);
  return c.json(cleanChannelGhostMembers(channel, username));
});

channelsRouter.patch("/:id", zValidator("json", UpdateChannelSchema), (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const data = c.req.valid("json");

  const existing = channelStore.getChannel(username, id);
  if (!existing) return c.json({ error: "Channel not found" }, 404);
  if (data.policy) {
    const compiled = compileChannelPolicy({ ...existing, policy: data.policy });
    if (compiled.diagnostics.some((diagnostic) => diagnostic.severity === "error")) return c.json({ error: "Invalid channel policy", diagnostics: compiled.diagnostics }, 400);
  }
  const effectiveTopology = data.topology ?? existing.topology;
  if (effectiveTopology) {
    const validation = validateChannelTopology(effectiveTopology, existing.members, data.negotiationProtocol ?? existing.negotiationProtocol);
    if (!validation.valid) return c.json({ error: "Invalid channel topology", diagnostics: validation.diagnostics }, 400);
    if (data.topology) data.executionSchedulerMode = data.topology.schedulerMode;
  }

  const arbiterAgentId = data.negotiationProtocol?.arbiterAgentId;
  if (arbiterAgentId) {
    const channel = channelStore.getChannel(username, id);
    if (channel) {
      const valid = channel.members.some((m) => m.agentId === arbiterAgentId);
      if (!valid) {
        return c.json({ error: "arbiterAgentId must be an existing channel member" }, 400);
      }
    }
  }

  const updated = channelStore.updateChannel(username, id, data);
  if (!updated) return c.json({ error: "Channel not found" }, 404);
  return c.json(updated);
});

channelsRouter.get("/:id/policy", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const channel = channelStore.getChannel(username, c.req.param("id"));
  if (!channel) return c.json({ error: "Channel not found" }, 404);
  const policy = compileChannelPolicy(channel);
  return c.json({ policy, policyVersion: channel.policyVersion ?? 1, topology: channel.topology, hardRules: ["Scheduler eligibility is enforced before prompting.", "Topology routing controls terminal ownership."], promptChecksum: policy.checksum });
});

channelsRouter.put("/:id/policy", zValidator("json", z.object({ policy: ChannelBehaviourPolicySchema })), (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const channel = channelStore.getChannel(username, c.req.param("id"));
  if (!channel) return c.json({ error: "Channel not found" }, 404);
  const policy = c.req.valid("json").policy;
  const compiled = compileChannelPolicy({ ...channel, policy });
  if (compiled.diagnostics.some((diagnostic) => diagnostic.severity === "error")) return c.json({ error: "Invalid channel policy", diagnostics: compiled.diagnostics }, 400);
  return c.json(channelStore.updateChannel(username, channel.id, { policy }));
});

channelsRouter.get("/:id/topology/migration", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const channel = channelStore.getChannel(username, c.req.param("id"));
  if (!channel) return c.json({ error: "Channel not found" }, 404);
  const inferred = channel.topology ?? inferChannelTopology(channel.members, channel.negotiationProtocol);
  const validation = validateChannelTopology(inferred, channel.members, channel.negotiationProtocol);
  return c.json({ topology: inferred, diagnostics: validation.diagnostics, preview: previewChannelTopology(inferred), requiresReview: inferred.kind === "legacy_custom" || !validation.valid });
});

channelsRouter.get("/:id/topology/export", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const channel = channelStore.getChannel(username, c.req.param("id"));
  if (!channel) return c.json({ error: "Channel not found" }, 404);
  const topology = channel.topology ?? inferChannelTopology(channel.members, channel.negotiationProtocol);
  return c.json({ schemaVersion: topology.version, topology });
});

channelsRouter.put("/:id/topology/import", zValidator("json", z.object({ topology: ChannelTopologySchema })), (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const channel = channelStore.getChannel(username, c.req.param("id"));
  if (!channel) return c.json({ error: "Channel not found" }, 404);
  const topology = c.req.valid("json").topology;
  const validation = validateChannelTopology(topology, channel.members, channel.negotiationProtocol);
  if (!validation.valid) return c.json({ error: "Invalid channel topology", diagnostics: validation.diagnostics }, 400);
  return c.json(channelStore.updateChannel(username, channel.id, { topology, executionSchedulerMode: topology.schedulerMode }));
});

channelsRouter.put("/:id/topology", zValidator("json", z.object({ topology: ChannelTopologySchema })), (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const channel = channelStore.getChannel(username, c.req.param("id"));
  if (!channel) return c.json({ error: "Channel not found" }, 404);
  const topology = c.req.valid("json").topology;
  const memberIds = topology.assignments.map((assignment) => assignment.agentId);
  if (new Set(memberIds).size !== memberIds.length) return c.json({ error: "Topology assignments must have unique agents" }, 400);
  for (const agentId of memberIds) {
    const agent = agentRegistry.get(agentId);
    if (!agent || agent.username !== username) return c.json({ error: `Agent "${agentId}" not registered or not owned by you` }, 400);
  }
  const members = topology.assignments.map((assignment) => ({
    agentId: assignment.agentId,
    role: assignment.role === "leader" ? "lead" as const : "member" as const,
    replyMode: topology.kind === "mention_only" ? "mention-only" as const : "user-only" as const,
    targetAgentIds: assignment.targets,
  }));
  const validation = validateChannelTopology(topology, members, channel.negotiationProtocol);
  if (!validation.valid) return c.json({ error: "Invalid channel topology", diagnostics: validation.diagnostics }, 400);
  return c.json(channelStore.applyTopology(username, channel.id, topology, members));
});

channelsRouter.put("/:id/context", zValidator("json", z.object({ context: z.array(z.object({ key: z.string().min(1), value: z.string() })) })), (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const { context } = c.req.valid("json");
  const updated = channelStore.updateChannelContext(username, id, context);
  if (!updated) return c.json({ error: "Channel not found" }, 404);
  return c.json(updated);
});

channelsRouter.delete("/:id", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const channel = channelStore.getChannel(username, id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);

  // Cascading delete: destroy all chat sessions associated with this channel
  const sessions = await sessionManager.listSessions(username).catch(() => []);
  for (const s of sessions) {
    if (s.channelId === id) {
      await sessionManager.destroySession(username, s.id).catch((err) =>
        console.error(`[ChannelsRoute] Failed to destroy session ${s.id}:`, err)
      );
    }
  }

  await scopeConfigManager.removeChannelScope(username, id);

  // Clean up benchmark runs associated with this channel
  try {
    const { ChannelBenchmarkStore } = await import("../laboratory/channel-benchmark-store");
    ChannelBenchmarkStore.deleteAll(username, id);
  } catch (err) {
    console.error(`[ChannelsRoute] Failed to clean up benchmarks for channel ${id}:`, err);
  }

  const deleted = channelStore.deleteChannel(username, id);
  if (!deleted) return c.json({ error: "Channel not found" }, 404);
  return c.body(null, 204);
});

channelsRouter.post("/:id/members", zValidator("json", AddMemberSchema), (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const channel = channelStore.getChannel(username, id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);
  if (channel.topology && channel.topology.kind !== "legacy_custom") return c.json({ error: "This channel uses a guided topology. Update its topology assignments in one save.", code: "topology_managed" }, 409);

  const data = c.req.valid("json");
  const agentEntry = agentRegistry.get(data.agentId);
  if (!agentEntry || agentEntry.username !== username) {
    return c.json({ error: `Agent "${data.agentId}" not registered or not owned by you` }, 400);
  }

  if (data.role === "lead") {
    const existingLead = channel.members.find((m) => m.role === "lead" && m.agentId !== data.agentId);
    if (existingLead) {
      return c.json({ error: "Channel already has a leader. Remove or reassign the current leader first." }, 409);
    }
  }

  const existingIndex = channel.members.findIndex((m) => m.agentId === data.agentId);
  const updatedMembers = [...channel.members];
  const memberWithRole = {
    ...data,
    role: data.role || "member",
    replyMode: data.role === "lead" ? "broadcast" : data.replyMode,
  };

  if (existingIndex >= 0) {
    updatedMembers[existingIndex] = memberWithRole;
  } else {
    updatedMembers.push(memberWithRole);
  }

  const updatedChannel = channelStore.updateMembers(username, id, updatedMembers);
  return c.json(updatedChannel);
});

channelsRouter.patch("/:id/members/:agentId", zValidator("json", UpdateMemberSchema), (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const agentId = c.req.param("agentId");
  const channel = channelStore.getChannel(username, id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);
  if (channel.topology && channel.topology.kind !== "legacy_custom") return c.json({ error: "This channel uses a guided topology. Update its topology assignments in one save.", code: "topology_managed" }, 409);

  const data = c.req.valid("json");

  if (data.role === "lead") {
    const existingLead = channel.members.find((m) => m.role === "lead" && m.agentId !== agentId);
    if (existingLead) {
      return c.json({ error: "Channel already has a leader. Remove or reassign the current leader first." }, 409);
    }
  }

  const index = channel.members.findIndex((m) => m.agentId === agentId);
  if (index === -1) return c.json({ error: "Member not found in channel" }, 404);

  const updatedMembers = [...channel.members];
  const newRole = data.role !== undefined ? data.role : updatedMembers[index].role;
  updatedMembers[index] = {
    ...updatedMembers[index],
    ...(data.replyMode !== undefined && { replyMode: data.replyMode }),
    ...(data.targetAgentIds !== undefined && { targetAgentIds: data.targetAgentIds }),
    ...(data.role !== undefined && { role: data.role }),
  };

  if (newRole === "lead" && data.replyMode === undefined) {
    updatedMembers[index].replyMode = "broadcast";
  }

  const updatedChannel = channelStore.updateMembers(username, id, updatedMembers);
  return c.json(updatedChannel);
});

channelsRouter.delete("/:id/members/:agentId", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const agentId = c.req.param("agentId");
  const channel = channelStore.getChannel(username, id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);
  if (channel.topology && channel.topology.kind !== "legacy_custom") return c.json({ error: "This channel uses a guided topology. Update its topology assignments in one save.", code: "topology_managed" }, 409);

  const updatedMembers = channel.members.filter((m) => m.agentId !== agentId);
  const updatedChannel = channelStore.updateMembers(username, id, updatedMembers);
  return c.json(updatedChannel);
});

channelsRouter.get("/:id/messages", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const limit = c.req.query("limit") ? parseInt(c.req.query("limit")!) : 100;
  const sessionId = c.req.query("sessionId");
  const channel = channelStore.getChannel(username, id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);

  const messages = channelStore.getMessages(username, id, limit, sessionId);
  return c.json({ messages });
});

channelsRouter.get("/:id/executions", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  if (!channelStore.getChannel(username, id)) return c.json({ error: "Channel not found" }, 404);
  const limit = Number.parseInt(c.req.query("limit") ?? "50", 10);
  return c.json({ executions: channelExecutionStore.listExecutions(username, id, Number.isFinite(limit) ? limit : 50) });
});

channelsRouter.get("/:id/executions/:executionId", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  if (!channelStore.getChannel(username, id)) return c.json({ error: "Channel not found" }, 404);
  const execution = channelExecutionStore.getExecution(username, id, c.req.param("executionId"));
  if (!execution) return c.json({ error: "Channel execution not found" }, 404);
  return c.json({ execution });
});

channelsRouter.get("/:id/executions/:executionId/events", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  if (!channelStore.getChannel(username, id)) return c.json({ error: "Channel not found" }, 404);
  const executionId = c.req.param("executionId");
  if (!channelExecutionStore.getExecution(username, id, executionId)) return c.json({ error: "Channel execution not found" }, 404);
  const afterSequence = Number.parseInt(c.req.query("afterSequence") ?? "0", 10);
  const limit = Number.parseInt(c.req.query("limit") ?? "200", 10);
  return c.json({ events: channelExecutionStore.getEvents(username, id, executionId, Number.isFinite(afterSequence) && afterSequence >= 0 ? afterSequence : 0, Number.isFinite(limit) ? limit : 200) });
});

channelsRouter.get("/:id/negotiation-state", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const channel = channelStore.getChannel(username, id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);

  const state = channelStore.getNegotiationState(username, id);
  return c.json({ state });
});

channelsRouter.get("/:id/memories", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const channel = channelStore.getChannel(username, id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);

  const { memoryRegistry } = await import("../core/memory/registry");
  const { getChannelMemoryDbPath } = await import("shared");

  const dbPath = getChannelMemoryDbPath(username, id);
  const memory = await memoryRegistry.get(`channel:${id}`, dbPath, true);

  const query = c.req.query("q") || "";
  const memories = await memory.recall(query, { limit: 100 });
  return c.json({ memories });
});

channelsRouter.delete("/:id/memories", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const channel = channelStore.getChannel(username, id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);

  const { memoryRegistry } = await import("../core/memory/registry");
  const { getChannelMemoryDbPath } = await import("shared");

  const dbPath = getChannelMemoryDbPath(username, id);
  const memory = await memoryRegistry.get(`channel:${id}`, dbPath, true);

  if (memory.clear) {
    await memory.clear();
  }
  return c.json({ success: true });
});

channelsRouter.get("/:id/active-streamings", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const sessionId = c.req.query("sessionId");
  const channel = channelStore.getChannel(username, id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);

  const streams = channelOrchestrator.getActiveStreams(id, sessionId);
  return c.json({ streamingAgents: streams });
});

channelsRouter.post("/:id/send", zValidator("json", z.object({ message: z.string().min(1), sessionId: z.string().optional() })), async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const { message, sessionId } = c.req.valid("json");
  const channel = channelStore.getChannel(username, id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);

  const activeExecutionId = channelOrchestrator.getActiveExecutionId(username, id, sessionId);
  if (channelOrchestrator.hasActiveDispatch(username, id, sessionId)) {
    return c.json({ error: "Channel already has an active execution", code: "channel_busy", executionId: activeExecutionId }, 409);
  }

  channelOrchestrator.dispatchUserMessage(username, id, message, sessionId).catch((err) => {
    if (err instanceof ChannelBusyError) {
      return;
    }
    console.error(`[ChannelsRoute] Error dispatching message for channel ${id}:`, err);
  });
  return c.json({ success: true, executionId: channelOrchestrator.getActiveExecutionId(username, id, sessionId) }, 202);
});

channelsRouter.post("/:id/abort", zValidator("json", z.object({ sessionId: z.string().optional(), executionId: z.string().optional() }).optional()), async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const body = c.req.valid("json");
  if (!channelStore.getChannel(username, id)) return c.json({ error: "Channel not found" }, 404);
  const aborted = channelOrchestrator.abortDispatch(username, id, body?.sessionId, body?.executionId);
  return c.json({ success: aborted });
});

channelsRouter.get("/:id/agents", (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  return c.json({ agents: agentRegistry.listScoped(username, "channels", id) });
});
