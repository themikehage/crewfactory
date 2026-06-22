import {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
  SessionManager,
  DefaultResourceLoader,
  getAgentDir,
  createBashToolDefinition,
  type AgentSession,
  type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { AVAILABLE_TOOLS } from "shared";

export function getResolvedSkillPaths(cwd: string): string[] {
  const paths: string[] = [];
  try {
    const realAgentDir = getAgentDir();
    const globalSkillsDir = resolve(realAgentDir, "skills");
    if (existsSync(globalSkillsDir)) {
      paths.push(globalSkillsDir);
    }
  } catch (e) {
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

export function ensureWorkspaceStructure(username: string): string {
  const userDir = `/tmp/pi-web-users/${username}`;
  const workspaceDir = join(userDir, "workspace");
  const subdirs = [
    join(workspaceDir, "repos"),
    join(workspaceDir, "assets", "uploads"),
    join(workspaceDir, "assets", "generated"),
    join(workspaceDir, "memories", "repos"),
    join(workspaceDir, "memories", "sessions"),
  ];

  for (const dir of subdirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
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

class PiSessionManager {
  private sessions = new Map<string, UserSessionEntry>();
  private users = new Map<string, UserContext>();

  private getSessionKey(username: string, sessionId: string): string {
    return `${username}:${sessionId}`;
  }

  private ensureUserDir(username: string): string {
    const dir = `/tmp/pi-web-users/${username}`;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  getUserEnv(username: string): Record<string, string> {
    const userDir = this.ensureUserDir(username);
    const envPath = join(userDir, "env.json");
    if (!existsSync(envPath)) return {};
    try {
      return JSON.parse(readFileSync(envPath, "utf-8"));
    } catch (e) {
      console.error(`Failed to read env.json for ${username}:`, e);
      return {};
    }
  }

  setUserEnv(username: string, key: string, value: string): void {
    const userDir = this.ensureUserDir(username);
    const envPath = join(userDir, "env.json");
    const env = this.getUserEnv(username);
    env[key] = value;
    writeFileSync(envPath, JSON.stringify(env, null, 2), "utf-8");
  }

  setUserEnvMap(username: string, env: Record<string, string>): void {
    const userDir = this.ensureUserDir(username);
    const envPath = join(userDir, "env.json");
    writeFileSync(envPath, JSON.stringify(env, null, 2), "utf-8");
  }

  deleteUserEnv(username: string, key: string): void {
    const userDir = this.ensureUserDir(username);
    const envPath = join(userDir, "env.json");
    const env = this.getUserEnv(username);
    delete env[key];
    writeFileSync(envPath, JSON.stringify(env, null, 2), "utf-8");
  }

  getUserContext(username: string): UserContext {
    const existing = this.users.get(username);
    if (existing) return existing;

    const userDir = this.ensureUserDir(username);
    const authStorage = AuthStorage.create(`${userDir}/auth.json`);
    const modelRegistry = ModelRegistry.create(authStorage);

    modelRegistry.refresh();

    const ctx: UserContext = { authStorage, modelRegistry };
    this.users.set(username, ctx);
    return ctx;
  }

  async getOrCreateSession(
    username: string,
    sessionId: string,
    repoName?: string
  ): Promise<AgentSession> {
    const key = this.getSessionKey(username, sessionId);
    const existing = this.sessions.get(key);
    if (existing) return existing.session;

    const userDir = this.ensureUserDir(username);
    const sessionDir = `${userDir}/sessions/${sessionId}`;

    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }

    // Persistir metadatos de sesión (guardar y leer metadata.json con repoName)
    const metadataPath = join(sessionDir, "metadata.json");
    let resolvedRepoName = repoName;
    let persistedTools: string[] | undefined;

    if (repoName) {
      const existing = existsSync(metadataPath)
        ? (() => { try { return JSON.parse(readFileSync(metadataPath, "utf-8")); } catch { return {}; } })()
        : {};
      writeFileSync(metadataPath, JSON.stringify({ ...existing, repoName }, null, 2), "utf-8");
    } else if (existsSync(metadataPath)) {
      try {
        const metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
        resolvedRepoName = metadata.repoName;
        persistedTools = Array.isArray(metadata.tools) ? metadata.tools : undefined;
      } catch (e) {
        console.error(`Failed to read metadata.json for session ${sessionId}:`, e);
      }
    }

    // Asegurar estructura de carpetas
    ensureWorkspaceStructure(username);

    // Asignar cwd dinámicamente
    const workspaceBase = join(userDir, "workspace");
    const workspaceDir = resolvedRepoName
      ? resolve(workspaceBase, "repos", resolvedRepoName)
      : workspaceBase;

    if (resolvedRepoName && !existsSync(workspaceDir)) {
      mkdirSync(workspaceDir, { recursive: true });
    }

    const { authStorage, modelRegistry } = this.getUserContext(username);

    const skillPaths = getResolvedSkillPaths(workspaceDir);
    const resourceLoader = new DefaultResourceLoader({
      cwd: workspaceDir,
      agentDir: userDir,
      additionalSkillPaths: skillPaths,
      appendSystemPrompt: [
        `\n\nAdditional Instructions for HTML Visual Preview and Image Rendering:\n` +
        `- When generating web pages, HTML layouts, mockups, or visual documents, always output them as complete HTML files starting with "<!DOCTYPE html>" or "<html>" to enable a live browser-based preview.\n` +
        `- When generating plots, charts, diagrams, or images, save them to a file and output their file paths or URLs on a separate line using this exact format:\n` +
        `=== [title] ===\n` +
        `[file path or URL]\n` +
        `Example: === output.png ===\n` +
        `assets/output.png\n` +
        `This enables the UI to automatically parse and render them in a gallery grid.\n`
      ]
    });
    await resourceLoader.reload();

    const jsonlFiles = readdirSync(sessionDir)
      .filter((f) => f.endsWith(".jsonl"))
      .sort()
      .reverse();

    let sessionManager: SessionManager;
    if (jsonlFiles.length > 0) {
      sessionManager = SessionManager.open(
        join(sessionDir, jsonlFiles[0]),
        sessionDir,
        sessionDir
      );
    } else {
      sessionManager = SessionManager.create(sessionDir, sessionDir);
    }

    const customBashTool = createBashToolDefinition(workspaceDir, {
      spawnHook: (context) => {
        const userEnv = this.getUserEnv(username);
        return {
          ...context,
          env: {
            ...context.env,
            ...userEnv,
          },
        };
      },
    });

    const { session } = await createAgentSession({
      cwd: workspaceDir,
      sessionManager,
      authStorage,
      modelRegistry,
      resourceLoader,
      customTools: [customBashTool],
    });

    if (persistedTools) {
      session.setActiveToolsByName(persistedTools);
    }

    const unsubscribe = session.subscribe(() => {});

    this.sessions.set(key, {
      session,
      unsubscribe,
    });

    return session;
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
    const unsubscribe = entry.session.subscribe((event) => {
      if (!called) {
        called = true;
        listener(event);
      }
    });

    entry.unsubscribe = () => {
      unsubscribe();
      if (!called) {
        called = true;
        listener({ type: "" } as unknown as AgentSessionEvent);
      }
    };
  }

  async destroySession(username: string, sessionId: string): Promise<void> {
    const key = this.getSessionKey(username, sessionId);
    const entry = this.sessions.get(key);
    if (entry) {
      entry.unsubscribe();
      entry.session.dispose();
      this.sessions.delete(key);
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

export const piSessionManager = new PiSessionManager();
