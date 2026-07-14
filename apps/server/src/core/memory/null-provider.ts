import type { MemoryProvider, RecallOptions, RecalledMemory, MemoryType } from "./types";

export class NullMemoryProvider implements MemoryProvider {
  async recall(query: string, opts?: RecallOptions): Promise<RecalledMemory[]> {
    return [];
  }

  async store(content: string, type: MemoryType, importance?: number, tags?: string[], sessionId?: string): Promise<void> {
    // No-op
  }

  async forget(id: string): Promise<void> {
    // No-op
  }

  async clear(): Promise<void> {
    // No-op
  }

  async buildContext(query: string, opts?: { sessionId?: string }): Promise<string> {
    return "";
  }

  async shutdown(): Promise<void> {
    // No-op
  }
}
