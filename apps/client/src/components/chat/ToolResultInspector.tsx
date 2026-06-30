import { useState, useEffect } from "react";
import { HtmlPreview } from "./HtmlPreview";
import { ImageGrid } from "./ImageGrid";

interface Props {
  toolName: string;
  args?: Record<string, unknown>;
  result: string | unknown;
  sessionId: string | null;
  activeRepoName?: string | null;
}

export type MediaType = "image" | "html" | "pdf" | "audio" | "video" | "office" | "other";

interface FileMarker {
  title: string;
  url: string;
  type: MediaType;
}

export function resolveFileUrl(rawUrl: string, sessionId: string | null, activeRepoName?: string | null): string {
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

  let cleanPath = rawUrl.replace(/\\/g, "/");
  if (cleanPath.startsWith("workspace/")) {
    cleanPath = cleanPath.substring("workspace/".length);
  }
  return `/api/workspace/${cleanPath}?repo=${activeRepoName || ""}&raw=true`;
}

export function getFileType(url: string): MediaType {
  const ext = url.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(ext)) return "image";
  if (["html", "htm"].includes(ext)) return "html";
  if (ext === "pdf") return "pdf";
  if (["mp3", "wav", "ogg", "m4a", "aac"].includes(ext)) return "audio";
  if (["mp4", "webm", "ogv", "avi", "mov"].includes(ext)) return "video";
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt", "md"].includes(ext)) return "office";
  return "other";
}

