import { Agent } from "./vendor/agent/src/agent.ts";
import { prepareCompaction, compact } from "./vendor/agent/src/harness/compaction/compaction.ts";
import { completeSimple, streamSimple } from "./vendor/ai/src/compat.ts";
import type { AgentMessage, AgentTool } from "./vendor/agent/src/types.ts";
import type { AvailableModel, ModelRegistry } from "./model-registry";
import type { SessionManager } from "./session-persistence";
import type { DefaultResourceLoader } from "./resource-loader";
import { convertToLlm } from "./messages";
import { estimateContextTokens } from "./vendor/ai/src/utils/estimate.ts";

export interface CreateAgentSessionOptions {
  cwd: string;
  sessionManager: SessionManager;
  authStorage: any;
  modelRegistry: ModelRegistry;
  resourceLoader: DefaultResourceLoader;
  customTools?: any[];
}

export type AgentSessionEvent = any;

export class AgentSession {
  cwd: string;
  sessionManager: SessionManager;
  authStorage: any;
  modelRegistry: ModelRegistry;
  resourceLoader: DefaultResourceLoader;
  customTools: any[];
  _customTools: any[];

  model: AvailableModel | null = null;

  private agent!: Agent;
  private activeTools: AgentTool[] = [];
  private allToolsMap: Map<string, AgentTool> = new Map();
  private eventListeners: Set<(evt: any) => void> = new Set();
  private abortController: AbortController | null = null;

  get messages(): any[] {
    return this.agent?.state?.messages || [];
  }
  set messages(val: any[]) {
    if (this.agent?.state) {
      this.agent.state.messages = val;
    }
  }

  get thinkingLevel(): string {
    return this.agent?.state?.thinkingLevel || "off";
  }
  set thinkingLevel(val: string) {
    if (this.agent?.state) {
      (this.agent.state as any).thinkingLevel = val as any;
    }
  }

  get isStreaming(): boolean {
    return this.agent?.state?.isStreaming || false;
  }
  set isStreaming(val: boolean) {
    if (this.agent?.state) {
      (this.agent.state as any).isStreaming = val;
    }
  }

  addDelegationResult(resultMessage: AgentMessage): void {
    this.agent.steer(resultMessage);
  }

  constructor(options: CreateAgentSessionOptions) {
    this.cwd = options.cwd;
    this.sessionManager = options.sessionManager;
    this.authStorage = options.authStorage;
    this.modelRegistry = options.modelRegistry;
    this.resourceLoader = options.resourceLoader;
    this.customTools = options.customTools || [];
    this._customTools = this.customTools;

    this.initializeTools();
    this.restoreSessionState();
    this.initializeAgent();
  }

  _refreshToolRegistry(): void {
    this.allToolsMap.clear();
    for (const toolDef of this.customTools) {
      const wrappedTool: AgentTool = {
        name: toolDef.name,
        label: toolDef.label || toolDef.name,
        description: toolDef.description,
        parameters: toolDef.parameters || toolDef.schema || {},
        execute: async (toolCallId, params, signal) => {
          const res = toolDef.name === "bash"
            ? await toolDef.execute(params, { signal, toolCallId })
            : await toolDef.execute(toolCallId, params, signal);
          if (res && typeof res === "object" && "content" in res && Array.isArray(res.content)) {
            return res;
          }
          if (typeof res === "string") {
            return {
              content: [{ type: "text", text: res }],
              details: { output: res },
            };
          }
          const outputText = res && typeof res === "object" && "output" in res
            ? String(res.output)
            : JSON.stringify(res);
          return {
            content: [{ type: "text", text: outputText }],
            details: res,
          };
        },
      };
      this.allToolsMap.set(toolDef.name, wrappedTool);
    }
    this.activeTools = Array.from(this.allToolsMap.values());
    if (this.agent) {
      (this.agent.state as any).tools = this.activeTools;
    }
  }

  private initializeTools() {
    this._refreshToolRegistry();
  }

  private restoreSessionState() {
    const context = this.sessionManager.buildSessionContext();
    const loadedThinkingLevel = context.thinkingLevel || "off";

    if (context.model) {
      const found = this.modelRegistry.find(context.model.provider, context.model.modelId);
      if (found) {
        this.model = found;
      }
    }

    if (!this.model) {
      const available = this.modelRegistry.getAvailable();
      if (available.length > 0) {
        this.model = available[0];
      }
    }

    this.thinkingLevel = loadedThinkingLevel;
  }

