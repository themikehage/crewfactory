import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveSafePath } from "./path-safety";

export function createWriteToolDefinition(cwd: string) {
  return {
    name: "write",
    description: "Write content to a file. Creates the file if it doesn't exist, and overwrites it if it does. Automatically creates parent directories.",
    schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file to write (relative or absolute)" },
        content: { type: "string", description: "Content to write to the file" }
      },
      required: ["path", "content"]
    },
    execute: async (toolCallId: string, args: any, signal?: AbortSignal) => {
      const { path: filePath, content } = args;

      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      const absolutePath = resolveSafePath(cwd, filePath);
      const parentDir = dirname(absolutePath);

      // Create parent directories recursively
      await mkdir(parentDir, { recursive: true });

      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      // Write content to the file
      await writeFile(absolutePath, content, "utf-8");

      return {
        content: [{ type: "text", text: `Successfully wrote ${Buffer.byteLength(content, "utf-8")} bytes to ${filePath}` }],
        details: {
          path: filePath,
          bytesWritten: Buffer.byteLength(content, "utf-8")
        }
      };
    }
  };
}
