import { getDb } from "./db";
import { randomBytes, randomUUID } from "node:crypto";
import { auth } from "./index";

export async function isFirstRun(): Promise<boolean> {
  try {
    const db = getDb();
    const result = db.query("SELECT COUNT(*) as count FROM user").get() as { count: number } | null;
    return !result || result.count === 0;
  } catch {
    return true;
  }
}

export async function getUserByUsername(
  username: string
): Promise<{ id: string; email: string; username: string } | null> {
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

function buildProgrammaticSessionPayload() {
  const token = randomBytes(32).toString("base64url");
  const id = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7);
  return {
    id,
    token,
    expiresAt,
    expiresAtIso: expiresAt.toISOString(),
    now,
    nowIso: now.toISOString(),
  };
}

function insertSessionRaw(
  id: string,
  token: string,
  expiresAt: Date | string,
  now: Date | string,
  userId: string
): void {
  const db = getDb();
  const expValue = expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt;
  const nowValue = now instanceof Date ? now.toISOString() : now;
  db.query(
    "INSERT INTO session (id, token, expiresAt, createdAt, updatedAt, userId) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, token, expValue, nowValue, nowValue, userId);
}

export async function createProgrammaticSession(username: string): Promise<string> {
  const user = await getUserByUsername(username);
  if (!user) throw new Error(`User not found: ${username}`);

  try {
    const api = (auth as any).api as {
      createProgrammaticSession?: (opts: { body: { userId: string; expiresIn?: number } }) => Promise<{ token: string }>;
    };
    if (api?.createProgrammaticSession) {
      const result = await api.createProgrammaticSession({
        body: { userId: user.id, expiresIn: 60 * 60 * 24 * 7 },
      });
      if (result?.token) return result.token;
    }
  } catch {}

  const { id, token, expiresAt, now } = buildProgrammaticSessionPayload();
  insertSessionRaw(id, token, expiresAt, now, user.id);
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

  const { id, token, expiresAt, now } = buildProgrammaticSessionPayload();
  insertSessionRaw(id, token, expiresAt, now, row.id);
  return token;
}

export function deleteProgrammaticSession(token: string): void {
  try {
    const db = getDb();
    db.query("DELETE FROM session WHERE token = ?").run(token);
  } catch {}
}