  private initializeAgent() {
    const systemPrompt = [
      this.resourceLoader.getSystemPrompt() || "",
      ...(this.resourceLoader.getAppendSystemPrompt() || []),
    ].filter(Boolean).join("\n\n");

    const modelObj = this.model ? {
      id: this.model.id,
      name: this.model.name,
      provider: this.model.provider,
      api: this.model.api,
      baseUrl: this.model.baseUrl,
      apiKey: this.model.apiKey,
      reasoning: !!this.model.reasoning,
      contextWindow: this.model.contextWindow || 100000,
      maxTokens: this.model.maxTokens || 4096,
      compat: this.model.compat,
      input: (this.model as any).input || [],
      cost: (this.model as any).cost || {},
    } : {
      id: "unknown",
      name: "unknown",
      provider: "unknown",
      api: "unknown",
      baseUrl: "",
      reasoning: false,
      contextWindow: 100000,
      maxTokens: 4096,
      compat: undefined,
      input: [],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    };

    const initialMessages = this.sessionManager.buildSessionContext().messages;

    this.agent = new Agent({
      initialState: {
        systemPrompt,
        model: modelObj as any,
        thinkingLevel: this.thinkingLevel as any,
        tools: this.activeTools,
        messages: initialMessages,
      },
      convertToLlm,
      streamFn: streamSimple,
      getApiKey: async (providerName: string) => {
        const result = await this.modelRegistry.getApiKeyAndHeaders({
          provider: providerName,
          apiKey: this.model?.apiKey,
        } as any);
        return result.ok ? result.apiKey : undefined;
      },
    });

    this.agent.subscribe(async (evt) => {
      await this.handleAgentEvent(evt);
    });
  }

  private async handleAgentEvent(evt: any) {
    if (evt.type === "agent_start") {
      this.emit({ type: "agent_start" });
    } else if (evt.type === "agent_end") {
      for (const msg of evt.messages || []) {
        if (msg.role === "assistant" && msg.usage) {
          if (!msg.usage.cost) {
            msg.usage.cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
          } else {
            const cost = msg.usage.cost;
            cost.input = cost.input ?? 0;
            cost.output = cost.output ?? 0;
            cost.cacheRead = cost.cacheRead ?? 0;
            cost.cacheWrite = cost.cacheWrite ?? 0;
            cost.total = cost.total ?? 0;
          }
        }
      }
      this.emit({ type: "agent_end", messages: evt.messages, willRetry: false });
    } else if (evt.type === "message_start") {
      this.emit({
        type: "message_start",
        message: evt.message,
      });
    } else if (evt.type === "message_end") {
      if (evt.message) {
        this.sessionManager.appendMessage(evt.message);
      }
      this.emit({
        type: "message_end",
        message: evt.message,
      });
    } else if (evt.type === "message_update") {
      if (evt.assistantMessageEvent?.type === "text_delta" || evt.assistantMessageEvent?.type === "thinking_delta") {
        this.emit({
          type: "message_update",
          assistantMessageEvent: evt.assistantMessageEvent,
          message: evt.message,
        });
      }
    } else if (evt.type === "tool_execution_start") {
      this.emit({
        type: "tool_execution_start",
        toolName: evt.toolName,
        args: evt.args,
        toolCallId: evt.toolCallId,
        toolCall: {
          id: evt.toolCallId,
          name: evt.toolName,
          arguments: evt.args,
        },
      });
    } else if (evt.type === "tool_execution_end") {
      this.emit({
        type: "tool_execution_end",
        toolName: evt.toolName,
        result: evt.result,
        isError: evt.isError,
        toolCallId: evt.toolCallId,
        toolCall: {
          id: evt.toolCallId,
          name: evt.toolName,
        },
      });
    } else if (evt.type === "tool_execution_update") {
      this.emit({
        type: "tool_execution_update",
        toolCallId: evt.toolCallId,
        toolName: evt.toolName,
        partialResult: evt.partialResult,
      });
    } else if (evt.type === "turn_end") {
      if (evt.message && evt.message.role === "assistant" && evt.message.errorMessage) {
        this.emit({ type: "agent_error", error: evt.message.errorMessage });
      }
    }
  }

  setActiveToolsByName(names: string[]): void {
    const list: AgentTool[] = [];
    for (const name of names) {
      const tool = this.allToolsMap.get(name);
      if (tool) list.push(tool);
    }
    this.activeTools = list;
    if (this.agent) {
      (this.agent.state as any).tools = list;
    }
  }

  getActiveToolNames(): string[] {
    return this.activeTools.map((t) => t.name);
  }

