import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getTeamsDir, TeamSchema, type CreateTeam, type Team, type UpdateTeam, validateTeamConfiguration } from "shared";

function atomicWrite(path: string, value: unknown): void {
  const temporaryPath = `${path}.${crypto.randomUUID()}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(value, null, 2), "utf-8");
  renameSync(temporaryPath, path);
}

class TeamStore {
  private baseDir(username: string): string {
    const path = getTeamsDir(username);
    if (!existsSync(path)) mkdirSync(path, { recursive: true });
    return path;
  }

  private teamDir(username: string, teamId: string): string {
    return join(this.baseDir(username), teamId);
  }

  private teamPath(username: string, teamId: string): string {
    return join(this.teamDir(username, teamId), "team.json");
  }

  create(username: string, data: CreateTeam): Team {
    const configurationError = validateTeamConfiguration(data);
    if (configurationError) throw new Error(configurationError);
    const id = crypto.randomUUID();
    const directory = this.teamDir(username, id);
    mkdirSync(directory, { recursive: true });
    const now = new Date().toISOString();
    const team = TeamSchema.parse({ ...data, id, configurationVersion: 1, createdAt: now, updatedAt: now });
    atomicWrite(this.teamPath(username, id), team);
    return team;
  }

  get(username: string, teamId: string): Team | null {
    const path = this.teamPath(username, teamId);
    if (!existsSync(path)) return null;
    try {
      const parsed = TeamSchema.safeParse(JSON.parse(readFileSync(path, "utf-8")));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  list(username: string): Team[] {
    const directory = this.baseDir(username);
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const team = this.get(username, entry.name);
        return team ? [team] : [];
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  update(username: string, teamId: string, updates: UpdateTeam): Team | null {
    const current = this.get(username, teamId);
    if (!current) return null;
    const next = { ...current, ...updates, members: updates.members ?? current.members, topology: updates.topology ?? current.topology };
    const configurationError = validateTeamConfiguration(next);
    if (configurationError) throw new Error(configurationError);
    const team = TeamSchema.parse({ ...next, configurationVersion: current.configurationVersion + 1, updatedAt: new Date().toISOString() });
    atomicWrite(this.teamPath(username, teamId), team);
    return team;
  }
}

export const teamStore = new TeamStore();
