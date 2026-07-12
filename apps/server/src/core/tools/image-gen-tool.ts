import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { generateImages } from "../../ai/vendor/ai/src/images.ts";
import { getImageModel } from "../../ai/vendor/ai/src/image-models.ts";
import { sessionManager } from "../session-manager";

export async function runImageGenModel(
  username: string,
  modelId: string,
  prompt: string,
  size: string,
  workspaceDir: string
): Promise<string> {
  const isQwen = modelId.startsWith("wan") || modelId.startsWith("qwen-image") || modelId.startsWith("z-image") || modelId.includes("wanxiang");
  const userEnv = sessionManager.userConfig.getUserEnv(username);

  const { authStorage } = sessionManager.userConfig.getUserContext(username);

  if (isQwen) {
    const apiKey = authStorage.getApiKey("qwen") || userEnv.DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY || "";
    console.log(`[QWEN IMAGE GEN] Resolving apiKey. Length: ${apiKey.length}. Start: ${apiKey.substring(0, 8)}... End: ${apiKey.substring(apiKey.length - 8)}`);
    if (!apiKey) {
      throw new Error("DASHSCOPE_API_KEY is not configured. Please configure your Qwen Cloud API key in the provider settings.");
    }

    const servicePath = modelId.startsWith("wan") ? "image-generation" : "multimodal-generation";
    const qwenSize = (size || "1024x1024").replace("x", "*");

    const endpoints = [
      `https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/${servicePath}/generation`,
      `https://dashscope.aliyuncs.com/api/v1/services/aigc/${servicePath}/generation`
    ];

    let res: Response | null = null;
    let lastErrorMsg = "";

    for (const endpoint of endpoints) {
      try {
        res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "X-DashScope-Async": "disable"
          },
          body: JSON.stringify({
            model: modelId,
            input: {
              messages: [
                {
                  role: "user",
                  content: [
                    { text: prompt }
                  ]
                }
              ]
            },
            parameters: {
              size: qwenSize,
              n: 1
            }
          })
        });

        if (res.ok) {
          break;
        }

        let errorMsg = `HTTP ${res.status}`;
        try {
          const rawText = await res.text();
          if (rawText) {
            try {
              const errData = JSON.parse(rawText);
              if (errData && typeof errData === "object") {
                errorMsg = errData.error?.message || errData.message || JSON.stringify(errData);
              } else {
                errorMsg = rawText.substring(0, 300);
              }
            } catch {
              errorMsg = rawText.substring(0, 300);
            }
          }
        } catch {}

        // If it's a client error (e.g. 400, 401, 429), throw immediately and do not try the other endpoint.
        if (res.status >= 400 && res.status < 500) {
          throw new Error(errorMsg);
        }

        lastErrorMsg = errorMsg;
      } catch (err: any) {
        // If it's our own thrown 4xx error, rethrow it
        if (res && res.status >= 400 && res.status < 500) {
          throw err;
        }
        lastErrorMsg = err.message || String(err);
      }
    }

    if (!res || !res.ok) {
      throw new Error(lastErrorMsg || "Failed to execute image generation call on DashScope endpoints.");
    }

    const data = await res.json();
    const imgUrl = data.output?.choices?.[0]?.message?.content?.[0]?.image || data.output?.results?.[0]?.url;

    if (!imgUrl) {
      throw new Error("No image URL returned by Qwen/DashScope API.");
    }

    const imgRes = await fetch(imgUrl);
    if (!imgRes.ok) throw new Error("Failed to download generated image from DashScope CDN.");
    const arrayBuffer = await imgRes.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    const generatedDir = join(workspaceDir, "assets", "generated");
    if (!existsSync(generatedDir)) {
      mkdirSync(generatedDir, { recursive: true });
    }

    const filename = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.png`;
    const localPath = join("assets", "generated", filename);
    const fullPath = join(workspaceDir, localPath);

    writeFileSync(fullPath, imageBuffer);
    return localPath;
  }

  // Fallback a OpenRouter
  const apiKey = authStorage.getApiKey("openrouter") || userEnv.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  console.log(`[OPENROUTER IMAGE GEN] Resolving apiKey. Length: ${apiKey?.length || 0}. Start: ${apiKey?.substring(0, 8)}...`);
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured. Please add your OpenRouter API key in the provider settings.");
  }

  const modelObj = getImageModel("openrouter", modelId as any);

  if (!modelObj) {
    throw new Error(`Image generation model '${modelId}' is not configured or available. Please verify your OpenRouter credentials.`);
  }

  const promptText = size !== "1024x1024" ? `${prompt} (${size} aspect ratio)` : prompt;

  const context = {
    input: [{ type: "text" as const, text: promptText }]
  };

  const result = await generateImages(modelObj, context, {
    apiKey: apiKey
  });

  if (result.errorMessage || result.stopReason === "error" || result.output.length === 0) {
    throw new Error(result.errorMessage || "Unknown provider error");
  }

  const imagePart = result.output.find(p => p.type === "image");
  if (!imagePart || imagePart.type !== "image") {
    throw new Error("No image was returned by the provider.");
  }

  const generatedDir = join(workspaceDir, "assets", "generated");
  if (!existsSync(generatedDir)) {
    mkdirSync(generatedDir, { recursive: true });
  }

  const filename = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.png`;
  const localPath = join("assets", "generated", filename);
  const fullPath = join(workspaceDir, localPath);

  const imageBuffer = Buffer.from(imagePart.data, "base64");
  writeFileSync(fullPath, imageBuffer);

  return localPath;
}

export function createImageGenTool(
  workspaceDir: string,
  username: string
) {
  return {
    name: "generate_image",
    description: "Generate an image from a text prompt using an AI image generation model configured in settings.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Description of the image to generate."
        },
        size: {
          type: "string",
          description: "Optional. Dimensions/aspect ratio of the image. Defaults to '1024x1024'.",
          enum: ["1024x1024", "1792x1024", "1024x1792"],
          default: "1024x1024"
        }
      },
      required: ["prompt"]
    },
    execute: async (toolCallId: string, args: any) => {
      const settings = sessionManager.userConfig.getUserSettings(username);
      const modelId = settings.imageGenModel;

      if (!modelId) {
        return {
          content: [{ type: "text", text: "Error: No image generation model configured. Please configure an image generation model in Settings > General Tab before calling generate_image." }],
          isError: true
        };
      }

      try {
        const localPath = await runImageGenModel(username, modelId, args.prompt, args.size || "1024x1024", workspaceDir);

        return {
          content: [
            { type: "text", text: `Successfully generated image and saved to workspace: ${localPath}` }
          ],
          details: {
            status: "success",
            filePath: localPath,
            images: [{ url: localPath, title: args.prompt }]
          }
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error executing image generation tool: ${err.message || String(err)}` }],
          isError: true
        };
      }
    }
  };
}
