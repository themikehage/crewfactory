import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  getUserDir,
  getSessionDir,
  getSessionMetadataPath,
  AVAILABLE_TOOLS,
} from "shared";

export class SessionMetadataStore {
  private getMetadataPath(username: string, sessionId: string): string {
    let sessionDir = getSessionDir(username, sessionId);
    if (sessionId.startsWith("sub_")) {
      const userDir = getUserDir(username);
      const sessionsDir = join(userDir, "sessions");
      if (existsSync(sessionsDir)) {
        try {
          const sessionFolders = readdirSync(sessionsDir);
          for (const parentId of sessionFolders) {
            const candidateDir = join(sessionsDir, parentId, "subagents", sessionId);
            if (existsSync(candidateDir)) {
              sessionDir = candidateDir;
              break;
            }
          }
        } catch {}
      }
    }
    return join(sessionDir, "metadata.json");
  }

  ensureSessionDir(username: string, sessionId: string): string {
    let sessionDir = getSessionDir(username, sessionId);
    if (sessionId.startsWith("sub_")) {
      const userDir = getUserDir(username);
      const sessionsDir = join(userDir, "sessions");
      if (existsSync(sessionsDir)) {
        try {
          const sessionFolders = readdirSync(sessionsDir);
          for (const parentId of sessionFolders) {
            const candidateDir = join(sessionsDir, parentId, "subagents", sessionId);
            if (existsSync(candidateDir)) {
              sessionDir = candidateDir;
              break;
            }
          }
        } catch {}
      }
    }
    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }
    return sessionDir;
  }

  saveSessionMetadata(username: string, sessionId: string, data: Record<string, unknown>): void {
    const metadataPath = this.getMetadataPath(username, sessionId);
    const sessionDir = dirname(metadataPath);
    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }
    let metadata: Record<string, unknown> = {};
    if (existsSync(metadataPath)) {
      try {
        metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
      } catch {}
    }
    Object.assign(metadata, data);
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
  }

  getSessionMetadata(username: string, sessionId: string): Record<string, any> | null {
    const metadataPath = this.getMetadataPath(username, sessionId);
    if (existsSync(metadataPath)) {
      try {
        return JSON.parse(readFileSync(metadataPath, "utf-8"));
      } catch {}
    }
    return null;
  }

  persistSessionTools(username: string, sessionId: string, tools: string[]): void {
    const metadataPath = this.getMetadataPath(username, sessionId);
    let metadata: Record<string, unknown> = {};
    if (existsSync(metadataPath)) {
      try {
        metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
      } catch {}
    }
    metadata.tools = tools;
    this.saveSessionMetadata(username, sessionId, metadata);
  }

  getSessionTools(username: string, sessionId: string): string[] {
    const metadataPath = this.getMetadataPath(username, sessionId);
    if (!existsSync(metadataPath)) return [...AVAILABLE_TOOLS];
    try {
      const metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
      return Array.isArray(metadata.tools) ? metadata.tools : [...AVAILABLE_TOOLS];
    } catch {
      return [...AVAILABLE_TOOLS];
    }
  }
}

// Helper to get dirname in ES6 environment
function dirname(path: string): string {
  return path.substring(0, path.lastIndexOf(require("node:path").sep));
}

export const sessionMetadataStore = new SessionMetadataStore();
