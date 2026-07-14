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
  session_id TEXT,
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

    // Migration to add session_id if not exists
    const tableInfo = this.db.query("PRAGMA table_info(memories)").all() as any[];
    const hasSessionId = tableInfo.some((col) => col.name === "session_id");
    if (!hasSessionId) {
      try {
        this.db.exec("ALTER TABLE memories ADD COLUMN session_id TEXT;");
      } catch (err) {
        console.error("[LocalMemoryProvider] Failed to add session_id column:", err);
      }
    }
  }

  async store(content: string, type: MemoryType, importance = 0.5, tags: string[] = [], sessionId?: string): Promise<void> {
    const id = crypto.randomUUID();
    const tagsJson = JSON.stringify(tags);
    const now = Date.now();

    this.db.run(
      "INSERT INTO memories (id, content, type, importance, tags, session_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, content, type, importance, tagsJson, sessionId || null, now]
    );

    this.db.run(
      "INSERT INTO memories_fts (id, content, tags) VALUES (?, ?, ?)",
      [id, content, tagsJson]
    );
  }

  async recall(query: string, opts?: RecallOptions): Promise<RecalledMemory[]> {
    const limit = opts?.limit ?? 10;
    const minImportance = opts?.minImportance ?? 0;
    const sessionId = opts?.sessionId;
    const excludeSessionId = opts?.excludeSessionId;

    let rows: Array<{ id: string; content: string; type: string; importance: number; tags: string; session_id?: string | null }>;

    if (query.trim().length > 0) {
      const sanitizedQuery = query
        .replace(/['"*]/g, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => `"${t}"*`)
        .join(" OR ");

      let sql = `SELECT m.id, m.content, m.type, m.importance, m.tags, m.session_id
           FROM memories_fts f
           JOIN memories m ON m.id = f.id
           WHERE memories_fts MATCH ?
             AND m.importance >= ?`;
      const params: any[] = [sanitizedQuery, minImportance];

      if (sessionId !== undefined) {
        sql += ` AND (m.session_id = ? OR m.session_id IS NULL)`;
        params.push(sessionId);
      }
      if (excludeSessionId !== undefined) {
        sql += ` AND (m.session_id IS NULL OR m.session_id != ?)`;
        params.push(excludeSessionId);
      }

      sql += ` ORDER BY rank LIMIT ?`;
      params.push(limit);

      rows = this.db.query<any, any>(sql).all(...params);
    } else {
      let sql = `SELECT id, content, type, importance, tags, session_id
           FROM memories
           WHERE importance >= ?`;
      const params: any[] = [minImportance];

      if (sessionId !== undefined) {
        sql += ` AND (session_id = ? OR session_id IS NULL)`;
        params.push(sessionId);
      }
      if (excludeSessionId !== undefined) {
        sql += ` AND (session_id IS NULL OR session_id != ?)`;
        params.push(excludeSessionId);
      }

      sql += ` ORDER BY importance DESC, created_at DESC LIMIT ?`;
      params.push(limit);

      rows = this.db.query<any, any>(sql).all(...params);
    }

    return rows
      .filter((r) => !opts?.types || opts.types.includes(r.type as MemoryType))
      .map((r) => ({
        id: r.id,
        content: r.content,
        type: r.type as MemoryType,
        importance: r.importance,
        sessionId: r.session_id || undefined,
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

  async buildContext(query: string, opts?: { sessionId?: string }): Promise<string> {
    const memories = await this.recall(query, {
      limit: 5,
      types: ["semantic", "episodic"],
      sessionId: opts?.sessionId,
    });

    if (memories.length === 0) return "";

    const lines = memories
      .map((m, i) => `${i + 1}. [${m.type}] ${m.content}`)
      .join("\n");

    return `--- Memories from previous sessions (historical context only — do not resume or re-execute past tasks unless explicitly asked) ---\n${lines}`;
  }

  async clear(): Promise<void> {
    this.db.run("DELETE FROM memories");
    this.db.run("DELETE FROM memories_fts");
  }

  async shutdown(): Promise<void> {
    this.db.close();
  }
}
