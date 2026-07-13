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
  
  // Initialize Better Auth schema tables
  _db.exec(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      emailVerified INTEGER NOT NULL,
      image TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      username TEXT UNIQUE,
      role TEXT
    );
  `);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      expiresAt INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      ipAddress TEXT,
      userAgent TEXT,
      userId TEXT NOT NULL REFERENCES user(id)
    );
  `);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY,
      accountId TEXT NOT NULL,
      providerId TEXT NOT NULL,
      userId TEXT NOT NULL REFERENCES user(id),
      accessToken TEXT,
      refreshToken TEXT,
      idToken TEXT,
      expiresAt INTEGER,
      password TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS verification (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expiresAt INTEGER NOT NULL,
      createdAt INTEGER,
      updatedAt INTEGER
    );
  `);
  return _db;
}
