import { ModelRegistry } from "../../ai";
import { loadProviderModels } from "./provider-persistence";

export function registerQwenProvider(registry: ModelRegistry, username?: string) {
  const persisted = username ? loadProviderModels(username, "qwen") : null;

  registry.registerProvider("qwen", {
    name: "Qwen Cloud",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    apiKey: "$DASHSCOPE_API_KEY",
    api: "openai-completions",
    dynamic: true,
    models: persisted ?? [],
  });
}

