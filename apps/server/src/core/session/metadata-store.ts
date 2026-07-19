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
    const fallbackTools = () => {
      const metadata = this.getSessionMetadata(username, sessionId);
      if (metadata && metadata.teamId) {
        try {
          const { teamStore } = require("../../teams/team-store");
          const team = teamStore.getTeam(username, metadata.teamId);
          if (team && team.teamType === "Negotiation") {
            return ["read", "grep", "find", "ls"];
          }
        } catch {}
      }
      return [...AVAILABLE_TOOLS];
    };

    if (!existsSync(metadataPath)) return fallbackTools();
    try {
      const metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
      let tools = Array.isArray(metadata.tools) ? metadata.tools : fallbackTools();
      if (tools.includes("run_pipeline")) {
        tools = tools.map((t: string) => (t === "run_pipeline" ? "manage_pipelines" : t));
        this.persistSessionTools(username, sessionId, tools);
      }
      return tools;
    } catch {
      return fallbackTools();
    }
  }

  setExecutionMode(username: string, sessionId: string, mode: "readonly" | "standard" | "autonomous"): void {
    this.saveSessionMetadata(username, sessionId, { executionMode: mode });
  }

  getExecutionMode(username: string, sessionId: string): "readonly" | "standard" | "autonomous" | undefined {
    const metadata = this.getSessionMetadata(username, sessionId);
    if (metadata) {
      if (metadata.executionMode === "readonly" || metadata.executionMode === "standard" || metadata.executionMode === "autonomous") {
        return metadata.executionMode;
      }
      if (metadata.teamId) {
        try {
          const { teamStore } = require("../../teams/team-store");
          const team = teamStore.getTeam(username, metadata.teamId);
          if (team && team.teamType === "Negotiation") {
            return "readonly";
          }
        } catch {}
      }
    }
    return undefined;
  }

  computeAndPersistMetrics(username: string, sessionId: string, session: any): void {
    const metadata = this.getSessionMetadata(username, sessionId) || {};
    const createdAt = metadata.createdAt ? new Date(metadata.createdAt) : new Date();
    const durationMs = Date.now() - createdAt.getTime();

    let totalTokensIn = 0;
    let totalTokensOut = 0;
    const msgs = session.messages || [];
    for (const msg of msgs) {
      if (msg.usage) {
        totalTokensIn += msg.usage.input || msg.usage.promptTokens || msg.usage.prompt_tokens || 0;
        totalTokensOut += msg.usage.output || msg.usage.completionTokens || msg.usage.completion_tokens || 0;
      }
    }
    const totalTokens = totalTokensIn + totalTokensOut;

    let messageCount = 0;
    for (const msg of msgs) {
      if (msg.role === "user" || msg.role === "assistant" || msg.role === "system") {
        messageCount++;
      }
    }

    let toolCallCount = 0;
    const toolCallsByTool: Record<string, number> = {};
    for (const msg of msgs) {
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "toolCall" && block.name) {
            toolCallCount++;
            toolCallsByTool[block.name] = (toolCallsByTool[block.name] || 0) + 1;
          }
        }
      }
    }

    let errorCount = 0;
    let lastError: string | null = null;
    const errorsByTool: Record<string, number> = {};

    for (const msg of msgs) {
      if (msg.role === "assistant" && msg.stopReason === "error") {
        errorCount++;
        lastError = msg.errorMessage || "API error response";
      }
      if (msg.role === "toolResult" && msg.isError) {
        errorCount++;
        if (msg.toolName) {
          errorsByTool[msg.toolName] = (errorsByTool[msg.toolName] || 0) + 1;
        }
      }
    }

    const modelId = session.model ? `${session.model.provider}/${session.model.id}` : "unknown";

    this.saveSessionMetadata(username, sessionId, {
      totalTokensIn,
      totalTokensOut,
      totalTokens,
      toolCallCount,
      toolCallsByTool,
      durationMs,
      modelId,
      messageCount,
      errorCount,
      lastError,
      errorsByTool,
      updatedAt: new Date().toISOString(),
    });
  }
}

export const sessionMetadataStore = new SessionMetadataStore();
