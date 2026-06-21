import {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
  SessionManager,
  DefaultResourceLoader,
  type AgentSession,
  type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync } from "node:fs";

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
    sessionId: string
  ): Promise<AgentSession> {
    const key = this.getSessionKey(username, sessionId);
    const existing = this.sessions.get(key);
    if (existing) return existing.session;

    const userDir = this.ensureUserDir(username);
    const sessionDir = `${userDir}/sessions/${sessionId}`;

    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }

    const { authStorage, modelRegistry } = this.getUserContext(username);

    const resourceLoader = new DefaultResourceLoader({
      cwd: sessionDir,
      agentDir: userDir,
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

    const { session } = await createAgentSession({
      cwd: sessionDir,
      sessionManager: SessionManager.create(sessionDir),
      authStorage,
      modelRegistry,
      resourceLoader,
    });

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
