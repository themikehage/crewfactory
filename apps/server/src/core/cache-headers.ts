import type { Context } from "hono";
import { statSync, existsSync } from "node:fs";

export function applyCacheHeaders(
  c: Context,
  filePath: string,
  opts?: { immutable?: boolean; maxAge?: number }
): Response | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      return null;
    }

    const mtime = stat.mtime;
    const mtimeMs = stat.mtimeMs;
    const etag = `W/"${mtimeMs.toString(16)}"`;
    const lastModified = mtime.toUTCString();

    const maxAge = opts?.maxAge ?? 3600; // 1 hour default
    const cacheControl = opts?.immutable
      ? `public, max-age=${opts.maxAge ?? 31536000}, immutable`
      : `public, max-age=${maxAge}`;

    // Set validation headers
    c.header("ETag", etag);
    c.header("Last-Modified", lastModified);
    c.header("Cache-Control", cacheControl);

    // Conditional GET validation
    const ifNoneMatch = c.req.header("If-None-Match");
    if (ifNoneMatch && ifNoneMatch.trim() === etag) {
      return new Response(null, { status: 304 });
    }

    const ifModifiedSince = c.req.header("If-Modified-Since");
    if (ifModifiedSince) {
      const clientTime = Date.parse(ifModifiedSince);
      // Compare ignoring milliseconds
      const serverTimeSecObj = new Date(mtime);
      serverTimeSecObj.setMilliseconds(0);
      const serverTimeSec = serverTimeSecObj.getTime();
      
      if (!isNaN(clientTime) && serverTimeSec <= clientTime) {
        return new Response(null, { status: 304 });
      }
    }
  } catch (err) {
    console.error("[Cache Headers] Error applying headers:", err);
  }

  return null;
}
