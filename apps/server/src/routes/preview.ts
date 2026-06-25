import { Hono } from "hono";
import { resolve, normalize, sep, extname } from "node:path";
import { existsSync } from "node:fs";
import { getUsername } from "../lib/auth-helpers";
import { getPreviewState } from "../pi/preview-watcher";

export const previewRouter = new Hono();

const MIME_MAP: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".cjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".map": "application/json",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
};

const ASSET_EXTENSIONS = new Set(Object.keys(MIME_MAP));

function lookupMime(path: string): string {
  const ext = extname(path).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

function isAssetPath(path: string): boolean {
  const ext = extname(path).toLowerCase();
  return ASSET_EXTENSIONS.has(ext);
}

function validatePreviewPath(username: string, repoName: string, reqPath: string): string {
  const workspaceBase = resolve(`/tmp/pi-web-users/${username}/workspace`);
  const distDir = resolve(workspaceBase, "repos", repoName, "dist");

  const normalized = normalize(reqPath || ".");
  const fullPath = resolve(distDir, normalized);

  if (fullPath !== distDir && !fullPath.startsWith(distDir + sep)) {
    throw new Error("Path traversal detected");
  }

  return fullPath;
}

function buildDistIndexPath(username: string, repoName: string): string {
  return resolve(`/tmp/pi-web-users/${username}/workspace/repos/${repoName}/dist/index.html`);
}

function buildPreviewHeaders(contentType: string): Record<string, string> {
  return {
    "Content-Type": contentType,
    "X-Frame-Options": "SAMEORIGIN",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' 'unsafe-inline'; frame-src 'self';",
  };
}

function getRepoName(c: any): string | null {
  const repo = c.req.query("repo");
  if (!repo || typeof repo !== "string") return null;
  if (repo.includes("..") || repo.includes("/")) return null;
  return repo;
}

// GET /api/preview/state?repo=X — returns preview state as JSON
previewRouter.get("/state", async (c) => {
  const username = getUsername(c);
  if (!username) return c.text("Unauthorized", 401);

  const repoName = getRepoName(c);
  if (!repoName) return c.json({ error: "Missing or invalid repo query parameter" }, 400);

  const state = getPreviewState(username, repoName);
  return c.json(state);
});

// GET /api/preview/* — serves static files from dist/
previewRouter.get("/*", async (c) => {
  const username = getUsername(c);
  if (!username) return c.text("Unauthorized", 401);

  const repoName = getRepoName(c);
  if (!repoName) return c.text("Missing or invalid repo query parameter", 400);

  const reqPath = c.req.param("*") || "index.html";

  try {
    // Validate path
    let fullPath: string;
    try {
      fullPath = validatePreviewPath(username, repoName, reqPath);
    } catch {
      return c.text("Forbidden", 403);
    }

    // If exact file exists, serve it
    if (existsSync(fullPath)) {
      const file = Bun.file(fullPath);
      const exists = await file.exists();
      if (exists) {
        return new Response(file.stream(), {
          headers: buildPreviewHeaders(lookupMime(fullPath)),
        });
      }
    }

    // SPA fallback: for non-asset requests, serve index.html
    if (!isAssetPath(reqPath)) {
      const indexPath = buildDistIndexPath(username, repoName);
      if (existsSync(indexPath)) {
        const file = Bun.file(indexPath);
        const exists = await file.exists();
        if (exists) {
          return new Response(file.stream(), {
            headers: buildPreviewHeaders("text/html; charset=utf-8"),
          });
        }
      }
    }

    return c.notFound();
  } catch {
    return c.text("Internal Server Error", 500);
  }
});
