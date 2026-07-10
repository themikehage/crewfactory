import { runAgentLoop } from "./vendor/agent/src/agent-loop.ts";
import { streamSimple } from "./vendor/ai/src/compat.ts";
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

  messages: any[] = [];
  model: AvailableModel | null = null;
  thinkingLevel: string = "off";
  isStreaming: boolean = false;

  private activeTools: AgentTool[] = [];
  private allToolsMap: Map<string, AgentTool> = new Map();
  private eventListeners: Set<(evt: any) => void> = new Set();
  private abortController: AbortController | null = null;
  private delegationResultQueue: any[] = [];

  addDelegationResult(resultMessage: any): void {
    this.delegationResultQueue.push(resultMessage);
  }

  private drainSteeringMessages(): Promise<any[]> {
    const msgs = [...this.delegationResultQueue];
    this.delegationResultQueue = [];
    return Promise.resolve(msgs);
  }

  private drainFollowUpMessages(): Promise<any[]> {
    const msgs = [...this.delegationResultQueue];
    this.delegationResultQueue = [];
    return Promise.resolve(msgs);
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
  }

  private initializeTools() {
    this._refreshToolRegistry();
  }

  private restoreSessionState() {
    const context = this.sessionManager.buildSessionContext();
    this.messages = context.messages;
    this.thinkingLevel = context.thinkingLevel || "off";

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
  }

  setActiveToolsByName(names: string[]): void {
    const list: AgentTool[] = [];
    for (const name of names) {
      const tool = this.allToolsMap.get(name);
      if (tool) list.push(tool);
    }
    this.activeTools = list;
  }

  getActiveToolNames(): string[] {
    return this.activeTools.map((t) => t.name);
  }

  async setModel(model: AvailableModel): Promise<void> {
    this.model = model;
    this.sessionManager.appendModelChange(model.provider, model.id);
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

    // Registrar en persistencia
    this.sessionManager.appendMessage(userMessage);
    this.messages = this.sessionManager.buildSessionContext().messages;

    const sessionContext = this.sessionManager.buildSessionContext();
    const systemPrompt = [
      this.resourceLoader.getSystemPrompt() || "",
      ...(this.resourceLoader.getAppendSystemPrompt() || []),
    ].filter(Boolean).join("\n\n");

    const agentContext = {
      systemPrompt,
      messages: sessionContext.messages.slice(0, -1) as AgentMessage[],
      tools: this.activeTools,
    };

    if (!this.model) {
      this.isStreaming = false;
      throw new Error("No model selected or available in session");
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

    const loopConfig = {
      model: modelObj,
      maxSteps: 20,
      thinkingLevel: this.thinkingLevel as any,
      getApiKey: async (providerName: string) => {
        const result = await this.modelRegistry.getApiKeyAndHeaders({
          provider: providerName,
          apiKey: this.model?.apiKey,
        } as any);
        return result.ok ? result.apiKey : undefined;
      },
      convertToLlm,
      getSteeringMessages: () => this.drainSteeringMessages(),
      getFollowUpMessages: () => this.drainFollowUpMessages(),
    };

    try {
      await runAgentLoop(
        [userMessage as any],
        agentContext,
        loopConfig,
        async (evt: any) => {
          // Mapear eventos a la estructura que espera CrewFactory
          if (evt.type === "agent_start") {
            this.emit({ type: "agent_start" });
          } else if (evt.type === "agent_end") {
            // Sanitizar costos al finalizar el loop
            for (const msg of evt.messages) {
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
            if (evt.message && (evt.message.role === "assistant" || evt.message.role === "toolResult")) {
              this.sessionManager.appendMessage(evt.message);
              this.messages = this.sessionManager.buildSessionContext().messages;
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
          }
        },
        this.abortController.signal,
        streamSimple
      );
    } catch (err: any) {
      this.emit({ type: "agent_error", error: err.message });
      this.emit({ type: "agent_end", messages: [], willRetry: false });
    } finally {
      this.isStreaming = false;
      this.abortController = null;
      // Actualizar mensajes en memoria local
      this.messages = this.sessionManager.buildSessionContext().messages;
    }
  }

  steer(messageText: string): void {
    const steeringMsg = {
      role: "user" as const,
      content: messageText,
      timestamp: Date.now(),
    };
    this.delegationResultQueue.push(steeringMsg);
    this.sessionManager.appendMessage(steeringMsg);
    this.messages = this.sessionManager.buildSessionContext().messages;
  }

  followUp(messageText: string): void {
    const followUpMsg = {
      role: "user" as const,
      content: messageText,
      timestamp: Date.now(),
    };
    this.delegationResultQueue.push(followUpMsg);
    this.sessionManager.appendMessage(followUpMsg);
    this.messages = this.sessionManager.buildSessionContext().messages;
  }

  async abort(): Promise<void> {
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

  async compact(): Promise<void> {
    // Stub de compaction simple
    this.sessionManager.appendCompaction("Manual compaction triggered", 0);
  }

  async navigateTree(targetId: string, options?: { summarize?: boolean }): Promise<{ editorText: string }> {
    this.sessionManager.branch(targetId);
    this.messages = this.sessionManager.buildSessionContext().messages;
    return { editorText: "" };
  }

  getContextUsage() {
    const context = this.sessionManager.buildSessionContext();
    try {
      const estimate = estimateContextTokens(context);
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
