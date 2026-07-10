import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolveSafePath } from "./path-safety";
import { truncateHead } from "../vendor/agent/src/harness/utils/truncate";

export function createReadToolDefinition(cwd: string) {
  return {
    name: "read",
    description: "Read the contents of a text file. Supports offset and limit parameters for paginating large files.",
    schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file to read (relative or absolute)" },
        offset: { type: "number", description: "Line number to start reading from (1-indexed)" },
        limit: { type: "number", description: "Maximum number of lines to read" }
      },
      required: ["path"]
    },
    execute: async (toolCallId: string, args: any, signal?: AbortSignal) => {
      const { path: filePath, offset, limit } = args;

      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      const absolutePath = resolveSafePath(cwd, filePath);

      await access(absolutePath, constants.R_OK);

      const buffer = await readFile(absolutePath);
      const textContent = buffer.toString("utf-8");

      // Check if binary
      if (textContent.includes("\u0000")) {
        return {
          content: [{ type: "text", text: "[Binary file detected. Reading binary files directly is not supported by this tool.]" }],
          details: { isBinary: true }
        };
      }

      const allLines = textContent.split("\n");
      const startLine = offset ? Math.max(0, offset - 1) : 0;
      const startLineDisplay = startLine + 1;

      if (startLine >= allLines.length) {
        throw new Error(`Offset ${offset} is beyond end of file (${allLines.length} lines total)`);
      }

      let selectedContent: string;
      if (limit !== undefined) {
        const endLine = Math.min(startLine + limit, allLines.length);
        selectedContent = allLines.slice(startLine, endLine).join("\n");
      } else {
        selectedContent = allLines.slice(startLine).join("\n");
      }

      const truncation = truncateHead(selectedContent);
      let outputText = truncation.content;

      if (truncation.firstLineExceedsLimit) {
        outputText = `[Line ${startLineDisplay} exceeds byte limit. Try reading with a smaller limit or offset.]`;
      } else if (truncation.truncated) {
        const endLineDisplay = startLineDisplay + truncation.outputLines - 1;
        const nextOffset = endLineDisplay + 1;
        outputText = truncation.content + `\n\n[Output truncated due to size limits. Use offset=${nextOffset} to continue reading.]`;
      }

      return {
        content: [{ type: "text", text: outputText }],
        details: {
          totalLines: allLines.length,
          outputLines: truncation.outputLines,
          truncated: truncation.truncated
        }
      };
    }
  };
}
