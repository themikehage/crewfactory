import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware, getAuthPayload } from "../middleware/auth";
import { sessionManager } from "../core/session-manager";
import { SetApiKeySchema } from "shared";

export const providersRouter = new Hono();

providersRouter.use("/*", authMiddleware);

function buildAuthStatus(
  authStorage: ReturnType<typeof sessionManager.userConfig.getUserContext>["authStorage"],
  provider: string
) {
  const base = authStorage.getAuthStatus(provider);
  return { ...base, configured: authStorage.hasAuth(provider) };
}

providersRouter.get("/", (c) => {
  const { username } = getAuthPayload(c);
  const { authStorage, modelRegistry } =
    sessionManager.userConfig.getUserContext(username);

  const models = modelRegistry.getAll();
  const providersMap = new Map<
    string,
    {
      name: string;
      authStatus: ReturnType<typeof buildAuthStatus>;
      models: Array<{ id: string; name: string; reasoning: boolean; input?: string[] }>;
    }
  >();

  for (const model of models) {
    const provider = model.provider as string;
    if (!providersMap.has(provider)) {
      providersMap.set(provider, {
        name: modelRegistry.getProviderDisplayName(provider),
        authStatus: buildAuthStatus(authStorage, provider),
        models: [],
      });
    }
    providersMap.get(provider)!.models.push({
      id: model.id,
      name: model.name,
      reasoning: model.reasoning,
      input: model.input || ["text"],
    });
  }

  return c.json({
    providers: Array.from(providersMap.entries()).map(
      ([id, data]) => ({
        id,
        ...data,
      })
    ),
  });
});

providersRouter.get("/:id/models", (c) => {
  const providerId = c.req.param("id");
  const { username } = getAuthPayload(c);
  const { modelRegistry } = sessionManager.userConfig.getUserContext(username);

  const models = modelRegistry.getAll().filter(
    (m) => (m.provider as string) === providerId
  );

  return c.json({
    models: models.map((m) => ({
      id: m.id,
      name: m.name,
      reasoning: m.reasoning,
      input: m.input,
      contextWindow: m.contextWindow,
      maxTokens: m.maxTokens,
      cost: m.cost,
    })),
  });
});

providersRouter.post(
  "/:id/key",
  zValidator("json", SetApiKeySchema),
  (c) => {
    const providerId = c.req.param("id");
    const { apiKey } = c.req.valid("json");
    const { username } = getAuthPayload(c);
    const { authStorage, modelRegistry } =
      sessionManager.userConfig.getUserContext(username);

    authStorage.set(providerId, { type: "api_key", key: apiKey });
    modelRegistry.refresh();

    const authStatus = buildAuthStatus(authStorage, providerId);
    return c.json({ success: true, authStatus });
  }
);

providersRouter.delete("/:id/key", (c) => {
  const providerId = c.req.param("id");
  const { username } = getAuthPayload(c);
  const { authStorage, modelRegistry } =
    sessionManager.userConfig.getUserContext(username);

    authStorage.remove(providerId);
    modelRegistry.refresh();

    const authStatus = buildAuthStatus(authStorage, providerId);
    return c.json({ success: true, authStatus });
});

providersRouter.post("/:id/refresh", async (c) => {
  const providerId = c.req.param("id");
  const { username } = getAuthPayload(c);
  const { modelRegistry } = sessionManager.userConfig.getUserContext(username);

  try {
    await modelRegistry.refreshProviderModels(providerId);
    return c.json({ success: true, models: modelRegistry.getAll().filter(m => (m.provider as string) === providerId) });
  } catch (err: any) {
    return c.json({ success: false, error: err.message || "Failed to refresh models" }, 500);
  }
});
