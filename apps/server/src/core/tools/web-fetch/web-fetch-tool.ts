import { resolveAndValidate, validateUrl } from "./security";
import { extractContent } from "./extractor";
import { webFetchCache, type CacheEntry } from "./cache";
import { rateLimiter } from "./rate-limiter";

export interface WebFetchOptions {
  username: string;
}

export interface WebFetchArgs {
  url: string;
  extractMode?: "auto" | "text" | "markdown";
  maxChars?: number;
  forceRefresh?: boolean;
}

export function createWebFetchTool(opts: WebFetchOptions) {
  return {
    name: "web_fetch",
    label: "Web Fetch",
    description: "Fetch and extract text content from a web URL. Returns cleaned, sanitized text suitable for LLM processing. Works on server-rendered pages.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to fetch. Must be http or https.",
        },
        extractMode: {
          type: "string",
          enum: ["auto", "text", "markdown"],
          default: "auto",
          description: "auto=readability+markdown (best), text=plain text extraction, markdown=force markdown conversion",
        },
        maxChars: {
          type: "integer",
          default: 50000,
          minimum: 1000,
          maximum: 100000,
          description: "Maximum characters to return to the LLM context",
        },
        forceRefresh: {
          type: "boolean",
          default: false,
          description: "If true, bypass cache and refetch",
        },
      },
      required: ["url"],
    },
    execute: async (toolCallId: string, rawArgs: any, parentSignal?: AbortSignal) => {
      const args = rawArgs as WebFetchArgs;
      const urlString = args.url;
      const extractMode = args.extractMode || "auto";
      const maxChars = Math.min(args.maxChars || 50000, 100000);
      const forceRefresh = !!args.forceRefresh;

      // 1. Initial URL Schema & Host Validation
      const urlValidation = validateUrl(urlString);
      if (!urlValidation.valid) {
        return {
          content: [{ type: "text", text: `Blocked URL: ${urlValidation.reason}` }],
          isError: true,
        };
      }

      // 2. Cache Check (if not forced refresh)
      if (!forceRefresh) {
        const cachedEntry = webFetchCache.get(urlString);
        if (cachedEntry) {
          const contentText = extractMode === "text" ? cachedEntry.textContent : cachedEntry.markdown;
          const truncated = contentText.length > maxChars;
          const returnedText = truncated 
            ? contentText.substring(0, maxChars) + "\n\n... [Content Truncated for Context Length] ..."
            : contentText;

          return {
            content: [{ type: "text", text: returnedText }],
            details: {
              ...cachedEntry,
              cached: true,
              truncated,
              returnedSize: returnedText.length,
            },
          };
        }
      }

      const parsedUrl = new URL(urlString);
      const startTime = Date.now();

      // 3. Acquire Rate Limiter
      try {
        await rateLimiter.acquire(parsedUrl.hostname, parentSignal);
      } catch (err) {
        return {
          content: [{ type: "text", text: `Rate limiting queue failed: ${String(err)}` }],
          isError: true,
        };
      }

      let response: Response;
      let finalUrl = urlString;

      try {
        // 4. Fetch with SSRF validation on redirects (max 5 hops)
        const fetchResult = await safeFetchWithRedirects(urlString, parentSignal);
        response = fetchResult.response;
        finalUrl = fetchResult.finalUrl;

        // 5. Validate Content-Type and Status Code
        if (!response.ok) {
          rateLimiter.release();
          return {
            content: [{ type: "text", text: `Fetch failed with status ${response.status}: ${response.statusText}` }],
            isError: true,
            details: { statusCode: response.status },
          };
        }

        const contentType = response.headers.get("content-type") || "";
        const mimeType = contentType.split(";")[0].trim().toLowerCase();
        
        const ALLOWED_CONTENT_TYPES = [
          "text/html", "text/plain", "application/json",
          "application/xml", "text/xml", "text/markdown",
          "text/csv", "application/javascript",
          "application/xhtml+xml"
        ];

        if (!ALLOWED_CONTENT_TYPES.some(t => mimeType.startsWith(t)) && !mimeType.startsWith("text/")) {
          rateLimiter.release();
          return {
            content: [{ type: "text", text: `Blocked content type: ${mimeType}. Only text-based pages are supported.` }],
            isError: true,
          };
        }

        // 6. Read stream with 10MB limit
        const MAX_BYTES = 10 * 1024 * 1024; // 10MB
        const rawContent = await readResponseBody(response, MAX_BYTES);
        rateLimiter.release();

        const originalSize = rawContent.length;

        // 7. Extract Content
        const extracted = extractContent(rawContent, finalUrl);
        const fetchDurationMs = Date.now() - startTime;

        // 8. Cache the full result
        const cacheEntry: CacheEntry = {
          url: urlString,
          title: extracted.title,
          markdown: extracted.markdown,
          textContent: extracted.textContent,
          contentType: mimeType,
          excerpt: extracted.excerpt,
          siteName: extracted.siteName,
          extractionMethod: extracted.extractionMethod,
          fetchedAt: Date.now(),
          etag: response.headers.get("etag") || undefined,
          lastModified: response.headers.get("last-modified") || undefined,
          originalSize,
          extractedSize: extracted.markdown.length,
        };

        webFetchCache.set(urlString, cacheEntry);

        // 9. Truncate for LLM return limit
        const contentText = extractMode === "text" ? extracted.textContent : extracted.markdown;
        const truncated = contentText.length > maxChars;
        const returnedText = truncated 
          ? contentText.substring(0, maxChars) + "\n\n... [Content Truncated for Context Length] ..."
          : contentText;

        return {
          content: [{ type: "text", text: returnedText }],
          details: {
            ...cacheEntry,
            cached: false,
            truncated,
            fetchDurationMs,
            statusCode: response.status,
            returnedSize: returnedText.length,
          },
        };

      } catch (error) {
        rateLimiter.release();
        return {
          content: [{ type: "text", text: `Web fetch error: ${String(error)}` }],
          isError: true,
        };
      }
    },
  };
}

async function safeFetchWithRedirects(
  initialUrl: string,
  signal?: AbortSignal,
  timeoutMs = 15000
): Promise<{ response: Response; finalUrl: string }> {
  const MAX_REDIRECTS = 5;
  let currentUrl = initialUrl;

  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    const dnsCheck = await resolveAndValidate(currentUrl);
    if (!dnsCheck.valid) {
      throw new Error(`SSRF validation failed at redirect hop ${hop}: ${dnsCheck.reason}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    if (signal) {
      signal.addEventListener("abort", () => controller.abort());
    }

    try {
      const response = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": "CrewFactoryWebFetch/1.0 (Security-Validated Bot)",
          "Accept": "text/html, text/plain, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const status = response.status;
      if (status >= 300 && status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          return { response, finalUrl: currentUrl };
        }
        const nextUrl = new URL(location, currentUrl).toString();
        currentUrl = nextUrl;
        continue;
      }

      return { response, finalUrl: currentUrl };
    } catch (e) {
      clearTimeout(timeoutId);
      throw e;
    }
  }

  throw new Error("Too many redirects (max 5)");
}

async function readResponseBody(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return await response.text();
  }

  let totalBytes = 0;
  const chunks: Uint8Array[] = [];
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.length;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        const allowedLength = maxBytes - (totalBytes - value.length);
        if (allowedLength > 0) {
          chunks.push(value.slice(0, allowedLength));
        }
        break;
      }
      chunks.push(value);
    }
  } catch (error) {
    // Return what we have so far
  } finally {
    reader.releaseLock();
  }

  return chunks.map(chunk => decoder.decode(chunk, { stream: true })).join("") + decoder.decode();
}
