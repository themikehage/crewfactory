import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { complete } from "../../ai/vendor/ai/src/compat.ts";
import { sessionManager } from "../session-manager";

export async function runVisionModel(
  username: string,
  modelId: string,
  prompt: string,
  base64Data: string,
  mimeType: string
): Promise<string> {
  const { modelRegistry } = sessionManager.userConfig.getUserContext(username);
  const available = modelRegistry.getAvailable();
  const visionModel = available.find(m => `${m.provider}/${m.id}` === modelId || m.id === modelId);

  if (!visionModel) {
    throw new Error(`Configured vision model '${modelId}' is not configured or available. Please configure the API credentials for this provider first.`);
  }

  const apiKeyResult = await modelRegistry.getApiKeyAndHeaders(visionModel);
  if (!apiKeyResult.ok) {
    throw new Error(`Error resolving API key for model ${visionModel.name}: ${(apiKeyResult as any).error}`);
  }

  const modelObj = {
    id: visionModel.id,
    name: visionModel.name,
    provider: visionModel.provider,
    api: visionModel.api,
    baseUrl: visionModel.baseUrl,
    apiKey: apiKeyResult.apiKey,
    contextWindow: visionModel.contextWindow || 128000,
    maxTokens: visionModel.maxTokens || 4096,
    compat: visionModel.compat,
    input: (visionModel as any).input || ["text", "image"],
  };

  const context = {
    messages: [
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: prompt },
          {
            type: "image" as const,
            mimeType: mimeType,
            data: base64Data
          }
        ]
      }
    ]
  };

  const response = await complete(modelObj as any, context as any, {
    apiKey: apiKeyResult.apiKey
  });

  const textContent = response.content.find(o => o.type === "text");
  return textContent && textContent.type === "text" ? textContent.text : JSON.stringify(response.content);
}

export function createVisionTool(
  workspaceDir: string,
  username: string
) {
  return {
    name: "vision",
    description: "Analyze an image file in the workspace and answer questions about it using a vision-enabled AI model configured in settings.",
    parameters: {
      type: "object",
      properties: {
        imagePath: {
          type: "string",
          description: "The workspace-relative path to the image file (e.g. 'assets/uploads/photo.jpg')."
        },
        prompt: {
          type: "string",
          description: "Question, instructions or description request for analyzing the image."
        }
      },
      required: ["imagePath", "prompt"]
    },
    execute: async (toolCallId: string, args: any) => {
      const settings = sessionManager.userConfig.getUserSettings(username);
      const modelId = settings.visionModel;

      if (!modelId) {
        return {
          content: [{ type: "text", text: "Error: No vision model configured. Please configure a vision-enabled model in Settings > General Tab before calling the vision tool." }],
          isError: true
        };
      }

      let cleanPath = args.imagePath;
      if (cleanPath.startsWith("workspace/")) {
        cleanPath = cleanPath.substring("workspace/".length);
      }
      const fullPath = join(workspaceDir, cleanPath);

      if (!existsSync(fullPath)) {
        return {
          content: [{ type: "text", text: `Error: Image file not found at "${args.imagePath}". Make sure the path is relative to the workspace.` }],
          isError: true
        };
      }

      try {
        const fileBuffer = readFileSync(fullPath);
        const ext = cleanPath.split(".").pop()?.toLowerCase();
        let mimeType = "image/png";
        if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg";
        else if (ext === "gif") mimeType = "image/gif";
        else if (ext === "webp") mimeType = "image/webp";

        const base64Data = fileBuffer.toString("base64");

        const responseText = await runVisionModel(username, modelId, args.prompt, base64Data, mimeType);

        return {
          content: [{ type: "text", text: responseText }],
          details: { status: "success", model: modelId }
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error executing vision tool: ${err.message || String(err)}` }],
          isError: true
        };
      }
    }
  };
}
