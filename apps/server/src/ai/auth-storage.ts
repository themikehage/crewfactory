import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { encryptEnv, decryptEnv } from "../lib/env-crypto";
import { auth } from "../auth/index";

export type AuthStatus = {
  configured: boolean;
  source?: "stored" | "environment";
  label?: string;
};

export type AuthStorageData = Record<string, string>;

export class AuthStorage {
  private authPath: string;
  private data: AuthStorageData;

  private constructor(authPath: string) {
    this.authPath = authPath;
    this.data = this.load();
  }

  static create(authPath?: string): AuthStorage {
    const path = authPath ?? "/tmp/pi-auth.json";
    return new AuthStorage(path);
  }

  private load(): AuthStorageData {
    if (!existsSync(this.authPath)) return {};
    const raw = readFileSync(this.authPath, "utf-8");
    if (!raw.trim()) return {};

    const jwtSecret = auth.options.secret;
    try {
      const decrypted = decryptEnv(raw, jwtSecret);
      return JSON.parse(decrypted);
    } catch {
      try {
        const parsed = JSON.parse(raw);
        console.warn(`auth.json at ${this.authPath} is in plaintext. Migrating to encrypted...`);
        const encrypted = encryptEnv(JSON.stringify(parsed), jwtSecret);
        writeFileSync(this.authPath, encrypted, "utf-8");
        return parsed;
      } catch {
        return {};
      }
    }
  }

  private save(): void {
    const dir = dirname(this.authPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const jwtSecret = auth.options.secret;
    const encrypted = encryptEnv(JSON.stringify(this.data), jwtSecret);
    writeFileSync(this.authPath, encrypted, "utf-8");
  }

  hasAuth(provider: string): boolean {
    if (this.data[provider]) return true;
    const envKey = this.getEnvKey(provider);
    return !!envKey && !!process.env[envKey];
  }

  getAuthStatus(provider: string): AuthStatus {
    if (this.data[provider]) {
      return { configured: true, source: "stored" };
    }
    const envKey = this.getEnvKey(provider);
    if (envKey && process.env[envKey]) {
      return { configured: true, source: "environment", label: envKey };
    }
    return { configured: false };
  }

  getApiKey(provider: string): string | undefined {
    return this.data[provider] ?? this.getEnvApiKey(provider);
  }

  set(provider: string, credential: string | { type: string; key: string }): void {
    const key = typeof credential === "string" ? credential : credential.key;
    this.data[provider] = key;
    this.save();
  }

  remove(provider: string): void {
    delete this.data[provider];
    this.save();
  }

  reload(): void {
    this.data = this.load();
  }

  private getEnvKey(provider: string): string | undefined {
    const envMap: Record<string, string> = {
      qwen: "DASHSCOPE_API_KEY",
      opencode: "OPENCODE_API_KEY",
      openai: "OPENAI_API_KEY",
      anthropic: "ANTHROPIC_API_KEY",
    };
    return envMap[provider];
  }

  private getEnvApiKey(provider: string): string | undefined {
    const envKey = this.getEnvKey(provider);
    if (!envKey) return undefined;
    return process.env[envKey];
  }
}
