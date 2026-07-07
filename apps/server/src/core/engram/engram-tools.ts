import type { MemoryProvider, MemoryType } from "./types";

export function createEngramTools(memory: MemoryProvider) {
  const engramStoreTool = {
    name: "engram_store",
    description: "Store a fact, event, or code/architectural pattern into the agent's long-term persistent memory.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "The memory text or factual content to store." },
        type: {
          type: "string",
          enum: ["semantic", "episodic", "procedural"],
          description: "Type of memory. semantic=facts, episodic=events/interactions, procedural=patterns/procedures.",
          default: "semantic",
        },
        importance: {
          type: "number",
          description: "Importance weight from 0.0 (low) to 1.0 (high). Defaults to 0.5.",
          minimum: 0,
          maximum: 1,
          default: 0.5,
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional categorization tags.",
        },
      },
      required: ["content"],
    },
    execute: async (toolCallId: string, args: any) => {
      try {
        const type = (args.type || "semantic") as MemoryType;
        const importance = args.importance ?? 0.5;
        const tags = args.tags || [];

        await memory.store(args.content, type, importance, tags);

        return {
          content: [{ type: "text", text: `Memory successfully stored: [${type}] "${args.content.slice(0, 80)}..."` }],
          details: { status: "success", type, importance, tags },
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error storing memory: ${String(e)}` }],
          isError: true,
        };
      }
    },
  };

  const engramRecallTool = {
    name: "engram_recall",
    description: "Search and retrieve query-relevant facts or interactions from the agent's long-term memory.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language search term or semantic query." },
        limit: {
          type: "integer",
          description: "Maximum number of memories to return (1-20). Defaults to 5.",
          minimum: 1,
          maximum: 20,
          default: 5,
        },
      },
      required: ["query"],
    },
    execute: async (toolCallId: string, args: any) => {
      try {
        const limit = args.limit ?? 5;
        const memories = await memory.recall(args.query, { limit });

        if (memories.length === 0) {
          return {
            content: [{ type: "text", text: "No relevant memories found." }],
            details: { count: 0 },
          };
        }

        const formatted = memories
          .map((m, i) => `${i + 1}. [${m.type}] (Importance: ${m.importance}) ID: ${m.id}\n   "${m.content}"`)
          .join("\n\n");

        return {
          content: [{ type: "text", text: formatted }],
          details: { count: memories.length, memories },
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error recalling memories: ${String(e)}` }],
          isError: true,
        };
      }
    },
  };

  const engramForgetTool = {
    name: "engram_forget",
    description: "Forget or delete a specific memory using its memory ID.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The unique memory ID to be deleted." },
      },
      required: ["id"],
    },
    execute: async (toolCallId: string, args: any) => {
      try {
        await memory.forget(args.id);
        return {
          content: [{ type: "text", text: `Memory ID "${args.id}" deleted successfully (if existed).` }],
          details: { status: "success", deletedId: args.id },
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error forgetting memory: ${String(e)}` }],
          isError: true,
        };
      }
    },
  };

  return [engramStoreTool, engramRecallTool, engramForgetTool];
}
