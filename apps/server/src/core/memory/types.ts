export type MemoryType = "semantic" | "episodic" | "procedural";

export interface RecalledMemory {
  id: string;
  content: string;
  type: MemoryType;
  importance: number;
  tags?: string[];
}

export interface RecallOptions {
  limit?: number;
  minImportance?: number;
  types?: MemoryType[];
}

export interface MemoryProvider {
  recall(query: string, opts?: RecallOptions): Promise<RecalledMemory[]>;
  store(content: string, type: MemoryType, importance?: number, tags?: string[]): Promise<void>;
  forget(id: string): Promise<void>;
  buildContext(query: string): Promise<string>;
  shutdown(): Promise<void>;
}
