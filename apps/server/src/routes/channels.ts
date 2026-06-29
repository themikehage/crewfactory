import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { channelStore, channelOrchestrator } from "../channels";
import { agentRegistry } from "../agents";
import {
  CreateChannelSchema,
  UpdateChannelSchema,
  AddMemberSchema,
  UpdateMemberSchema,
} from "shared";

export const channelsRouter = new Hono();

channelsRouter.use("/*", authMiddleware);

channelsRouter.get("/", (c) => {
  const channels = channelStore.listChannels();
  return c.json({ channels });
});

channelsRouter.post("/", zValidator("json", CreateChannelSchema), (c) => {
  const data = c.req.valid("json");
  const channel = channelStore.createChannel(data);
  return c.json(channel, 201);
});

channelsRouter.get("/:id", (c) => {
  const id = c.req.param("id");
  const channel = channelStore.getChannel(id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);
  return c.json(channel);
});

channelsRouter.patch("/:id", zValidator("json", UpdateChannelSchema), (c) => {
  const id = c.req.param("id");
  const data = c.req.valid("json");
  const updated = channelStore.updateChannel(id, data);
  if (!updated) return c.json({ error: "Channel not found" }, 404);
  return c.json(updated);
});

channelsRouter.put("/:id/context", zValidator("json", z.object({ context: z.array(z.object({ key: z.string().min(1), value: z.string() })) })), (c) => {
  const id = c.req.param("id");
  const { context } = c.req.valid("json");
  const updated = channelStore.updateChannelContext(id, context);
  if (!updated) return c.json({ error: "Channel not found" }, 404);
  return c.json(updated);
});

channelsRouter.delete("/:id", (c) => {
  const id = c.req.param("id");
  const deleted = channelStore.deleteChannel(id);
  if (!deleted) return c.json({ error: "Channel not found" }, 404);
  return c.body(null, 204);
});

channelsRouter.post("/:id/members", zValidator("json", AddMemberSchema), (c) => {
  const id = c.req.param("id");
  const channel = channelStore.getChannel(id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);

  const data = c.req.valid("json");
  if (!agentRegistry.get(data.agentId)) {
    return c.json({ error: `Agent "${data.agentId}" not registered` }, 400);
  }

  const existingIndex = channel.members.findIndex((m) => m.agentId === data.agentId);
  const updatedMembers = [...channel.members];

  if (existingIndex >= 0) {
    updatedMembers[existingIndex] = data;
  } else {
    updatedMembers.push(data);
  }

  const updatedChannel = channelStore.updateMembers(id, updatedMembers);
  return c.json(updatedChannel);
});

channelsRouter.patch("/:id/members/:agentId", zValidator("json", UpdateMemberSchema), (c) => {
  const id = c.req.param("id");
  const agentId = c.req.param("agentId");
  const channel = channelStore.getChannel(id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);

  const data = c.req.valid("json");
  const index = channel.members.findIndex((m) => m.agentId === agentId);
  if (index === -1) return c.json({ error: "Member not found in channel" }, 404);

  const updatedMembers = [...channel.members];
  updatedMembers[index] = {
    ...updatedMembers[index],
    ...(data.replyMode !== undefined && { replyMode: data.replyMode }),
    ...(data.targetAgentIds !== undefined && { targetAgentIds: data.targetAgentIds }),
  };

  const updatedChannel = channelStore.updateMembers(id, updatedMembers);
  return c.json(updatedChannel);
});

channelsRouter.delete("/:id/members/:agentId", (c) => {
  const id = c.req.param("id");
  const agentId = c.req.param("agentId");
  const channel = channelStore.getChannel(id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);

  const updatedMembers = channel.members.filter((m) => m.agentId !== agentId);
  const updatedChannel = channelStore.updateMembers(id, updatedMembers);
  return c.json(updatedChannel);
});

channelsRouter.get("/:id/messages", (c) => {
  const id = c.req.param("id");
  const limit = c.req.query("limit") ? parseInt(c.req.query("limit")!) : 100;
  const channel = channelStore.getChannel(id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);

  const messages = channelStore.getMessages(id, limit);
  return c.json({ messages });
});

channelsRouter.post("/:id/send", zValidator("json", z.object({ message: z.string().min(1) })), async (c) => {
  const id = c.req.param("id");
  const { message } = c.req.valid("json");
  const channel = channelStore.getChannel(id);
  if (!channel) return c.json({ error: "Channel not found" }, 404);

  // Trigger dispatch asynchronously
  channelOrchestrator.dispatchUserMessage(id, message).catch((err) => {
    console.error(`[ChannelsRoute] Error dispatching message for channel ${id}:`, err);
  });

  return c.json({ success: true });
});
