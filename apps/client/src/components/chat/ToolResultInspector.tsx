import { useState, useEffect } from "react";
import { HtmlPreview } from "./HtmlPreview";
import { ImageGrid } from "./ImageGrid";

interface Props {
  toolName: string;
  args?: Record<string, unknown>;
  result: string | unknown;
  sessionId: string | null;
}

interface FileMarker {
  title: string;
  url: string;
  type: "image" | "html" | "other";
}

function resolveSessionUrl(rawUrl: string, sessionId: string | null): string {
  if (!rawUrl) return "";

  if (rawUrl.startsWith("data:") || rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }

  if (sessionId && (rawUrl.includes("/tmp/") || rawUrl.includes("C:\\tmp\\") || rawUrl.includes("C:/tmp/"))) {
    const sessionMarker = `sessions/${sessionId}/`;
    const idx = rawUrl.indexOf(sessionMarker);
    if (idx !== -1) {
      const relativePath = rawUrl.substring(idx + sessionMarker.length);
      return `/api/sessions/${sessionId}/files/${relativePath.replace(/\\/g, "/")}`;
    }

    const match = rawUrl.match(/sessions\/([a-zA-Z0-9-]+)\/(.+)/);
    if (match) {
      return `/api/sessions/${match[1]}/files/${match[2].replace(/\\/g, "/")}`;
    }

    const baseName = rawUrl.split(/[\\/]/).pop();
    if (baseName) {
      return `/api/sessions/${sessionId}/files/${baseName}`;
    }
  }

  return rawUrl;
}

function getFileType(url: string): "image" | "html" | "other" {
  const ext = url.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(ext)) return "image";
  if (["html", "htm"].includes(ext)) return "html";
  return "other";
}

export function extractFileMarkers(text: string): FileMarker[] {
  if (typeof text !== "string") return [];

  const markers: FileMarker[] = [];

  // Match: === Title ===\npath/url (any extension)
  const markerRegex = /===\s*([^\n]+?)\s*===\s*\n(https?:\/\/[^\s]+|[\w/\\:.-]+\.\w+)/gi;
  let match;
  while ((match = markerRegex.exec(text)) !== null) {
    const title = match[1].trim();
    const url = match[2].trim();
    if (!markers.some((m) => m.url === url)) {
      markers.push({ title, url, type: getFileType(url) });
    }
  }

  // Any standalone image URLs
  const urlRegex = /(https?:\/\/[^\s]+?\.(?:jpg|jpeg|png|webp|gif|svg))/gi;
  const rawMatches = text.match(urlRegex) ?? [];
  for (const url of rawMatches) {
    if (!markers.some((m) => m.url === url)) {
      markers.push({ title: "", url, type: "image" });
    }
  }

  // Local filesystem paths with image extensions
  const localImageRegex = /(?:[a-zA-Z]:[\\/]|[\/])(?:[\w.-]+[\\/])+\w+\.(?:jpg|jpeg|png|webp|gif|svg)/gi;
  const localMatches = text.match(localImageRegex) ?? [];
  for (const path of localMatches) {
    if (!markers.some((m) => m.url === path)) {
      const fileName = path.split(/[\\/]/).pop();
      markers.push({ url: path, title: fileName ?? "", type: "image" });
    }
  }

  return markers;
}

// Legacy exports for backward compat
export function isHtml(text: string): boolean {
  if (typeof text !== "string") return false;
  const trimmed = text.trim();
  return (
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<html") ||
    (trimmed.includes("<head") && trimmed.includes("</html"))
  );
}

export function extractImages(text: string): Array<{ url: string; title?: string }> {
  return extractFileMarkers(text)
    .filter((m) => m.type === "image")
    .map((m) => ({ url: m.url, title: m.title }));
}

export function HtmlFileFetcher({ url, title, sessionId }: { url: string; title: string; sessionId: string | null }) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resolvedUrl = resolveSessionUrl(url, sessionId);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const token = localStorage.getItem("token");
    fetch(resolvedUrl, {
      headers: resolvedUrl.startsWith("/api/") && token
        ? { Authorization: `Bearer ${token}` }
        : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((content) => {
        if (!cancelled) {
          setHtml(content);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [resolvedUrl]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-text-secondary font-sans bg-surface rounded-lg border border-surface-hover">
        <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        Loading {title || "HTML file"}...
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-3 py-2 text-[11px] text-error font-sans bg-surface rounded-lg border border-error/30">
        Error loading {title || "HTML file"}: {error}
      </div>
    );
  }

  if (html) {
    return <HtmlPreview html={html} />;
  }

  return null;
}

function MediaRenderer({ markers, sessionId }: { markers: FileMarker[]; sessionId: string | null }) {
  const imageMarkers = markers.filter((m) => m.type === "image");
  const htmlMarkers = markers.filter((m) => m.type === "html");

  if (markers.length === 0) return null;

  return (
    <div className="space-y-3">
      {htmlMarkers.map((m, i) => (
        <HtmlFileFetcher key={`html-${i}`} url={m.url} title={m.title} sessionId={sessionId} />
      ))}
      {imageMarkers.length > 0 && (
        <ImageGrid
          images={imageMarkers.map((m) => ({ url: m.url, title: m.title }))}
          sessionId={sessionId}
        />
      )}
    </div>
  );
}

export function ToolResultInspector({ toolName, args, result, sessionId }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const resultStr = typeof result === "string"
    ? result
    : JSON.stringify(result, null, 2) ?? "";

  const markers = extractFileMarkers(resultStr);
  const htmlOutput = isHtml(resultStr) ? resultStr : null;
  const hasInlineHtml = htmlOutput !== null;
  const hasMediaMarkers = markers.length > 0;

  return (
    <div className="w-full my-1 rounded-lg border border-surface-hover bg-surface overflow-hidden text-xs font-sans">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-surface-hover/50 transition-colors text-left cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" />
          <span className="font-mono font-semibold text-text-primary truncate">{toolName}</span>
          <span className="text-[10px] text-text-secondary/50">executed</span>
        </div>
        <svg
          width="12"
          height="12"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`text-text-secondary transition-transform ${isOpen ? "rotate-90" : ""}`}
        >
          <path
            fillRule="evenodd"
            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="border-t border-surface-hover">
          {args && Object.keys(args).length > 0 && (
            <div className="px-3 py-1.5 bg-code-bg border-b border-surface-hover/40 text-[10px] text-text-secondary font-mono break-all">
              <span className="text-text-secondary/50">params:</span>{" "}
              {JSON.stringify(args)}
            </div>
          )}

          <div className="p-3 space-y-3">
            {hasInlineHtml ? (
              <HtmlPreview html={htmlOutput} />
            ) : hasMediaMarkers ? (
              <MediaRenderer markers={markers} sessionId={sessionId} />
            ) : (
              <pre className="whitespace-pre-wrap break-words text-text-secondary text-[11px] font-mono leading-relaxed bg-code-bg p-2.5 rounded-md max-h-96 overflow-y-auto">
                {resultStr}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
