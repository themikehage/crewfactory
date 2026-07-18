import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { resolveSafePath, type CwdConfig } from "./path-safety";
import { truncateHead } from "../vendor/agent/src/harness/utils/truncate";

export function createLsToolDefinition(cwd: CwdConfig) {
  return {
    name: "ls",
    description: "List directory contents. Returns entries sorted alphabetically, with '/' suffix for directories. Includes dotfiles.",
    schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory to list (default: current directory)" },
        limit: { type: "number", description: "Maximum number of entries to return (default: 500)" }
      }
    },
    execute: async (toolCallId: string, args: any, signal?: AbortSignal) => {
      const { path: dirPath, limit } = args;
      const effectiveLimit = limit && limit > 0 ? limit : 500;

      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      const absolutePath = resolveSafePath(cwd, dirPath || ".");

      const pathStat = await stat(absolutePath);
      if (!pathStat.isDirectory()) {
        throw new Error(`Not a directory: ${dirPath || "."}`);
      }

      const entries = await readdir(absolutePath);

      entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

      const results: string[] = [];
      let limitReached = false;

      for (const entry of entries) {
        if (results.length >= effectiveLimit) {
          limitReached = true;
          break;
        }

        const fullPath = join(absolutePath, entry);
        let suffix = "";
        try {
          const entryStat = await stat(fullPath);
          if (entryStat.isDirectory()) {
            suffix = "/";
          }
        } catch {
          continue;
        }
        results.push(entry + suffix);
      }

      if (results.length === 0) {
        return {
          content: [{ type: "text", text: "(empty directory)" }],
          details: { count: 0 }
        };
      }

      const rawOutput = results.join("\n");
      const truncation = truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER });
      let output = truncation.content;

      if (limitReached) {
        output += `\n\n[Output truncated: ${effectiveLimit} entries limit reached.]`;
      } else if (truncation.truncated) {
        output += "\n\n[Output truncated due to size limits.]";
      }

      return {
        content: [{ type: "text", text: output }],
        details: {
          count: results.length,
          limitReached,
          truncated: truncation.truncated
        }
      };
    }
  };
}
