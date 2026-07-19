import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, appendFileSync, statSync, openSync, fstatSync, readSync, closeSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { Team, TeamMember, TeamMessage, CreateTeam, UpdateTeam } from "shared";
import { getTeamsDir, getTeamDir, getTeamMessagesPath } from "shared";

export interface NegotiationRound {
  roundNumber: number;
  votes: Record<string, "agreed" | "counter" | "rejected" | "neutral">;
  outcome: "open" | "consensus" | "conflict" | "escalated";
}

export interface NegotiationState {
  [key: string]: any;
  _rounds?: NegotiationRound[];
  _currentRound?: number;
  _arbitrations?: number;
  _divergences?: number;
}

class TeamStore {
  private getBaseDir(username: string): string {
    return getTeamsDir(username);
  }

  private getTeamDirectory(username: string, id: string): string {
    const dir = getTeamDir(username, id);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private getTeamJsonPath(username: string, id: string): string {
    return join(this.getTeamDirectory(username, id), "team.json");
  }

  createTeam(username: string, data: CreateTeam): Team {
    const id = (data as any).id || crypto.randomUUID();
    const dir = this.getTeamDirectory(username, id);

    const now = new Date().toISOString();
    const team: Team = {
      id,
      name: data.name,
      description: data.description,
      mode: data.mode || "debate",
      teamType: data.teamType || "Negotiation",
      members: data.members || [],
      maxRounds: data.maxRounds ?? 5,
      showThinking: data.showThinking ?? false,
      showTools: data.showTools ?? false,
      negotiationProtocol: data.negotiationProtocol,
      createdAt: now,
      updatedAt: now,
      blueprintId: data.blueprintId,
    };

    writeFileSync(this.getTeamJsonPath(username, id), JSON.stringify(team, null, 2), "utf-8");
    writeFileSync(getTeamMessagesPath(username, id), "", "utf-8"); // create empty messages file

    return team;
  }

  getTeam(username: string, id: string): Team | null {
    const jsonPath = this.getTeamJsonPath(username, id);
    if (!existsSync(jsonPath)) return null;
    try {
      const parsed = JSON.parse(readFileSync(jsonPath, "utf-8"));
      return {
        ...parsed,
        mode: parsed.mode || "debate",
        teamType: parsed.teamType || "Negotiation",
        members: parsed.members || [],
        maxRounds: parsed.maxRounds ?? 5,
        showThinking: parsed.showThinking ?? false,
        showTools: parsed.showTools ?? false,
      };
    } catch {
      return null;
    }
  }

  listTeams(username: string): Team[] {
    const baseDir = this.getBaseDir(username);
    if (!existsSync(baseDir)) return [];
    try {
      const entries = readdirSync(baseDir, { withFileTypes: true });
      const teams: Team[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const team = this.getTeam(username, entry.name);
          if (team) {
            const msgPath = getTeamMessagesPath(username, entry.name);
            if (existsSync(msgPath)) {
              try {
                const stats = statSync(msgPath);
                team.updatedAt = stats.mtime.toISOString();
              } catch {}
            }
            teams.push(team);
          }
        }
      }
      teams.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return teams;
    } catch {
      return [];
    }
  }

  updateTeam(username: string, id: string, updates: UpdateTeam): Team | null {
    const team = this.getTeam(username, id);
    if (!team) return null;

    if ("teamType" in updates) {
      throw new Error("A team's type is immutable after creation.");
    }

    if (updates.name !== undefined) team.name = updates.name;
    if (updates.description !== undefined) team.description = updates.description;
    if (updates.mode !== undefined) team.mode = updates.mode;
    if (updates.members !== undefined) team.members = updates.members;
    if (updates.maxRounds !== undefined) team.maxRounds = updates.maxRounds;
    if (updates.showThinking !== undefined) team.showThinking = updates.showThinking;
    if (updates.showTools !== undefined) team.showTools = updates.showTools;
    if (updates.negotiationProtocol !== undefined) team.negotiationProtocol = updates.negotiationProtocol;
    if (updates.blueprintId !== undefined) team.blueprintId = updates.blueprintId;
    team.updatedAt = new Date().toISOString();

    writeFileSync(this.getTeamJsonPath(username, id), JSON.stringify(team, null, 2), "utf-8");
    return team;
  }

  updateMembers(username: string, id: string, members: TeamMember[]): Team | null {
    const team = this.getTeam(username, id);
    if (!team) return null;

    team.members = members;
    team.updatedAt = new Date().toISOString();

    writeFileSync(this.getTeamJsonPath(username, id), JSON.stringify(team, null, 2), "utf-8");
    return team;
  }

  deleteTeam(username: string, id: string): boolean {
    const dir = getTeamDir(username, id);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
      return true;
    }
    return false;
  }

  appendMessage(username: string, teamId: string, msg: TeamMessage): void {
    const dir = this.getTeamDirectory(username, teamId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const messagesPath = getTeamMessagesPath(username, teamId);
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

  getMessages(username: string, teamId: string, limit: number = 100, sessionId?: string): TeamMessage[] {
    const messagesPath = getTeamMessagesPath(username, teamId);
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
      const messages: TeamMessage[] = [];

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
            const parsed: TeamMessage = JSON.parse(line);
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
          const parsed: TeamMessage = JSON.parse(leftover.trim());
          if (!sessionId || parsed.sessionId === sessionId) {
            messages.unshift(parsed);
          }
        } catch {}
      }

      return messages;
    } catch (e) {
      console.error("Failed to tail-read team messages:", e);
      return [];
    } finally {
      if (fd !== null) {
        try { closeSync(fd); } catch {}
      }
    }
  }

  getNegotiationStatePath(username: string, teamId: string): string {
    return join(this.getTeamDirectory(username, teamId), "negotiation-state.json");
  }

  getNegotiationState(username: string, teamId: string): NegotiationState {
    const path = this.getNegotiationStatePath(username, teamId);
    if (!existsSync(path)) return {};
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as NegotiationState;
    } catch {
      return {};
    }
  }

  saveNegotiationState(username: string, teamId: string, state: NegotiationState): void {
    const path = this.getNegotiationStatePath(username, teamId);
    writeFileSync(path, JSON.stringify(state, null, 2), "utf-8");
  }

  resetNegotiationState(username: string, teamId: string): void {
    const path = this.getNegotiationStatePath(username, teamId);
    if (existsSync(path)) writeFileSync(path, "{}", "utf-8");
  }
}

export const teamStore = new TeamStore();
