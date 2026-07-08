import { Hono } from "hono";
import { resolve, normalize, sep, extname } from "node:path";
import { existsSync } from "node:fs";
import { getUsername } from "../lib/auth-helpers";
import { getPreviewState } from "../core/preview-watcher";
import {
  loadPreviewConfig,
  savePreviewConfig,
} from "../core/preview-config";
import { runBuild, abortBuild } from "../core/preview-builder";
import { getWorkspaceDir } from "shared";

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

function resolveBuildDir(username: string, projectName: string): string | null {
  const workspaceBase = getWorkspaceDir(username);
  const projectDir = resolve(workspaceBase, "projects", projectName);
  for (const dir of BUILD_DIRS) {
    const candidate = resolve(projectDir, dir);
    if (existsSync(candidate)) return candidate;
  }
  return resolve(projectDir, "dist");
}

function validatePreviewPath(username: string, projectName: string, reqPath: string): string {
  const buildDir = resolveBuildDir(username, projectName);
  if (!buildDir) throw new Error("No build directory found");

  const normalized = normalize(reqPath || ".");
  const fullPath = resolve(buildDir, normalized);

  if (fullPath !== buildDir && !fullPath.startsWith(buildDir + sep)) {
    throw new Error("Path traversal detected");
  }

  return fullPath;
}

function buildIndexPath(username: string, projectName: string): string | null {
  const buildDir = resolveBuildDir(username, projectName);
  if (!buildDir) return null;
  const indexPath = resolve(buildDir, "index.html");
  return existsSync(indexPath) ? indexPath : null;
}

/**
 * Rewrites the served HTML so that all absolute paths point to
 * /api/preview/{username}/{projectName}/ instead of /.
 * This means the browser will request sub-assets through our server
 * without needing any authentication token — the path itself provides isolation.
 */
function rewriteHtml(html: string, username: string, projectName: string): string {
  const prefix = `/api/preview/${encodeURIComponent(username)}/${encodeURIComponent(projectName)}/`;

  // 1. Inject <base href> so relative paths work correctly
  let result = html.replace(
    /<head[^>]*>/i,
    (match) => `${match}<base href="${prefix}">`
  );

  // 2. Strip `crossorigin` attribute — it's not needed for same-origin serving
  //    and causes issues with some browsers treating requests as CORS
  result = result.replace(/\s+crossorigin(?:="[^"]*"|='[^']*'|(?=[>\s]))?/gi, "");

  // 3. Rewrite absolute src/href/action attributes (double-quotes)
  result = result.replace(
    /(<(?:script|link|img|source|iframe|video|audio)\s[^>]*?)(src|href|action)\s*=\s*"(\/(?!\/)[^"]*?)"/gi,
    (_, tag, attr, path) => {
      if (path.startsWith(prefix) || path.startsWith("//") || path.startsWith("http")) {
        return `${tag}${attr}="${path}"`;
      }
      return `${tag}${attr}="${prefix}${path.replace(/^\//, "")}"`;
    }
  );

  // 4. Rewrite absolute src/href/action attributes (single-quotes)
  result = result.replace(
    /(<(?:script|link|img|source|iframe|video|audio)\s[^>]*?)(src|href|action)\s*=\s*'(\/(?!\/)[^']*?)'/gi,
    (_, tag, attr, path) => {
      if (path.startsWith(prefix) || path.startsWith("//") || path.startsWith("http")) {
        return `${tag}${attr}='${path}'`;
      }
      return `${tag}${attr}='${prefix}${path.replace(/^\//, "")}'`;
    }
  );

  // 5. Rewrite fetch/import calls with absolute paths
  result = result.replace(
    /(fetch|import)\s*\(\s*"(\/(?!\/)[^"]*?)"/gi,
    (_, call, path) => {
      if (path.startsWith(prefix)) return `${call}("${path}"`;
      return `${call}("${prefix}${path.replace(/^\//, "")}"`;
    }
  );

  result = result.replace(
    /(fetch|import)\s*\(\s*'(\/(?!\/)[^']*?)'/gi,
    (_, call, path) => {
      if (path.startsWith(prefix)) return `${call}('${path}'`;
      return `${call}('${prefix}${path.replace(/^\//, "")}'`;
    }
  );

  return result;
}

