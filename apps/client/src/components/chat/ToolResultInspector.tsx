import { useState } from "react";
import { HtmlPreview } from "./HtmlPreview";
import { ImageGrid } from "./ImageGrid";

interface Props {
  toolName: string;
  args?: Record<string, unknown>;
  result: string | unknown;
  sessionId: string | null;
}

// Parses results for HTML documents
function isHtml(text: string): boolean {
  if (typeof text !== "string") return false;
  const trimmed = text.trim();
  return (
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<html") ||
    (trimmed.includes("<head") && trimmed.includes("</html"))
  );
}

// Parses result text to extract image URLs and headers
function extractImages(text: string): Array<{ url: string; title?: string }> {
  if (typeof text !== "string") return [];

  const images: Array<{ url: string; title?: string }> = [];

  // Match: === Title.jpg ===\nhttp://...
  const markerRegex = /===\s*([^\n]+?)\s*===\s*\n(https?:\/\/[^\s]+|[\w/\\:.-]+\.(?:jpg|jpeg|png|webp|gif))/gi;
  let match;
  while ((match = markerRegex.exec(text)) !== null) {
    images.push({ title: match[1], url: match[2] });
  }

  // Also match any raw images listed: file: ... or image: ...
  const urlRegex = /(https?:\/\/[^\s]+?\.(?:jpg|jpeg|png|webp|gif))/gi;
  const rawMatches = text.match(urlRegex) ?? [];
  for (const url of rawMatches) {
    if (!images.some((img) => img.url === url)) {
      images.push({ url });
    }
  }

  // Local filesystem path matching (e.g. C:\tmp\...)
  const localRegex = /(?:[a-zA-Z]:[\\/]|[\/])(?:[\w.-]+[\\/])+\w+\.(?:jpg|jpeg|png|webp|gif)/gi;
  const localMatches = text.match(localRegex) ?? [];
  for (const path of localMatches) {
    if (!images.some((img) => img.url === path)) {
      const fileName = path.split(/[\\/]/).pop();
      images.push({ url: path, title: fileName });
    }
  }

  return images;
}

export function ToolResultInspector({ toolName, args, result, sessionId }: Props) {
  const [expanded, setExpanded] = useState(false);

  const resultStr = typeof result === "string"
    ? result
    : JSON.stringify(result, null, 2) ?? "";
  const isLarge = resultStr.length > 300;
  const displayResult = expanded || !isLarge ? resultStr : resultStr.substring(0, 300) + "...";

  const images = extractImages(resultStr);
  const htmlOutput = isHtml(resultStr) ? resultStr : null;

  return (
    <div className="my-3 rounded-lg border border-surface-hover bg-surface overflow-hidden text-xs font-sans">
      <div className="bg-surface-hover/30 px-3 py-2 border-b border-surface-hover flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-warning" />
          <span className="font-mono font-semibold text-text-primary">{toolName}</span>
          <span className="text-[10px] text-text-secondary/70">executed</span>
        </div>
      </div>

      {args && Object.keys(args).length > 0 && (
        <div className="px-3 py-1.5 bg-[#171717]/40 border-b border-surface-hover/40 text-[10px] text-text-secondary font-mono">
          <span className="text-text-secondary/50">params:</span>{" "}
          {JSON.stringify(args)}
        </div>
      )}

      <div className="p-3">
        {htmlOutput ? (
          <HtmlPreview html={htmlOutput} />
        ) : (
          <div>
            <pre className="whitespace-pre-wrap break-words text-text-secondary text-[11px] font-mono leading-relaxed bg-[#171717]/40 p-2.5 rounded-md">
              {displayResult}
            </pre>
            {isLarge && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="mt-2 text-accent hover:underline text-[10px] font-semibold cursor-pointer"
              >
                {expanded ? "Show Less" : "Expand Tool Output"}
              </button>
            )}
          </div>
        )}

        {images.length > 0 && (
          <div className="mt-3">
            <div className="text-[10px] font-semibold text-text-secondary/70 uppercase tracking-wider mb-1.5">
              Extracted Images
            </div>
            <ImageGrid images={images} sessionId={sessionId} />
          </div>
        )}
      </div>
    </div>
  );
}
