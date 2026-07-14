import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getProviderModelsPath } from "shared";

export function loadAllProviderModels(username: string): Record<string, any[]> {
  const path = getProviderModelsPath(username);
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    console.error(`[ProviderPersistence] Failed to read ${path}:`, error);
    return {};
  }
}

export function saveAllProviderModels(username: string, data: Record<string, any[]>): void {
  const path = getProviderModelsPath(username);
  try {
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error(`[ProviderPersistence] Failed to write ${path}:`, error);
  }
}

export function loadProviderModels(username: string, provider: string): any[] | null {
  const all = loadAllProviderModels(username);
  return all[provider] ?? null;
}

export function saveProviderModels(username: string, provider: string, models: any[]): void {
  const all = loadAllProviderModels(username);
  all[provider] = models;
  saveAllProviderModels(username, all);
}

export function clearProviderModels(username: string, provider: string): void {
  const all = loadAllProviderModels(username);
  if (provider in all) {
    delete all[provider];
    saveAllProviderModels(username, all);
  }
}
