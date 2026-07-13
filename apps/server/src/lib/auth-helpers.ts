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

  // 2. Otherwise retrieve the token from query parameter or authorization header
  const tokenFromQuery = c.req.query("token");
  const authHeader = c.req.header("Authorization");
  let token = "";

  if (tokenFromQuery) {
    token = tokenFromQuery;
  } else if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    // Check if token is in Cookie
    const cookie = c.req.header("Cookie");
    if (cookie) {
      const match = cookie.match(/better-auth\.session_token=([^;]+)/);
      if (match) {
        token = match[1];
      }
    }
  }

  if (!token) return null;

  // 3. Synchronously query SQLite DB to resolve session token to username
  try {
    const db = getDb();
    const row = db
      .query(`
        SELECT user.username 
        FROM session 
        INNER JOIN user ON session.userId = user.id 
        WHERE session.token = ? AND session.expiresAt > ?
      `)
      .get(token, Date.now()) as { username: string } | null;

    return row?.username ?? null;
  } catch {
    return null;
  }
}
