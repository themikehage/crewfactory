/**
 * Compatibility entrypoint — vendored, stripped to OpenAI-compatible providers only.
 * Replaces the vendored ai compat module for CrewFactory.
 */

import { openAICompletionsApi } from "./api/openai-completions.lazy.ts";
import { getEnvApiKey } from "./env-api-keys.ts";
import { createFauxCore, type FauxProviderRegistration, type RegisterFauxProviderOptions } from "./providers/faux.ts";
import type {
  Api,
  ApiStreamOptions,
  AssistantMessage,
  AssistantMessageEventStream,
  Context,
  Model,
  ProviderStreamOptions,
  SimpleStreamOptions,
  StreamOptions,
} from "./types.ts";

export * from "./index.ts";

export type ApiStreamFunction = (
  model: Model<Api>,
  context: Context,
  options?: StreamOptions,
) => AssistantMessageEventStream;

export type ApiStreamSimpleFunction = (
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
) => AssistantMessageEventStream;

export interface ApiProvider<TApi extends Api = Api> {
  api: TApi;
  stream: ApiStreamFunction;
  streamSimple: ApiStreamSimpleFunction;
}

interface ApiProviderInternal {
  api: Api;
  stream: ApiStreamFunction;
  streamSimple: ApiStreamSimpleFunction;
}

type RegisteredApiProvider = {
  provider: ApiProviderInternal;
  sourceId?: string;
};

const apiProviderRegistry = new Map<string, RegisteredApiProvider>();

function wrapStreamSimple<TApi extends Api>(
  api: TApi,
  streamSimpleFn: (model: Model<TApi>, context: Context, options?: SimpleStreamOptions) => AssistantMessageEventStream,
): ApiStreamSimpleFunction {
  return (model, context, options) => {
    if (model.api !== api) {
      throw new Error(`Mismatched api: ${model.api} expected ${api}`);
    }
    return streamSimpleFn(model as Model<TApi>, context, options);
  };
}

function wrapStream<TApi extends Api>(
  api: TApi,
  streamFn: (model: Model<TApi>, context: Context, options?: any) => AssistantMessageEventStream,
): ApiStreamFunction {
  return (model, context, options) => {
    if (model.api !== api) {
      throw new Error(`Mismatched api: ${model.api} expected ${api}`);
    }
    return streamFn(model as Model<TApi>, context, options);
  };
}

export function registerApiProvider<TApi extends Api>(
  provider: { api: TApi; stream: any; streamSimple: any },
  sourceId?: string,
): void {
  apiProviderRegistry.set(provider.api, {
    provider: {
      api: provider.api,
      stream: wrapStream(provider.api, provider.stream),
      streamSimple: wrapStreamSimple(provider.api, provider.streamSimple),
    },
    sourceId,
  });
}

export function getApiProvider(api: Api): ApiProviderInternal | undefined {
  return apiProviderRegistry.get(api)?.provider;
}

export function unregisterApiProviders(sourceId: string): void {
  for (const [api, entry] of apiProviderRegistry.entries()) {
    if (entry.sourceId === sourceId) {
      apiProviderRegistry.delete(api);
    }
  }
}

export function registerFauxProvider(options: RegisterFauxProviderOptions = {}): FauxProviderRegistration {
  const core = createFauxCore(options);
  const sourceId = `faux-provider-${Math.random().toString(36).slice(2, 10)}`;
  registerApiProvider({ api: core.api, stream: core.stream, streamSimple: core.streamSimple }, sourceId);
  return {
    api: core.api,
    models: core.models,
    getModel: core.getModel,
    state: core.state,
    setResponses: core.setResponses,
    appendResponses: core.appendResponses,
    getPendingResponseCount: core.getPendingResponseCount,
    unregister() {
      unregisterApiProviders(sourceId);
    },
  };
}

export function resetApiProviders(): void {
  apiProviderRegistry.clear();
  registerBuiltInApiProviders();
}

export function registerBuiltInApiProviders(): void {
  const openaiCompletions = openAICompletionsApi();
  if (!getApiProvider("openai-completions")) {
    registerApiProvider({
      api: "openai-completions",
      stream: openaiCompletions.stream,
      streamSimple: openaiCompletions.streamSimple,
    });
  }
}

registerBuiltInApiProviders();

function hasExplicitApiKey(apiKey: string | undefined): apiKey is string {
  return typeof apiKey === "string" && apiKey.trim().length > 0;
}

function withEnvApiKey<TOptions extends StreamOptions>(
  model: Model<Api>,
  options: TOptions | undefined,
): TOptions | undefined {
  if (hasExplicitApiKey(options?.apiKey)) return options;
  const apiKey = getEnvApiKey(model.provider, options?.env);
  if (!apiKey) return options;
  return { ...options, apiKey } as TOptions;
}

function resolveApiProvider(api: Api) {
  const provider = getApiProvider(api);
  if (!provider) {
    throw new Error(`No API provider registered for api: ${api}`);
  }
  return provider;
}

export function stream<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options?: ProviderStreamOptions,
): AssistantMessageEventStream {
  const provider = resolveApiProvider(model.api);
  return provider.stream(model, context, withEnvApiKey(model, options) as StreamOptions);
}

export async function complete<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options?: ProviderStreamOptions,
): Promise<AssistantMessage> {
  const s = stream(model, context, options);
  return s.result();
}

export function streamSimple<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  const provider = resolveApiProvider(model.api);
  return provider.streamSimple(model, context, withEnvApiKey(model, options));
}

export async function completeSimple<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options?: SimpleStreamOptions,
): Promise<AssistantMessage> {
  const s = streamSimple(model, context, options);
  return s.result();
}

export function clampThinkingLevel(model: Model<Api>, level: string): string {
  return level;
}

export function isContextOverflow(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes("context") && error.message.includes("overflow");
}

export function isRetryableAssistantError(msg: { stopReason?: string; errorMessage?: string }): boolean {
  if (msg.stopReason !== "error") return false;
  const err = msg.errorMessage ?? "";
  return err.includes("overloaded") || err.includes("rate_limit") || err.includes("timeout");
}

export function modelsAreEqual(a: Model<Api> | undefined, b: Model<Api> | undefined): boolean {
  if (!a || !b) return a === b;
  return a.provider === b.provider && a.id === b.id && a.api === b.api;
}

export function getSupportedThinkingLevels(model: Model<Api>): string[] {
  if (!(model as any).reasoning) return ["off"];
  return ["off", "minimal", "low", "medium", "high"];
}

export type { ProviderStreamOptions, ApiStreamOptions };
export { EventStream } from "./utils/event-stream.ts";
export { validateToolArguments } from "./utils/validation.ts";
export type { AssistantMessage, AssistantMessageEventStream, Context, Model, SimpleStreamOptions, ToolResultMessage } from "./types.ts";
