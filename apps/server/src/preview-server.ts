import { resolve, normalize, sep, extname } from "node:path";
import { existsSync } from "node:fs";

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

function lookupMime(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

function isAsset(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return ext !== "" && MIME_MAP[ext] !== undefined && !ext.match(/\.(html?)/);
}

const BUILD_DIRS = ["dist", "build", ".output"] as const;

function resolveBuildDir(username: string, repo: string): string {
  const repoDir = resolve(`/tmp/crewfactory/${username}/repos/${repo}/workspace`);
  for (const dir of BUILD_DIRS) {
    const candidate = resolve(repoDir, dir);
    if (existsSync(candidate)) return candidate;
  }
  return resolve(repoDir, "dist");
}

/**
 * Rewrites the HTML for iframe rendering:
 * 1. Injects <base href="/{username}/{repo}/"> so relative asset paths resolve correctly
 * 2. Strips `crossorigin` attribute (not needed when preview server is origin-isolated)
 * 3. Rewrites absolute paths (/assets/...) to the scoped preview path
 */
function rewriteHtml(html: string, username: string, repo: string): string {
  const prefix = `/${encodeURIComponent(username)}/${encodeURIComponent(repo)}/`;

  let result = html.replace(
    /<head[^>]*>/i,
    (m) => `${m}<base href="${prefix}">`
  );

  result = result.replace(/\s+crossorigin(?:="[^"]*"|='[^']*'|(?=[>\s]))?/gi, "");

  result = result.replace(
    /(<(?:script|link|img|source|iframe|video|audio)\s[^>]*?)(src|href|action)\s*=\s*"(\/(?!\/)[^"]*?)"/gi,
    (_, tag, attr, path) => {
      if (path.startsWith(prefix) || path.startsWith("//") || path.startsWith("http")) {
        return `${tag}${attr}="${path}"`;
      }
      return `${tag}${attr}="${prefix}${path.replace(/^\//, "")}"`;
    }
  );

  result = result.replace(
    /(<(?:script|link|img|source|iframe|video|audio)\s[^>]*?)(src|href|action)\s*=\s*'(\/(?!\/)[^']*?)'/gi,
    (_, tag, attr, path) => {
      if (path.startsWith(prefix) || path.startsWith("//") || path.startsWith("http")) {
        return `${tag}${attr}='${path}'`;
      }
      return `${tag}${attr}='${prefix}${path.replace(/^\//, "")}'`;
    }
  );

  return result;
}

function htmlHeaders(contentType: string): Record<string, string> {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Access-Control-Allow-Origin": "*",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https: http:; img-src * data: blob:; font-src 'self' data: https: http:; connect-src *; frame-src *;",
  };
}

function assetHeaders(contentType: string): Record<string, string> {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Access-Control-Allow-Origin": "*",
  };
}

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts.length < 2) {
    return new Response("Not Found", { status: 404 });
  }

  const username = decodeURIComponent(parts[0]);
  const repo = decodeURIComponent(parts[1]);
  const filePath = parts.slice(2).join("/") || "index.html";

  if (username.includes("..") || repo.includes("..") || filePath.includes("..")) {
    return new Response("Bad Request", { status: 400 });
  }

  const buildDir = resolveBuildDir(username, repo);
  const normalized = normalize(filePath);
  const fullPath = resolve(buildDir, normalized);

  if (fullPath !== buildDir && !fullPath.startsWith(buildDir + sep)) {
    return new Response("Forbidden", { status: 403 });
  }

  if (existsSync(fullPath)) {
    const file = Bun.file(fullPath);
    if (await file.exists()) {
      const mime = lookupMime(fullPath);
      if (mime.startsWith("text/html")) {
        const rewritten = rewriteHtml(await file.text(), username, repo);
        return new Response(rewritten, { headers: htmlHeaders(mime) });
      }
      return new Response(await file.arrayBuffer(), { headers: assetHeaders(mime) });
    }
  }

  if (!isAsset(filePath)) {
    const indexPath = resolve(buildDir, "index.html");
    if (existsSync(indexPath)) {
      const file = Bun.file(indexPath);
      if (await file.exists()) {
        const rewritten = rewriteHtml(await file.text(), username, repo);
        return new Response(rewritten, {
          headers: htmlHeaders("text/html; charset=utf-8"),
        });
      }
    }
  }

  return new Response("Not Found", { status: 404 });
}

export function startPreviewServer(): void {
  const port = parseInt(process.env.PREVIEW_PORT ?? "3001");

  Bun.serve({
    port,
    async fetch(req) {
      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
          },
        });
      }
      try {
        return await handleRequest(req);
      } catch {
        return new Response("Internal Server Error", { status: 500 });
      }
    },
  });

  console.log(`Preview server running at http://0.0.0.0:${port}`);
}
