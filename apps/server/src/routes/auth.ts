import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { LoginSchema } from "shared";
import { authMiddleware, getAuthPayload } from "../middleware/auth";

export const authRouter = new Hono();

authRouter.post("/login", zValidator("json", LoginSchema), async (c) => {
  const { username, password } = c.req.valid("json");

  if (username !== process.env.AUTH_USERNAME) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const valid = await bcrypt.compare(password, process.env.AUTH_PASSWORD_HASH!);
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

authRouter.get("/debug", (c) => {
  return c.json({
    username: process.env.AUTH_USERNAME ?? "NOT_SET",
    hashPrefix: (process.env.AUTH_PASSWORD_HASH ?? "").slice(0, 30),
    hashLength: (process.env.AUTH_PASSWORD_HASH ?? "").length,
  });
});

authRouter.get("/me", authMiddleware, (c) => {
  const payload = getAuthPayload(c);
  return c.json({ user: payload });
});
