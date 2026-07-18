import { execSync, spawn } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, basename } from "node:path";
import { existsSync } from "node:fs";
import ignore from "ignore";
import { resolveSafePath, type CwdConfig } from "./path-safety";

function isRipgrepAvailable(): boolean {
  try {
    execSync(process.platform === "win32" ? "where rg" : "which rg", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexStr = "^" + escaped.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, ".") + "$";
  return new RegExp(regexStr, "i");
}

export function createGrepToolDefinition(cwd: CwdConfig) {
  return {
    name: "grep",
    description: "Search file contents for a pattern. Returns matching lines with file paths and line numbers. Respects .gitignore.",
    schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Search pattern (regex or literal string)" },
        path: { type: "string", description: "Directory or file to search (default: current directory)" },
        glob: { type: "string", description: "Filter files by glob pattern, e.g. '*.ts'" },
        ignoreCase: { type: "boolean", description: "Case-insensitive search (default: false)" },
        literal: { type: "boolean", description: "Treat pattern as literal string instead of regex (default: false)" },
        limit: { type: "number", description: "Maximum number of matches to return (default: 100)" }
      },
      required: ["pattern"]
    },
    execute: async (toolCallId: string, args: any, signal?: AbortSignal) => {
      const { pattern, path: searchDir, glob: globPattern, ignoreCase, literal, limit } = args;
      const effectiveLimit = limit && limit > 0 ? limit : 100;
      const searchPath = resolveSafePath(cwd, searchDir || ".");

      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      if (isRipgrepAvailable()) {
        try {
          return await runRipgrep(searchPath, pattern, { globPattern, ignoreCase, literal, limit: effectiveLimit, signal });
        } catch {
          // Fallback to native if spawing fails for some reason
        }
      }

      return runNativeGrep(cwd, searchPath, pattern, { globPattern, ignoreCase, literal, limit: effectiveLimit, signal });
    }
  };
}

async function runRipgrep(
  searchPath: string,
  pattern: string,
  opts: { globPattern?: string; ignoreCase?: boolean; literal?: boolean; limit: number; signal?: AbortSignal }
): Promise<any> {
  return new Promise((resolve, reject) => {
    const args = ["--line-number", "--color=never", "--with-filename", "--no-heading"];
    if (opts.ignoreCase) args.push("-i");
    if (opts.literal) args.push("-F");
    if (opts.globPattern) args.push("-g", opts.globPattern);
    args.push("--max-count", String(opts.limit));
    args.push("--", pattern, searchPath);

    const child = spawn("rg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    const onAbort = () => {
      child.kill();
      reject(new Error("Operation aborted"));
    };

    if (opts.signal) {
      if (opts.signal.aborted) {
        onAbort();
        return;
      }
      opts.signal.addEventListener("abort", onAbort, { once: true });
    }

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (opts.signal) {
        opts.signal.removeEventListener("abort", onAbort);
      }

      if (code !== 0 && code !== 1) {
        reject(new Error(stderr.trim() || `rg exited with code ${code}`));
        return;
      }

      const lines = stdout.split("\n").filter(Boolean);
      const matches = lines.slice(0, opts.limit).map((line) => {
        const parts = line.split(":");
        if (parts.length >= 3) {
          const filePath = parts.slice(0, parts.length - 2).join(":");
          const lineNum = parts[parts.length - 2];
          const text = parts.slice(parts.length - 1).join(":");
          const relativePath = relative(searchPath, filePath) || basename(filePath);
          return `${relativePath.replace(/\\/g, "/")}:${lineNum}: ${text}`;
        }
        return line;
      });

      if (matches.length === 0) {
        resolve({ content: [{ type: "text", text: "No matches found" }], details: { count: 0 } });
      } else {
        resolve({
          content: [{ type: "text", text: matches.join("\n") }],
          details: { count: matches.length }
        });
      }
    });

    child.on("error", (err) => {
      if (opts.signal) {
        opts.signal.removeEventListener("abort", onAbort);
      }
      reject(err);
    });
  });
}

async function runNativeGrep(
  workspaceDir: string,
  searchPath: string,
  pattern: string,
  opts: { globPattern?: string; ignoreCase?: boolean; literal?: boolean; limit: number; signal?: AbortSignal }
): Promise<any> {
  const ig = ignore();
  ig.add(["node_modules", ".git", ".atl", "pnpm-lock.yaml", "bun.lockb", "dist", "build"]);

  const gitignorePath = join(workspaceDir, ".gitignore");
  if (existsSync(gitignorePath)) {
    try {
      const gitignoreContent = await readFile(gitignorePath, "utf-8");
      ig.add(gitignoreContent);
    } catch {}
  }

  const files: string[] = [];
  const walk = async (dir: string) => {
    if (opts.signal?.aborted) return;
    const entries = await readdir(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const relativeToWorkspace = relative(workspaceDir, fullPath).replace(/\\/g, "/");

      if (ig.ignores(relativeToWorkspace)) {
        continue;
      }

      const entryStat = await stat(fullPath);
      if (entryStat.isDirectory()) {
        await walk(fullPath);
      } else if (entryStat.isFile()) {
        if (opts.globPattern) {
          const globRegex = globToRegex(opts.globPattern);
          if (!globRegex.test(entry)) {
            continue;
          }
        }
        files.push(fullPath);
      }
    }
  };

  const pathStat = await stat(searchPath);
  if (pathStat.isDirectory()) {
    await walk(searchPath);
  } else if (pathStat.isFile()) {
    files.push(searchPath);
  }

  const regex = opts.literal
    ? null
    : new RegExp(pattern, opts.ignoreCase ? "i" : "");
  const lowerPattern = opts.literal && opts.ignoreCase ? pattern.toLowerCase() : pattern;

  const matches: string[] = [];
  for (const file of files) {
    if (opts.signal?.aborted) break;
    if (matches.length >= opts.limit) break;

    try {
      const content = await readFile(file, "utf-8");
      if (content.includes("\u0000")) continue; // Skip binaries

      const lines = content.split("\n");
      const relativePath = relative(searchPath, file) || basename(file);
      const formattedPath = relativePath.replace(/\\/g, "/");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let isMatch = false;

        if (regex) {
          isMatch = regex.test(line);
        } else {
          const targetLine = opts.ignoreCase ? line.toLowerCase() : line;
          isMatch = targetLine.includes(lowerPattern);
        }

        if (isMatch) {
          matches.push(`${formattedPath}:${i + 1}: ${line.trim()}`);
          if (matches.length >= opts.limit) break;
        }
      }
    } catch {}
  }

  if (matches.length === 0) {
    return { content: [{ type: "text", text: "No matches found" }], details: { count: 0 } };
  }

  return {
    content: [{ type: "text", text: matches.join("\n") }],
    details: { count: matches.length }
  };
}
