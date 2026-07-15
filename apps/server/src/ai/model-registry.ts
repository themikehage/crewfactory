import type { AuthStorage } from "./auth-storage.ts";

type ModelsDevCache = {
  data: Record<string, any>;
  fetchedAt: number;
};

let modelsDevCache: ModelsDevCache | null = null;
const MODELS_DEV_URL = "https://models.dev/api.json";
const MODELS_DEV_TTL_MS = 1000 * 60 * 60;

async function fetchModelsDev(): Promise<Record<string, any>> {
  const now = Date.now();
  if (modelsDevCache && now - modelsDevCache.fetchedAt < MODELS_DEV_TTL_MS) {
    return modelsDevCache.data;
  }
  try {
    const res = await fetch(MODELS_DEV_URL, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`models.dev status ${res.status}`);
    const data = (await res.json()) as Record<string, any>;
    modelsDevCache = { data, fetchedAt: now };
    return data;
  } catch (err) {
    console.error("[ModelRegistry] Failed to fetch models.dev:", err);
    if (modelsDevCache) return modelsDevCache.data;
    return {};
  }
}

function findModelsDevEntry(
  modelsDev: Record<string, any>,
  providerHint: string,
  modelId: string
): any | null {
  const lowerId = modelId.toLowerCase();

  const tryProvider = (provKey: string): any | null => {
    const prov = modelsDev[provKey];
    const models = prov?.models;
    if (!models) return null;
    if (models[modelId]) return models[modelId];
    const exactLower = Object.keys(models).find((k) => k.toLowerCase() === lowerId);
    if (exactLower) return models[exactLower];
    return null;
  };

  const direct = tryProvider(providerHint);
  if (direct) return direct;

  const opencodeGo = tryProvider("opencode-go");
  if (opencodeGo) return opencodeGo;

  const secondaryHints = ["alibaba", "deepseek", "moonshotai", "zhipuai", "minimax", "xiaomi", "zai"];
  for (const hint of secondaryHints) {
    const found = tryProvider(hint);
    if (found) return found;
  }

  for (const provKey of Object.keys(modelsDev)) {
    const prov = modelsDev[provKey];
    const models = prov?.models;
    if (!models) continue;
    if (models[modelId]) return models[modelId];
    const exactLower = Object.keys(models).find((k) => k.toLowerCase() === lowerId);
    if (exactLower) return models[exactLower];
  }

  for (const provData of Object.values(modelsDev) as any[]) {
    const models = provData?.models;
    if (!models) continue;
    for (const [key, val] of Object.entries(models)) {
      const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      const normId = lowerId.replace(/[^a-z0-9]/g, "");
      if (normKey.length >= 5 && normId.length >= 5 && (normKey === normId || normKey.includes(normId) || normId.includes(normKey))) {
        return val;
      }
    }
  }

  return null;
}

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
  input?: string[];
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
  private userEnvGetter?: () => Record<string, string>;

  private constructor(authStorage: AuthStorage, userEnvGetter?: () => Record<string, string>) {
    this.authStorage = authStorage;
    this.userEnvGetter = userEnvGetter;
  }

  static create(authStorage: AuthStorage, userEnvGetter?: () => Record<string, string>): ModelRegistry {
    return new ModelRegistry(authStorage, userEnvGetter);
  }

  registerProvider(name: string, config: ProviderConfig): void {
    this.providers.set(name, config);
    this.refresh();
  }

  refresh(): void {
    const result: AvailableModel[] = [];
    const userEnv = this.userEnvGetter ? this.userEnvGetter() : {};

    for (const [providerName, config] of this.providers.entries()) {
      const apiKeyVar = config.apiKey.startsWith("$")
        ? config.apiKey.slice(1)
        : config.apiKey;

      const storedKey = this.authStorage.getApiKey(providerName);
      const envKey = userEnv[apiKeyVar] ?? process.env[apiKeyVar];
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
          input: model.input,
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
    const userEnv = this.userEnvGetter ? this.userEnvGetter() : {};
    const config = this.providers.get(model.provider);
    const apiKeyVar = config?.apiKey.startsWith("$")
      ? config.apiKey.slice(1)
      : config?.apiKey;
    const envKey = apiKeyVar ? (userEnv[apiKeyVar] ?? process.env[apiKeyVar]) : undefined;

    const key = model.apiKey ?? this.authStorage.getApiKey(model.provider) ?? envKey;
    if (!key) {
      return { ok: false, error: `No API key found for provider: ${model.provider}` };
    }
    return { ok: true, apiKey: key };
  }

  getProviderDisplayName(provider: string): string {
    return this.providers.get(provider)?.name ?? provider;
  }

  isDynamic(providerName: string): boolean {
    return !!this.providers.get(providerName)?.dynamic;
  }

  async refreshProviderModels(providerName: string): Promise<any[]> {
    const config = this.providers.get(providerName);
    if (!config || !config.dynamic) return [];

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

      const modelsDev = await fetchModelsDev();

      const updatedModels = rawModels.map((m: any) => {
        const id = m.id;
        const modelsDevEntry = findModelsDevEntry(modelsDev, providerName, id);

        const rawName = typeof m.name === "string" && m.name.trim() ? m.name : null;
        const devName = typeof modelsDevEntry?.name === "string" ? modelsDevEntry.name : null;
        const name =
          rawName ??
          devName ??
          id
            .replace(/^(opencode\/|qwen\/)/i, "")
            .replace(/-/g, " ")
            .replace(/\b\w/g, (c: string) => c.toUpperCase());

        const toNumber = (...vals: any[]): number | undefined => {
          for (const v of vals) {
            if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.floor(v);
            if (typeof v === "string" && v.trim() !== "") {
              const n = Number.parseInt(v, 10);
              if (Number.isFinite(n) && n > 0) return n;
            }
          }
          return undefined;
        };

        const contextWindow = toNumber(
          modelsDevEntry?.limit?.context,
          modelsDevEntry?.context_length,
          modelsDevEntry?.context_window,
          modelsDevEntry?.limit?.contextLength,
          m.context_window,
          m.context_length,
          m.max_context_length,
          m.contextWindow,
          m.contextLength,
          m.max_context_tokens,
          m.context_size,
          m.max_context,
          m.context_len,
          m.max_input_tokens,
          m.meta?.context_window,
          m.meta?.context_length,
          m.info?.context_length,
          m.capabilities?.context_length,
          m.capabilities?.context_window
        );

        const maxTokens = toNumber(
          modelsDevEntry?.limit?.output,
          modelsDevEntry?.limit?.max_tokens,
          modelsDevEntry?.max_output_tokens,
          modelsDevEntry?.output,
          m.max_tokens,
          m.max_output_tokens,
          m.max_completion_tokens,
          m.max_output_length,
          m.max_completion_length,
          m.maxTokens,
          m.maxOutputTokens,
          m.output_token_limit,
          m.completion_max_tokens,
          m.meta?.max_tokens,
          m.info?.max_tokens,
          m.capabilities?.max_tokens
        );

        const explicitReasoning =
          typeof modelsDevEntry?.reasoning === "boolean"
            ? modelsDevEntry.reasoning
            : typeof m.reasoning === "boolean"
              ? m.reasoning
              : typeof m.supports_reasoning === "boolean"
                ? m.supports_reasoning
                : typeof m.capabilities?.reasoning === "boolean"
                  ? m.capabilities.reasoning
                  : undefined;

        const isReasoning =
          explicitReasoning ?? /reasoning|think|preview|max|r1|o1|o3|plus/i.test(id);

        const explicitInput: string[] | undefined = (() => {
          const devInput = modelsDevEntry?.modalities?.input;
          if (Array.isArray(devInput) && devInput.length) return devInput;
          if (Array.isArray(m.input) && m.input.length) return m.input;
          if (Array.isArray(m.modalities) && m.modalities.length) return m.modalities;
          if (Array.isArray(m.capabilities?.input)) return m.capabilities.input;
          if (Array.isArray(m.capabilities?.modalities)) return m.capabilities.modalities;
          if (typeof m.supports_vision === "boolean") {
            return m.supports_vision ? ["text", "image"] : ["text"];
          }
          return undefined;
        })();

        const hasVision = /vision|vl|multimodal|max|pro/i.test(id);
        const input = explicitInput ?? (hasVision ? ["text", "image"] : ["text"]);

        const cost = modelsDevEntry?.cost ?? m.cost;

        const compat = (() => {
          const base = m.compat ?? {};
          if (modelsDevEntry?.reasoning) {
            return base;
          }
          return Object.keys(base).length ? base : undefined;
        })();

        return {
          id,
          name,
          reasoning: isReasoning,
          input,
          ...(contextWindow ? { contextWindow } : {}),
          ...(maxTokens ? { maxTokens } : {}),
          ...(cost ? { cost } : {}),
          ...(compat ? { compat } : {}),
        };
      });

      if (updatedModels.length > 0) {
        config.models = updatedModels;
        this.refresh();
        console.log(`[ModelRegistry] Refreshed ${updatedModels.length} models for ${providerName} with models.dev enrichment. Sample: ${updatedModels[0]?.id} context=${updatedModels[0]?.contextWindow} max=${updatedModels[0]?.maxTokens}`);
      }
      return updatedModels;
    } catch (error) {
      console.error(`[ModelRegistry] Failed to refresh models for provider ${providerName}:`, error);
      throw error;
    }
  }
}
