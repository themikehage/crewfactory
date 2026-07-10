import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { getUsername } from "../lib/auth-helpers";
import { channelStore, channelOrchestrator } from "../channels";
import { agentRegistry } from "../agents";
import { sessionManager } from "../core/session-manager";
import { CreateChannelSchema, UpdateChannelSchema, AddMemberSchema, UpdateMemberSchema } from "shared";
import { eventBroker } from "../lib/event-broker";

export const channelsRouter = new Hono();

channelsRouter.use("/*", authMiddleware);

function cleanChannelGhostMembers(channel: any, username: string): any {
  if (!channel || !channel.members) return channel;

  const validAgents = agentRegistry.list(username);
  const validAgentIds = new Set(validAgents.map((a) => a.id));

  const cleanedMembers = channel.members.filter((m: any) => validAgentIds.has(m.agentId));
  const finalMembers = cleanedMembers.map((m: any) => {
    if (m.targetAgentIds) {
      return {
        ...m,
        targetAgentIds: m.targetAgentIds.filter((tid: string) => validAgentIds.has(tid)),
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
  const updated = channelStore.updateChannel(username, id, data);
  if (!updated) return c.json({ error: "Channel not found" }, 404);
  return c.json(updated);
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

  const data = c.req.valid("json");
  const agentEntry = agentRegistry.get(data.agentId);
  if (!agentEntry || agentEntry.username !== username) {
    return c.json({ error: `Agent "${data.agentId}" not registered or not owned by you` }, 400);
  }

  const existingIndex = channel.members.findIndex((m) => m.agentId === data.agentId);
  const updatedMembers = [...channel.members];
  const memberWithRole = {
    ...data,
    role: data.role || "member",
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

  const data = c.req.valid("json");
  const index = channel.members.findIndex((m) => m.agentId === agentId);
  if (index === -1) return c.json({ error: "Member not found in channel" }, 404);

  const updatedMembers = [...channel.members];
  updatedMembers[index] = {
    ...updatedMembers[index],
    ...(data.replyMode !== undefined && { replyMode: data.replyMode }),
    ...(data.targetAgentIds !== undefined && { targetAgentIds: data.targetAgentIds }),
    ...(data.role !== undefined && { role: data.role }),
  };

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

  // Trigger dispatch asynchronously
  channelOrchestrator.dispatchUserMessage(username, id, message, sessionId).catch((err) => {
    console.error(`[ChannelsRoute] Error dispatching message for channel ${id}:`, err);
  });

  return c.json({ success: true });
});

channelsRouter.post("/:id/abort", zValidator("json", z.object({ sessionId: z.string().optional() }).optional()), async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const body = c.req.valid("json");
  channelOrchestrator.abortDispatch(username, id, body?.sessionId);
  return c.json({ success: true });
});
