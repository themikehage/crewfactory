import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, appendFileSync, statSync, openSync, fstatSync, readSync, closeSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { Channel, ChannelContextItem, ChannelMember, ChannelMessage, CreateChannel, UpdateChannel } from "shared";
import { SessionPrefix, getChannelsDir } from "shared";

export interface NegotiationPairState {
  rounds: number;
  lastOffer: string | null;
  status: "open" | "agreed" | "rejected" | "escalated";
}

export type NegotiationState = Record<string, NegotiationPairState>;

class ChannelStore {
  private getBaseDir(username: string): string {
    return getChannelsDir(username);
  }

  private getChannelDir(username: string, id: string): string {
    const dir = join(this.getBaseDir(username), id);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private getChannelJsonPath(username: string, id: string): string {
    return join(this.getChannelDir(username, id), "channel.json");
  }

  private getMessagesPath(username: string, id: string): string {
    return join(this.getChannelDir(username, id), "messages.jsonl");
  }

  createChannel(username: string, data: CreateChannel): Channel {
    const id = (data as any).id || crypto.randomUUID();
    const dir = this.getChannelDir(username, id);

    const now = new Date().toISOString();
    const channel: Channel = {
      id,
      name: data.name,
      description: data.description,
      members: [],
      context: data.context || [],
      maxChainDepth: data.maxChainDepth ?? 5,
      showThinking: data.showThinking ?? false,
      showTools: data.showTools ?? false,
      negotiationProtocol: data.negotiationProtocol,
      delegationPattern: data.delegationPattern,
      createdAt: now,
      updatedAt: now,
    };

    writeFileSync(this.getChannelJsonPath(username, id), JSON.stringify(channel, null, 2), "utf-8");
    writeFileSync(this.getMessagesPath(username, id), "", "utf-8"); // create empty messages file

    return channel;
  }

  getChannel(username: string, id: string): Channel | null {
    const jsonPath = this.getChannelJsonPath(username, id);
    if (!existsSync(jsonPath)) return null;
    try {
      const parsed = JSON.parse(readFileSync(jsonPath, "utf-8"));
      return {
        ...parsed,
        context: parsed.context || [],
        maxChainDepth: parsed.maxChainDepth ?? 5,
        showThinking: parsed.showThinking ?? false,
        showTools: parsed.showTools ?? false,
      };
    } catch {
      return null;
    }
  }

  listChannels(username: string): Channel[] {
    const baseDir = this.getBaseDir(username);
    if (!existsSync(baseDir)) return [];
    const entries = readdirSync(baseDir, { withFileTypes: true });
    const channels: Channel[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const channel = this.getChannel(username, entry.name);
        if (channel && !channel.id.startsWith(SessionPrefix.LAB)) {
          const msgPath = this.getMessagesPath(username, entry.name);
          if (existsSync(msgPath)) {
            try {
              const stats = statSync(msgPath);
              channel.updatedAt = stats.mtime.toISOString();
            } catch {}
          }
          channels.push(channel);
        }
      }
    }
    channels.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return channels;
  }

  updateChannel(username: string, id: string, updates: UpdateChannel): Channel | null {
    const channel = this.getChannel(username, id);
    if (!channel) return null;

    if (updates.name !== undefined) channel.name = updates.name;
    if (updates.description !== undefined) channel.description = updates.description;
    if (updates.context !== undefined) channel.context = updates.context;
    if (updates.maxChainDepth !== undefined) channel.maxChainDepth = updates.maxChainDepth;
    if (updates.showThinking !== undefined) channel.showThinking = updates.showThinking;
    if (updates.showTools !== undefined) channel.showTools = updates.showTools;
    if (updates.negotiationProtocol !== undefined) channel.negotiationProtocol = updates.negotiationProtocol;
    if (updates.delegationPattern !== undefined) channel.delegationPattern = updates.delegationPattern;
    channel.updatedAt = new Date().toISOString();

    writeFileSync(this.getChannelJsonPath(username, id), JSON.stringify(channel, null, 2), "utf-8");
    return channel;
  }

