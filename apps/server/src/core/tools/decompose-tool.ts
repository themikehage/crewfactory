import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sessionManager } from "../session-manager";
import { broadcastToSession } from "../../ws/handler";
import { streamSimple } from "../../ai/vendor/ai/src/compat.ts";

export interface DecomposeTasksOptions {
  username: string;
  parentSessionId: string;
}

function buildDecomposePrompt(objective: string, context: string, maxTasks: number, mode: string): string {
  const modeInstruction =
    mode === "dag"
      ? "Where possible, express parallelism by specifying which tasks each step depends on using their IDs."
      : "Tasks must be strictly sequential — each depends on the previous one completing first.";

  return [
    `Objective: "${objective}"`,
    context ? `\nAdditional context:\n${context}` : "",
    ``,
    `Decompose this objective into a structured task list of at most ${maxTasks} tasks. ${modeInstruction}`,
    ``,
    `CRITICAL: Your response must end with ONLY a valid JSON array wrapped in a \`\`\`json block. No prose after the JSON block.`,
    ``,
    "Format:",
    "```json",
    "[",
    `  {`,
    `    "id": "t1",`,
    `    "title": "Short, action-oriented title",`,
    `    "prompt": "Complete, self-contained instructions for this task. Include file paths, tools, requirements, and acceptance criteria.",`,
    `    "depends_on": [],`,
    `    "estimated_steps": 3`,
    `  }`,
    `]`,
    "```",
    ``,
    `Rules:`,
    `- IDs must be "t1", "t2", etc.`,
    `- For linear mode: each task's depends_on should contain the ID of the previous task (except the first).`,
    `- "prompt" must be fully self-contained.`,
    `- Output ONLY the JSON block.`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function parseTasksFromText(
  text: string
): Array<{ id: string; title: string; prompt: string; depends_on: string[]; estimated_steps?: number }> | null {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch { }
  }
  try {
    const parsed = JSON.parse(text.trim());
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch { }
  return null;
}

export function createDecomposeTasksTool(opts: DecomposeTasksOptions) {
  const { username, parentSessionId } = opts;

  return {
    name: "decompose_tasks",
    description: `Decompose a high-level objective into a structured, ordered task plan with dependency tracking.
Use this when a goal is too complex to accomplish in a single pass and needs to be broken into discrete, executable steps.
After calling this tool, execute each task step by step using your available tools.
For tasks with depends_on, only start them once their dependencies are complete.
If a task fails, call this tool again with updated context to re-plan the remaining steps.
Do NOT use this for simple, single-step tasks you can execute inline.`,
    parameters: {
      type: "object",
      properties: {
        objective: {
          type: "string",
          description: "The high-level goal to decompose into tasks. Be specific and complete.",
        },
        context: {
          type: "string",
          description:
            "Optional: extra context about the current workspace state, tech stack, constraints, or partial progress that should influence the plan.",
        },
        maxTasks: {
          type: "number",
          description: "Maximum number of tasks to generate (default: 8, max: 15).",
        },
        mode: {
          type: "string",
          enum: ["linear", "dag"],
          description:
            "Decomposition mode. 'linear': each task depends on the previous (default, safer). 'dag': LLM determines optimal dependency graph allowing parallelism.",
        },
      },
      required: ["objective"],
    },
    execute: async (toolCallId: string, args: any, _parentSignal?: AbortSignal) => {
      const objective: string = args.objective || "";
      const context: string = args.context || "";
      const maxTasks: number = Math.min(args.maxTasks || 8, 15);
      const mode: string = args.mode || "linear";

      if (!objective.trim()) {
        return {
          content: [{ type: "text", text: "Error: objective is required." }],
          isError: true,
        };
      }

      const userDir = sessionManager.ensureUserDir(username);
      const sessionDir = join(userDir, "sessions", parentSessionId);
      const tasksPath = join(sessionDir, "tasks.json");

      if (existsSync(tasksPath)) {
        try {
          const oldState = JSON.parse(readFileSync(tasksPath, "utf-8"));
          if (oldState.status === "running") {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: There is already an active task plan in progress. Please complete or pause the current task list before starting a new one.",
                },
              ],
              isError: true,
            };
          }
        } catch { }
      }

      const parentSession = sessionManager.getSession(username, parentSessionId);
      const parentModel = parentSession?.model;

      const { modelRegistry } = sessionManager.getUserContext(username);
      const available = modelRegistry.getAvailable();

      let activeModel = parentModel;
      if (!activeModel) {
        const defaultModelId = sessionManager.getUserDefaultModel(username);
        if (defaultModelId) {
          activeModel = available.find(
            (m) => m.id === defaultModelId || `${m.provider}/${m.id}` === defaultModelId
          );
        }
      }

      if (!activeModel) {
        activeModel = available[0];
      }

      if (!activeModel) {
        return {
          content: [{ type: "text", text: "Error: No active or default models configured." }],
          isError: true,
        };
      }

      const promptText = buildDecomposePrompt(objective, context, maxTasks, mode);

      let responseText = "";
      try {
        const apiKeyResult = await modelRegistry.getApiKeyAndHeaders(activeModel);
        if (!apiKeyResult.ok) {
          throw new Error(
            `Error resolving API key for model ${activeModel.name}: ${(apiKeyResult as any).error}`
          );
        }

        const modelObj = {
          id: activeModel.id,
          name: activeModel.name,
          provider: activeModel.provider,
          api: activeModel.api,
          baseUrl: activeModel.baseUrl,
          apiKey: apiKeyResult.apiKey,
          contextWindow: activeModel.contextWindow || 128000,
          maxTokens: activeModel.maxTokens || 4096,
          compat: activeModel.compat,
          input: (activeModel as any).input || ["text"],
        };

        const stream = streamSimple(
          modelObj as any,
          {
            systemPrompt: "You are a task decomposition engine. Output ONLY JSON.",
            messages: [{ role: "user" as const, content: promptText }],
          },
          {
            signal: _parentSignal,
            apiKey: apiKeyResult.apiKey,
          }
        );

        for await (const event of stream) {
          if (event.type === "text_delta") {
            responseText += event.delta;
          } else if (event.type === "error") {
            throw new Error(event.error);
          }
        }
      } catch (err: any) {
        return {
          content: [
            { type: "text", text: `Failed to decompose objective: ${err.message || String(err)}` },
          ],
          isError: true,
        };
      }

      const parsed = parseTasksFromText(responseText);
      if (!parsed || parsed.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "Could not parse a valid task list from the decomposition response. Try rephrasing the objective or providing more context.",
            },
          ],
          isError: true,
        };
      }

      const tasks = parsed.map((t, idx) => ({
        id: t.id || `t${idx + 1}`,
        title: t.title || `Task ${idx + 1}`,
        prompt: t.prompt || "",
        status: "pending" as const,
        log: "",
        depends_on: Array.isArray(t.depends_on) ? t.depends_on : [],
        estimated_steps: typeof t.estimated_steps === "number" ? t.estimated_steps : undefined,
      }));

      const finalState = {
        tasks,
        currentTaskId: tasks[0]?.id || null,
        status: "running" as const,
        error: undefined,
      };

      try {
        writeFileSync(tasksPath, JSON.stringify(finalState, null, 2), "utf-8");
      } catch (e) {
        console.error("Failed to write tasks.json:", e);
      }

      broadcastToSession(parentSessionId, {
        type: "tasks_update",
        state: finalState,
      });

      const summary = tasks
        .map((t, i) => {
          const deps = t.depends_on.length > 0 ? ` (after: ${t.depends_on.join(", ")})` : "";
          const steps = t.estimated_steps ? ` ~${t.estimated_steps} steps` : "";
          return `${i + 1}. [${t.id}] ${t.title}${deps}${steps}`;
        })
        .join("\n");

      const resultText = [
        `Decomposed "${objective.slice(0, 80)}${objective.length > 80 ? "..." : ""}" into ${tasks.length} tasks (mode: ${mode}):`,
        "",
        summary,
        "",
        "Beginning execution now — working through each task in order.",
      ].join("\n");

      return {
        content: [{ type: "text", text: resultText }],
        details: {
          objective,
          mode,
          tasks,
          totalTasks: tasks.length,
        },
      };
    },
  };
}
