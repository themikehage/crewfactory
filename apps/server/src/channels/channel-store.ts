import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import type { Channel, ChannelContextItem, ChannelMember, ChannelMessage, CreateChannel, UpdateChannel } from "shared";

class ChannelStore {
  private baseDir = "/tmp/pi-channels";

  constructor() {
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private getChannelDir(id: string): string {
    return join(this.baseDir, id);
  }

  private getChannelJsonPath(id: string): string {
    return join(this.getChannelDir(id), "channel.json");
  }

  private getMessagesPath(id: string): string {
    return join(this.getChannelDir(id), "messages.jsonl");
  }

  createChannel(data: CreateChannel): Channel {
    const id = crypto.randomUUID();
    const dir = this.getChannelDir(id);
    mkdirSync(dir, { recursive: true });

    const now = new Date().toISOString();
    const channel: Channel = {
      id,
      name: data.name,
      description: data.description,
      members: [],
      context: data.context || [],
      createdAt: now,
      updatedAt: now,
    };

    writeFileSync(this.getChannelJsonPath(id), JSON.stringify(channel, null, 2), "utf-8");
    writeFileSync(this.getMessagesPath(id), "", "utf-8"); // create empty messages file

    return channel;
  }

  getChannel(id: string): Channel | null {
    const jsonPath = this.getChannelJsonPath(id);
    if (!existsSync(jsonPath)) return null;
    try {
      const parsed = JSON.parse(readFileSync(jsonPath, "utf-8"));
      return {
        ...parsed,
        context: parsed.context || [],
      };
    } catch {
      return null;
    }
  }

  listChannels(): Channel[] {
    if (!existsSync(this.baseDir)) return [];
    const entries = readdirSync(this.baseDir, { withFileTypes: true });
    const channels: Channel[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const channel = this.getChannel(entry.name);
        if (channel) channels.push(channel);
      }
    }
    channels.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return channels;
  }

  updateChannel(id: string, updates: UpdateChannel): Channel | null {
    const channel = this.getChannel(id);
    if (!channel) return null;

    if (updates.name !== undefined) channel.name = updates.name;
    if (updates.description !== undefined) channel.description = updates.description;
    if (updates.context !== undefined) channel.context = updates.context;
    channel.updatedAt = new Date().toISOString();

    writeFileSync(this.getChannelJsonPath(id), JSON.stringify(channel, null, 2), "utf-8");
    return channel;
  }

  updateChannelContext(id: string, context: ChannelContextItem[]): Channel | null {
    const channel = this.getChannel(id);
    if (!channel) return null;

    channel.context = context;
    channel.updatedAt = new Date().toISOString();

    writeFileSync(this.getChannelJsonPath(id), JSON.stringify(channel, null, 2), "utf-8");
    return channel;
  }

  updateMembers(id: string, members: ChannelMember[]): Channel | null {
    const channel = this.getChannel(id);
    if (!channel) return null;

    channel.members = members;
    channel.updatedAt = new Date().toISOString();

    writeFileSync(this.getChannelJsonPath(id), JSON.stringify(channel, null, 2), "utf-8");
    return channel;
  }

  deleteChannel(id: string): boolean {
    const dir = this.getChannelDir(id);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
      return true;
    }
    return false;
  }

  appendMessage(channelId: string, msg: ChannelMessage): void {
    const dir = this.getChannelDir(channelId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const messagesPath = this.getMessagesPath(channelId);
    appendFileSync(messagesPath, JSON.stringify(msg) + "\n", "utf-8");

    // Touch channel updatedAt
    const channel = this.getChannel(channelId);
    if (channel) {
      channel.updatedAt = new Date().toISOString();
      writeFileSync(this.getChannelJsonPath(channelId), JSON.stringify(channel, null, 2), "utf-8");
    }
  }

  getMessages(channelId: string, limit: number = 100): ChannelMessage[] {
    const messagesPath = this.getMessagesPath(channelId);
    if (!existsSync(messagesPath)) return [];
    try {
      const content = readFileSync(messagesPath, "utf-8");
      const lines = content.trim().split("\n").filter((l) => l.trim().length > 0);
      const messages: ChannelMessage[] = [];
      const slice = lines.slice(-limit);
      for (const line of slice) {
        try {
          messages.push(JSON.parse(line));
        } catch {}
      }
      return messages;
    } catch {
      return [];
    }
  }
}

export const channelStore = new ChannelStore();
