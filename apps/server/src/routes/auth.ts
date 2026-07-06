import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { LoginSchema, ChangePasswordSchema } from "shared";
import { authMiddleware, getAuthPayload } from "../middleware/auth";
import { sessionManager } from "../core/session-manager";

export const authRouter = new Hono();

function resolveHashB64(username: string): string {
  const fileHash = sessionManager.getUserPasswordHash(username);
  return fileHash ?? process.env.AUTH_PASSWORD_HASH!;
}

authRouter.post("/login", zValidator("json", LoginSchema), async (c) => {
  const { username, password } = c.req.valid("json");

  if (username !== process.env.AUTH_USERNAME) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const hashB64 = resolveHashB64(username);
  const hash = Buffer.from(hashB64, "base64").toString("utf-8");
  const valid = await bcrypt.compare(password, hash);
  if (!valid) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = jwt.sign(
    { username },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  );

  return c.json({ token, user: { username } });
});

authRouter.post("/password", authMiddleware, zValidator("json", ChangePasswordSchema), async (c) => {
  const { currentPassword, newPassword } = c.req.valid("json");
  const { username } = getAuthPayload(c);

  const hashB64 = resolveHashB64(username);
  const hash = Buffer.from(hashB64, "base64").toString("utf-8");
  const valid = await bcrypt.compare(currentPassword, hash);
  if (!valid) {
    return c.json({ error: "Current password is incorrect" }, 401);
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  const newHashB64 = Buffer.from(newHash).toString("base64");
  sessionManager.setUserPasswordHash(username, newHashB64);

  const token = jwt.sign(
    { username },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  );

  return c.json({ token, user: { username } });
});

authRouter.get("/me", authMiddleware, (c) => {
  const payload = getAuthPayload(c);
  return c.json({ user: payload });
});
