import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { identityFragments } from "./fragments/identity";
import { leaderFragments } from "./fragments/role-leader";
import { memberFragments } from "./fragments/role-member";
import { instanceFragments } from "./fragments/instance";
import { protocolFragments } from "./fragments/protocol";

export interface PromptFragment {
  key: string;
  category: "identity" | "role" | "instance" | "protocol";
  content: string;
  priority: number;
}

export class PromptFragmentRegistry {
  private defaults = new Map<string, PromptFragment>();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults() {
    const all = [
      ...identityFragments,
      ...leaderFragments,
      ...memberFragments,
      ...instanceFragments,
      ...protocolFragments,
    ];
    for (const f of all) {
      this.defaults.set(f.key, f);
    }
  }

  get(key: string, workspaceDir?: string): PromptFragment | undefined {
    if (workspaceDir) {
      const overridesPath = join(workspaceDir, "prompt-overrides.json");
      if (existsSync(overridesPath)) {
        try {
          const overrides = JSON.parse(readFileSync(overridesPath, "utf-8"));
          if (overrides[key]) {
            const def = this.defaults.get(key);
            return {
              key,
              category: def?.category || "identity",
              content: overrides[key],
              priority: def?.priority || 1,
            };
          }
        } catch {}
      }
    }
    return this.defaults.get(key);
  }

  listByCategory(category: PromptFragment["category"], workspaceDir?: string): PromptFragment[] {
    const list: PromptFragment[] = [];
    for (const f of this.defaults.values()) {
      if (f.category === category) {
        const resolved = this.get(f.key, workspaceDir) || f;
        list.push(resolved);
      }
    }
    return list.sort((a, b) => a.priority - b.priority);
  }
}

export const promptFragmentRegistry = new PromptFragmentRegistry();
