import { resolve, relative, isAbsolute } from "node:path";

/**
 * Resolves targetPath relative to workspaceDir and ensures the resolved path
 * lies within workspaceDir (no directory traversal attacks).
 */
export function resolveSafePath(workspaceDir: string, targetPath: string): string {
  const resolved = resolve(workspaceDir, targetPath);
  const rel = relative(workspaceDir, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Access Denied: Path "${targetPath}" resolves outside of workspace.`);
  }
  return resolved;
}