export function extractFileMarkers(text: string): FileMarker[] {
  if (typeof text !== "string") return [];

  const markers: FileMarker[] = [];

  const getBasename = (path: string) => {
    return path.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
  };

  const isDuplicate = (path: string) => {
    const base = getBasename(path);
    return markers.some((m) => getBasename(m.url) === base);
  };

  // Match: === Title ===\npath/url (any extension)
  const markerRegex = /===\s*([^\n]+?)\s*===\s*\n(https?:\/\/[^\s]+|[\w/\\:.-]+\.\w+)/gi;
  let match;
  while ((match = markerRegex.exec(text)) !== null) {
    const title = match[1].trim();
    const url = match[2].trim();
    if (!isDuplicate(url)) {
      markers.push({ title, url, type: getFileType(url) });
    }
  }

  // Any standalone image URLs
  const urlRegex = /(https?:\/\/[^\s]+?\.(?:jpg|jpeg|png|webp|gif|svg))/gi;
  const rawMatches = text.match(urlRegex) ?? [];
  for (const url of rawMatches) {
    if (!isDuplicate(url)) {
      markers.push({ title: "", url, type: "image" });
    }
  }

  // Local filesystem paths with image extensions
  const localImageRegex = /(?:[a-zA-Z]:[\\/]|[\/])(?:[\w.-]+[\\/])+\w+\.(?:jpg|jpeg|png|webp|gif|svg)/gi;
  const localMatches = text.match(localImageRegex) ?? [];
  for (const path of localMatches) {
    if (!isDuplicate(path)) {
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

export function HtmlFileFetcher({ url, title, sessionId, activeRepoName }: { url: string; title: string; sessionId: string | null; activeRepoName?: string | null }) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resolvedUrl = resolveFileUrl(url, sessionId, activeRepoName);

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

function MediaRenderer({ markers, sessionId, activeRepoName }: { markers: FileMarker[]; sessionId: string | null; activeRepoName?: string | null }) {
  const imageMarkers = markers.filter((m) => m.type === "image");
  const htmlMarkers = markers.filter((m) => m.type === "html");
  const pdfMarkers = markers.filter((m) => m.type === "pdf");
  const audioMarkers = markers.filter((m) => m.type === "audio");
  const videoMarkers = markers.filter((m) => m.type === "video");
  const officeMarkers = markers.filter((m) => m.type === "office" || m.type === "other");

  if (markers.length === 0) return null;

  const token = localStorage.getItem("token");

  return (
    <div className="space-y-3">
      {htmlMarkers.map((m, i) => (
        <HtmlFileFetcher key={`html-${i}`} url={m.url} title={m.title} sessionId={sessionId} activeRepoName={activeRepoName} />
      ))}
      
      {imageMarkers.length > 0 && (
        <ImageGrid
          images={imageMarkers.map((m) => ({ url: m.url, title: m.title }))}
          sessionId={sessionId}
          activeRepoName={activeRepoName}
        />
      )}

      {pdfMarkers.map((m, i) => {
        const resolved = resolveFileUrl(m.url, sessionId, activeRepoName);
        const fileUrl = resolved.startsWith("/api/") && token ? `${resolved}&token=${token}` : resolved;
        return (
          <div key={`pdf-${i}`} className="w-full h-96 rounded-lg border border-surface-hover overflow-hidden bg-surface flex flex-col font-sans">
            <div className="bg-surface-hover/50 px-3 py-1.5 border-b border-surface-hover flex items-center justify-between text-[11px] text-text-secondary">
              <span className="font-medium truncate">PDF Preview: {m.title || "Document"}</span>
              <a
                href={fileUrl}
                target="_blank"
                rel="noreferrer"
                className="px-2 py-0.5 rounded bg-accent/10 border border-accent/20 hover:bg-accent/25 text-accent font-semibold transition-colors cursor-pointer"
              >
                Open in New Tab
              </a>
            </div>
            <iframe
              src={fileUrl}
              className="w-full flex-1 border-0"
              title={m.title || "PDF document"}
            />
          </div>
        );
      })}

      {audioMarkers.map((m, i) => {
        const resolved = resolveFileUrl(m.url, sessionId, activeRepoName);
        const fileUrl = resolved.startsWith("/api/") && token ? `${resolved}&token=${token}` : resolved;
        return (
          <div key={`audio-${i}`} className="w-full p-3 bg-surface border border-surface-hover rounded-lg flex flex-col gap-1.5 font-sans">
            <span className="text-[11px] font-semibold text-text-secondary truncate">{m.title || "Audio output"}</span>
            <audio controls src={fileUrl} className="w-full h-8 outline-none" />
          </div>
        );
      })}

      {videoMarkers.map((m, i) => {
        const resolved = resolveFileUrl(m.url, sessionId, activeRepoName);
        const fileUrl = resolved.startsWith("/api/") && token ? `${resolved}&token=${token}` : resolved;
        return (
          <div key={`video-${i}`} className="w-full p-2 bg-surface border border-surface-hover rounded-lg flex flex-col gap-1.5 font-sans">
            <span className="text-[11px] font-semibold text-text-secondary truncate">{m.title || "Video output"}</span>
            <video controls src={fileUrl} className="w-full rounded border border-surface-hover max-h-96" />
          </div>
        );
      })}

      {officeMarkers.map((m, i) => {
        const resolved = resolveFileUrl(m.url, sessionId, activeRepoName);
        const fileUrl = resolved.startsWith("/api/") && token ? `${resolved}&token=${token}` : resolved;
        const filename = m.title || m.url.split(/[\\/]/).pop() || "file";
        const extension = m.url.split(".").pop() || "file";
        return (
          <div key={`file-${i}`} className="flex items-center justify-between p-3 bg-surface border border-surface-hover rounded-lg font-sans">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded bg-accent/15 flex items-center justify-center text-accent text-[10px] font-extrabold select-none shrink-0 border border-accent/20 uppercase">
                {extension.substring(0, 3)}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-text-primary truncate">{filename}</span>
                <span className="text-[9px] text-text-secondary/50 uppercase font-mono">{extension}</span>
              </div>
            </div>
            <a
              href={fileUrl}
              download={filename}
              className="px-3 py-1.5 text-[11px] font-semibold rounded bg-accent text-bg hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center shrink-0"
            >
              Download
            </a>
          </div>
        );
      })}
    </div>
  );
}

export function ToolResultInspector({ toolName, args, result, sessionId, activeRepoName }: Props) {
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
              <MediaRenderer markers={markers} sessionId={sessionId} activeRepoName={activeRepoName} />
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
