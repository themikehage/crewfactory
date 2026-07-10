import { Hono } from "hono";
import { authMiddleware, getAuthPayload } from "../middleware/auth";
import { sessionManager } from "../core/session-manager";

import { IMAGE_MODELS } from "../ai/vendor/ai/src/image-models.generated.ts";

export const modelsRouter = new Hono();

const QWEN_IMAGE_MODELS = [
  {
    id: "wan2.7-image-pro",
    name: "Qwen: Wan-Image Pro (wan2.7-image-pro)",
    provider: "qwen",
    description: "Supports text to image, text/image to sequential images, image editing, multi-image reference generation, and interactive editing. Delivers enhanced performance in text rendering, subject consistency, and complex instruction following.",
    cost: 0.075,
    rpm: 300,
    concurrency: 5
  },
  {
    id: "qwen-image-2.0-pro",
    name: "Qwen: Image 2.0 Pro (qwen-image-2.0-pro)",
    provider: "qwen",
    description: "The full-featured Qwen-Image-2.0 series models integrate image generation and image editing, offering enhanced text rendering with support for 1,000-token prompts, more refined realistic textures, detailed depiction of photorealistic scenes, and stronger semantic adherence. The full-featured version delivers the strongest text rendering and most lifelike textures in the 2.0 series.",
    cost: 0.075,
    rpm: 2,
    concurrency: null
  },
  {
    id: "qwen-image-2.0",
    name: "Qwen: Image 2.0 (qwen-image-2.0)",
    provider: "qwen",
    description: "The Qwen-Image-2.0 series of accelerated models integrates image generation and image editing, offering enhanced text-rendering capabilities with support for 1,000-token prompts, more realistic textures, finely detailed photorealistic scenes, and improved semantic consistency. The accelerated version effectively strikes an optimal balance between model performance and quality.",
    cost: 0.035,
    rpm: 120,
    concurrency: null
  },
  {
    id: "z-image-turbo",
    name: "Qwen: Z-Image Turbo (z-image-turbo)",
    provider: "qwen",
    description: "Z-Image-Turbo is a highly efficient image-generation model that has topped the Artificial Analysis benchmark as the world’s No. 1 open-source text-to-image model. With just 6 billion parameters and an 8-step inference process, it generates photo-realistic images comparable to those produced by large-scale commercial models, while excelling in bilingual Chinese–English text rendering, complex semantic understanding, and diverse thematic generation.",
    cost: 0.015,
    rpm: 120,
    concurrency: null
  },
  {
    id: "qwen-image-edit-max",
    name: "Qwen: Image Edit Max (qwen-image-edit-max)",
    provider: "qwen",
    description: "The Max series of Qwen’s image editing models delivers more stable and versatile editing capabilities: enhanced industrial design and geometric reasoning, improved character consistency, reduced offset issues, and integrated LoRA capabilities for a wider range of image editing functions.",
    cost: 0.075,
    rpm: 2,
    concurrency: null
  },
  {
    id: "qwen-image-plus",
    name: "Qwen: Image Plus (qwen-image-plus)",
    provider: "qwen",
    description: "The first image generation foundation model in the Qwen series that achieves significant advances in complex text rendering and precise image editing. Experiments show strong general capabilities in both image generation and editing, with exceptional performance in text rendering, especially for Chinese.",
    cost: 0.03,
    rpm: 120,
    concurrency: 2
  },
  {
    id: "qwen-image-max",
    name: "Qwen: Image Max (qwen-image-max)",
    provider: "qwen",
    description: "The Max series of Tongyi Qwen’s image generation model excels across a wide range of generation tasks. Compared with the Plus series, it significantly reduces the 'AI-like' feel in generated images, enhancing their realism. It delivers more lifelike material textures for human subjects, finer and more detailed natural textures, and more visually appealing text rendering.",
    cost: 0.075,
    rpm: 2,
    concurrency: null
  },
  {
    id: "qwen-image-edit-plus-2025-12-15",
    name: "Qwen: Image Edit Plus (qwen-image-edit-plus-2025-12-15)",
    provider: "qwen",
    description: "The Qwen series of Image Editing Plus models features enhanced character consistency, industrial design capabilities, and geometric reasoning abilities compared to the snapshot as of October 30. Additionally, it integrates LoRA capabilities such as lighting effects and effectively mitigates offset issues. This version is based on a snapshot taken on December 15, 2025.",
    cost: 0.03,
    rpm: 120,
    concurrency: null
  },
  {
    id: "wan2.6-t2i",
    name: "Qwen: Wan-T2I (wan2.6-t2i)",
    provider: "qwen",
    description: "Wan2.6 text to image, Upgraded visual quality, aesthetics, and instruction-following deliver precise style control, realistic portraits, long-text understanding, and broad historical/cultural IP coverage, enabling high-quality, highly expressive visual generation.",
    cost: 0.03,
    rpm: 300,
    concurrency: 5
  }
];

modelsRouter.get("/images", authMiddleware, (c) => {
  const { username } = getAuthPayload(c);
  const { authStorage } = sessionManager.getUserContext(username);
  const userEnv = sessionManager.getUserEnv(username);

  const hasQwen = authStorage.hasAuth("qwen") || 
                  !!userEnv.DASHSCOPE_API_KEY || 
                  !!process.env.DASHSCOPE_API_KEY || 
                  !!userEnv.wqnw || 
                  !!process.env.wqnw;
                  
  const hasOpenRouter = authStorage.hasAuth("openrouter") || 
                        !!userEnv.OPENROUTER_API_KEY || 
                        !!process.env.OPENROUTER_API_KEY;

  const models: Array<{ id: string; name: string; provider: string }> = [];

  if (hasQwen) {
    models.push(...QWEN_IMAGE_MODELS);
  }

  if (hasOpenRouter) {
    const openrouterModels = Object.values(IMAGE_MODELS.openrouter).map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
    }));
    models.push(...openrouterModels);
  }

  if (models.length === 0) {
    const openrouterModels = Object.values(IMAGE_MODELS.openrouter).map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
    }));
    models.push(...QWEN_IMAGE_MODELS, ...openrouterModels);
  }

  return c.json({ models });
});

modelsRouter.get("/", authMiddleware, (c) => {
  const { username } = getAuthPayload(c);
  const { modelRegistry } = sessionManager.getUserContext(username);

  const available = modelRegistry.getAvailable();

  const models = available.map((m) => ({
    id: m.id,
    name: m.name,
    provider: m.provider as string,
    input: m.input || ["text"],
    reasoning: !!m.reasoning,
  }));

  return c.json({ models });
});
