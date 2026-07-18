import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, appendFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import {
  TeamDefinitionSchema,
  TeamSessionSchema,
  TeamMessageSchema,
  CreateTeamSchema,
  UpdateTeamSchema,
  type TeamDefinition,
  type TeamSession,
  type TeamMessage,
  type CreateTeam,
  type UpdateTeam,
} from "shared";
import { getTeamDir, getTeamsDir, getTeamSessionsDir, getTeamWorkspaceDir } from "shared";
import { ensureWorkspaceSubdirs } from "../core/session/workspace-resolver";

function atomicWrite(path: string, value: unknown, json = true): void {
  const temp = `${path}.${crypto.randomUUID()}.tmp`;
  writeFileSync(temp, json ? JSON.stringify(value, null, 2) : String(value), "utf-8");
  renameSync(temp, path);
}

class TeamStore {
  private teamJsonPath(username: string, teamId: string): string {
    return join(getTeamDir(username, teamId), "team.json");
  }

  private sessionJsonPath(username: string, teamId: string, sessionId: string): string {
    return join(getTeamSessionsDir(username, teamId), `${sessionId}.json`);
  }

  private messagesPath(username: string, teamId: string, sessionId: string): string {
    return join(getTeamSessionsDir(username, teamId), `${sessionId}.messages.jsonl`);
  }

  private ensureTeamDir(username: string, teamId: string): void {
    const dir = getTeamDir(username, teamId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const sessionsDir = getTeamSessionsDir(username, teamId);
    if (!existsSync(sessionsDir)) mkdirSync(sessionsDir, { recursive: true });
    const wsDir = getTeamWorkspaceDir(username, teamId);
    if (!existsSync(wsDir)) {
      mkdirSync(wsDir, { recursive: true });
      ensureWorkspaceSubdirs(wsDir);
    }
  }

  createTeam(username: string, data: CreateTeam): TeamDefinition {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const team = TeamDefinitionSchema.parse({
      id,
      name: data.name,
      description: data.description,
      topology: data.topology,
      members: data.members,
      showThinking: data.showThinking ?? false,
      showTools: data.showTools ?? true,
      createdAt: now,
      updatedAt: now,
    });
    this.ensureTeamDir(username, id);
    atomicWrite(this.teamJsonPath(username, id), team);
    return team;
  }

  getTeam(username: string, teamId: string): TeamDefinition | null {
    const path = this.teamJsonPath(username, teamId);
    if (!existsSync(path)) return null;
    try {
      const parsed = TeamDefinitionSchema.safeParse(JSON.parse(readFileSync(path, "utf-8")));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  listTeams(username: string): TeamDefinition[] {
    const dir = getTeamsDir(username);
    if (!existsSync(dir)) return [];
    const results: TeamDefinition[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const team = this.getTeam(username, entry.name);
      if (team) results.push(team);
    }
    return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  updateTeam(username: string, teamId: string, patch: UpdateTeam): TeamDefinition | null {
    const existing = this.getTeam(username, teamId);
    if (!existing) return null;
    const now = new Date().toISOString();
    const updated = TeamDefinitionSchema.parse({ ...existing, ...patch, updatedAt: now });
    atomicWrite(this.teamJsonPath(username, teamId), updated);
    return updated;
  }

  deleteTeam(username: string, teamId: string): boolean {
    const dir = getTeamDir(username, teamId);
    if (!existsSync(dir)) return false;
    rmSync(dir, { recursive: true, force: true });
    return true;
  }

  createSession(username: string, teamId: string, name: string): TeamSession {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const session = TeamSessionSchema.parse({ id, teamId, name, createdAt: now, updatedAt: now });
    this.ensureTeamDir(username, teamId);
    atomicWrite(this.sessionJsonPath(username, teamId, id), session);
    writeFileSync(this.messagesPath(username, teamId, id), "", "utf-8");
    return session;
  }

  getSession(username: string, teamId: string, sessionId: string): TeamSession | null {
    const path = this.sessionJsonPath(username, teamId, sessionId);
    if (!existsSync(path)) return null;
    try {
      const parsed = TeamSessionSchema.safeParse(JSON.parse(readFileSync(path, "utf-8")));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  listSessions(username: string, teamId: string): TeamSession[] {
    const dir = getTeamSessionsDir(username, teamId);
    if (!existsSync(dir)) return [];
    const results: TeamSession[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const sessionId = entry.name.replace(".json", "");
      const session = this.getSession(username, teamId, sessionId);
      if (session) results.push(session);
    }
    return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  updateSession(username: string, teamId: string, sessionId: string, patch: Partial<Pick<TeamSession, "name" | "lastRunId" | "updatedAt">>): TeamSession | null {
    const existing = this.getSession(username, teamId, sessionId);
    if (!existing) return null;
    const now = new Date().toISOString();
    const updated = TeamSessionSchema.parse({ ...existing, ...patch, updatedAt: patch.updatedAt ?? now });
    atomicWrite(this.sessionJsonPath(username, teamId, sessionId), updated);
    return updated;
  }

  getSessionMessages(username: string, teamId: string, sessionId: string, limit = 50): TeamMessage[] {
    const path = this.messagesPath(username, teamId, sessionId);
    if (!existsSync(path)) return [];
    try {
      const lines = readFileSync(path, "utf-8").split("\n").filter(Boolean);
      const all = lines.flatMap((line) => {
        const parsed = TeamMessageSchema.safeParse(JSON.parse(line));
        return parsed.success ? [parsed.data] : [];
      });
      return all.slice(-limit);
    } catch {
      return [];
    }
  }

  appendSessionMessage(username: string, teamId: string, sessionId: string, message: TeamMessage): void {
    const path = this.messagesPath(username, teamId, sessionId);
    this.ensureTeamDir(username, teamId);
    appendFileSync(path, JSON.stringify(message) + "\n", "utf-8");
    this.updateSession(username, teamId, sessionId, { updatedAt: message.createdAt });
  }
}

export const teamStore = new TeamStore();
