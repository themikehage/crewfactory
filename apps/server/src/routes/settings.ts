import { Hono } from "hono";
import { authMiddleware, getAuthPayload } from "../middleware/auth";
import { sessionManager } from "../core/session-manager";

export const settingsRouter = new Hono();

settingsRouter.use("/*", authMiddleware);

settingsRouter.get("/", (c) => {
  const { username } = getAuthPayload(c);
  const settings = sessionManager.getUserSettings(username);

  // Fallbacks razonables por defecto
  return c.json({
    memoryEnabled: settings.memoryEnabled ?? false,
    memoryAutoStore: settings.memoryAutoStore ?? false,
    memoryEmbeddings: settings.memoryEmbeddings ?? true,
  });
});

settingsRouter.patch("/", async (c) => {
  const { username } = getAuthPayload(c);
  try {
    const body = await c.req.json<{
      memoryEnabled?: boolean;
      memoryAutoStore?: boolean;
      memoryEmbeddings?: boolean;
    }>();

    const updates: Record<string, boolean> = {};

    if (body.memoryEnabled !== undefined) {
      updates.memoryEnabled = !!body.memoryEnabled;
    }
    if (body.memoryAutoStore !== undefined) {
      updates.memoryAutoStore = !!body.memoryAutoStore;
    }
    if (body.memoryEmbeddings !== undefined) {
      updates.memoryEmbeddings = !!body.memoryEmbeddings;
    }

    sessionManager.saveUserSettings(username, updates);

    return c.json({ ok: true, settings: { ...sessionManager.getUserSettings(username) } });
  } catch (e) {
    return c.json({ error: "Invalid request body" }, 400);
  }
});
