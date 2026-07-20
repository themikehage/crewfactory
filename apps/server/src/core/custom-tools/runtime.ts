import { AsyncLocalStorage } from "node:async_hooks";
import { type CustomToolDefinition } from "./schemas";
import { type PipelineContext, executePipeline, resolveVariables } from "./pipeline-engine";

export const pipelineExecutionStack = new AsyncLocalStorage<string[]>();

export function createCustomToolRuntime(
  definition: CustomToolDefinition,
  context: PipelineContext
): any {
  return {
    name: definition.name,
    label: definition.label || definition.name,
    description: definition.description,
    parameters: definition.parameters || {},
    execute: async (
      toolCallId: string,
      params: Record<string, any>,
      signal?: AbortSignal,
      onUpdate?: (partialResult: any) => void
    ) => {
      const executeDef = definition.execute;
      switch (executeDef.type) {
        case "pipeline": {
          const currentStack = pipelineExecutionStack.getStore() || [];
          if (currentStack.includes(definition.name)) {
            return {
              content: [{ type: "text", text: `Circular dependency detected: ${currentStack.join(" -> ")} -> ${definition.name}` }],
              isError: true,
            };
          }
          if (currentStack.length >= 5) {
            return {
              content: [{ type: "text", text: `Max pipeline execution depth (5) exceeded` }],
              isError: true,
            };
          }
          const nextStack = [...currentStack, definition.name];

          return pipelineExecutionStack.run(nextStack, async () => {
            const { sessionManager } = await import("../session-manager");
            const activeSession = sessionManager.getSession(context.username, context.sessionId);
            if (!activeSession) {
              return {
                content: [{ type: "text", text: `Session ${context.sessionId} is not active` }],
                isError: true,
              };
            }
            const runContext = {
              ...context,
              session: activeSession,
            };
            const result = await executePipeline(
              executeDef.steps,
              params,
              runContext,
              executeDef.onError,
              signal,
              (step, total, desc) => {
                onUpdate?.({
                  content: [{ type: "text", text: `Step ${step}/${total}: ${desc}` }],
                  details: { step, total },
                });
              }
            );
            const scope = result.scope || {};
            const resolvedUi = definition.ui ? resolveVariables(definition.ui, scope) : undefined;
            result.details = {
              ...result.details,
              ...(resolvedUi ? { ui: resolvedUi } : {}),
              ...(definition.presentation ? { presentation: definition.presentation } : { presentation: { defaultExpanded: true, accordionDefaultOpen: true } }),
            };
            delete result.scope;
            return result;
          });
        }

        case "ui":
          return {
            content: [{ type: "text", text: `UI rendered for custom tool ${definition.name}` }],
            details: {
              ui: definition.ui,
              presentation: definition.presentation || { defaultExpanded: true, accordionDefaultOpen: true },
            },
            isError: false,
          };

        default:
          return {
            content: [{ type: "text", text: `Unsupported execution mode for tool ${definition.name}` }],
            isError: true,
          };
      }
    },
  };
}
