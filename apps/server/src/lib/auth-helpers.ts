import { getAuthPayload } from "../auth/middleware";
import { getDb } from "../auth/db";

export function getUsername(c: any): string | null {
  // 1. If Hono authMiddleware has already run, use c.get("user")
  try {
    const payload = getAuthPayload(c);
    if (payload?.username) {
      return payload.username;
    }
  } catch {}

  // 2. Retrieve all potential tokens from query parameter, authorization header, and Cookie
  const tokensToCheck: string[] = [];

  const tokenFromQuery = c.req.query("token");
  if (tokenFromQuery) {
    tokensToCheck.push(tokenFromQuery.split(".")[0]);
  }

  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    tokensToCheck.push(authHeader.slice(7).split(".")[0]);
  }

  const cookie = c.req.header("Cookie");
  if (cookie) {
    const match = cookie.match(/better-auth\.session_token=([^;]+)/);
    if (match) {
      tokensToCheck.push(match[1].split(".")[0]);
    }
  }

  if (tokensToCheck.length === 0) return null;

  // 3. Synchronously query SQLite DB to resolve the first token that matches a valid session
  try {
    const db = getDb();
    const nowIso = new Date().toISOString();
    
    for (const token of tokensToCheck) {
      const row = db
        .query(`
          SELECT user.username 
          FROM session 
          INNER JOIN user ON session.userId = user.id 
          WHERE session.token = ? AND session.expiresAt > ?
        `)
        .get(token, nowIso) as { username: string } | null;

      if (row?.username) {
        return row.username;
      }
    }
  } catch {}

  return null;
}