function buildPreviewHeaders(contentType: string): Record<string, string> {
  return {
    "Content-Type": contentType,
    "X-Frame-Options": "SAMEORIGIN",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    // Permissive CSP for user-built apps: allow external fonts, stylesheets, connections
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https: http:; img-src * data: blob:; font-src 'self' data: https: http:; connect-src *; frame-src *;",
  };
}

function getProjectName(c: any): string | null {
  const project = c.req.query("project");
  if (!project || typeof project !== "string") return null;
  if (project.includes("..") || project.includes("/")) return null;
  return project;
}

// GET /api/preview/state?repo=X
previewRouter.get("/state", async (c) => {
  const username = getUsername(c);
  if (!username) return c.text("Unauthorized", 401);

  const projectName = getProjectName(c);
  if (!projectName) return c.json({ error: "Missing or invalid project query parameter" }, 400);

  const state = getPreviewState(username, projectName);
  return c.json(state);
});

// GET /api/preview/config?project=X
previewRouter.get("/config", async (c) => {
  const username = getUsername(c);
  if (!username) return c.text("Unauthorized", 401);

  const projectName = getProjectName(c);
  if (!projectName) return c.json({ error: "Missing or invalid project query parameter" }, 400);

  const config = loadPreviewConfig(username, projectName);
  return c.json(config);
});

// POST /api/preview/config?project=X
previewRouter.post("/config", async (c) => {
  const username = getUsername(c);
  if (!username) return c.text("Unauthorized", 401);

  const projectName = getProjectName(c);
  if (!projectName) return c.json({ error: "Missing or invalid project query parameter" }, 400);

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const saved = savePreviewConfig(username, projectName, {
    framework: body.framework,
    buildCommand: body.buildCommand || undefined,
    outputDir: body.outputDir || undefined,
  });

  return c.json(saved);
});

// POST /api/preview/build?project=X
previewRouter.post("/build", async (c) => {
  const username = getUsername(c);
  if (!username) return c.text("Unauthorized", 401);

  const projectName = getProjectName(c);
  if (!projectName) return c.json({ error: "Missing or invalid project query parameter" }, 400);

  const config = loadPreviewConfig(username, projectName);
  const result = await runBuild(username, projectName, config);
  return c.json(result);
});

// POST /api/preview/build/abort?project=X
previewRouter.post("/build/abort", async (c) => {
  const username = getUsername(c);
  if (!username) return c.text("Unauthorized", 401);

  const projectName = getProjectName(c);
  if (!projectName) return c.json({ error: "Missing or invalid project query parameter" }, 400);

  abortBuild(username, projectName);
  return c.json({ success: true });
});

/**
 * GET /api/preview/:username/:repo/*
 *
 * Serves user-built app static files without authentication.
 * Security: Path-based isolation — the username+projectName in the URL uniquely
 * identifies the user's workspace. No token needed for sub-assets.
 *
 * Dynamic imports, manifests, fonts, and all relative/absolute paths resolve
 * correctly because <base href> is injected and crossorigin is stripped.
 */
previewRouter.get("/:username/:project/*", async (c) => {
  const username = c.req.param("username");
  const projectName = c.req.param("project");

  if (
    !username || !projectName ||
    username.includes("..") || username.includes("/") ||
    projectName.includes("..") || projectName.includes("/")
  ) {
    return c.text("Bad Request", 400);
  }

  const reqPath = c.req.param("*") || "index.html";

  try {
    let fullPath: string;
    try {
      fullPath = validatePreviewPath(username, projectName, reqPath);
    } catch {
      return c.text("Forbidden", 403);
    }

    if (existsSync(fullPath)) {
      const file = Bun.file(fullPath);
      const exists = await file.exists();
      if (exists) {
        const mime = lookupMime(fullPath);
        if (mime.startsWith("text/html")) {
          const original = await file.text();
          const rewritten = rewriteHtml(original, username, projectName);
          return new Response(rewritten, { headers: buildPreviewHeaders(mime) });
        }
        return new Response(await file.arrayBuffer(), { headers: buildPreviewHeaders(mime) });
      }
    }

    if (!isAssetPath(reqPath)) {
      const indexPath = buildIndexPath(username, projectName);
      if (indexPath && existsSync(indexPath)) {
        const file = Bun.file(indexPath);
        const exists = await file.exists();
        if (exists) {
          const original = await file.text();
          const rewritten = rewriteHtml(original, username, projectName);
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
