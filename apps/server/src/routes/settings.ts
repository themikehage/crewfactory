import { Hono } from "hono";
import { authMiddleware, getAuthPayload } from "../middleware/auth";
import { sessionManager } from "../core/session-manager";
import { runVisionModel } from "../core/tools/vision-tool";
import { runImageGenModel } from "../core/tools/image-gen-tool";
import { getWorkspaceDir } from "shared";

export const settingsRouter = new Hono();

settingsRouter.use("/*", authMiddleware);

settingsRouter.get("/", (c) => {
  const { username } = getAuthPayload(c);
  const settings = sessionManager.userConfig.getUserSettings(username);

  // Fallbacks razonables por defecto
  return c.json({
    memoryEnabled: settings.memoryEnabled ?? true,
    memoryAutoStore: settings.memoryAutoStore ?? false,
    memoryEmbeddings: settings.memoryEmbeddings ?? true,
    visionModel: settings.visionModel ?? "",
    imageGenModel: settings.imageGenModel ?? "",
  });
});

settingsRouter.patch("/", async (c) => {
  const { username } = getAuthPayload(c);
  try {
    const body = await c.req.json<{
      memoryEnabled?: boolean;
      memoryAutoStore?: boolean;
      memoryEmbeddings?: boolean;
      visionModel?: string;
      imageGenModel?: string;
    }>();

    const updates: Record<string, any> = {};

    if (body.memoryEnabled !== undefined) {
      updates.memoryEnabled = !!body.memoryEnabled;
    }
    if (body.memoryAutoStore !== undefined) {
      updates.memoryAutoStore = !!body.memoryAutoStore;
    }
    if (body.memoryEmbeddings !== undefined) {
      updates.memoryEmbeddings = !!body.memoryEmbeddings;
    }
    if (body.visionModel !== undefined) {
      updates.visionModel = String(body.visionModel);
    }
    if (body.imageGenModel !== undefined) {
      updates.imageGenModel = String(body.imageGenModel);
    }

    sessionManager.userConfig.saveUserSettings(username, updates);

    return c.json({ ok: true, settings: { ...sessionManager.userConfig.getUserSettings(username) } });
  } catch (e) {
    return c.json({ error: "Invalid request body" }, 400);
  }
});

settingsRouter.post("/test-vision", async (c) => {
  const { username } = getAuthPayload(c);
  try {
    const body = await c.req.json<{
      modelId: string;
      prompt: string;
      image?: string;
      mimeType?: string;
    }>();

    if (!body.modelId) {
      return c.json({ error: "Missing modelId" }, 400);
    }

    const prompt = body.prompt || "Describe this image in one word";
    const defaultImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const base64Data = body.image || defaultImage;
    const mimeType = body.mimeType || "image/png";

    const responseText = await runVisionModel(username, body.modelId, prompt, base64Data, mimeType);
    return c.json({ ok: true, response: responseText });
  } catch (err: any) {
    return c.json({ error: err.message || String(err) }, 500);
  }
});

settingsRouter.post("/test-image-gen", async (c) => {
  const { username } = getAuthPayload(c);
  try {
    const body = await c.req.json<{
      modelId: string;
      prompt: string;
      size?: string;
    }>();

    if (!body.modelId) {
      return c.json({ error: "Missing modelId" }, 400);
    }
    if (!body.prompt) {
      return c.json({ error: "Missing prompt" }, 400);
    }

    const { authStorage } = sessionManager.userConfig.getUserContext(username);
    const userEnv = sessionManager.userConfig.getUserEnv(username);
    const apiKey = authStorage.getApiKey("qwen") || userEnv.DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY || "";
    console.log(`[DIAGNOSTIC TEST-IMAGE-GEN] Resolved key length: ${apiKey.length}. Start: '${apiKey.substring(0, 15)}' End: '${apiKey.substring(apiKey.length - 15)}'`);

    const workspaceDir = getWorkspaceDir(username);
    const size = body.size || "1024x1024";

    const localPath = await runImageGenModel(username, body.modelId, body.prompt, size, workspaceDir);
    return c.json({ ok: true, imageUrl: `/api/workspace/${localPath.replace(/\\/g, "/")}` });
  } catch (err: any) {
    console.error(`[DIAGNOSTIC TEST-IMAGE-GEN] Error: ${err.message || String(err)}`);
    return c.json({ error: err.message || String(err) }, 500);
  }
});

