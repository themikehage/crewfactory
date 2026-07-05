import { isAbsolute, resolve as nodeResolvePath } from "node:path";
import { homedir } from "node:os";

export function normalizePath(input: string): string {
  if (input.startsWith("~/")) {
    return `${homedir()}/${input.slice(2)}`;
  }
  return input;
}

export function resolvePath(input: string, baseDir: string = process.cwd()): string {
  const normalized = normalizePath(input);
  return isAbsolute(normalized) ? nodeResolvePath(normalized) : nodeResolvePath(baseDir, normalized);
}
