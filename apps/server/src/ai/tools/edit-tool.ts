import { access, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolveSafePath, type CwdConfig } from "./path-safety";
import {
  stripBom,
  normalizeToLF,
  detectLineEnding,
  applyEditsToNormalizedContent,
  restoreLineEndings,
  generateDiffString,
  generateUnifiedPatch,
  Edit
} from "./edit-diff";

export function createEditToolDefinition(cwd: CwdConfig) {
  return {
    name: "edit",
    description: "Edit a single text file using exact text block replacements. Multiple disjoint replacements can be executed in one call.",
    schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file to edit (relative or absolute)" },
        edits: {
          type: "array",
          description: "One or more targeted replacements. oldText must match a unique, non-overlapping region of the file exactly.",
          items: {
            type: "object",
            properties: {
              oldText: { type: "string", description: "Exact text block to replace. Must be unique in the file." },
              newText: { type: "string", description: "Replacement text." }
            },
            required: ["oldText", "newText"]
          }
        }
      },
      required: ["path", "edits"]
    },
    execute: async (toolCallId: string, args: any, signal?: AbortSignal) => {
      const { path: filePath, edits } = args;

      if (!Array.isArray(edits) || edits.length === 0) {
        throw new Error("edits must contain at least one replacement block.");
      }

      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      const absolutePath = resolveSafePath(cwd, filePath);

      await access(absolutePath, constants.R_OK | constants.W_OK);

      const buffer = await readFile(absolutePath);
      const rawContent = buffer.toString("utf-8");

      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      const { bom, text: content } = stripBom(rawContent);
      const originalEnding = detectLineEnding(content);
      const normalizedContent = normalizeToLF(content);

      const { baseContent, newContent } = applyEditsToNormalizedContent(normalizedContent, edits as Edit[], filePath);

      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      const finalContent = bom + restoreLineEndings(newContent, originalEnding);
      await writeFile(absolutePath, finalContent, "utf-8");

      const diffResult = generateDiffString(baseContent, newContent);
      const patch = generateUnifiedPatch(filePath, baseContent, newContent);

      return {
        content: [{ type: "text", text: `Successfully replaced ${edits.length} block(s) in ${filePath}.` }],
        details: {
          path: filePath,
          diff: diffResult.diff,
          patch,
          firstChangedLine: diffResult.firstChangedLine
        }
      };
    }
  };
}
