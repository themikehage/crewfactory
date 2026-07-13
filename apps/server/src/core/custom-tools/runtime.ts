import { type CustomToolDefinition } from "./schemas";
import { type PipelineContext, executePipeline } from "./pipeline-engine";

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
      switch (definition.execute.type) {
        case "pipeline": {
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
            definition.execute.steps,
            params,
            runContext,
            definition.execute.onError,
            signal,
            (step, total, desc) => {
              onUpdate?.({
                content: [{ type: "text", text: `Step ${step}/${total}: ${desc}` }],
                details: { step, total },
              });
            }
          );
          // Attach UI definition and presentation if available
          result.details = {
            ...result.details,
            ...(definition.ui ? { ui: definition.ui } : {}),
            ...(definition.presentation ? { presentation: definition.presentation } : { presentation: { defaultExpanded: true, accordionDefaultOpen: true } }),
          };
          return result;
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
