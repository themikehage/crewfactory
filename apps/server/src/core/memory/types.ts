export type MemoryType = "semantic" | "episodic" | "procedural";

export interface RecalledMemory {
  id: string;
  content: string;
  type: MemoryType;
  importance: number;
  tags?: string[];
  sessionId?: string;
}

export interface RecallOptions {
  limit?: number;
  minImportance?: number;
  types?: MemoryType[];
  sessionId?: string;
  excludeSessionId?: string;
}

export interface MemoryProvider {
  recall(query: string, opts?: RecallOptions): Promise<RecalledMemory[]>;
  store(content: string, type: MemoryType, importance?: number, tags?: string[], sessionId?: string): Promise<void>;
  forget(id: string): Promise<void>;
  clear?(): Promise<void>;
  buildContext(query: string, opts?: { sessionId?: string }): Promise<string>;
  shutdown(): Promise<void>;
}
