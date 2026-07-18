import { resolve, relative, isAbsolute } from "node:path";

export type CwdConfig = string | { getCwd: () => string };

/**
 * Resolves targetPath relative to workspaceDir and ensures the resolved path
 * lies within workspaceDir (no directory traversal attacks).
 */
export function resolveSafePath(workspaceDir: CwdConfig, targetPath: string): string {
  const wsDir = typeof workspaceDir === "string" ? workspaceDir : workspaceDir.getCwd();
  const resolved = resolve(wsDir, targetPath);
  const rel = relative(wsDir, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Access Denied: Path "${targetPath}" resolves outside of workspace.`);
  }
  return resolved;
}
