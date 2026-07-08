import { ModelRegistry } from "../../ai";

export function registerOpenCodeGoProvider(registry: ModelRegistry) {
  registry.registerProvider("opencode-go", {
    name: "OpenCode Go",
    baseUrl: "https://opencode.ai/zen/go/v1",
    apiKey: "$OPENCODE_API_KEY",
    api: "openai-completions",
    dynamic: true,
    models: [
      {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 1, output: 3, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
        compat: {
          maxTokensField: "max_tokens",
          thinkingFormat: "openai",
          supportsDeveloperRole: false
        }
      },
      {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        reasoning: false,
        input: ["text", "image"],
        cost: { input: 0.1, output: 0.3, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
        compat: {
          maxTokensField: "max_tokens",
          supportsDeveloperRole: false
        }
      },
      {
        id: "glm-5.2",
        name: "GLM 5.2",
        reasoning: true,
        input: ["text"],
        cost: { input: 1, output: 3, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
        compat: {
          maxTokensField: "max_tokens",
          supportsDeveloperRole: false
        }
      },
      {
        id: "minimax-m3",
        name: "MiniMax M3",
        reasoning: false,
        input: ["text"],
        cost: { input: 1, output: 3, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
        compat: {
          maxTokensField: "max_tokens",
          supportsDeveloperRole: false
        }
      },
      {
        id: "kimi-k2.7",
        name: "Kimi K2.7 Code",
        reasoning: true,
        input: ["text"],
        cost: { input: 1, output: 3, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
        compat: {
          maxTokensField: "max_tokens",
          supportsDeveloperRole: false
        }
      },
      {
        id: "qwen3.7-max",
        name: "Qwen 3.7 Max",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 10, output: 30, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
        compat: {
          maxTokensField: "max_tokens",
          thinkingFormat: "qwen",
          supportsDeveloperRole: false
        }
      }
    ]
  });
}
