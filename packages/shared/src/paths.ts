import path from "node:path";
import fs from "node:fs";

const join = (...args: string[]): string => path.join(...args);
const existsSync = (p: string): boolean => fs.existsSync(p);
const mkdirSync = (p: string, options?: { recursive?: boolean }): string | undefined =>
  fs.mkdirSync(p, options) as string | undefined;

export const CREWFACTORY_DATA_PATH = () =>
  process.env.CREWFACTORY_DATA_PATH || "/app/data";

export const USERS_DIR = "users";
export const AUDIT_DIR = "_audit";
export const WORKSPACE_DIR = "workspace";
export const PROJECTS_DIR = "projects";
export const AGENTS_DIR = "agents";
export const TEAMS_DIR = "teams";
export const SESSIONS_DIR = "sessions";
export const EXPERIMENTS_DIR = "experiments";
export const MEMORIES_DIR = "memories";
export const ASSETS_DIR = "assets";
export const UPLOADS_DIR = "uploads";
export const GENERATED_DIR = "generated";
export const SKILLS_SUBDIR = ".agents/skills";
export const EXECUTIONS_DIR = "executions";
export const PIPELINES_DIR = "pipelines";

export function getAuditDir(): string {
  return join(CREWFACTORY_DATA_PATH(), AUDIT_DIR);
}

export function getUserDir(username: string): string {
  return join(CREWFACTORY_DATA_PATH(), USERS_DIR, username);
}

export function getWorkspaceDir(username: string): string {
  return join(getUserDir(username), WORKSPACE_DIR);
}

export function getWorkspaceSkillsDir(username: string): string {
  return join(getWorkspaceDir(username), SKILLS_SUBDIR);
}

export function getProjectsDir(username: string): string {
  return join(getUserDir(username), PROJECTS_DIR);
}

export function getProjectDir(username: string, projectId: string): string {
  return join(getProjectsDir(username), projectId);
}

export function getProjectWorkspaceDir(username: string, projectId: string): string {
  return join(getProjectDir(username, projectId), WORKSPACE_DIR);
}

export function getProjectExecutionsDir(username: string, projectId: string): string {
  return join(getProjectDir(username, projectId), EXECUTIONS_DIR);
}

export function getAgentDir(username: string, agentId: string): string {
  return join(getUserDir(username), AGENTS_DIR, agentId);
}

export function getAgentWorkspaceDir(username: string, agentId: string): string {
  return join(getAgentDir(username, agentId), WORKSPACE_DIR);
}

export function getAgentExecutionsDir(username: string, agentId: string): string {
  return join(getAgentDir(username, agentId), EXECUTIONS_DIR);
}

export function getTeamsDir(username: string): string {
  return join(getUserDir(username), TEAMS_DIR);
}

export function getTeamDir(username: string, teamId: string): string {
  return join(getTeamsDir(username), teamId);
}

export function getTeamWorkspaceDir(username: string, teamId: string): string {
  return join(getTeamDir(username, teamId), WORKSPACE_DIR);
}

export function getTeamMemoriesDir(username: string, teamId: string): string {
  return join(getTeamDir(username, teamId), MEMORIES_DIR);
}

export function getSessionsDir(username: string): string {
  return join(getUserDir(username), SESSIONS_DIR);
}

export function getSessionDir(username: string, sessionId: string): string {
  return join(getSessionsDir(username), sessionId);
}

export function getSessionMetadataPath(username: string, sessionId: string): string {
  return join(getSessionDir(username, sessionId), "metadata.json");
}

export function getExperimentsDir(username: string): string {
  return join(getUserDir(username), EXPERIMENTS_DIR);
}

export function getPipelinesDir(username: string): string {
  return join(getUserDir(username), PIPELINES_DIR);
}

export function getPipelineDir(username: string, pipelineId: string): string {
  return join(getPipelinesDir(username), pipelineId);
}

export function getPipelineRunsDir(username: string, pipelineId: string): string {
  return join(getPipelineDir(username, pipelineId), "runs");
}

export function getPipelineRunDir(username: string, pipelineId: string, runId: string): string {
  return join(getPipelineRunsDir(username, pipelineId), runId);
}

export function getMcpServersPath(username: string): string {
  return join(getUserDir(username), "mcp-servers.json");
}

export function getMcpConfigOldPath(username: string): string {
  return join(getUserDir(username), "mcp-config.json");
}

export function getEnvPath(username: string): string {
  return join(getUserDir(username), "env.json");
}

export function getAuthPath(username: string): string {
  return join(getUserDir(username), "auth.json");
}

export function getProviderModelsPath(username: string): string {
  return join(getUserDir(username), "provider-models.json");
}

export function getScopeConfigPath(username: string): string {
  return join(getUserDir(username), "scope-config.json");
}

export function getSettingsPath(username: string): string {
  return join(getUserDir(username), "settings.json");
}

export function getCredentialsPath(username: string): string {
  return join(getUserDir(username), "credentials.json");
}

export function getIntegrationsPath(username: string): string {
  return join(getUserDir(username), "integrations.json");
}

export function getTasksPath(username: string, sessionId: string): string {
  return join(getSessionDir(username, sessionId), "tasks.json");
}

export function getMemoryDbPath(username: string, sessionId: string): string {
  return join(getSessionDir(username, sessionId), "memory", "memory.db");
}

export function getExecutionMessagesPath(
  username: string,
  entityType: "agents" | "projects",
  entityId: string,
  execId: string
): string {
  return join(CREWFACTORY_DATA_PATH(), USERS_DIR, username, entityType, entityId, EXECUTIONS_DIR, execId, "messages.jsonl");
}

export function getExecutionSummaryPath(
  username: string,
  entityType: "agents" | "projects",
  entityId: string,
  execId: string
): string {
  return join(CREWFACTORY_DATA_PATH(), USERS_DIR, username, entityType, entityId, EXECUTIONS_DIR, execId, "summary.json");
}

export function getTeamMessagesPath(username: string, teamId: string): string {
  return join(getTeamDir(username, teamId), "messages.jsonl");
}

export function getTeamMemoryDbPath(username: string, teamId: string): string {
  return join(getTeamMemoriesDir(username, teamId), "memory.db");
}

export function ensureUserDir(username: string): string {
  const dir = getUserDir(username);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function ensureSessionDir(username: string, sessionId: string): string {
  const dir = getSessionDir(username, sessionId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function ensureAuditDir(): string {
  const dir = getAuditDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function ensureAllDirs(username: string): void {
  const dirs = [
    CREWFACTORY_DATA_PATH(),
    getAuditDir(),
    getUserDir(username),
    getProjectsDir(username),
    getSessionsDir(username),
    getTeamsDir(username),
    getExperimentsDir(username),
    getPipelinesDir(username),
    getWorkspaceSkillsDir(username),
    join(getWorkspaceDir(username), ASSETS_DIR, UPLOADS_DIR),
    join(getWorkspaceDir(username), ASSETS_DIR, GENERATED_DIR),
    join(getWorkspaceDir(username), MEMORIES_DIR, PROJECTS_DIR),
    join(getWorkspaceDir(username), MEMORIES_DIR, SESSIONS_DIR),
  ];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}
