import type { Context, Next } from "hono";
import { auth } from "./index";
import { resolveUsernameFromToken, getSessionTokensFromCookieHeader } from "../lib/auth-helpers";
import { getDb } from "./db";

export interface AuthPayload {
  username: string;
}

function findUserByTokenSync(token: string): string | null {
  if (!token) return null;
  try {
    const db = getDb();
    const row = db
      .query(
        `SELECT user.username, session.expiresAt FROM session INNER JOIN user ON session.userId = user.id WHERE session.token = ?`
      )
      .get(token) as { username: string; expiresAt: unknown } | null;
    if (!row?.username) return null;
    const exp = row.expiresAt as any;
    let expMs = 0;
    if (typeof exp === "number") {
      expMs = exp > 1e12 ? exp : exp * 1000;
    } else if (typeof exp === "string") {
      const asNum = Number(exp);
      if (!Number.isNaN(asNum) && asNum !== 0) {
        expMs = asNum > 1e12 ? asNum : asNum * 1000;
      } else {
        const d = Date.parse(exp);
        if (!Number.isNaN(d)) expMs = d;
      }
    } else if (exp instanceof Date) {
      expMs = exp.getTime();
    }
    if (expMs && Date.now() > expMs) return null;
    return row.username;
  } catch {
    return null;
  }
}

export async function sessionMiddleware(c: Context, next: Next) {
  const path = c.req.path;
  const isWorkspaceProjects = path.includes("workspace-projects");

  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });
    if (session?.user) {
      const username = (session.user as any).username;
      if (username) {
        if (isWorkspaceProjects) {
          console.log(`[Auth Middleware] ${path} auth.api.getSession success -> ${username}`);
        }
        c.set("user", { username } as AuthPayload);
        await next();
        return;
      }
    } else if (isWorkspaceProjects) {
      console.log(`[Auth Middleware] ${path} auth.api.getSession returned no session`);
    }
  } catch (err) {
    if (isWorkspaceProjects) {
      console.log(`[Auth Middleware] ${path} auth.api.getSession error:`, err);
    }
  }

  const tokenFromQuery = c.req.query("token");
  if (tokenFromQuery) {
    const username = findUserByTokenSync(tokenFromQuery.trim()) ?? resolveUsernameFromToken(tokenFromQuery);
    if (username) {
      if (isWorkspaceProjects) console.log(`[Auth Middleware] ${path} query token auth success -> ${username}`);
      c.set("user", { username } as AuthPayload);
      await next();
      return;
    } else if (isWorkspaceProjects) {
      console.log(`[Auth Middleware] ${path} query token auth failed`);
    }
  }

  const authHeader = c.req.header("Authorization") ?? c.req.header("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const raw = authHeader.slice(7).trim();
    const username = findUserByTokenSync(raw) ?? resolveUsernameFromToken(raw);
    if (username) {
      if (isWorkspaceProjects) console.log(`[Auth Middleware] ${path} bearer auth success -> ${username}`);
      c.set("user", { username } as AuthPayload);
      await next();
      return;
    } else if (isWorkspaceProjects) {
      console.log(`[Auth Middleware] ${path} bearer auth failed`);
    }
  }

  let cookieHeader: string | null | undefined;
  try {
    cookieHeader = c.req.header("Cookie") ?? c.req.header("cookie");
  } catch {}
  if (!cookieHeader) {
    try {
      cookieHeader = c.req.raw?.headers?.get?.("Cookie") ?? c.req.raw?.headers?.get?.("cookie");
    } catch {}
  }

  if (isWorkspaceProjects) {
    console.log(`[Auth Middleware] ${path} cookieHeader present: ${!!cookieHeader}, length: ${cookieHeader?.length ?? 0}`);
    if (cookieHeader) {
      console.log(`[Auth Middleware] ${path} cookieHeader preview: ${cookieHeader.slice(0, 100)}...`);
      const tokens = getSessionTokensFromCookieHeader(cookieHeader);
      console.log(`[Auth Middleware] ${path} extracted ${tokens.length} session tokens from cookie`);
      for (const tok of tokens) {
        console.log(`[Auth Middleware] ${path} trying token prefix: ${tok.slice(0, 8)}...`);
        const username = findUserByTokenSync(tok);
        console.log(`[Auth Middleware] ${path} findUserByTokenSync result: ${username ?? "null"}`);
        if (username) {
          c.set("user", { username } as AuthPayload);
          await next();
          return;
        }
      }
    }
  } else if (cookieHeader) {
    const tokens = getSessionTokensFromCookieHeader(cookieHeader);
    for (const tok of tokens) {
      const username = findUserByTokenSync(tok);
      if (username) {
        c.set("user", { username } as AuthPayload);
        await next();
        return;
      }
    }
  }

  if (isWorkspaceProjects) {
    console.log(`[Auth Middleware] ${path} all auth methods failed -> 401`);
  }
  return c.json({ error: "Unauthorized" }, 401);
}

export function getAuthPayload(c: Context): AuthPayload {
  return c.get("user") as AuthPayload;
}

export function getUsername(c: Context): string {
  return getAuthPayload(c).username;
}
