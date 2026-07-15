import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { getUserDir } from "shared";
import type { ToolPermissionRule } from "./subagent-permissions";

export class UserPermissionStore {
  private cache = new Map<string, ToolPermissionRule[]>();

  private getFilePath(username: string): string {
    return join(getUserDir(username), "permission-decisions.json");
  }

  getDecisions(username: string): ToolPermissionRule[] {
    if (this.cache.has(username)) {
      return this.cache.get(username)!;
    }
    const path = this.getFilePath(username);
    if (!existsSync(path)) {
      return [];
    }
    try {
      const content = readFileSync(path, "utf-8");
      const rules = JSON.parse(content);
      if (Array.isArray(rules)) {
        this.cache.set(username, rules);
        return rules;
      }
      return [];
    } catch (e) {
      console.error(`[UserPermissionStore] Failed to load decisions for ${username}:`, e);
      return [];
    }
  }

  saveDecision(
    username: string,
    toolName: string,
    pattern: string,
    action: "allow" | "deny"
  ): void {
    const rules = this.getDecisions(username);
    const filtered = rules.filter(
      (r) => !(r.toolName.toLowerCase() === toolName.toLowerCase() && r.pattern.toLowerCase() === pattern.toLowerCase())
    );
    filtered.push({
      toolName,
      pattern,
      action,
      source: "user-decision",
    });
    this.cache.set(username, filtered);

    const path = this.getFilePath(username);
    const dir = dirname(path);
    try {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(path, JSON.stringify(filtered, null, 2), "utf-8");
    } catch (e) {
      console.error(`[UserPermissionStore] Failed to save decisions for ${username}:`, e);
    }
  }
}

export const userPermissionStore = new UserPermissionStore();