  updateChannelContext(username: string, id: string, context: ChannelContextItem[]): Channel | null {
    const channel = this.getChannel(username, id);
    if (!channel) return null;

    channel.context = context;
    channel.updatedAt = new Date().toISOString();

    writeFileSync(this.getChannelJsonPath(username, id), JSON.stringify(channel, null, 2), "utf-8");
    return channel;
  }

  updateMembers(username: string, id: string, members: ChannelMember[]): Channel | null {
    const channel = this.getChannel(username, id);
    if (!channel) return null;

    channel.members = members;
    channel.updatedAt = new Date().toISOString();

    writeFileSync(this.getChannelJsonPath(username, id), JSON.stringify(channel, null, 2), "utf-8");
    return channel;
  }

  deleteChannel(username: string, id: string): boolean {
    const dir = this.getChannelDir(username, id);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
      return true;
    }
    return false;
  }

  appendMessage(username: string, channelId: string, msg: ChannelMessage): void {
    const dir = this.getChannelDir(username, channelId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const messagesPath = this.getMessagesPath(username, channelId);
    appendFileSync(messagesPath, JSON.stringify(msg) + "\n", "utf-8");

    try {
      const stats = statSync(messagesPath);
      if (stats.size > 10 * 1024 * 1024) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const rotatedPath = join(dir, `messages.${timestamp}.jsonl`);
        renameSync(messagesPath, rotatedPath);
        writeFileSync(messagesPath, "", "utf-8");
      }
    } catch (e) {
      console.error("Failed to rotate messages.jsonl:", e);
    }
  }

  getMessages(username: string, channelId: string, limit: number = 100, sessionId?: string): ChannelMessage[] {
    const messagesPath = this.getMessagesPath(username, channelId);
    if (!existsSync(messagesPath)) return [];
    
    let fd: number | null = null;
    try {
      fd = openSync(messagesPath, "r");
      const stats = fstatSync(fd);
      const fileSize = stats.size;
      if (fileSize === 0) return [];

      const bufferSize = Math.min(65536, fileSize);
      const buffer = Buffer.alloc(bufferSize);
      let filePosition = fileSize;
      let leftover = "";
      const messages: ChannelMessage[] = [];

      while (filePosition > 0 && messages.length < limit) {
        const readLength = Math.min(bufferSize, filePosition);
        filePosition -= readLength;
        readSync(fd, buffer, 0, readLength, filePosition);

        let chunk = buffer.toString("utf-8", 0, readLength) + leftover;
        const chunkLines = chunk.split("\n");
        
        leftover = chunkLines[0];
        
        for (let i = chunkLines.length - 1; i >= 1; i--) {
          const line = chunkLines[i].trim();
          if (!line) continue;
          try {
            const parsed: ChannelMessage = JSON.parse(line);
            if (!sessionId || parsed.sessionId === sessionId) {
              messages.unshift(parsed);
              if (messages.length >= limit) {
                break;
              }
            }
          } catch {}
        }
      }

      if (filePosition === 0 && leftover.trim() && messages.length < limit) {
        try {
          const parsed: ChannelMessage = JSON.parse(leftover.trim());
          if (!sessionId || parsed.sessionId === sessionId) {
            messages.unshift(parsed);
          }
        } catch {}
      }

      return messages;
    } catch (e) {
      console.error("Failed to tail-read channel messages:", e);
      return [];
    } finally {
      if (fd !== null) {
        try { closeSync(fd); } catch {}
      }
    }
  }

  getNegotiationStatePath(username: string, channelId: string): string {
    return join(this.getChannelDir(username, channelId), "negotiation-state.json");
  }

  getNegotiationState(username: string, channelId: string): NegotiationState {
    const path = this.getNegotiationStatePath(username, channelId);
    if (!existsSync(path)) return {};
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as NegotiationState;
    } catch {
      return {};
    }
  }

  saveNegotiationState(username: string, channelId: string, state: NegotiationState): void {
    const path = this.getNegotiationStatePath(username, channelId);
    writeFileSync(path, JSON.stringify(state, null, 2), "utf-8");
  }

  resetNegotiationState(username: string, channelId: string): void {
    const path = this.getNegotiationStatePath(username, channelId);
    if (existsSync(path)) writeFileSync(path, "{}", "utf-8");
  }
}

export const channelStore = new ChannelStore();
