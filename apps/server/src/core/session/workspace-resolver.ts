import { existsSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import {
  getUserDir,
  getWorkspaceDir,
  getWorkspaceSkillsDir,
  getProjectsDir,
  getSessionsDir,
  getSessionDir,
  getProjectWorkspaceDir,
  getChannelWorkspaceDir,
  getAgentWorkspaceDir,
  SessionPrefix,
} from "shared";
import { DEFAULT_AGENTS_MD, DEFAULT_FACTORY_SKILLS } from "../default-factory-skills";
import { userConfigManager } from "./user-config";

export function getResolvedSkillPaths(cwd: string, username?: string): string[] {
  const paths: string[] = [];

  if (username) {
    const factorySkillsDir = getWorkspaceSkillsDir(username);
    if (existsSync(factorySkillsDir) && !paths.includes(factorySkillsDir)) {
      paths.push(factorySkillsDir);
    }
  }

  let current = resolve(cwd);
  let workspaceRoot = current;
  while (true) {
    if (existsSync(resolve(current, "package.json")) || existsSync(resolve(current, "bun.lock"))) {
      workspaceRoot = current;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  const localCandidates = [
    resolve(workspaceRoot, ".pi/skills"),
    resolve(workspaceRoot, ".agents/skills"),
    resolve(workspaceRoot, "pi/.pi/skills"),
    resolve(workspaceRoot, "pi/.agents/skills"),
  ];
  for (const candidate of localCandidates) {
    if (existsSync(candidate) && !paths.includes(candidate)) {
      paths.push(candidate);
    }
  }
  return paths;
}

export function ensureWorkspaceSubdirs(workspaceDir: string): void {
  const subdirs = [
    join(workspaceDir, ".agents", "skills"),
    join(workspaceDir, "assets", "uploads"),
    join(workspaceDir, "assets", "generated"),
    join(workspaceDir, "memories", "projects"),
    join(workspaceDir, "memories", "sessions"),
  ];

  for (const dir of subdirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

export function ensureWorkspaceStructure(username: string): string {
  const workspaceDir = getWorkspaceDir(username);
  const skillsBaseDir = join(workspaceDir, ".agents", "skills");

  ensureWorkspaceSubdirs(workspaceDir);
  mkdirSync(getProjectsDir(username), { recursive: true });

  const agentsMdPath = join(workspaceDir, "AGENTS.md");
  if (!existsSync(agentsMdPath)) {
    try {
      writeFileSync(agentsMdPath, DEFAULT_AGENTS_MD, "utf-8");
    } catch (e) {
      console.error("Failed to write AGENTS.md:", e);
    }
  }

  for (const [skillKey, skillDef] of Object.entries(DEFAULT_FACTORY_SKILLS)) {
    const skillDir = join(skillsBaseDir, skillKey);
    if (!existsSync(skillDir)) {
      mkdirSync(skillDir, { recursive: true });
    }
    const skillFilePath = join(skillDir, "SKILL.md");
    if (!existsSync(skillFilePath)) {
      try {
        writeFileSync(skillFilePath, skillDef.content, "utf-8");
      } catch (e) {
        console.error(`Failed to write skill ${skillKey}:`, e);
      }
    }
  }

  return workspaceDir;
}

export function resolveSubagentSessionDir(username: string, sessionId: string): string | null {
  if (sessionId.startsWith(SessionPrefix.SUBAGENT)) {
    const userDir = userConfigManager.ensureUserDir(username);
    const sessionsDir = join(userDir, "sessions");
    if (existsSync(sessionsDir)) {
      try {
        const sessionFolders = readdirSync(sessionsDir);
        for (const parentId of sessionFolders) {
          const candidateDir = join(sessionsDir, parentId, "subagents", sessionId);
          if (existsSync(candidateDir)) {
            return candidateDir;
          }
        }
      } catch {}
    }
  }
  return null;
}

export function resolveSessionWorkspace(
  username: string,
  sessionId: string,
  projectName?: string,
  agentId?: string,
  channelId?: string
): { sessionDir: string; workspaceDir: string } {
  const sessionDir = resolveSubagentSessionDir(username, sessionId) ?? getSessionDir(username, sessionId);

  ensureWorkspaceStructure(username);

  const workspaceBase = getWorkspaceDir(username);
  let workspaceDir = workspaceBase;
  if (channelId) {
    workspaceDir = getChannelWorkspaceDir(username, channelId);
  } else if (agentId) {
    workspaceDir = getAgentWorkspaceDir(username, agentId);
  } else if (projectName) {
    workspaceDir = getProjectWorkspaceDir(username, projectName);
  }

  if (!existsSync(workspaceDir)) {
    mkdirSync(workspaceDir, { recursive: true });
  }

  if (channelId || agentId || projectName) {
    ensureWorkspaceSubdirs(workspaceDir);
  }

  return { sessionDir, workspaceDir };
}
