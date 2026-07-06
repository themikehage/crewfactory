import type { AuthStorage } from "./auth-storage.ts";

export interface ModelDef {
  id: string;
  name: string;
  provider: string;
  api: string;
  baseUrl: string;
  apiKeyEnv: string;
  reasoning?: boolean;
  contextWindow?: number;
  maxTokens?: number;
  compat?: Record<string, unknown>;
}

export interface AvailableModel {
  id: string;
  name: string;
  provider: string;
  api: string;
  baseUrl: string;
  apiKey?: string;
  reasoning?: boolean;
  contextWindow?: number;
  maxTokens?: number;
  compat?: Record<string, unknown>;
}

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  api: string;
  models: Array<{
    id: string;
    name: string;
    reasoning?: boolean;
    input?: string[];
    cost?: Record<string, number>;
    contextWindow?: number;
    maxTokens?: number;
    compat?: Record<string, unknown>;
  }>;
  dynamic?: boolean;
}

export class ModelRegistry {
  private authStorage: AuthStorage;
  private providers: Map<string, ProviderConfig> = new Map();
  private available: AvailableModel[] = [];

  private constructor(authStorage: AuthStorage) {
    this.authStorage = authStorage;
  }

  static create(authStorage: AuthStorage): ModelRegistry {
    return new ModelRegistry(authStorage);
  }

  registerProvider(name: string, config: ProviderConfig): void {
    this.providers.set(name, config);
    this.refresh();
  }

  refresh(): void {
    const result: AvailableModel[] = [];

    for (const [providerName, config] of this.providers.entries()) {
      const apiKeyVar = config.apiKey.startsWith("$")
        ? config.apiKey.slice(1)
        : config.apiKey;

      const storedKey = this.authStorage.getApiKey(providerName);
      const envKey = process.env[apiKeyVar];
      const resolvedKey = storedKey ?? envKey;

      if (!resolvedKey) continue;

      for (const model of config.models) {
        result.push({
          id: model.id,
          name: model.name,
          provider: providerName,
          api: config.api,
          baseUrl: config.baseUrl,
          apiKey: resolvedKey,
          reasoning: model.reasoning,
          contextWindow: model.contextWindow,
          maxTokens: model.maxTokens,
          compat: model.compat,
        });
      }
    }

    this.available = result;
  }

  getAvailable(): AvailableModel[] {
    return this.available;
  }

  getAll(): Array<{
    id: string;
    name: string;
    provider: string;
    reasoning: boolean;
    input?: string[];
    contextWindow?: number;
    maxTokens?: number;
    cost?: Record<string, number>;
  }> {
    const list: any[] = [];
    for (const [providerName, config] of this.providers.entries()) {
      for (const model of config.models) {
        list.push({
          id: model.id,
          name: model.name,
          provider: providerName,
          reasoning: !!model.reasoning,
          input: model.input,
          contextWindow: model.contextWindow,
          maxTokens: model.maxTokens,
          cost: model.cost,
        });
      }
    }
    return list;
  }

  find(provider: string, modelId: string): AvailableModel | undefined {
    return this.available.find(
      (m) => m.provider === provider && m.id === modelId
    );
  }

  hasConfiguredAuth(model: AvailableModel): boolean {
    return !!model.apiKey;
  }

  async getApiKeyAndHeaders(
    model: AvailableModel
  ): Promise<{ ok: true; apiKey: string; headers?: Record<string, string> } | { ok: false; error: string }> {
    const key = model.apiKey ?? this.authStorage.getApiKey(model.provider);
    if (!key) {
      return { ok: false, error: `No API key found for provider: ${model.provider}` };
    }
    return { ok: true, apiKey: key };
  }

  getProviderDisplayName(provider: string): string {
    return this.providers.get(provider)?.name ?? provider;
  }

  async refreshProviderModels(providerName: string): Promise<void> {
    const config = this.providers.get(providerName);
    if (!config || !config.dynamic) return;

    const apiKeyVar = config.apiKey.startsWith("$")
      ? config.apiKey.slice(1)
      : config.apiKey;

    const storedKey = this.authStorage.getApiKey(providerName);
    const envKey = process.env[apiKeyVar];
    const resolvedKey = storedKey ?? envKey;

    if (!resolvedKey) {
      throw new Error(`API key not configured for provider: ${providerName}`);
    }

    try {
      const response = await fetch(`${config.baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${resolvedKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const rawModels = Array.isArray(data.data) ? data.data : [];

      const updatedModels = rawModels.map((m: any) => {
        const id = m.id;
        const name = id
          .replace(/^(opencode\/|qwen\/)/i, "")
          .replace(/-/g, " ")
          .replace(/\b\w/g, (c: string) => c.toUpperCase());

        const isReasoning = /reasoning|think|preview|max|r1|o1|o3|plus/i.test(id);
        const hasVision = /vision|vl|multimodal|max|pro/i.test(id);

        return {
          id,
          name,
          reasoning: isReasoning,
          input: hasVision ? ["text", "image"] : ["text"],
          contextWindow: 128000,
          maxTokens: 8192,
        };
      });

      if (updatedModels.length > 0) {
        config.models = updatedModels;
        this.refresh();
      }
    } catch (error) {
      console.error(`[ModelRegistry] Failed to refresh models for provider ${providerName}:`, error);
      throw error;
    }
  }
}
