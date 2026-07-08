import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  getUserDir,
  getSessionDir,
  getSessionMetadataPath,
  AVAILABLE_TOOLS,
} from "shared";

export class SessionMetadataStore {
  ensureSessionDir(username: string, sessionId: string): string {
    const sessionDir = getSessionDir(username, sessionId);
    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }
    return sessionDir;
  }

  saveSessionMetadata(username: string, sessionId: string, data: Record<string, unknown>): void {
    const sessionDir = this.ensureSessionDir(username, sessionId);
    const metadataPath = join(sessionDir, "metadata.json");
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
    const metadataPath = getSessionMetadataPath(username, sessionId);
    if (existsSync(metadataPath)) {
      try {
        return JSON.parse(readFileSync(metadataPath, "utf-8"));
      } catch {}
    }
    return null;
  }

  persistSessionTools(username: string, sessionId: string, tools: string[]): void {
    const metadataPath = getSessionMetadataPath(username, sessionId);
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
    const metadataPath = getSessionMetadataPath(username, sessionId);
    if (!existsSync(metadataPath)) return [...AVAILABLE_TOOLS];
    try {
      const metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
      return Array.isArray(metadata.tools) ? metadata.tools : [...AVAILABLE_TOOLS];
    } catch {
      return [...AVAILABLE_TOOLS];
    }
  }
}

export const sessionMetadataStore = new SessionMetadataStore();
