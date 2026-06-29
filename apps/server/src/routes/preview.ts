import { Hono } from "hono";
import { resolve, normalize, sep, extname } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { getUsername } from "../lib/auth-helpers";
import { getPreviewState } from "../pi/preview-watcher";
import {
  loadPreviewConfig,
  savePreviewConfig,
  autoDetectConfig,
  getBuildOutputDir,
  getBuildCommand,
} from "../pi/preview-config";
import { runBuild, isBuilding, abortBuild } from "../pi/preview-builder";

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

const BUILD_DIRS = ["dist", "build", ".output"] as const;

function resolveBuildDir(username: string, repoName: string): string | null {
  const workspaceBase = resolve(`/tmp/crewfactory/${username}/workspace`);
  const repoDir = resolve(workspaceBase, "repos", repoName);
  for (const dir of BUILD_DIRS) {
    const candidate = resolve(repoDir, dir);
    if (existsSync(candidate)) return candidate;
  }
  return resolve(repoDir, "dist");
}

function validatePreviewPath(username: string, repoName: string, reqPath: string): string {
  const buildDir = resolveBuildDir(username, repoName);
  if (!buildDir) throw new Error("No build directory found");

  const normalized = normalize(reqPath || ".");
  const fullPath = resolve(buildDir, normalized);

  if (fullPath !== buildDir && !fullPath.startsWith(buildDir + sep)) {
    throw new Error("Path traversal detected");
  }

  return fullPath;
}

function buildIndexPath(username: string, repoName: string): string | null {
  const buildDir = resolveBuildDir(username, repoName);
  if (!buildDir) return null;
  const indexPath = resolve(buildDir, "index.html");
  return existsSync(indexPath) ? indexPath : null;
}

const PREFIX = "/api/preview/";

function rewriteHtml(html: string): string {
  const baseInjected = html.replace(
    /<head[^>]*>/i,
    (match) => `${match}<base href="${PREFIX}">`
  );

  return baseInjected
    .replace(
      /(<(?:script|link|img|source|iframe|video|audio)\s[^>]*?)(src|href|action)\s*=\s*"(\/(?!\/)[^"]*?)"/gi,
      (_, tag, attr, path) => {
        if (path.startsWith(PREFIX) || path.startsWith("//") || path.startsWith("http")) return `${tag}${attr}="${path}"`;
        return `${tag}${attr}="${PREFIX}${path.replace(/^\//, "")}"`;
      }
    )
    .replace(
      /(<(?:script|link|img|source|iframe|video|audio)\s[^>]*?)(src|href|action)\s*=\s*'(\/(?!\/)[^']*?)'/gi,
      (_, tag, attr, path) => {
        if (path.startsWith(PREFIX) || path.startsWith("//") || path.startsWith("http")) return `${tag}${attr}='${path}'`;
        return `${tag}${attr}='${PREFIX}${path.replace(/^\//, "")}'`;
      }
    )
    .replace(
      /(fetch|import)\s*\(\s*"(\/(?!\/)[^"]*?)"/gi,
      (_, call, path) => {
        if (path.startsWith(PREFIX)) return `${call}("${path}"`;
        return `${call}("${PREFIX}${path.replace(/^\//, "")}"`;
      }
    )
    .replace(
      /(fetch|import)\s*\(\s*'(\/(?!\/)[^']*?)'/gi,
      (_, call, path) => {
        if (path.startsWith(PREFIX)) return `${call}('${path}'`;
        return `${call}('${PREFIX}${path.replace(/^\//, "")}'`;
      }
    )
    .replace(
      /(new URL|import\.meta\.url)\s*\(\s*"(\/(?!\/)[^"]*?)"/gi,
      (_, call, path) => {
        if (path.startsWith(PREFIX)) return `${call}("${path}"`;
        return `${call}("${PREFIX}${path.replace(/^\//, "")}"`;
      }
    );
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

// GET /api/preview/config?repo=X — get current preview config
previewRouter.get("/config", async (c) => {
  const username = getUsername(c);
  if (!username) return c.text("Unauthorized", 401);

  const repoName = getRepoName(c);
  if (!repoName) return c.json({ error: "Missing or invalid repo query parameter" }, 400);

  const config = loadPreviewConfig(username, repoName);
  return c.json(config);
});

// POST /api/preview/config?repo=X — save preview config
previewRouter.post("/config", async (c) => {
  const username = getUsername(c);
  if (!username) return c.text("Unauthorized", 401);

  const repoName = getRepoName(c);
  if (!repoName) return c.json({ error: "Missing or invalid repo query parameter" }, 400);

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const saved = savePreviewConfig(username, repoName, {
    framework: body.framework,
    buildCommand: body.buildCommand || undefined,
    outputDir: body.outputDir || undefined,
  });

  return c.json(saved);
});

// POST /api/preview/build?repo=X — trigger build
previewRouter.post("/build", async (c) => {
  const username = getUsername(c);
  if (!username) return c.text("Unauthorized", 401);

  const repoName = getRepoName(c);
  if (!repoName) return c.json({ error: "Missing or invalid repo query parameter" }, 400);

  const config = loadPreviewConfig(username, repoName);
  const result = await runBuild(username, repoName, config);
  return c.json(result);
});

// POST /api/preview/build/abort?repo=X — cancel running build
previewRouter.post("/build/abort", async (c) => {
  const username = getUsername(c);
  if (!username) return c.text("Unauthorized", 401);

  const repoName = getRepoName(c);
  if (!repoName) return c.json({ error: "Missing or invalid repo query parameter" }, 400);

  abortBuild(username, repoName);
  return c.json({ success: true });
});

// GET /api/preview/* — serves static files from build output dir
previewRouter.get("/*", async (c) => {
  const username = getUsername(c);
  if (!username) return c.text("Unauthorized", 401);

  const repoName = getRepoName(c);
  if (!repoName) return c.text("Missing or invalid repo query parameter", 400);

  const reqPath = c.req.param("*") || "index.html";

  try {
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
        const mime = lookupMime(fullPath);
        if (mime.startsWith("text/html")) {
          const original = await file.text();
          const rewritten = rewriteHtml(original);
          return new Response(rewritten, {
            headers: buildPreviewHeaders(mime),
          });
        }
        return new Response(file.stream(), {
          headers: buildPreviewHeaders(mime),
        });
      }
    }

    // SPA fallback: for non-asset requests, serve index.html
    if (!isAssetPath(reqPath)) {
      const indexPath = buildIndexPath(username, repoName);
      if (indexPath && existsSync(indexPath)) {
        const file = Bun.file(indexPath);
        const exists = await file.exists();
        if (exists) {
          const original = await file.text();
          const rewritten = rewriteHtml(original);
          return new Response(rewritten, {
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
