import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getUserDir } from "shared";
import { type CustomToolDefinition, CustomToolDefinitionSchema } from "./schemas";

export interface RegistryEntry {
  name: string;
  label?: string;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export class CustomToolStorage {
  private getStorageDir(username: string): string {
    const userDir = getUserDir(username);
    const dir = join(userDir, "custom-tools");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private getIndexPath(username: string): string {
    return join(this.getStorageDir(username), "_index.json");
  }

  private readIndex(username: string): RegistryEntry[] {
    const indexPath = this.getIndexPath(username);
    if (!existsSync(indexPath)) {
      return [];
    }
    try {
      const content = readFileSync(indexPath, "utf8");
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  private writeIndex(username: string, index: RegistryEntry[]): void {
    const indexPath = this.getIndexPath(username);
    writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf8");
  }

  loadAll(username: string): CustomToolDefinition[] {
    const index = this.readIndex(username);
    const dir = this.getStorageDir(username);
    const definitions: CustomToolDefinition[] = [];

    for (const entry of index) {
      const filePath = join(dir, `${entry.name}.json`);
      if (existsSync(filePath)) {
        try {
          const content = readFileSync(filePath, "utf8");
          const raw = JSON.parse(content);
          const parsed = CustomToolDefinitionSchema.parse(raw);
          definitions.push(parsed);
        } catch (err) {
          console.error(`Failed to load custom tool definition for ${entry.name}:`, err);
        }
      }
    }
    return definitions;
  }

  get(username: string, name: string): CustomToolDefinition | null {
    const dir = this.getStorageDir(username);
    const filePath = join(dir, `${name}.json`);
    if (!existsSync(filePath)) {
      return null;
    }
    try {
      const content = readFileSync(filePath, "utf8");
      const raw = JSON.parse(content);
      return CustomToolDefinitionSchema.parse(raw);
    } catch {
      return null;
    }
  }

  upsert(username: string, definition: CustomToolDefinition): void {
    const dir = this.getStorageDir(username);
    const filePath = join(dir, `${definition.name}.json`);
    
    const now = new Date().toISOString();
    const cleanDef = {
      ...definition,
      createdAt: definition.createdAt || now,
      updatedAt: now,
    };

    writeFileSync(filePath, JSON.stringify(cleanDef, null, 2), "utf8");

    // Update index
    const index = this.readIndex(username);
    const existingIdx = index.findIndex(e => e.name === cleanDef.name);
    
    const entry: RegistryEntry = {
      name: cleanDef.name,
      label: cleanDef.label,
      enabled: cleanDef.enabled,
      createdAt: cleanDef.createdAt,
      updatedAt: cleanDef.updatedAt,
    };

    if (existingIdx >= 0) {
      index[existingIdx] = entry;
    } else {
      index.push(entry);
    }
    this.writeIndex(username, index);
  }

  delete(username: string, name: string): void {
    const dir = this.getStorageDir(username);
    const filePath = join(dir, `${name}.json`);
    if (existsSync(filePath)) {
      rmSync(filePath, { force: true });
    }

    const index = this.readIndex(username);
    const updated = index.filter(e => e.name !== name);
    this.writeIndex(username, updated);
  }

  toggle(username: string, name: string, enabled: boolean): void {
    const def = this.get(username, name);
    if (def) {
      def.enabled = enabled;
      this.upsert(username, def);
    } else {
      // If full file doesn't exist, update index at least
      const index = this.readIndex(username);
      const existing = index.find(e => e.name === name);
      if (existing) {
        existing.enabled = enabled;
        this.writeIndex(username, index);
      }
    }
  }
}

export const customToolStorage = new CustomToolStorage();
