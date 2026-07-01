import { ModelRegistry } from "@earendil-works/pi-coding-agent";

export function registerQwenProvider(registry: ModelRegistry) {
  registry.registerProvider("qwen", {
    name: "Qwen Cloud",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    apiKey: "$DASHSCOPE_API_KEY",
    api: "openai-completions",
    models: [
      {
        id: "qwen3.7-max",
        name: "Qwen 3.7 Max",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 10, output: 30, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 64000,
        compat: {
          maxTokensField: "max_tokens",
          thinkingFormat: "qwen",
          supportsDeveloperRole: false
        }
      },
      {
        id: "qwen3.7-max-preview",
        name: "Qwen 3.7 Max Preview",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 10, output: 30, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 64000,
        compat: {
          maxTokensField: "max_tokens",
          thinkingFormat: "qwen",
          supportsDeveloperRole: false
        }
      },
      {
        id: "qwen3.7-plus",
        name: "Qwen 3.7 Plus",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 5, output: 16, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 64000,
        compat: {
          maxTokensField: "max_tokens",
          thinkingFormat: "qwen",
          supportsDeveloperRole: false
        }
      },
      {
        id: "qwen3.6-max-preview",
        name: "Qwen 3.6 Max Preview",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 10, output: 30, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 256000,
        maxTokens: 64000,
        compat: {
          maxTokensField: "max_tokens",
          thinkingFormat: "qwen",
          supportsDeveloperRole: false
        }
      },
      {
        id: "qwen3.6-plus",
        name: "Qwen 3.6 Plus",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 5, output: 16, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 64000,
        compat: {
          maxTokensField: "max_tokens",
          thinkingFormat: "qwen",
          supportsDeveloperRole: false
        }
      },
      {
        id: "qwen3.6-flash",
        name: "Qwen 3.6 Flash",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 64000,
        compat: {
          maxTokensField: "max_tokens",
          thinkingFormat: "qwen",
          supportsDeveloperRole: false
        }
      },
      {
        id: "qwen3.5-plus",
        name: "Qwen 3.5 Plus",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 5, output: 16, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 64000,
        compat: {
          maxTokensField: "max_tokens",
          thinkingFormat: "qwen",
          supportsDeveloperRole: false
        }
      },
      {
        id: "qwen3.5-flash",
        name: "Qwen 3.5 Flash",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 64000,
        compat: {
          maxTokensField: "max_tokens",
          thinkingFormat: "qwen",
          supportsDeveloperRole: false
        }
      }
    ]
  });
}

