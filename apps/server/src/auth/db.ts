import { Database } from "bun:sqlite";
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { CREWFACTORY_DATA_PATH } from "shared";

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;

  const dataPath = CREWFACTORY_DATA_PATH();
  if (!existsSync(dataPath)) {
    mkdirSync(dataPath, { recursive: true });
  }

  const dbPath = join(dataPath, "crewfactory.db");
  _db = new Database(dbPath);
  _db.exec("PRAGMA journal_mode = WAL;");
  return _db;
}

export function getDbPath(): string {
  return join(CREWFACTORY_DATA_PATH(), "crewfactory.db");
}
