import { type PipelineStep, type CustomToolDefinition } from "./schemas";
import { type AgentSession } from "../../ai";

export interface PipelineContext {
  cwd: string;
  session: AgentSession;
  username: string;
  sessionId: string;
}

export function resolveVariables(template: any, scope: Record<string, any>): any {
  if (typeof template === "string") {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      if (key in scope) {
        return String(scope[key]);
      }
      return match;
    });
  }
  if (Array.isArray(template)) {
    return template.map(item => resolveVariables(item, scope));
  }
  if (typeof template === "object" && template !== null) {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(template)) {
      result[key] = resolveVariables(value, scope);
    }
    return result;
  }
  return template;
}

export async function executePipeline(
  steps: PipelineStep[],
  toolParams: Record<string, any>,
  context: PipelineContext,
  onError: "stop" | "continue" = "stop",
  signal?: AbortSignal,
  onProgress?: (step: number, total: number, description: string) => void
): Promise<any> {
  const scope: Record<string, any> = { ...toolParams };
  const stepLogs: Array<{ step: number; tool: string; description?: string; status: "success" | "failed"; output?: string; error?: string }> = [];
  let lastOutput = "";

  const total = steps.length;
  for (let i = 0; i < total; i++) {
    const step = steps[i];
    const stepNum = i + 1;
    const desc = step.description || `Executing ${step.tool}`;
    
    onProgress?.(stepNum, total, desc);

    if (signal?.aborted) {
      throw new Error("Pipeline execution aborted");
    }

    // 1. Resolve variables in parameters
    const resolvedParams = resolveVariables(step.params, scope);

    // 2. Find tool
    const sessionAny = context.session as any;
    const tool = sessionAny.allToolsMap?.get(step.tool);
    if (!tool) {
      const errorMsg = `Tool "${step.tool}" not found in session tools map`;
      stepLogs.push({ step: stepNum, tool: step.tool, description: step.description, status: "failed", error: errorMsg });
      if (onError === "stop") {
        return {
          content: [{ type: "text", text: `Pipeline failed at step ${stepNum} (${desc}): ${errorMsg}` }],
          details: { stepLogs, lastOutput },
          isError: true,
        };
      }
      continue;
    }

    // 3. Execute tool
    try {
      const toolCallId = `step_${stepNum}_${Date.now()}`;
      const result = await tool.execute(toolCallId, resolvedParams, signal);
      
      const isError = result.isError || false;
      const textResult = result.content?.[0]?.text || "";

      if (isError) {
        stepLogs.push({ step: stepNum, tool: step.tool, description: step.description, status: "failed", error: textResult });
        if (onError === "stop") {
          return {
            content: [{ type: "text", text: `Pipeline failed at step ${stepNum} (${desc}): ${textResult}` }],
            details: { stepLogs, lastOutput },
            isError: true,
          };
        }
      } else {
        lastOutput = textResult;
        if (step.output) {
          scope[step.output] = textResult;
        }
        stepLogs.push({ step: stepNum, tool: step.tool, description: step.description, status: "success", output: textResult });
      }
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      stepLogs.push({ step: stepNum, tool: step.tool, description: step.description, status: "failed", error: errorMsg });
      if (onError === "stop") {
        return {
          content: [{ type: "text", text: `Pipeline failed at step ${stepNum} (${desc}) with exception: ${errorMsg}` }],
          details: { stepLogs, lastOutput },
          isError: true,
        };
      }
    }
  }

  return {
    content: [{ type: "text", text: lastOutput || "Pipeline completed successfully" }],
    details: { stepLogs, lastOutput },
    isError: false,
  };
}
