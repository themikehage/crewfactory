import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { MemoryProvider, MemoryType, RecallOptions, RecalledMemory } from "./types";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS memories (
  id         TEXT PRIMARY KEY,
  content    TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'semantic',
  importance REAL NOT NULL DEFAULT 0.5,
  tags       TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  id        UNINDEXED,
  content,
  tags,
  tokenize = 'unicode61 remove_diacritics 1'
);
`;

export class LocalMemoryProvider implements MemoryProvider {
  private db: Database;

  constructor(dbPath: string) {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec(SCHEMA_SQL);
  }

  async store(content: string, type: MemoryType, importance = 0.5, tags: string[] = []): Promise<void> {
    const id = crypto.randomUUID();
    const tagsJson = JSON.stringify(tags);
    const now = Date.now();

    this.db.run(
      "INSERT INTO memories (id, content, type, importance, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, content, type, importance, tagsJson, now]
    );

    this.db.run(
      "INSERT INTO memories_fts (id, content, tags) VALUES (?, ?, ?)",
      [id, content, tagsJson]
    );
  }

  async recall(query: string, opts?: RecallOptions): Promise<RecalledMemory[]> {
    const limit = opts?.limit ?? 10;
    const minImportance = opts?.minImportance ?? 0;

    let rows: Array<{ id: string; content: string; type: string; importance: number; tags: string }>;

    if (query.trim().length > 0) {
      const sanitizedQuery = query
        .replace(/['"*]/g, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => `"${t}"*`)
        .join(" OR ");

      rows = this.db
        .query<
          { id: string; content: string; type: string; importance: number; tags: string },
          [string, number, number]
        >(
          `SELECT m.id, m.content, m.type, m.importance, m.tags
           FROM memories_fts f
           JOIN memories m ON m.id = f.id
           WHERE memories_fts MATCH ?
             AND m.importance >= ?
           ORDER BY rank
           LIMIT ?`
        )
        .all(sanitizedQuery, minImportance, limit);
    } else {
      rows = this.db
        .query<
          { id: string; content: string; type: string; importance: number; tags: string },
          [number, number]
        >(
          `SELECT id, content, type, importance, tags
           FROM memories
           WHERE importance >= ?
           ORDER BY importance DESC, created_at DESC
           LIMIT ?`
        )
        .all(minImportance, limit);
    }

    return rows
      .filter((r) => !opts?.types || opts.types.includes(r.type as MemoryType))
      .map((r) => ({
        id: r.id,
        content: r.content,
        type: r.type as MemoryType,
        importance: r.importance,
        tags: (() => {
          try {
            return JSON.parse(r.tags);
          } catch {
            return [];
          }
        })(),
      }));
  }

  async forget(id: string): Promise<void> {
    this.db.run("DELETE FROM memories WHERE id = ?", [id]);
    this.db.run("DELETE FROM memories_fts WHERE id = ?", [id]);
  }

  async buildContext(query: string): Promise<string> {
    const memories = await this.recall(query, {
      limit: 5,
      types: ["semantic", "episodic"],
    });

    if (memories.length === 0) return "";

    const lines = memories
      .map((m, i) => `${i + 1}. [${m.type}] ${m.content}`)
      .join("\n");

    return `--- Relevant Memories ---\n${lines}`;
  }

  async shutdown(): Promise<void> {
    this.db.close();
  }
}
