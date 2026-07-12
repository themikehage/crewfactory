import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { agentRegistry } from "../../agents";
import { channelStore } from "../../channels";
import { sessionManager } from "../session-manager";
import { ExperimentStore } from "../../laboratory/experiment-store";
import { loadSkills } from "../../ai";
import { getProjectsDir, getWorkspaceSkillsDir } from "shared";
import { FACTORY_CONTRACTS } from "./factory-contracts";

export interface FactoryToolOptions {
  username: string;
  parentSessionId: string;
}

const ENTITY_REFRESH_MAP: Record<string, string> = {
  agents: "agent",
  projects: "project",
  channels: "channel",
  skills: "skill",
  experiments: "experiment",
};

export function validateParams(entity: string, action: string, id: string | undefined, params: any) {
  const contract = FACTORY_CONTRACTS[entity];
  if (!contract) {
    return `Unknown entity: ${entity}`;
  }
  const actionContract = contract.actions[action as keyof typeof contract.actions];
  if (!actionContract) {
    return `Unknown action: ${action} for entity ${entity}`;
  }

  const expectedParams = actionContract.params || {};

  for (const [paramName, paramDef] of Object.entries(expectedParams)) {
    let val = params[paramName];
    if (paramName === "id") {
      val = val ?? id;
    } else if (paramName === "key") {
      val = val ?? id;
    }

    if (paramDef.required) {
      if (val === undefined || val === null || val === "") {
        return `Parameter "${paramName}" is required for action "${action}" on entity "${entity}".`;
      }
    }

    if (val !== undefined && val !== null) {
      if (paramDef.type === "string" && typeof val !== "string") {
        return `Parameter "${paramName}" must be a string.`;
      }
      if (paramDef.type === "boolean" && typeof val !== "boolean") {
        return `Parameter "${paramName}" must be a boolean.`;
      }
      if (paramDef.type === "array" && !Array.isArray(val)) {
        return `Parameter "${paramName}" must be an array.`;
      }
      if (paramDef.type === "object" && (typeof val !== "object" || Array.isArray(val))) {
        return `Parameter "${paramName}" must be an object.`;
      }
      if (paramDef.enum && !paramDef.enum.includes(val)) {
        return `Parameter "${paramName}" must be one of: ${paramDef.enum.join(", ")}.`;
      }
    }
  }

  return null;
}

function ok(text: string, details?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    details: details ?? {},
  };
}

function err(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    isError: true,
  };
}

async function handleAgents(action: string, id: string | undefined, params: any, username: string) {
  if (action === "get") {
    if (id) {
      const entry = agentRegistry.get(id, username);
      if (!entry) return err(`Agent "${id}" not found`);
      return ok(JSON.stringify(entry.server.definition, null, 2), { entity: "agents", id, data: entry.server.definition });
    }
    const list = agentRegistry.list(username);
    return ok(JSON.stringify(list, null, 2), { entity: "agents", data: list });
  }

  if (action === "upsert") {
    if (!id) return err("id is required for upsert");
    const existing = agentRegistry.get(id, username);
    if (existing) {
      await agentRegistry.update(username, id, {
        name: params.name ?? existing.server.definition.name,
        role: params.role ?? existing.server.definition.role,
        systemPrompt: params.systemPrompt ?? existing.server.definition.systemPrompt,
        model: params.model ?? existing.server.definition.model,
        skills: params.skills ?? existing.server.definition.skills,
        avatarUrl: params.avatarUrl ?? existing.server.definition.avatarUrl,
      });
      return ok(`Agent "${id}" updated`, { entity: "agents", id, status: "updated" });
    }
    const definition = {
      id,
      name: params.name,
      role: params.role,
      systemPrompt: params.systemPrompt ?? "",
      model: params.model ?? "",
      skills: params.skills ?? [],
      avatarUrl: params.avatarUrl,
    };
    await agentRegistry.register(username, definition);
    return ok(`Agent "${id}" created`, { entity: "agents", id, status: "created", data: definition });
  }

  if (action === "delete") {
    if (!id) return err("id is required for delete");
    const existing = agentRegistry.get(id, username);
    if (!existing) return err(`Agent "${id}" not found`);
    await agentRegistry.stop(id);
    return ok(`Agent "${id}" deleted`, { entity: "agents", id, status: "deleted" });
  }

  return err(`Unknown action: ${action}`);
}

