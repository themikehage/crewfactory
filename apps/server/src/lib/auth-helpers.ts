import { getAuthPayload } from "../auth/middleware";
import { getDb } from "../auth/db";

const SESSION_COOKIE_KEYS = new Set([
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
]);

function isSessionCookieKey(key: string): boolean {
  if (SESSION_COOKIE_KEYS.has(key)) return true;
  if (key.includes("session_token")) return true;
  return false;
}

function isSessionDataCookieKey(key: string): boolean {
  return key.includes("session_data");
}

export function parseExpiresAt(expiresAt: unknown): number {
  if (expiresAt == null) return 0;
  if (typeof expiresAt === "number") {
    return expiresAt > 1e12 ? expiresAt : expiresAt * 1000;
  }
  if (typeof expiresAt === "string") {
    const asNum = Number(expiresAt);
    if (!Number.isNaN(asNum) && asNum !== 0) {
      return asNum > 1e12 ? asNum : asNum * 1000;
    }
    const d = Date.parse(expiresAt);
    if (!Number.isNaN(d)) return d;
  }
  if (expiresAt instanceof Date) return expiresAt.getTime();
  return 0;
}

export function isExpired(expiresAt: unknown): boolean {
  const expMs = parseExpiresAt(expiresAt);
  if (!expMs) return false;
  return Date.now() > expMs;
}

export function extractToken(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

export function parseCookieHeader(cookieHeader: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    map.set(key, val);
  }
  return map;
}

export function getSessionTokensFromCookieHeader(cookieHeader: string | null | undefined): string[] {
  if (!cookieHeader) return [];
  const tokens: string[] = [];
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (isSessionCookieKey(key)) {
      const tok = extractToken(val);
      if (tok) tokens.push(tok);
    }
  }
  return tokens;
}

function findUserByTokenSync(token: string): { username: string; expiresAt: unknown } | null {
  if (!token) return null;
  try {
    const db = getDb();
    const row = db
      .query(
        `SELECT user.username, session.expiresAt FROM session INNER JOIN user ON session.userId = user.id WHERE session.token = ?`
      )
      .get(token) as { username: string; expiresAt: unknown } | null;
    return row ?? null;
  } catch {
    return null;
  }
}

function resolveUsernameFromTokensSync(tokens: string[]): string | null {
  for (const token of tokens) {
    if (!token) continue;
    const row = findUserByTokenSync(token);
    if (row?.username && !isExpired(row.expiresAt)) {
      return row.username;
    }
  }
  return null;
}

export function resolveUsernameFromToken(rawToken: string): string | null {
  if (!rawToken) return null;
  const token = extractToken(rawToken);
  if (!token) return null;
  const row = findUserByTokenSync(token);
  if (row?.username && !isExpired(row.expiresAt)) {
    return row.username;
  }
  return null;
}

export function resolveUsernameFromCookieHeader(
  cookieHeader: string | null | undefined
): string | null {
  const tokens = getSessionTokensFromCookieHeader(cookieHeader);
  if (tokens.length === 0) return null;
  return resolveUsernameFromTokensSync(tokens);
}

export async function resolveUsernameFromCookieHeaderAsync(
  cookieHeader: string | null | undefined,
  headers?: Headers
): Promise<string | null> {
  if (!cookieHeader && !headers) return null;
  try {
    const { auth } = await import("../auth/index");
    const h = headers ?? new Headers({ cookie: cookieHeader || "" });
    const session = await auth.api.getSession({ headers: h });
    if (session?.user) {
      const username = (session.user as any).username;
      if (username) return username;
    }
  } catch {}

  return resolveUsernameFromCookieHeader(cookieHeader);
}

export async function validateSessionFromHeaders(
  headers: Headers
): Promise<{ username: string } | null> {
  try {
    const { auth } = await import("../auth/index");
    const session = await auth.api.getSession({ headers });
    if (session?.user) {
      const username = (session.user as any).username;
      if (username) return { username };
    }
  } catch {}

  const cookie = headers.get("cookie") ?? headers.get("Cookie");
  const tokens = getSessionTokensFromCookieHeader(cookie);
  const username = resolveUsernameFromTokensSync(tokens);
  if (username) return { username };
  return null;
}

export function getUsername(c: any): string | null {
  try {
    const payload = getAuthPayload(c);
    if (payload?.username) {
      return payload.username;
    }
  } catch {}

  const tokensToCheck: string[] = [];

  try {
    const tokenFromQuery = c.req.query("token");
    if (tokenFromQuery) {
      tokensToCheck.push(extractToken(tokenFromQuery));
    }
  } catch {}

  try {
    const authHeader = c.req.header("Authorization") ?? c.req.header("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      tokensToCheck.push(extractToken(authHeader.slice(7)));
    }
  } catch {}

  let cookie: string | null | undefined;
  try {
    cookie = c.req.header("Cookie") ?? c.req.header("cookie");
  } catch {}
  if (!cookie) {
    try {
      cookie = c.req.raw?.headers?.get?.("Cookie") ?? c.req.raw?.headers?.get?.("cookie");
    } catch {}
  }
  if (cookie) {
    tokensToCheck.push(...getSessionTokensFromCookieHeader(cookie));
  }

  if (tokensToCheck.length === 0) return null;
  return resolveUsernameFromTokensSync(tokensToCheck);
}

export async function getUsernameAsync(c: any): Promise<string | null> {
  try {
    const sync = getUsername(c);
    if (sync) return sync;
  } catch {}

  try {
    const { auth } = await import("../auth/index");
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session?.user) {
      const username = (session.user as any).username;
      if (username) return username;
    }
  } catch {}

  return null;
}
