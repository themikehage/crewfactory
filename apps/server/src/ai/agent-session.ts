import { runAgentLoop } from "./vendor/agent/src/agent-loop.ts";
import { streamSimple } from "./vendor/ai/src/compat.ts";
import type { AgentMessage, AgentTool } from "./vendor/agent/src/types.ts";
import type { AvailableModel, ModelRegistry } from "./model-registry";
import type { SessionManager } from "./session-persistence";
import type { DefaultResourceLoader } from "./resource-loader";
import { convertToLlm } from "./messages";

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

  messages: any[] = [];
  model: AvailableModel | null = null;
  thinkingLevel: string = "off";
  isStreaming: boolean = false;

  private activeTools: AgentTool[] = [];
  private allToolsMap: Map<string, AgentTool> = new Map();
  private eventListeners: Set<(evt: any) => void> = new Set();
  private abortController: AbortController | null = null;

  constructor(options: CreateAgentSessionOptions) {
    this.cwd = options.cwd;
    this.sessionManager = options.sessionManager;
    this.authStorage = options.authStorage;
    this.modelRegistry = options.modelRegistry;
    this.resourceLoader = options.resourceLoader;
    this.customTools = options.customTools || [];

    // Inicializar herramientas disponibles
    this.initializeTools();

    // Restaurar estado de modelo/thinking desde la sesión
    this.restoreSessionState();
  }

  private initializeTools() {
    for (const toolDef of this.customTools) {
      const wrappedTool: AgentTool = {
        name: toolDef.name,
        label: toolDef.label || toolDef.name,
        description: toolDef.description,
        parameters: toolDef.parameters || toolDef.schema || {},
        execute: async (toolCallId, params, signal) => {
          const res = await toolDef.execute(params, { signal, toolCallId });
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

    const userMessage = {
      role: "user" as const,
      content: messageText,
      timestamp: Date.now(),
    };

    // Registrar en persistencia
    this.sessionManager.appendMessage(userMessage);

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
            // Persistir los mensajes de salida al finalizar el loop y sanitizar costos
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
              if (msg.role === "assistant" || msg.role === "toolResult") {
                this.sessionManager.appendMessage(msg);
              }
            }
            this.emit({ type: "agent_end", messages: evt.messages, willRetry: false });
          } else if (evt.type === "message_start") {
            this.emit({
              type: "message_start",
              message: evt.message,
            });
          } else if (evt.type === "message_end") {
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

  async steer(messageText: string): Promise<any> {
    return this.prompt(messageText);
  }

  async followUp(messageText: string): Promise<any> {
    return this.prompt(messageText);
  }

  async abort(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
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
