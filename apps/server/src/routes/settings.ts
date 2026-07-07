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
    engramEnabled: settings.engramEnabled ?? false,
    engramAutoStore: settings.engramAutoStore ?? false,
    engramEmbeddings: settings.engramEmbeddings ?? true,
  });
});

settingsRouter.patch("/", async (c) => {
  const { username } = getAuthPayload(c);
  try {
    const body = await c.req.json<{
      engramEnabled?: boolean;
      engramAutoStore?: boolean;
      engramEmbeddings?: boolean;
    }>();

    const updates: Record<string, boolean> = {};

    if (body.engramEnabled !== undefined) {
      updates.engramEnabled = !!body.engramEnabled;
    }
    if (body.engramAutoStore !== undefined) {
      updates.engramAutoStore = !!body.engramAutoStore;
    }
    if (body.engramEmbeddings !== undefined) {
      updates.engramEmbeddings = !!body.engramEmbeddings;
    }

    sessionManager.saveUserSettings(username, updates);

    return c.json({ ok: true, settings: { ...sessionManager.getUserSettings(username) } });
  } catch (e) {
    return c.json({ error: "Invalid request body" }, 400);
  }
});
