import { auth } from "./index";
import { getDb } from "./db";

export async function isFirstRun(): Promise<boolean> {
  try {
    const db = getDb();
    const result = db.query("SELECT COUNT(*) as count FROM user").get() as { count: number } | null;
    return !result || result.count === 0;
  } catch {
    return true;
  }
}

export async function getUserByUsername(username: string): Promise<{ id: string; email: string; username: string } | null> {
  try {
    const db = getDb();
    const row = db.query("SELECT id, email, username FROM user WHERE username = ?").get(username) as {
      id: string;
      email: string;
      username: string;
    } | null;
    return row ?? null;
  } catch {
    return null;
  }
}

export async function createProgrammaticSession(username: string): Promise<string> {
  const user = await getUserByUsername(username);
  if (!user) throw new Error(`User not found: ${username}`);

  const db = getDb();
  // Using native crypto randomBytes to generate a secure session token
  const { randomBytes } = await import("node:crypto");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days

  db.query(
    "INSERT INTO session (id, token, expiresAt, createdAt, updatedAt, userId) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(token, token, expiresAt, Date.now(), Date.now(), user.id);

  return token;
}

export function createProgrammaticSessionSync(username: string): string {
  const db = getDb();
  const row = db.query("SELECT id, email, username FROM user WHERE username = ?").get(username) as {
    id: string;
    email: string;
    username: string;
  } | null;
  if (!row) throw new Error(`User not found: ${username}`);

  const { randomBytes } = require("node:crypto");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days

  db.query(
    "INSERT INTO session (id, token, expiresAt, createdAt, updatedAt, userId) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(token, token, expiresAt, Date.now(), Date.now(), row.id);

  return token;
}
