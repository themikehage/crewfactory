import type { Context, Next } from "hono";
import { auth } from "./index";

export interface AuthPayload {
  username: string;
}

export async function sessionMiddleware(c: Context, next: Next) {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("user", { username: (session.user as any).username } as AuthPayload);
  await next();
}

export function getAuthPayload(c: Context): AuthPayload {
  return c.get("user") as AuthPayload;
}

export function getUsername(c: Context): string {
  return getAuthPayload(c).username;
}