function readProjectJson(projectPath: string): Record<string, unknown> | null {
  const filePath = join(projectPath, "project.json");
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function findProjectDir(username: string, nameOrId: string): string | null {
  const projectsDir = getProjectsDir(username);
  if (!existsSync(projectsDir)) return null;
  const entries = readdirSync(projectsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projPath = join(projectsDir, entry.name);
    const proj = readProjectJson(projPath);
    if (proj && (proj.id === nameOrId || proj.name === nameOrId)) {
      return projPath;
    }
  }
  return null;
}

async function handleProjects(action: string, id: string | undefined, params: any, username: string) {
  if (action === "get") {
    if (id) {
      const projPath = findProjectDir(username, id);
      if (!projPath) return err(`Project "${id}" not found`);
      const proj = readProjectJson(projPath);
      return ok(JSON.stringify(proj, null, 2), { entity: "projects", id, data: proj });
    }
    const projectsDir = getProjectsDir(username);
    const projects: Record<string, unknown>[] = [];
    if (existsSync(projectsDir)) {
      const entries = readdirSync(projectsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const projPath = join(projectsDir, entry.name);
        const proj = readProjectJson(projPath);
        if (proj) {
          const workspaceDir = join(projPath, "workspace");
          projects.push({ ...proj, hasWorkspace: existsSync(workspaceDir) });
        }
      }
    }
    return ok(JSON.stringify(projects, null, 2), { entity: "projects", data: projects });
  }

  if (action === "upsert") {
    if (!id) return err("id (project name) is required for upsert");
    if (!params.name) return err("name is required for upsert");

    const existingPath = findProjectDir(username, id);
    if (existingPath) {
      const proj = readProjectJson(existingPath);
      if (proj) {
        proj.name = params.name;
        writeFileSync(join(existingPath, "project.json"), JSON.stringify(proj, null, 2), "utf-8");
        return ok(`Project "${id}" renamed to "${params.name}"`, { entity: "projects", id, status: "updated", data: proj });
      }
    }

    const projectsDir = getProjectsDir(username);
    mkdirSync(projectsDir, { recursive: true });
    const projectId = crypto.randomUUID();
    const baseDir = join(projectsDir, projectId);
    const workspaceDir = join(baseDir, "workspace");
    mkdirSync(workspaceDir, { recursive: true });

    const projData = {
      id: projectId,
      name: params.name,
      cloneUrl: params.cloneUrl ?? null,
      createdAt: new Date().toISOString(),
    };
    writeFileSync(join(baseDir, "project.json"), JSON.stringify(projData, null, 2), "utf-8");

    if (params.cloneUrl) {
      try {
        const { spawn } = await import("bun");
        const proc = spawn(["git", "clone", params.cloneUrl, workspaceDir], {
          cwd: projectsDir,
          stdout: "pipe",
          stderr: "pipe",
        });
        await proc.exited;
      } catch {
        return ok(`Project "${params.name}" created but clone failed. Workspace is empty.`, { entity: "projects", id: projectId, status: "created", data: projData, cloneWarning: true });
      }
    }

    return ok(`Project "${params.name}" created`, { entity: "projects", id: projectId, status: "created", data: projData });
  }

  if (action === "delete") {
    if (!id) return err("id is required for delete");
    const projPath = findProjectDir(username, id);
    if (!projPath) return err(`Project "${id}" not found`);
    const proj = readProjectJson(projPath);
    rmSync(projPath, { recursive: true, force: true });
    const projectName = (proj as any)?.name ?? id;
    return ok(`Project "${projectName}" deleted`, { entity: "projects", id, status: "deleted" });
  }

  return err(`Unknown action: ${action}`);
}

async function handleChannels(action: string, id: string | undefined, params: any, username: string) {
  if (action === "get") {
    if (id) {
      const channel = channelStore.getChannel(username, id);
      if (!channel) return err(`Channel "${id}" not found`);
      return ok(JSON.stringify(channel, null, 2), { entity: "channels", id, data: channel });
    }
    const list = channelStore.listChannels(username);
    return ok(JSON.stringify(list, null, 2), { entity: "channels", data: list });
  }

  if (action === "upsert") {
    if (!id) return err("id is required for upsert");
    const existing = channelStore.getChannel(username, id);
    if (existing) {
      const updated = channelStore.updateChannel(username, id, {
        name: params.name,
        description: params.description,
      });
      if (params.members) {
        channelStore.updateMembers(username, id, params.members);
      }
      if (params.negotiationProtocol !== undefined) {
        channelStore.updateChannel(username, id, { negotiationProtocol: params.negotiationProtocol });
      }
      return ok(`Channel "${id}" updated`, { entity: "channels", id, status: "updated", data: updated });
    }
    const channel = channelStore.createChannel(username, {
      id,
      name: params.name,
      description: params.description ?? "",
      members: params.members ?? [],
      negotiationProtocol: params.negotiationProtocol ?? false,
    } as any);
    return ok(`Channel "${id}" created`, { entity: "channels", id, status: "created", data: channel });
  }

  if (action === "delete") {
    if (!id) return err("id is required for delete");
    const existing = channelStore.getChannel(username, id);
    if (!existing) return err(`Channel "${id}" not found`);
    channelStore.deleteChannel(username, id);
    return ok(`Channel "${id}" deleted`, { entity: "channels", id, status: "deleted" });
  }

  return err(`Unknown action: ${action}`);
}

async function handleSessions(action: string, id: string | undefined, _params: any, username: string) {
  if (action === "get") {
    if (id) {
      const meta = sessionManager.metadataStore.getSessionMetadata(username, id);
      if (!meta) {
        const session = sessionManager.getSession(username, id);
        if (!session) return err(`Session "${id}" not found`);
        const stats = session.getSessionStats();
        return ok(JSON.stringify(stats, null, 2), { entity: "sessions", id, data: stats });
      }
      return ok(JSON.stringify(meta, null, 2), { entity: "sessions", id, data: meta });
    }
    const list = await sessionManager.listSessions(username);
    return ok(JSON.stringify(list, null, 2), { entity: "sessions", data: list });
  }

  if (action === "upsert") {
    return err("Sessions are created implicitly via chat. Upsert is not supported. Use delegate_task to send a prompt to a session.");
  }

  if (action === "delete") {
    if (!id) return err("id is required for delete");
    await sessionManager.destroySession(username, id);
    return ok(`Session "${id}" deleted`, { entity: "sessions", id, status: "deleted" });
  }

  return err(`Unknown action: ${action}`);
}

async function handleEnv(action: string, key: string | undefined, params: any, username: string) {
  if (action === "get") {
    if (key) {
      const userEnv = sessionManager.userConfig.getUserEnv(username);
      if (!(key in userEnv)) return err(`Env var "${key}" not found`);
      return ok(`Env var ${key} exists (value hidden)`, { entity: "env", key, exists: true });
    }
    const userEnv = sessionManager.userConfig.getUserEnv(username);
    const list = Object.entries(userEnv).map(([k]) => ({ key: k, value: "••••••••" }));
    return ok(JSON.stringify(list, null, 2), { entity: "env", data: list });
  }

  if (action === "upsert") {
    if (!params.key) return err("key is required in params for env upsert");
    if (params.value === undefined) return err("value is required in params for env upsert");
    sessionManager.userConfig.setUserEnv(username, params.key.trim(), params.value);
    return ok(`Env var "${params.key}" set`, { entity: "env", key: params.key, status: "set" });
  }

  if (action === "delete") {
    const targetKey = key || params?.key;
    if (!targetKey) return err("key is required (as id or in params) for env delete");
    sessionManager.userConfig.deleteUserEnv(username, targetKey);
    return ok(`Env var "${targetKey}" deleted`, { entity: "env", key: targetKey, status: "deleted" });
  }

  return err(`Unknown action: ${action}`);
}

async function handleProviders(action: string, id: string | undefined, params: any, username: string) {
  const { modelRegistry, authStorage } = sessionManager.userConfig.getUserContext(username);

  if (action === "get") {
    if (id) {
      const status = authStorage.getAuthStatus(id);
      const models = modelRegistry.getAll().filter((m: any) => m.provider === id);
      return ok(JSON.stringify({ provider: id, configured: status.configured, source: status.source, models }, null, 2), {
        entity: "providers", id, data: { configured: status.configured, source: status.source, models },
      });
    }
    const allModels = modelRegistry.getAll();
    const providers = new Map<string, any>();
    for (const m of allModels) {
      if (!providers.has(m.provider)) {
        const status = authStorage.getAuthStatus(m.provider);
        providers.set(m.provider, {
          id: m.provider,
          name: modelRegistry.getProviderDisplayName(m.provider),
          configured: status.configured,
          source: status.source,
        });
      }
    }
    return ok(JSON.stringify([...providers.values()], null, 2), { entity: "providers", data: [...providers.values()] });
  }

  if (action === "upsert") {
    if (!id) return err("id (provider ID) is required for upsert");
    if (!params.apiKey) return err("apiKey is required in params for provider upsert");
    authStorage.set(id, params.apiKey);
    modelRegistry.refresh();
    return ok(`API key set for provider "${id}"`, { entity: "providers", id, status: "configured" });
  }

  if (action === "delete") {
    if (!id) return err("id (provider ID) is required for delete");
    authStorage.remove(id);
    modelRegistry.refresh();
    return ok(`API key revoked for provider "${id}"`, { entity: "providers", id, status: "revoked" });
  }

  return err(`Unknown action: ${action}`);
}

async function handleSkills(action: string, id: string | undefined, params: any, username: string) {
  const skillsDir = getWorkspaceSkillsDir(username);

  if (action === "get") {
    if (id) {
      const skillPath = join(skillsDir, id, "SKILL.md");
      if (!existsSync(skillPath)) return err(`Skill "${id}" not found`);
      const content = readFileSync(skillPath, "utf-8");
      return ok(content, { entity: "skills", id, data: { name: id, filePath: skillPath, content } });
    }
    const result = loadSkills({
      cwd: skillsDir,
      agentDir: skillsDir,
      skillPaths: [skillsDir],
      includeDefaults: false,
    });
    const list = result.skills.map((s: any) => ({
      name: s.name,
      description: s.description,
      scope: s.sourceInfo?.scope ?? "global",
    }));
    return ok(JSON.stringify(list, null, 2), { entity: "skills", data: list });
  }

  if (action === "upsert") {
    if (!id) return err("id (skill name) is required for upsert");
    if (!params.name) return err("name is required in params for skill upsert");
    if (!params.description) return err("description is required in params for skill upsert");
    if (!params.content) return err("content is required in params for skill upsert");

    const skillDir = join(skillsDir, id);
    mkdirSync(skillDir, { recursive: true });
    const frontmatter = `---\nname: ${params.name}\ndescription: ${params.description}\n---\n\n`;
    writeFileSync(join(skillDir, "SKILL.md"), frontmatter + params.content, "utf-8");
    return ok(`Skill "${id}" saved`, { entity: "skills", id, status: "saved" });
  }

  if (action === "delete") {
    if (!id) return err("id (skill name) is required for delete");
    const skillDir = join(skillsDir, id);
    if (!existsSync(skillDir)) return err(`Skill "${id}" not found`);
    rmSync(skillDir, { recursive: true, force: true });
    return ok(`Skill "${id}" deleted`, { entity: "skills", id, status: "deleted" });
  }

  return err(`Unknown action: ${action}`);
}

async function handleExperiments(action: string, id: string | undefined, params: any, username: string) {
  if (action === "get") {
    if (id) {
      const exp = await ExperimentStore.getExperiment(username, id);
      if (!exp) return err(`Experiment "${id}" not found`);
      return ok(JSON.stringify(exp, null, 2), { entity: "experiments", id, data: exp });
    }
    const list = await ExperimentStore.listExperiments(username);
    return ok(JSON.stringify(list, null, 2), { entity: "experiments", data: list });
  }

  if (action === "upsert") {
    if (!id) return err("id is required for upsert");
    if (!params.name) return err("name is required in params for experiment upsert");

    const existing = await ExperimentStore.getExperiment(username, id);
    if (existing) {
      existing.name = params.name ?? existing.name;
      if (params.taskPrompt !== undefined) existing.taskPrompt = params.taskPrompt;
      if (params.judge) existing.judge = params.judge;
      await ExperimentStore.saveExperiment(username, existing);
      return ok(`Experiment "${id}" updated`, { entity: "experiments", id, status: "updated", data: existing });
    }

    const experiment: any = {
      id,
      name: params.name,
      taskPrompt: params.taskPrompt ?? "",
      status: "designing",
      positions: [],
      judge: params.judge ?? { criteria: ["Quality"], autoEvaluate: true },
      variants: {
        single: { type: "single", agents: [] },
        multiNoLeader: { type: "multi_no_leader", agents: [] },
        multiWithLeader: { type: "multi_with_leader", agents: [] },
      },
      createdAt: new Date().toISOString(),
    };
    await ExperimentStore.saveExperiment(username, experiment);
    return ok(`Experiment "${id}" created`, { entity: "experiments", id, status: "created", data: experiment });
  }

  if (action === "delete") {
    if (!id) return err("id is required for delete");
    const existing = await ExperimentStore.getExperiment(username, id);
    if (!existing) return err(`Experiment "${id}" not found`);
    await ExperimentStore.deleteExperiment(username, id);
    return ok(`Experiment "${id}" deleted`, { entity: "experiments", id, status: "deleted" });
  }

  return err(`Unknown action: ${action}`);
}

export function createFactoryTool(opts: FactoryToolOptions) {
  const { username } = opts;

  return {
    name: "manage_factory",
    description: `Manage CrewFactory entities directly. Operations on agents, projects, channels, sessions, environment variables, LLM providers, custom skills, and laboratory experiments.

Available entities: agents, projects, channels, sessions, env, providers, skills, experiments.
Actions: get (list or read), upsert (create or update), delete (permanently remove).

Entity-specific notes:
- sessions: only get and delete. Sessions are created implicitly via chat.
- env: uses "key" in params instead of "id" for upsert/delete. Keys are uppercase (e.g. GITHUB_TOKEN).
- providers: upsert sets an API key, delete revokes it.
- skills: upsert writes a SKILL.md file with frontmatter. Requires name, description, and content params.
- projects: upsert can optionally clone a git repo via cloneUrl param.

For exact parameter schemas, call GET /api/factory/contract/:entity.
After mutating any entity, call refresh_ui to update the frontend sidebar.`,

    parameters: {
      type: "object",
      properties: {
        entity: {
          type: "string",
          enum: ["agents", "projects", "channels", "sessions", "env", "providers", "skills", "experiments"],
          description: "The factory entity type to operate on.",
        },
        action: {
          type: "string",
          enum: ["get", "upsert", "delete"],
          description: "get: retrieve entity data (list or single). upsert: create or update. delete: permanently remove.",
        },
        id: {
          type: "string",
          description: "Entity identifier. Required for delete. For get, omit to list all entities. For upsert on agents/channels/skills/experiments, use as the unique ID. For env, use 'key' in params instead.",
        },
        params: {
          type: "object",
          description: "Entity-specific parameters as a flat JSON object. For upsert, includes required fields. See GET /api/factory/contract/:entity for exact schemas per entity.",
        },
      },
      required: ["entity", "action"],
    },

    execute: async (_toolCallId: string, args: any) => {
      const { entity, action, id, params = {} } = args;

      const validationError = validateParams(entity, action, id, params);
      if (validationError) {
        return err(validationError);
      }

      let result: any;
      switch (entity) {
        case "agents":
          result = await handleAgents(action, id, params, username);
          break;
        case "projects":
          result = await handleProjects(action, id, params, username);
          break;
        case "channels":
          result = await handleChannels(action, id, params, username);
          break;
        case "sessions":
          result = await handleSessions(action, id, params, username);
          break;
        case "env":
          result = await handleEnv(action, id, params, username);
          break;
        case "providers":
          result = await handleProviders(action, id, params, username);
          break;
        case "skills":
          result = await handleSkills(action, id, params, username);
          break;
        case "experiments":
          result = await handleExperiments(action, id, params, username);
          break;
        default:
          return err(`Unknown entity: ${entity}`);
      }

      if (result && !result.isError && (action === "upsert" || action === "delete")) {
        const refreshType = ENTITY_REFRESH_MAP[entity];
        if (refreshType) {
          try {
            const { broadcastToUser } = await import("../../ws/handler");
            broadcastToUser(username, {
              type: "entity-updated",
              entityType: refreshType,
            });
          } catch (e) {
            console.error("Failed to broadcast entity refresh:", e);
          }
        }
      }

      return result;
    },
  };
}
