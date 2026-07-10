import { useState } from "react";
import { useLiterals } from "@/lib";
import { RichMarkdown } from "./RichMarkdown";
import { resolveFileUrl, extractFileMarkers, isHtml, HtmlFileFetcher } from "./ToolResultInspector";
import { HtmlPreview } from "./HtmlPreview";
import { ImageGrid } from "./ImageGrid";
import { literals as ml } from "./MessageBlocks.literals";

function LightningIcon({ className }: { className?: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" className={`flex-shrink-0 ${className ?? ""}`}>
      <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor" className={`transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`}>
      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );
}

export function ThinkingBlock({ thinking, isStreaming }: { thinking: string; isStreaming?: boolean }) {
  const [open, setOpen] = useState(false);
  const l = useLiterals(ml);
  const previewText = thinking.trim().replace(/\n/g, " ");

  return (
    <div className="my-1.5">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className={`flex items-center gap-1.5 w-full text-left pl-2 pr-2 py-1 rounded-r cursor-pointer select-none transition-colors hover:bg-primary/10 text-[11px] font-mono text-muted-foreground/70 border-l-2 min-w-0 ${isStreaming ? "border-primary animate-pulse" : "border-primary/20"}`}
        >
          <LightningIcon className={isStreaming ? "text-primary" : ""} />
          <span className="truncate">{previewText}</span>
        </button>
      ) : (
        <>
          <button
            onClick={() => setOpen(false)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-muted-foreground transition-colors cursor-pointer select-none"
          >
            <LightningIcon />
            <span className="font-sans">{l.hideReasoning}</span>
            <ChevronIcon open={open} />
          </button>
          <div className="mt-1.5 pl-4 border-l-2 border-primary/20 text-[11px] text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
            {thinking}
          </div>
        </>
      )}
    </div>
  );
}

export function AssistantTextBlock({
  text,
  sessionId,
  activeProjectName,
  activeAgentId = null,
  activeChannelId = null,
}: {
  text: string;
  sessionId: string | null;
  activeProjectName?: string | null;
  activeAgentId?: string | null;
  activeChannelId?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const htmlOutput = isHtml(text) ? text : null;
  const markers = extractFileMarkers(text);
  const imageMarkers = markers.filter(m => m.type === "image");
  const htmlMarkers = markers.filter(m => m.type === "html");
  const pdfMarkers = markers.filter(m => m.type === "pdf");
  const audioMarkers = markers.filter(m => m.type === "audio");
  const videoMarkers = markers.filter(m => m.type === "video");
  const officeMarkers = markers.filter(m => m.type === "office" || m.type === "other");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const copyButton = (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded-md bg-card/80 hover:bg-card border border-border/50 hover:border-primary/30 text-text-secondary hover:text-text-primary transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm"
      title={copied ? "Copiado!" : "Copiar mensaje"}
    >
      {copied ? (
        <svg className="w-3.5 h-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );

  if (htmlOutput || markers.length > 0) {
    const token = localStorage.getItem("token");
    return (
      <div className="relative group">
        {copyButton}
        <div className="space-y-3">
        {htmlOutput && <HtmlPreview html={htmlOutput} />}
        {htmlMarkers.map((m, i) => (
          <HtmlFileFetcher
            key={`html-${i}`}
            url={m.url}
            title={m.title}
            sessionId={sessionId}
            activeProjectName={activeProjectName}
            activeAgentId={activeAgentId}
            activeChannelId={activeChannelId}
          />
        ))}
        {imageMarkers.length > 0 && (
          <ImageGrid
            images={imageMarkers.map(m => ({ url: m.url, title: m.title }))}
            sessionId={sessionId}
            activeProjectName={activeProjectName}
            activeAgentId={activeAgentId}
            activeChannelId={activeChannelId}
          />
        )}

        {pdfMarkers.map((m, i) => {
          const resolved = resolveFileUrl(m.url, sessionId, activeProjectName, activeAgentId, activeChannelId);
          const fileUrl = resolved.startsWith("/api/") && token ? `${resolved}&token=${token}` : resolved;
          return (
            <div key={`pdf-${i}`} className="w-full h-96 rounded-lg border border-input overflow-hidden bg-card flex flex-col font-sans">
              <div className="bg-card-hover/50 px-3 py-1.5 border-b border-input flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="font-medium truncate">PDF Preview: {m.title || "Document"}</span>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 hover:bg-primary/25 text-primary font-semibold transition-colors cursor-pointer"
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
          const resolved = resolveFileUrl(m.url, sessionId, activeProjectName, activeAgentId, activeChannelId);
          const fileUrl = resolved.startsWith("/api/") && token ? `${resolved}&token=${token}` : resolved;
          return (
            <div key={`audio-${i}`} className="w-full p-3 bg-card border border-input rounded-lg flex flex-col gap-1.5 font-sans">
              <span className="text-[11px] font-semibold text-muted-foreground truncate">{m.title || "Audio output"}</span>
              <audio controls src={fileUrl} className="w-full h-8 outline-none animate-fade-in" />
            </div>
          );
        })}

        {videoMarkers.map((m, i) => {
          const resolved = resolveFileUrl(m.url, sessionId, activeProjectName, activeAgentId, activeChannelId);
          const fileUrl = resolved.startsWith("/api/") && token ? `${resolved}&token=${token}` : resolved;
          return (
            <div key={`video-${i}`} className="w-full p-2 bg-card border border-input rounded-lg flex flex-col gap-1.5 font-sans">
              <span className="text-[11px] font-semibold text-muted-foreground truncate">{m.title || "Video output"}</span>
              <video controls src={fileUrl} className="w-full rounded border border-input max-h-96" />
            </div>
          );
        })}

        {officeMarkers.map((m, i) => {
          const resolved = resolveFileUrl(m.url, sessionId, activeProjectName, activeAgentId, activeChannelId);
          const fileUrl = resolved.startsWith("/api/") && token ? `${resolved}&token=${token}` : resolved;
          const filename = m.title || m.url.split(/[\\/]/).pop() || "file";
          const extension = m.url.split(".").pop() || "file";
          return (
            <div key={`file-${i}`} className="flex items-center justify-between p-3 bg-card border border-input rounded-lg font-sans">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded bg-primary/15 flex items-center justify-center text-primary text-xs font-extrabold select-none shrink-0 border border-primary/20 uppercase">
                  {extension.substring(0, 3)}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-foreground truncate">{filename}</span>
                  <span className="text-xs text-muted-foreground uppercase font-mono">{extension}</span>
                </div>
              </div>
              <a
                href={fileUrl}
                download={filename}
                className="px-3 py-1.5 text-[11px] font-semibold rounded bg-primary text-background hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center shrink-0"
              >
                Download
              </a>
            </div>
          );
        })}

        {!htmlOutput && <RichMarkdown content={text} />}
        </div>
      </div>
    );
  }
  return (
    <div className="relative group">
      {copyButton}
      <RichMarkdown content={text} />
    </div>
  );
}
