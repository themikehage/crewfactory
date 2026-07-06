import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware, getAuthPayload } from "../middleware/auth";
import { sessionManager } from "../core/session-manager";
import { SetEnvVarSchema } from "shared";

export const envRouter = new Hono();

envRouter.use("/*", authMiddleware);

envRouter.get("/", (c) => {
  const { username } = getAuthPayload(c);
  const userEnv = sessionManager.getUserEnv(username);
  const reveal = c.req.query("reveal") === "true";

  const envList = Object.entries(userEnv).map(([key, value]) => ({
    key,
    value: reveal ? value : "••••••••",
  }));

  return c.json({ env: envList });
});

envRouter.post(
  "/",
  zValidator("json", SetEnvVarSchema),
  (c) => {
    const { key, value } = c.req.valid("json");
    const { username } = getAuthPayload(c);

    sessionManager.setUserEnv(username, key.trim(), value);

    return c.json({ success: true, key, value: "••••••••" });
  }
);

envRouter.put(
  "/",
  zValidator(
    "json",
    z.object({
      variables: z.record(
        z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
        z.string()
      ),
    })
  ),
  (c) => {
    const { variables } = c.req.valid("json");
    const { username } = getAuthPayload(c);
    const current = sessionManager.getUserEnv(username);
    const updated: Record<string, string> = {};

    for (const [key, value] of Object.entries(variables)) {
      const formattedKey = key.trim().toUpperCase();
      if (value === "••••••••") {
        if (current[formattedKey]) {
          updated[formattedKey] = current[formattedKey];
        }
      } else {
        updated[formattedKey] = value;
      }
    }

    sessionManager.setUserEnvMap(username, updated);

    const envList = Object.entries(updated).map(([k]) => ({
      key: k,
      value: "••••••••",
    }));

    return c.json({ success: true, env: envList });
  }
);

envRouter.delete("/:key", (c) => {
  const key = c.req.param("key");
  const { username } = getAuthPayload(c);

  sessionManager.deleteUserEnv(username, key);

  return c.json({ success: true });
});
