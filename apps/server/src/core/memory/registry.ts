import { join, dirname } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import type { MemoryProvider } from "./types";
import { NullMemoryProvider } from "./null-provider";
import { LocalMemoryProvider } from "./local-provider";

class MemoryRegistry {
  private providers = new Map<string, MemoryProvider>();

  async get(namespace: string, dbPath: string, enabled: boolean): Promise<MemoryProvider> {
    if (!enabled) {
      return new NullMemoryProvider();
    }

    const key = `${namespace}:${dbPath}`;
    if (this.providers.has(key)) {
      return this.providers.get(key)!;
    }

    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    const provider = new LocalMemoryProvider(dbPath);
    this.providers.set(key, provider);
    return provider;
  }

  async shutdown(namespace: string): Promise<void> {
    for (const [key, provider] of this.providers.entries()) {
      if (key.startsWith(`${namespace}:`)) {
        await provider.shutdown();
        this.providers.delete(key);
      }
    }
  }

  async shutdownAll(): Promise<void> {
    const promises = Array.from(this.providers.values()).map((p) => p.shutdown());
    await Promise.all(promises);
    this.providers.clear();
  }
}

export const memoryRegistry = new MemoryRegistry();
