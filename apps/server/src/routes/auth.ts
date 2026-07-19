import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { auth } from "../auth/index";
import { sessionMiddleware, getAuthPayload } from "../auth/middleware";
import { isFirstRun, getUserByUsername } from "../auth/onboarding";

export const authRouter = new Hono();

const RegisterSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8),
  email: z.string().email().optional(),
});

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

authRouter.get("/status", async (c) => {
  const needsSetup = await isFirstRun();

  if (needsSetup) {
    return c.json({ needsSetup: true, authenticated: false });
  }

  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  return c.json({
    needsSetup: false,
    authenticated: !!session,
    user: session ? { username: (session.user as any).username } : null,
    token: session ? session.session.token : null,
  });
});

authRouter.post("/register", zValidator("json", RegisterSchema), async (c) => {
  const { username, password, email } = c.req.valid("json");

  const needsSetup = await isFirstRun();
  if (!needsSetup) {
    return c.json({ error: "Registration is closed. An account already exists." }, 403);
  }

  const internalEmail = email || `${username}@crewfactory.internal`;

  try {
    const result = await auth.api.signUpEmail({
      body: {
        email: internalEmail,
        password,
        name: username,
        username,
        role: "admin",
      } as any,
    });

    if (!result) {
      return c.json({ error: "Registration failed" }, 500);
    }

    const signIn = await auth.api.signInEmail({
      body: { email: internalEmail, password },
      asResponse: true,
    });

    const setCookies = signIn.headers.getSetCookie();
    let token: string | null = null;
    for (const cookie of setCookies) {
      c.res.headers.append("Set-Cookie", cookie);
      if (cookie.startsWith("better-auth.session_token=")) {
        token = cookie.split("=")[1].split(";")[0];
      }
    }

    return c.json({ user: { username }, token });
  } catch (err: any) {
    const message = err?.message || "Registration failed";
    if (message.toLowerCase().includes("already exists") || message.toLowerCase().includes("unique")) {
      return c.json({ error: "Username already taken" }, 409);
    }
    return c.json({ error: message }, 500);
  }
});

authRouter.post("/login", zValidator("json", LoginSchema), async (c) => {
  const { username, password } = c.req.valid("json");

  const user = await getUserByUsername(username);
  if (!user) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  try {
    const result = await auth.api.signInEmail({
      body: { email: user.email, password },
      asResponse: true,
    });

    if (!result.ok) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const setCookies = result.headers.getSetCookie();
    let token: string | null = null;
    for (const cookie of setCookies) {
      c.res.headers.append("Set-Cookie", cookie);
      if (cookie.startsWith("better-auth.session_token=")) {
        token = cookie.split("=")[1].split(";")[0];
      }
    }

    return c.json({ user: { username }, token });
  } catch {
    return c.json({ error: "Invalid credentials" }, 401);
  }
});

authRouter.post("/logout", async (c) => {
  await auth.api.signOut({ headers: c.req.raw.headers });
  return c.json({ ok: true });
});

authRouter.get("/me", sessionMiddleware, (c) => {
  const payload = getAuthPayload(c);
  return c.json({ user: payload });
});

authRouter.post("/password", sessionMiddleware, zValidator("json", ChangePasswordSchema), async (c) => {
  const { currentPassword, newPassword } = c.req.valid("json");
  const { username } = getAuthPayload(c);

  const user = await getUserByUsername(username);
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  try {
    const result = await auth.api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: false },
      headers: c.req.raw.headers,
    });

    if (!result) {
      return c.json({ error: "Current password is incorrect" }, 401);
    }

    return c.json({ ok: true, user: { username } });
  } catch (err: any) {
    return c.json({ error: err?.message || "Failed to change password" }, 400);
  }
});
