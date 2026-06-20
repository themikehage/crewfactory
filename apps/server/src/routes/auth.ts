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

  const hashB64 = process.env.AUTH_PASSWORD_HASH!;
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

authRouter.get("/debug", (c) => {
  const hashB64 = process.env.AUTH_PASSWORD_HASH ?? "";
  const hash = hashB64 ? Buffer.from(hashB64, "base64").toString("utf-8") : "";
  return c.json({
    username: process.env.AUTH_USERNAME ?? "NOT_SET",
    hashB64Len: hashB64.length,
    hashDecodedLen: hash.length,
  });
});

authRouter.get("/me", authMiddleware, (c) => {
  const payload = getAuthPayload(c);
  return c.json({ user: payload });
});
