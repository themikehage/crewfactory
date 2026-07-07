import jwt from "jsonwebtoken";
import {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
  SessionManager as VendoredSessionManager,
  DefaultResourceLoader,
  createBashToolDefinition,
  type AgentSession,
  type AgentSessionEvent,
} from "../ai";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { AVAILABLE_TOOLS, SessionPrefix } from "shared";
import { DEFAULT_AGENTS_MD, DEFAULT_FACTORY_SKILLS } from "./default-factory-skills";
import { eventBroker } from "../lib/event-broker";
import { join, resolve, dirname } from "node:path";
import { registerQwenProvider } from "./qwen-provider";
import { registerOpenCodeGoProvider } from "./opencode-go-provider";
import { mcpRegistry } from "./mcp-registry";

import { createUiTools } from "./ui-tools";
import { encryptEnv, decryptEnv } from "../lib/env-crypto";
import { filterSecretsFromOutput } from "./bash-output-filter";
import { getEnvironmentContext } from "./env-check";
import { createExaSearchTool } from "./exa-search-tool";
import { memoryRegistry } from "./memory/registry";
import { createMemoryTools } from "./memory/memory-tools";

export function getResolvedSkillPaths(cwd: string, username?: string): string[] {
  const paths: string[] = [];

  // Todas las entidades (proyectos, agentes, canales) ven las factory skills globales
  if (username) {
    const factorySkillsDir = resolve(`/tmp/crewfactory/${username}`, "workspace", ".agents", "skills");
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
  const userDir = `/tmp/crewfactory/${username}`;
  const workspaceDir = join(userDir, "workspace");
  const skillsBaseDir = join(workspaceDir, ".agents", "skills");

  ensureWorkspaceSubdirs(workspaceDir);
  mkdirSync(join(userDir, "projects"), { recursive: true });

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


interface UserSessionEntry {
  session: AgentSession;
  unsubscribe: () => void;
}

interface UserContext {
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
}

type SessionListItem = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  status?: "active" | "streaming" | "task-running" | "sleeping";
  projectName?: string;
  agentId?: string;
  channelId?: string;
  isExecution?: boolean;
};

class SessionManager {
  private sessions = new Map<string, UserSessionEntry>();
  private pendingSessions = new Map<string, Promise<AgentSession>>();
  private users = new Map<string, UserContext>();

  private getSessionKey(username: string, sessionId: string): string {
    return `${username}:${sessionId}`;
  }

  ensureUserDir(username: string): string {
    const dir = `/tmp/crewfactory/${username}`;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  getUserEnv(username: string): Record<string, string> {
    const userDir = this.ensureUserDir(username);
    const envPath = join(userDir, "env.json");
    if (!existsSync(envPath)) return {};
    const raw = readFileSync(envPath, "utf-8");
    if (!raw.trim()) return {};
    
    const jwtSecret = process.env.JWT_SECRET || "dev-fallback-secret-key-crewfactory-default-1234567890";
    try {
      const decrypted = decryptEnv(raw, jwtSecret);
      return JSON.parse(decrypted);
    } catch (e) {
      try {
        const parsed = JSON.parse(raw);
        console.warn(`env.json for ${username} is in plaintext. Migrating to encrypted...`);
        this.setUserEnvMap(username, parsed);
        return parsed;
      } catch (err) {
        console.error(`Failed to parse env.json for ${username}:`, err);
        return {};
      }
    }
  }

  setUserEnv(username: string, key: string, value: string): void {
    const env = this.getUserEnv(username);
    env[key] = value;
    this.setUserEnvMap(username, env);
  }

  setUserEnvMap(username: string, env: Record<string, string>): void {
    const userDir = this.ensureUserDir(username);
    const envPath = join(userDir, "env.json");
    const jwtSecret = process.env.JWT_SECRET || "dev-fallback-secret-key-crewfactory-default-1234567890";
    const encrypted = encryptEnv(JSON.stringify(env), jwtSecret);
    writeFileSync(envPath, encrypted, "utf-8");
  }

  deleteUserEnv(username: string, key: string): void {
    const env = this.getUserEnv(username);
    delete env[key];
    this.setUserEnvMap(username, env);
  }

  getUserSettings(username: string): Record<string, any> {
    const userDir = this.ensureUserDir(username);
    const settingsPath = join(userDir, "settings.json");
    if (!existsSync(settingsPath)) return {};
    try {
      const raw = readFileSync(settingsPath, "utf-8");
      return JSON.parse(raw);
    } catch (e) {
      console.error(`Failed to parse settings.json for ${username}:`, e);
      return {};
    }
  }

  saveUserSettings(username: string, settings: Record<string, any>): void {
    const userDir = this.ensureUserDir(username);
    const settingsPath = join(userDir, "settings.json");
    const current = this.getUserSettings(username);
    const updated = { ...current, ...settings };
    writeFileSync(settingsPath, JSON.stringify(updated, null, 2), "utf-8");
  }

  getUserContext(username: string): UserContext {
    const existing = this.users.get(username);
    if (existing) return existing;

    const userDir = this.ensureUserDir(username);
    const authStorage = AuthStorage.create(`${userDir}/auth.json`);
    const modelRegistry = ModelRegistry.create(authStorage);

    modelRegistry.refresh();
    registerQwenProvider(modelRegistry);
    registerOpenCodeGoProvider(modelRegistry);

    const ctx: UserContext = { authStorage, modelRegistry };
    this.users.set(username, ctx);
    return ctx;
  }

  clearUserContext(username: string): void {
    this.users.delete(username);
  }

  getUserDefaultModel(username: string): string | null {
    const { modelRegistry } = this.getUserContext(username);
    const available = modelRegistry.getAvailable();
    if (available.length > 0) {
      return `${available[0].provider}/${available[0].id}`;
    }
    return null;
  }


  async getOrCreateSession(
    username: string,
    sessionId: string,
    projectName?: string,
    agentId?: string,
    channelId?: string
  ): Promise<AgentSession> {
    const key = this.getSessionKey(username, sessionId);
    const existing = this.sessions.get(key);
    if (existing) return existing.session;

    // Return the existing pending promise if initialization is already in progress
    const pending = this.pendingSessions.get(key);
    if (pending) return pending;

    const initPromise = (async () => {
      try {
        const userDir = this.ensureUserDir(username);
        const sessionDir = `${userDir}/sessions/${sessionId}`;

        if (!existsSync(sessionDir)) {
          mkdirSync(sessionDir, { recursive: true });
        }

    const metadataPath = join(sessionDir, "metadata.json");
    let resolvedProjectName = projectName;
    let resolvedAgentId = agentId;
    let resolvedChannelId = channelId;
    let persistedTools: string[] | undefined;

    const existingMeta = existsSync(metadataPath)
      ? (() => { try { return JSON.parse(readFileSync(metadataPath, "utf-8")); } catch { return {}; } })()
      : {};
    const updatedMeta = { ...existingMeta };

    if (projectName || agentId || channelId) {
      if (projectName !== undefined) updatedMeta.projectName = projectName;
      if (agentId !== undefined) updatedMeta.agentId = agentId;
      if (channelId !== undefined) updatedMeta.channelId = channelId;
      writeFileSync(metadataPath, JSON.stringify(updatedMeta, null, 2), "utf-8");
      resolvedProjectName = updatedMeta.projectName;
      resolvedAgentId = updatedMeta.agentId;
      resolvedChannelId = updatedMeta.channelId;
    } else {
      resolvedProjectName = existingMeta.projectName;
      resolvedAgentId = existingMeta.agentId;
      resolvedChannelId = existingMeta.channelId;
      persistedTools = Array.isArray(existingMeta.tools) ? existingMeta.tools : undefined;
    }

    // Asegurar estructura de carpetas
    ensureWorkspaceStructure(username);

    // Asignar cwd dinÃ¡micamente segÃºn el contexto (Repo vs Agent vs Channel vs Global)
    const workspaceBase = join(userDir, "workspace");
    let workspaceDir = workspaceBase;
    if (resolvedChannelId) {
      workspaceDir = join(userDir, "channels", resolvedChannelId, "workspace");
    } else if (resolvedAgentId) {
      workspaceDir = join(userDir, "agents", resolvedAgentId, "workspace");
    } else if (resolvedProjectName) {
      workspaceDir = resolve(userDir, "projects", resolvedProjectName, "workspace");
    }

    if (!existsSync(workspaceDir)) {
      mkdirSync(workspaceDir, { recursive: true });
    }

    // Crear subestructura completa para workspaces no-globales (skills, assets, memorias)
    if (resolvedChannelId || resolvedAgentId || resolvedProjectName) {
      ensureWorkspaceSubdirs(workspaceDir);
    }

    const { authStorage, modelRegistry } = this.getUserContext(username);

    let agentDef;
    if (resolvedAgentId) {
      const { agentRegistry } = await import("../agents");
      if (resolvedAgentId === "lab-architect") {
        try {
          if (!agentRegistry.get("lab-architect")) {
            const userDefaultModel = this.getUserDefaultModel(username);
            const modelId = userDefaultModel || "anthropic/claude-3-5-sonnet";
            await agentRegistry.register(username, {
              id: "lab-architect",
              name: "Lab Architect",
              role: "System Architect specialized in multi-agent experiments",
              systemPrompt: `You are Lab Architect, an expert System Architect. Your main task is to guide the user in designing and refining multi-agent benchmarking experiments.
Your communication style should be professional, clear, and structured. Always write in Spanish.
To achieve this, you have access to the tool \`create_experiment\` which allows you to create or update the configuration of an experiment.

When designing a team:
- Ask clarifying questions if the objective is underspecified.
- Propose specialist roles with detailed and clear Spanish system prompts following design principles (leader, specialized member, etc.).
- Call the \`create_experiment\` tool as soon as you have a solid design proposal to save it. If the user suggests tweaks (e.g. adding an agent or modifying criteria), call the tool again with the updated parameters and the same \`experimentId\`.`,
              model: modelId,
              skills: []
            }, false); // don't persist to user's custom agents list on disk
          }
        } catch (e) {
          console.error("Failed to register lab-architect:", e);
        }
      }
      const agentEntry = agentRegistry.get(resolvedAgentId);
      agentDef = agentEntry?.server.definition;
    }

    const skillPaths = getResolvedSkillPaths(workspaceDir, username);
    if (agentDef?.skills && agentDef.skills.length > 0) {
      for (const sk of agentDef.skills) {
        const candidate = resolve(workspaceDir, ".pi", "skills", sk);
        if (existsSync(candidate) && !skillPaths.includes(candidate)) {
          skillPaths.push(candidate);
        }
      }
    }
    const mcpConfig = mcpRegistry.loadConfig(username);
    const cachedMcpToolNames: string[] = [];
    for (const srv of Object.values(mcpConfig.mcpServers)) {
      if (srv.enabled && Array.isArray(srv.tools)) {
        for (const tName of srv.tools) {
          cachedMcpToolNames.push(`mcp_${srv.id}_${tName}`);
        }
      }
    }

    const envContext = getEnvironmentContext(workspaceDir);
    const appendPrompts = [
      `\n\nRuntime Environment:\n${envContext}`,
      `\n\nAdditional Instructions for HTML Visual Preview and Image Rendering:\n` +
      `- When generating web pages, HTML layouts, mockups, or visual documents, always output them as complete HTML files starting with "<!DOCTYPE html>" or "<html>" to enable a live browser-based preview.\n` +
      `- When generating plots, charts, diagrams, or images, save them to a file and output their file paths or URLs on a separate line using this exact format:\n` +
      `=== [title] ===\n` +
      `[file path or URL]\n` +
      `Example: === output.png ===\n` +
      `assets/output.png\n` +
      `This enables the UI to automatically parse and render them in a gallery grid.\n`,
      `\n\nInteractive UI Components (AG-UI Protocol):\n` +
      `You have native interactive UI tools. Prefer using them over custom scripts or general output formats when suitable:\n` +
      `- render_chart: Use this tool to display bar, line, area, or pie charts to visualize quantitative data, metrics, or analytical trends. Avoid writing Python/matplotlib scripts or generating image files for charts if they can be represented using this tool.\n` +
      `- request_approval: Before executing any critical, destructive, or potentially dangerous actions (such as running build/deploy scripts, deleting files, or executing system commands via bash), you MUST call this tool to request explicit user confirmation.\n` +
      `- ask_question: When you need to ask the user a question to clarify requirements, solicit design feedback, or resolve choices, call this tool to present a clean single/multi-choice form or custom text field.\n` +
      `- render_images: When generating images, drawings, or mockups, use this tool to display them dynamically in a responsive grid in the chat stream.\n` +
      `- render_html: When you produce a complete HTML document (web pages, mockups, dashboards, or any visual HTML output), use this tool to render it directly in the chat as a live interactive preview. Always prefer this over writing HTML to a file and expecting the user to open it manually.\n` +
      `- share_file: When you generate any file artifact that the user should download (PDF reports, Excel spreadsheets, PowerPoint presentations, Word documents, ZIP archives, etc.), use this tool to share it directly in the chat. The user will see a download card and can click to download. Always prefer this over telling the user to manually find the file in the workspace.\n` +
      `- refresh_ui: Call this tool immediately after creating, updating, or deleting a project/repository, agent, channel, custom skill, or experiment to trigger a reactive refresh of the UI sidebar and lists on the user's interface.\n`,
      `\n\nPersistent Memory Tools (memory_store, memory_recall, memory_forget):\n` +
      `You have access to long-term persistent memory tools that help you remember facts, decisions, patterns, and interactions across sessions.\n` +
      `- memory_store: Save a fact, event, or code/architectural pattern into your long-term persistent memory. Use this to remember user preferences, project conventions, bug fixes, architecture decisions, and important discoveries.\n` +
      `  * content: The memory text or factual content to store (required).\n` +
      `  * type: "semantic" (facts/concepts), "episodic" (events/interactions), or "procedural" (patterns/procedures). Default: "semantic".\n` +
      `  * importance: 0.0 (low) to 1.0 (high). Default: 0.5.\n` +
      `  * tags: Optional categorization tags for searching later.\n` +
      `- memory_recall: Search and retrieve query-relevant memories from your long-term memory. Use this before starting work on a topic to check if you have prior knowledge about it.\n` +
      `  * query: Natural language search term or semantic query (required).\n` +
      `  * limit: Max number of memories to return (1-20, default: 5).\n` +
      `- memory_forget: Delete a specific memory by its ID when it's no longer relevant or correct.\n` +
      `  * id: The unique memory ID to be deleted (required).\n` +
      `IMPORTANT: Use memory_store proactively after completing significant work (bug fixes, architecture decisions, discoveries, new patterns). Always use memory_recall before starting work on a topic that may have prior context.\n`,
      `\n\nSubagent Delegation (spawn_subagent tool):\n` +
      `You have a spawn_subagent tool to delegate focused, self-contained tasks to worker agents with fresh context. You are the ORCHESTRATOR, they are the EXECUTORS.\n` +
      `Use spawn_subagent when:\n` +
      `- A task requires isolated execution (such as writing several files, analyzing/verifying code, running builds/tests).\n` +
      `- You want an adversarial peer review of code or plans (spawn a subagent with role 'senior typescript reviewer').\n` +
      `- You want to break down a larger feature into parallel or serial execution batches without losing context length.\n` +
      `Do NOT delegate simple one-line changes, git status reads, or trivial file lookups.\n` +
      `Every subagent is a pure EXECUTOR and must be given all context (relative file paths, code snippets, requirements) in the "task" argument. It has no memory of this parent conversation.\n`,
      `\n\nTask Delegation (delegate_task tool):\n` +
      `You have a delegate_task tool to prompt and execute tasks on programmatic agents, channels, projects, or existing sessions.\n` +
      `Use delegate_task when you need to coordinate or ask another entity to do work (e.g. asking a search agent to search images, asking a channel team to build a plan, prompting a project build/test loop).\n` +
      `- CRITICAL: ALWAYS use this tool to communicate with other agents, channels, or projects. DO NOT run bash commands (like curl, Invoke-RestMethod, or scripts/delegate.ts) to send prompts or communicate. Communicating with other agents via bash/HTTP endpoints is strictly prohibited and will cause permission/sandbox errors.\n` +
      `- Target Type mapping: targetType must be "agent" | "project" | "channel" | "session".\n` +
      `- For agent targets, it triggers a clean isolated session bound to the target agent. For project targets, it invokes the project executor. For channel targets, it coordinates multi-agent chains and awaits agreement/negotiation completion.\n`
    ];

    if (sessionId.startsWith(SessionPrefix.DELEGATE)) {
      appendPrompts.push(
        `\n\n## Delegated Task Mode\n` +
        `You are executing a delegated task. Perform the task directly and output a structured result envelope at the very end of your response.\n` +
        `Return the result envelope exactly in this format as your last message:\n` +
        `---\n` +
        `status: success | partial | blocked\n` +
        `executive_summary: <1-3 sentences summarizing what was accomplished>\n` +
        `artifacts: <comma-separated list of files created/modified, or "none">\n` +
        `risks: <any risks found, or "None">\n` +
        `---`
      );
    }

    if (cachedMcpToolNames.length > 0) {
      appendPrompts.push(
        `\n\nModel Context Protocol (MCP) Tools Available:\n` +
        `You have the following custom MCP tools registered and active:\n` +
        `${cachedMcpToolNames.map((name: string) => `- ${name}`).join("\n")}\n` +
        `Use these tools when the task requires interacting with external databases, APIs, searching the web, or product integrations (like Slack, Linear, Jira, Google Drive). Do not assume you need to use bash if a specific MCP tool is more suitable.\n`
      );
    }

    if (agentDef?.systemPrompt) {
      appendPrompts.push(`\n\nAgent Instructions (${agentDef.name} - ${agentDef.role}):\n${agentDef.systemPrompt}`);
    }

    if (resolvedAgentId === "lab-architect") {
      const expId = updatedMeta.experimentId || (existingMeta ? (existingMeta as any).experimentId : undefined);
      if (expId) {
        const { ExperimentStore } = require("../laboratory/experiment-store");
        const exp = await ExperimentStore.getExperiment(username, expId);
        if (exp) {
          const agentsStr = exp.variants.multiWithLeader.agents.map((a: any) => 
            `  * **${a.name}** (id: \`${a.id}\`, role: \`${a.role}\`)${a.leader ? " [LÍDER]" : ""}\n    Prompt: ${a.systemPrompt}`
          ).join("\n");
          appendPrompts.push(
            `\n\n## Experimento Activo (ID: ${expId})\n` +
            `Actualmente estás editando el experimento:\n` +
            `- **Nombre:** ${exp.name}\n` +
            `- **Objetivo/Task Prompt:** ${exp.taskPrompt}\n` +
            `- **Criterios de Evaluación:** ${exp.judge.criteria.join(", ")}\n` +
            `- **Agentes Configurados:**\n${agentsStr}\n\n` +
            `Cuando llames a \`create_experiment\` para actualizar este experimento, debes pasarle obligatoriamente su \`experimentId\`: \`"${expId}"\`.`
          );
        }
      } else {
        appendPrompts.push(
          `\n\n## Sin Experimento Activo\n` +
          `El usuario está iniciando el diseño de un experimento nuevo. Ayúdalo a diseñar su tripulación de agentes y criterios de evaluación. ` +
          `Una vez definido, llama a \`create_experiment\` omitiendo el parámetro \`experimentId\` (se le generará uno automáticamente).`
        );
      }
    }

    const tasksPath = join(sessionDir, "tasks.json");
    if (existsSync(tasksPath)) {
      try {
        const tasksState = JSON.parse(readFileSync(tasksPath, "utf-8"));
        if (tasksState.status === "running") {
          const activeTask = tasksState.tasks?.find((t: any) => t.id === tasksState.currentTaskId);
          const tasksListStr = tasksState.tasks
            ?.map((t: any) => `- [${t.status === "done" ? "x" : t.status === "running" ? "/" : " "}] ${t.id}: ${t.title}${t.depends_on?.length > 0 ? ` (depends on: ${t.depends_on.join(", ")})` : ""}`)
            .join("\n");

          const promptSnippet = 
            `\n\n## Active Task Plan\n` +
            `You are currently executing a structured, dependency-aware task plan to achieve a high-level goal.\n` +
            `Overall Objective: "${tasksState.objective || ""}"\n` +
            `Current Plan Status: ${tasksState.status}\n\n` +
            `Tasks List:\n${tasksListStr}\n\n` +
            `Active Task Details:\n` +
            `- ID: ${tasksState.currentTaskId}\n` +
            `- Title: ${activeTask?.title || "N/A"}\n` +
            `- Instructions: "${activeTask?.prompt || "N/A"}"\n\n` +
            `Guidelines:\n` +
            `1. Focus ONLY on completing the active task: ${tasksState.currentTaskId}. Do not perform actions related to other tasks.\n` +
            `2. When the active task's objective is fully achieved, you MUST call the native tool: \`update_task_status(taskId: "${tasksState.currentTaskId}", status: "done", log: "summary of what was done")\` to mark it as complete. This will automatically update your active instructions in the next turn.\n` +
            `3. If a task fails or you hit an error you cannot resolve, call \`update_task_status(taskId: "${tasksState.currentTaskId}", status: "failed", log: "error reason")\`.\n` +
            `4. When all tasks in the list have been marked as "done", you MUST call \`complete_task_list(summary: "final completion summary")\` to finalize the execution.`;

          appendPrompts.push(promptSnippet);
        }
      } catch (e) {
        console.error("Failed to parse tasks.json for prompt injection:", e);
      }
    }

    const resourceLoader = new DefaultResourceLoader({
      cwd: workspaceDir,
      agentDir: userDir,
      additionalSkillPaths: skillPaths,
      appendSystemPrompt: appendPrompts,
    });
    await resourceLoader.reload();

    const jsonlFiles = readdirSync(sessionDir)
      .filter((f) => f.endsWith(".jsonl"))
      .sort()
      .reverse();

    let sessionManager: VendoredSessionManager;
    if (jsonlFiles.length > 0) {
      sessionManager = VendoredSessionManager.open(
        join(sessionDir, jsonlFiles[0]),
        sessionDir,
        sessionDir
      );
    } else {
      sessionManager = VendoredSessionManager.create(sessionDir, sessionDir);
    }

    const customBashTool = createBashToolDefinition(workspaceDir, {
      spawnHook: (context) => {
        const userEnv = this.getUserEnv(username);
        const token = jwt.sign(
          { username },
          process.env.JWT_SECRET!,
          { expiresIn: "7d" }
        );
        return {
          ...context,
          env: {
            ...context.env,
            ...userEnv,
            TOKEN: token,
            JWT_TOKEN: token,
          },
        };
      },
      outputFilter: (output: string) => {
        const userEnv = this.getUserEnv(username);
        const secrets = Object.values(userEnv).filter(Boolean);
        return filterSecretsFromOutput(output, secrets);
      },
    });


    const exaSearchTool = createExaSearchTool({ username });
    const userSettings = this.getUserSettings(username);
    const memoryEnabled = userSettings.memoryEnabled ?? true;
    const memoryDbPath = join(userDir, "sessions", sessionId, "memory", "memory.db");
    const memory = await memoryRegistry.get(`session:${sessionId}`, memoryDbPath, memoryEnabled);
    const memoryTools = memoryEnabled ? createMemoryTools(memory) : [];

    const uiTools = createUiTools(workspaceDir, username, false, {
      workspaceDir,
      username,
      parentSessionId: sessionId,
      modelRegistry,
      authStorage,
      resourceLoader,
    });
    const { session } = await createAgentSession({
      cwd: workspaceDir,
      sessionManager,
      authStorage,
      modelRegistry,
      resourceLoader,
      customTools: [customBashTool as any, ...uiTools as any, exaSearchTool as any, ...memoryTools as any],
    });

    const userEnv = this.getUserEnv(username);
    const hasExaKey = !!(userEnv.EXA_API_KEY || process.env.EXA_API_KEY);

    const systemTools = this.getSessionTools(username, sessionId);
    let activeTools = persistedTools || systemTools;
    
    if (!hasExaKey) {
      activeTools = activeTools.filter(t => t !== "exa_search");
    }

    const alwaysOnTools = [
      "request_approval",
      "ask_question",
      "render_images",
      "render_html",
      "render_chart",
      "share_file",
      "refresh_ui",
      "decompose_tasks",
      "update_task_status",
      "complete_task_list",
    ];
    if (resolvedAgentId === "lab-architect") {
      alwaysOnTools.push("create_experiment");
    } else {
      alwaysOnTools.push("spawn_subagent", "delegate_task");
    }

    const definedToolNames = new Set([
      ...systemTools,
      "bash",
      "exa_search",
      ...alwaysOnTools,
    ]);
    if (memoryEnabled) {
      definedToolNames.add("memory_store");
      definedToolNames.add("memory_recall");
      definedToolNames.add("memory_forget");
    }

    const combinedTools = Array.from(new Set([
      ...activeTools,
      ...alwaysOnTools,
      ...(memoryEnabled ? ["memory_store", "memory_recall", "memory_forget"] : []),
    ]))
      .filter(tName => definedToolNames.has(tName));

    session.setActiveToolsByName(combinedTools);

    const originalPrompt = session.prompt.bind(session);
    session.prompt = async (message: string) => {
      const memCtx = await memory.buildContext(message);
      const enriched = memCtx ? `${memCtx}\n\n${message}` : message;
      return originalPrompt(enriched);
    };

    // Load and inject MCP tools in the background asynchronously
    (async () => {
      try {
        const mcpTools = await mcpRegistry.getSessionMcpTools(username, sessionId);
        if (mcpTools.length > 0) {
          const sessionAny = session as any;
          if (sessionAny._customTools) {
            sessionAny._customTools.push(...mcpTools);
            if (typeof sessionAny._refreshToolRegistry === "function") {
              sessionAny._refreshToolRegistry();
            }
          }
          console.log(`[MCP Dynamic Load] Successfully loaded ${mcpTools.length} tools for session ${sessionId}`);
        }
      } catch (err) {
        console.error(`[MCP Dynamic Load] Failed to load MCP tools for session ${sessionId}:`, err);
      }
    })();

    // Subscribe to global logs forwarding
    const globalLogUnsub = session.subscribe((evt: any) => {
      const ev = evt as any;

      if (
        evt.type === "agent_start" ||
        evt.type === "agent_end" ||
        evt.type === "tool_execution_start" ||
        evt.type === "tool_execution_end" ||
        evt.type === "agent_error"
      ) {
        try {
          this.saveSessionMetadata(username, sessionId, {
            updatedAt: new Date().toISOString(),
          });
        } catch {}
      }
      const getSessionName = () => {
        try {
          const metaPath = join(sessionDir, "metadata.json");
          if (existsSync(metaPath)) {
            return JSON.parse(readFileSync(metaPath, "utf-8")).name || sessionId;
          }
        } catch {}
        return sessionId;
      };

      if (evt.type === "agent_start") {
        eventBroker.publishEvent(username, {
          sourceType: "session",
          sourceId: sessionId,
          sourceName: getSessionName(),
          eventType: "agent_start",
        });
      } else if (evt.type === "agent_end") {
        eventBroker.publishEvent(username, {
          sourceType: "session",
          sourceId: sessionId,
          sourceName: getSessionName(),
          eventType: "agent_end",
        });
      } else if (evt.type === "message_update") {
        if (ev.assistantMessageEvent?.type === "text_delta" && ev.assistantMessageEvent.delta) {
          eventBroker.publishEvent(username, {
            sourceType: "session",
            sourceId: sessionId,
            sourceName: getSessionName(),
            eventType: "text_delta",
            detail: ev.assistantMessageEvent.delta,
          });
        } else if (ev.assistantMessageEvent?.type === "thinking_delta" && ev.assistantMessageEvent.delta) {
          eventBroker.publishEvent(username, {
            sourceType: "session",
            sourceId: sessionId,
            sourceName: getSessionName(),
            eventType: "thinking_delta",
            detail: ev.assistantMessageEvent.delta,
          });
        }
      } else if (evt.type === "tool_execution_start") {
        eventBroker.publishEvent(username, {
          sourceType: "session",
          sourceId: sessionId,
          sourceName: getSessionName(),
          eventType: "tool_start",
          detail: { toolName: ev.toolName, args: ev.args, toolCallId: ev.toolCallId },
        });
      } else if (evt.type === "tool_execution_end") {
        eventBroker.publishEvent(username, {
          sourceType: "session",
          sourceId: sessionId,
          sourceName: getSessionName(),
          eventType: "tool_end",
          detail: { toolName: ev.toolName, result: ev.result, isError: ev.isError, toolCallId: ev.toolCallId },
        });
      } else if (evt.type === "agent_error") {
        eventBroker.publishEvent(username, {
          sourceType: "session",
          sourceId: sessionId,
          sourceName: getSessionName(),
          eventType: "error",
          detail: ev.error,
        });
      }
    });

        const unsubscribe = session.subscribe(() => {});

        const entry: UserSessionEntry = {
          session,
          unsubscribe: () => {
            unsubscribe();
            globalLogUnsub();
          },
        };
        this.sessions.set(key, entry);
        return session;
      } finally {
        this.pendingSessions.delete(key);
      }
    })();

    this.pendingSessions.set(key, initPromise);
    return initPromise;
  }

  getSession(username: string, sessionId: string): AgentSession | null {
    const key = this.getSessionKey(username, sessionId);
    return this.sessions.get(key)?.session ?? null;
  }

  subscribeToSession(
    username: string,
    sessionId: string,
    listener: (event: AgentSessionEvent) => void
  ): () => void {
    const key = this.getSessionKey(username, sessionId);
    const entry = this.sessions.get(key);
    if (!entry) return () => {};

    const unsubscribe = entry.session.subscribe(listener);
    return unsubscribe;
  }

  subscribeOnce(
    username: string,
    sessionId: string,
    listener: (event: AgentSessionEvent) => void
  ): void {
    const key = this.getSessionKey(username, sessionId);
    const entry = this.sessions.get(key);
    if (!entry) return;

    let called = false;
    let unsubscribe: (() => void) | null = null;

    unsubscribe = entry.session.subscribe((event) => {
      if (!called) {
        called = true;
        unsubscribe?.();
        listener(event);
      }
    });
  }

  async destroySession(username: string, sessionId: string): Promise<void> {
    const key = this.getSessionKey(username, sessionId);
    const entry = this.sessions.get(key);
    if (entry) {
      entry.unsubscribe();
      entry.session.dispose();
      this.sessions.delete(key);
    }
    this.pendingSessions.delete(key);
    mcpRegistry.stopSessionMcpTools(username, sessionId);
    await memoryRegistry.shutdown(`session:${sessionId}`);
    const userDir = this.ensureUserDir(username);
    const sessionDir = join(userDir, "sessions", sessionId);
    if (existsSync(sessionDir)) {
      rmSync(sessionDir, { recursive: true, force: true });
    }
  }

  saveSessionMetadata(username: string, sessionId: string, data: Record<string, unknown>): void {
    const userDir = this.ensureUserDir(username);
    const metadataPath = join(userDir, "sessions", sessionId, "metadata.json");
    let metadata: Record<string, unknown> = {};
    if (existsSync(metadataPath)) {
      try { metadata = JSON.parse(readFileSync(metadataPath, "utf-8")); } catch {}
    }
    Object.assign(metadata, data);
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
  }

  getSessionMetadata(username: string, sessionId: string): Record<string, any> | null {
    const userDir = this.ensureUserDir(username);
    const metadataPath = join(userDir, "sessions", sessionId, "metadata.json");
    if (existsSync(metadataPath)) {
      try {
        return JSON.parse(readFileSync(metadataPath, "utf-8"));
      } catch {}
    }
    return null;
  }


  async listSessions(username: string): Promise<SessionListItem[]> {
    const userDir = this.ensureUserDir(username);
    const sessionsDir = join(userDir, "sessions");
    if (!existsSync(sessionsDir)) return [];

    try {
      const entries = await readdir(sessionsDir, { withFileTypes: true });
      const sessionPromises = entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("plan_") && !entry.name.startsWith(SessionPrefix.DELEGATE) && !entry.name.startsWith(SessionPrefix.SUBAGENT))
        .map(async (entry) => {
          const sessionId = entry.name;
          const sessionSubdir = join(sessionsDir, sessionId);
          const metadataPath = join(sessionSubdir, "metadata.json");
          
          let metadata: Record<string, unknown> = {};
          if (existsSync(metadataPath)) {
            try {
              const metaContent = await readFile(metadataPath, "utf-8");
              metadata = JSON.parse(metaContent);
            } catch {}
          }

          let messageCount = 0;
          try {
            const files = await readdir(sessionSubdir);
            const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
            for (const file of jsonlFiles) {
              try {
                const content = await readFile(join(sessionSubdir, file), "utf-8");
                const lines = content.trim().split("\n");
                const limit = Math.min(lines.length, 500);
                for (let i = 0; i < limit; i++) {
                  const line = lines[i].trim();
                  if (!line) continue;
                  const parsed = JSON.parse(line);
                  if (parsed.type === "message" && parsed.message?.role === "user") {
                    messageCount++;
                  }
                }
              } catch {}
            }
          } catch {}

          const session = this.sessions.get(this.getSessionKey(username, sessionId));
          let status: "active" | "streaming" | "task-running" | "sleeping" | undefined;
          if (session) {
            if (session.session.isStreaming) {
              status = "streaming";
            } else {
              status = "active";
            }
          } else {
            status = "sleeping";
          }

          return {
            id: sessionId,
            name: (metadata.name as string) || sessionId,
            createdAt: (metadata.createdAt as string) || new Date(0).toISOString(),
            updatedAt: (metadata.updatedAt as string) || new Date(0).toISOString(),
            messageCount,
            status,
            projectName: metadata.projectName as string | undefined,
            agentId: metadata.agentId as string | undefined,
            channelId: metadata.channelId as string | undefined,
          };
        });

      const userSessions = await Promise.all(sessionPromises);
      const virtualSessions: SessionListItem[] = [];

      // 1. Ejecuciones de Agentes
      try {
        const { agentRegistry } = await import("../agents");
        const agentsList = agentRegistry.list(username);
        for (const agent of agentsList) {
          const execsDir = join(userDir, "agents", agent.id, "executions");
          if (existsSync(execsDir)) {
            const execFolders = readdirSync(execsDir);
            for (const f of execFolders) {
              try {
                const summaryPath = join(execsDir, f, "summary.json");
                if (existsSync(summaryPath)) {
                  const summary = JSON.parse(readFileSync(summaryPath, "utf-8"));
                  virtualSessions.push({
                    id: `exec_agent_${agent.id}_${f}`,
                    name: `API: ${summary.prompt ? summary.prompt.slice(0, 30) + (summary.prompt.length > 30 ? "..." : "") : f}`,
                    createdAt: summary.createdAt || new Date().toISOString(),
                    updatedAt: summary.createdAt || new Date().toISOString(),
                    messageCount: 0,
                    status: "sleeping",
                    agentId: agent.id,
                    isExecution: true as any,
                  });
                }
              } catch {}
            }
          }
        }
      } catch (e) {
        console.error("Failed to list virtual agent sessions:", e);
      }

      // 2. Ejecuciones de Proyectos
      try {
        const projectsDir = join(userDir, "projects");
        if (existsSync(projectsDir)) {
          const projectFolders = readdirSync(projectsDir, { withFileTypes: true });
          for (const entry of projectFolders) {
            if (entry.isDirectory()) {
              const execsDir = join(projectsDir, entry.name, "executions");
              if (existsSync(execsDir)) {
                const execFolders = readdirSync(execsDir);
                for (const f of execFolders) {
                  try {
                    const summaryPath = join(execsDir, f, "summary.json");
                    if (existsSync(summaryPath)) {
                      const summary = JSON.parse(readFileSync(summaryPath, "utf-8"));
                      virtualSessions.push({
                        id: `exec_project_${entry.name}_${f}`,
                        name: `API: ${summary.prompt ? summary.prompt.slice(0, 30) + (summary.prompt.length > 30 ? "..." : "") : f}`,
                        createdAt: summary.createdAt || new Date().toISOString(),
                        updatedAt: summary.createdAt || new Date().toISOString(),
                        messageCount: 0,
                        status: "sleeping",
                        projectName: entry.name,
                        isExecution: true as any,
                      });
                    }
                  } catch {}
                }
              }
            }
          }
        }
      } catch (e) {
        console.error("Failed to list virtual project sessions:", e);
      }

      // 3. Ejecuciones de Canales (CLI)
      try {
        const { channelStore } = await import("../channels");
        const channelsList = channelStore.listChannels(username);
        for (const channel of channelsList) {
          const msgsPath = join(userDir, "channels", channel.id, "messages.jsonl");
          if (existsSync(msgsPath)) {
            const fileContent = readFileSync(msgsPath, "utf-8");
            const lines = fileContent.trim().split("\n");
            const channelSessions = new Map<string, { firstMsgTime: string, lastMsgTime: string, firstPrompt: string }>();
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const parsed = JSON.parse(line);
                const sId = parsed.sessionId;
                if (sId && sId.startsWith("cli-channel-")) {
                  const time = parsed.timestamp || new Date().toISOString();
                  let text = parsed.content || "";
                  if (typeof text !== "string" && parsed.message?.content) {
                    text = parsed.message.content;
                  }
                  if (channelSessions.has(sId)) {
                    const entry = channelSessions.get(sId)!;
                    entry.lastMsgTime = time;
                    if (!entry.firstPrompt && parsed.role === "user" && text) {
                      entry.firstPrompt = text;
                    }
                  } else {
                    channelSessions.set(sId, {
                      firstMsgTime: time,
                      lastMsgTime: time,
                      firstPrompt: parsed.role === "user" ? text : "",
                    });
                  }
                }
              } catch {}
            }
            
            for (const [sId, info] of channelSessions.entries()) {
              virtualSessions.push({
                id: `exec_channel_${channel.id}_${sId}`,
                name: `CLI: ${info.firstPrompt ? info.firstPrompt.slice(0, 30) + (info.firstPrompt.length > 30 ? "..." : "") : sId}`,
                createdAt: info.firstMsgTime,
                updatedAt: info.lastMsgTime,
                messageCount: 0,
                status: "sleeping",
                channelId: channel.id,
                isExecution: true as any,
              });
            }
          }
        }
      } catch (e) {
        console.error("Failed to list virtual channel sessions:", e);
      }

      const allSessions = [...userSessions, ...virtualSessions];
      allSessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return allSessions;
    } catch (e) {
      console.error(`Failed to list sessions for ${username}:`, e);
      return [];
    }
  }

  persistSessionTools(username: string, sessionId: string, tools: string[]): void {
    const userDir = this.ensureUserDir(username);
    const metadataPath = join(userDir, "sessions", sessionId, "metadata.json");
    let metadata: Record<string, unknown> = {};
    if (existsSync(metadataPath)) {
      try { metadata = JSON.parse(readFileSync(metadataPath, "utf-8")); } catch {}
    }
    metadata.tools = tools;
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
  }

  getSessionTools(username: string, sessionId: string): string[] {
    const userDir = this.ensureUserDir(username);
    const metadataPath = join(userDir, "sessions", sessionId, "metadata.json");
    if (!existsSync(metadataPath)) return [...AVAILABLE_TOOLS];
    try {
      const metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
      return Array.isArray(metadata.tools) ? metadata.tools : [...AVAILABLE_TOOLS];
    } catch {
      return [...AVAILABLE_TOOLS];
    }
  }


  getUserPasswordHash(username: string): string | null {
    const userDir = this.ensureUserDir(username);
    const credPath = join(userDir, "credentials.json");
    if (!existsSync(credPath)) return null;
    try {
      const data = JSON.parse(readFileSync(credPath, "utf-8"));
      return data.passwordHash ?? null;
    } catch {
      return null;
    }
  }

  setUserPasswordHash(username: string, hashB64: string): void {
    const userDir = this.ensureUserDir(username);
    const credPath = join(userDir, "credentials.json");
    writeFileSync(credPath, JSON.stringify({ passwordHash: hashB64 }, null, 2), "utf-8");
  }

  async destroyAllSessions(username: string): Promise<void> {
    const prefix = `${username}:`;
    for (const [key, entry] of this.sessions) {
      if (key.startsWith(prefix)) {
        entry.unsubscribe();
        entry.session.dispose();
        this.sessions.delete(key);
      }
    }
  }
}

export const sessionManager = new SessionManager();
