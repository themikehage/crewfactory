import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware, getAuthPayload } from "../middleware/auth";
import { piSessionManager } from "../pi/session-manager";
import { SetEnvVarSchema } from "shared";

export const envRouter = new Hono();

envRouter.use("/*", authMiddleware);

envRouter.get("/", (c) => {
  const { username } = getAuthPayload(c);
  const userEnv = piSessionManager.getUserEnv(username);

  const envList = Object.entries(userEnv).map(([key]) => ({
    key,
    value: "••••••••",
  }));

  return c.json({ env: envList });
});

envRouter.post(
  "/",
  zValidator("json", SetEnvVarSchema),
  (c) => {
    const { key, value } = c.req.valid("json");
    const { username } = getAuthPayload(c);

    piSessionManager.setUserEnv(username, key.trim(), value);

    return c.json({ success: true, key, value: "••••••••" });
  }
);

envRouter.delete("/:key", (c) => {
  const key = c.req.param("key");
  const { username } = getAuthPayload(c);

  piSessionManager.deleteUserEnv(username, key);

  return c.json({ success: true });
});
