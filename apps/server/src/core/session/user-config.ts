import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  getUserDir,
  getEnvPath,
  getSettingsPath,
  getCredentialsPath,
  getAuthPath,
} from "shared";
import { AuthStorage, ModelRegistry } from "../../ai";
import { registerQwenProvider } from "../providers/qwen-provider";
import { registerOpenCodeGoProvider } from "../providers/opencode-go-provider";
import { encryptEnv, decryptEnv } from "../../lib/env-crypto";
import { auth } from "../../auth/index";

export interface UserContext {
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
}

export class UserConfigManager {
  private users = new Map<string, UserContext>();

  ensureUserDir(username: string): string {
    const dir = getUserDir(username);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  getUserEnv(username: string): Record<string, string> {
    this.ensureUserDir(username);
    const envPath = getEnvPath(username);
    if (!existsSync(envPath)) return {};
    const raw = readFileSync(envPath, "utf-8");
    if (!raw.trim()) return {};

    const jwtSecret = auth.options.secret;
    try {
      const decrypted = decryptEnv(raw, jwtSecret);
      return JSON.parse(decrypted);
    } catch (e) {
      try {
        const parsed = JSON.parse(raw);
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
    this.ensureUserDir(username);
    const envPath = getEnvPath(username);
    const jwtSecret = auth.options.secret;
    const encrypted = encryptEnv(JSON.stringify(env), jwtSecret);
    writeFileSync(envPath, encrypted, "utf-8");
  }

  deleteUserEnv(username: string, key: string): void {
    const env = this.getUserEnv(username);
    delete env[key];
    this.setUserEnvMap(username, env);
  }

  getUserSettings(username: string): Record<string, any> {
    this.ensureUserDir(username);
    const settingsPath = getSettingsPath(username);
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
    this.ensureUserDir(username);
    const settingsPath = getSettingsPath(username);
    const current = this.getUserSettings(username);
    const updated = { ...current, ...settings };
    writeFileSync(settingsPath, JSON.stringify(updated, null, 2), "utf-8");
  }

  getUserContext(username: string): UserContext {
    const existing = this.users.get(username);
    if (existing) return existing;

    this.ensureUserDir(username);
    const authStorage = AuthStorage.create(getAuthPath(username));
    const modelRegistry = ModelRegistry.create(authStorage, () => this.getUserEnv(username));

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

  getUserPasswordHash(username: string): string | null {
    this.ensureUserDir(username);
    const credPath = getCredentialsPath(username);
    if (!existsSync(credPath)) return null;
    try {
      const data = JSON.parse(readFileSync(credPath, "utf-8"));
      return data.passwordHash ?? null;
    } catch {
      return null;
    }
  }

  setUserPasswordHash(username: string, hashB64: string): void {
    this.ensureUserDir(username);
    const credPath = getCredentialsPath(username);
    writeFileSync(credPath, JSON.stringify({ passwordHash: hashB64 }, null, 2), "utf-8");
  }
}

export const userConfigManager = new UserConfigManager();
