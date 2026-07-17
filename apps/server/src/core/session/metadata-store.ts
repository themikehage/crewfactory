import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  getUserDir,
  getSessionDir,
  getSessionMetadataPath,
  AVAILABLE_TOOLS,
} from "shared";
import { resolveSubagentSessionDir } from "./workspace-resolver";

export class SessionMetadataStore {
  private getMetadataPath(username: string, sessionId: string): string {
    const sessionDir = resolveSubagentSessionDir(username, sessionId) ?? getSessionDir(username, sessionId);
    return join(sessionDir, "metadata.json");
  }

  ensureSessionDir(username: string, sessionId: string): string {
    const sessionDir = resolveSubagentSessionDir(username, sessionId) ?? getSessionDir(username, sessionId);
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
      let tools = Array.isArray(metadata.tools) ? metadata.tools : [...AVAILABLE_TOOLS];
      if (tools.includes("run_pipeline")) {
        tools = tools.map((t: string) => (t === "run_pipeline" ? "manage_pipelines" : t));
        this.persistSessionTools(username, sessionId, tools);
      }
      return tools;
    } catch {
      return [...AVAILABLE_TOOLS];
    }
  }

  setExecutionMode(username: string, sessionId: string, mode: "readonly" | "standard" | "autonomous"): void {
    this.saveSessionMetadata(username, sessionId, { executionMode: mode });
  }

  getExecutionMode(username: string, sessionId: string): "readonly" | "standard" | "autonomous" | undefined {
    const metadata = this.getSessionMetadata(username, sessionId);
    if (metadata && (metadata.executionMode === "readonly" || metadata.executionMode === "standard" || metadata.executionMode === "autonomous")) {
      return metadata.executionMode;
    }
    return undefined;
  }
}

export const sessionMetadataStore = new SessionMetadataStore();