  async setModel(model: AvailableModel): Promise<void> {
    this.model = model;
    this.sessionManager.appendModelChange(model.provider, model.id);
    if (this.agent) {
      (this.agent.state as any).model = {
        id: model.id,
        name: model.name,
        provider: model.provider,
        api: model.api,
        baseUrl: model.baseUrl,
        apiKey: model.apiKey,
        reasoning: !!model.reasoning,
        contextWindow: model.contextWindow || 100000,
        maxTokens: model.maxTokens || 4096,
        compat: model.compat,
        input: (model as any).input || [],
        cost: (model as any).cost || {},
      };
    }
  }

  setThinkingLevel(level: string): void {
    this.thinkingLevel = level;
    this.sessionManager.appendThinkingLevelChange(level);
  }

  subscribe(listener: (evt: any) => void): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  private emit(event: any) {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {}
    }
  }

  async prompt(messageText: string, opts?: any): Promise<any> {
    if (this.isStreaming) {
      throw new Error("Session is already streaming");
    }

    this.isStreaming = true;
    this.abortController = new AbortController();

    try {
      const contentParts: any[] = [{ type: "text" as const, text: messageText }];
      if (opts?.images && Array.isArray(opts.images)) {
        for (const img of opts.images) {
          let base64Part = img.data || "";
          if (base64Part.includes("base64,")) {
            base64Part = base64Part.substring(base64Part.indexOf("base64,") + 7);
          }
          contentParts.push({
            type: "image" as const,
            mimeType: img.mimeType || "image/png",
            data: base64Part,
          });
        }
      }

      const userMessage = {
        role: "user" as const,
        content: contentParts.length > 1 ? contentParts : messageText,
        timestamp: Date.now(),
      };

      if (this.model) {
        const modelObj = {
          id: this.model.id,
          name: this.model.name,
          provider: this.model.provider,
          api: this.model.api,
          baseUrl: this.model.baseUrl,
          apiKey: this.model.apiKey,
          reasoning: !!this.model.reasoning,
          contextWindow: this.model.contextWindow || 100000,
          maxTokens: this.model.maxTokens || 4096,
          compat: this.model.compat,
          input: (this.model as any).input || [],
          cost: (this.model as any).cost || {},
        };
        (this.agent.state as any).model = modelObj;
      }

      const systemPrompt = [
        this.resourceLoader.getSystemPrompt() || "",
        ...(this.resourceLoader.getAppendSystemPrompt() || []),
      ].filter(Boolean).join("\n\n");
      (this.agent.state as any).systemPrompt = systemPrompt;

      const currentMessages = this.sessionManager.buildSessionContext().messages;
      (this.agent.state as any).messages = currentMessages;

      await this.agent.prompt(userMessage as any);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err ?? "Unknown error");
      this.emit({ type: "agent_error", error: errorMsg });
      this.emit({ type: "agent_end", messages: this.messages, willRetry: false });
    } finally {
      this.isStreaming = false;
      this.abortController = null;
    }
  }

  steer(messageText: string): void {
    const steeringMsg = {
      role: "user" as const,
      content: messageText,
      timestamp: Date.now(),
    };
    this.agent.steer(steeringMsg);
  }

  followUp(messageText: string): void {
    const followUpMsg = {
      role: "user" as const,
      content: messageText,
      timestamp: Date.now(),
    };
    this.agent.followUp(followUpMsg);
  }

  async abort(): Promise<void> {
    if (this.agent) {
      this.agent.abort();
    }
    if (this.abortController) {
      this.abortController.abort();
    }
    const sId = this.sessionManager.getSessionId();
    try {
      const { delegationRegistry } = await import("../core/delegation-registry");
      delegationRegistry.abortBySubagentSessionId(sId);
      delegationRegistry.abortAll(sId);
    } catch (err) {
      console.error("[AgentSession.abort] Failed to propagate abort to delegation registry:", err);
    }
  }

  async compact(customInstructions?: string): Promise<void> {
    if (this.isStreaming) {
      throw new Error("Cannot compact while session is streaming");
    }

    if (!this.model) {
      throw new Error("No model configured for compaction");
    }

    const modelObj = {
      id: this.model.id,
      name: this.model.name,
      provider: this.model.provider,
      api: this.model.api,
      baseUrl: this.model.baseUrl,
      apiKey: this.model.apiKey,
      reasoning: !!this.model.reasoning,
      contextWindow: this.model.contextWindow || 100000,
      maxTokens: this.model.maxTokens || 4096,
      compat: this.model.compat,
      input: (this.model as any).input || [],
      cost: (this.model as any).cost || {},
    };

    const entries = this.sessionManager.getEntries();
    const settings = {
      enabled: true,
      reserveTokens: 16384,
      keepRecentTokens: 20000,
    };

    const prepResult = prepareCompaction(entries as any[], settings);
    if (!prepResult.ok) {
      console.error("[Compaction] Preparation failed:", prepResult.error);
      return;
    }

    const preparation = prepResult.value;
    if (!preparation) {
      console.log("[Compaction] Nothing to compact");
      return;
    }

    const dummyModels = {
      completeSimple: async (m: any, ctx: any, opts?: any) => {
        const result = await this.modelRegistry.getApiKeyAndHeaders({
          provider: m.provider,
          apiKey: this.model?.apiKey,
        } as any);
        const apiKey = result.ok ? result.apiKey : undefined;
        return completeSimple(m, ctx, { ...opts, apiKey });
      }
    } as any;

    try {
      const compactResult = await compact(
        preparation,
        dummyModels,
        modelObj,
        customInstructions,
        undefined,
        this.thinkingLevel as any
      );

      if (!compactResult.ok) {
        console.error("[Compaction] Execution failed:", compactResult.error);
        return;
      }

      const { summary, firstKeptEntryId, tokensBefore } = compactResult.value;
      this.sessionManager.appendCompaction(summary, tokensBefore, firstKeptEntryId);
      this.messages = this.sessionManager.buildSessionContext().messages;
      console.log("[Compaction] Successfully compacted session context");
    } catch (err) {
      console.error("[Compaction] Unexpected error during compaction:", err);
    }
  }

  async navigateTree(targetId: string, options?: { summarize?: boolean }): Promise<{ editorText: string }> {
    if (this.isStreaming) {
      throw new Error("Cannot navigate while session is streaming");
    }
    this.sessionManager.branch(targetId);
    this.messages = this.sessionManager.buildSessionContext().messages;
    if (this.agent) {
      this.agent.state.messages = this.messages;
    }
    return { editorText: "" };
  }

  getContextUsage() {
    const context = this.sessionManager.buildSessionContext();
    try {
      const systemPrompt = [
        this.resourceLoader.getSystemPrompt() || "",
        ...(this.resourceLoader.getAppendSystemPrompt() || []),
      ].filter(Boolean).join("\n\n");
      const llmContext = {
        systemPrompt,
        messages: convertToLlm(context.messages),
      };
      const estimate = estimateContextTokens(llmContext);
      return {
        totalTokens: estimate.tokens,
        inputTokens: estimate.usageTokens,
        outputTokens: estimate.trailingTokens,
        limit: this.model?.contextWindow ?? 1_000_000,
      };
    } catch (err) {
      console.error("[AgentSession] Error estimating context tokens:", err);
      let charCount = 0;
      for (const msg of context.messages as any[]) {
        if (msg.content) {
          if (typeof msg.content === "string") {
            charCount += msg.content.length;
          } else if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block.type === "text" && block.text) {
                charCount += block.text.length;
              }
            }
          }
        }
      }
      const estimatedTokens = Math.ceil(charCount / 4);
      return {
        totalTokens: estimatedTokens,
        inputTokens: estimatedTokens,
        outputTokens: 0,
        limit: this.model?.contextWindow ?? 1_000_000,
      };
    }
  }

  getSessionStats() {
    const entries = this.sessionManager.getEntries();
    let userMessages = 0;
    let assistantMessages = 0;
    let toolCalls = 0;
    let toolResults = 0;

    for (const entry of entries) {
      if (entry.type === "message") {
        if (entry.message.role === "user") userMessages++;
        if (entry.message.role === "assistant") {
          assistantMessages++;
          const tc = (entry.message.content as any)?.filter((c: any) => c.type === "toolCall") || [];
          toolCalls += tc.length;
        }
        if (entry.message.role === "toolResult") toolResults++;
      }
    }

    return {
      sessionFile: this.sessionManager.getSessionFile(),
      sessionId: this.sessionManager.getSessionId(),
      userMessages,
      assistantMessages,
      toolCalls,
      toolResults,
      totalMessages: entries.length,
      tokens: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
      cost: 0,
    };
  }

  dispose(): void {
    this.abort();
    this.eventListeners.clear();
  }
}

export async function createAgentSession(options: CreateAgentSessionOptions): Promise<{ session: AgentSession; extensionsResult: any }> {
  const session = new AgentSession(options);
  return {
    session,
    extensionsResult: { extensions: [], diagnostics: [] },
  };
}
