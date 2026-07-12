import { useState } from "react";
import { motion } from "framer-motion";

interface Props {
  html: string;
  title?: string;
  fullBleed?: boolean;
}

const SCROLLBAR_STYLES = `<style>
  :root { color-scheme: dark; }
  html { scrollbar-width: thin; scrollbar-color: #313131 #171717; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: #171717; }
  ::-webkit-scrollbar-thumb { background: #313131; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #4ade80; }
</style>`;

function injectScrollbarStyles(raw: string): string {
  if (raw.includes("</head>") || raw.includes("</HEAD>")) {
    return raw.replace(/(<\/head\s*>)/i, `${SCROLLBAR_STYLES}$1`);
  }
  if (raw.includes("<html") || raw.includes("<HTML")) {
    return raw.replace(/(<html[^>]*>)/i, `$1<head>${SCROLLBAR_STYLES}</head>`);
  }
  if (raw.includes("<body") || raw.includes("<BODY")) {
    return raw.replace(/(<body[^>]*>)/i, `$1${SCROLLBAR_STYLES}`);
  }
  return `${SCROLLBAR_STYLES}${raw}`;
}

export function HtmlPreview({ html, title, fullBleed = false }: Props) {
  const [showHtml, setShowHtml] = useState(true);
  const previewHtml = injectScrollbarStyles(html);
  const extractedTitle = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
  const displayTitle = extractedTitle || title || "HTML Preview";
  const displayUrl = extractedTitle
    ? `localhost:3000 / ${extractedTitle.toLowerCase().replace(/\s+/g, "-")}`
    : "localhost:3000";

  const handleDownload = () => {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = extractedTitle
      ? `${extractedTitle.trim() || "output"}.html`
      : "output.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`overflow-hidden font-sans w-full ${
        fullBleed
          ? ""
          : "my-4 rounded-xl border border-border shadow-xl bg-card"
      }`}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 bg-card-hover/30 border-b border-border">
        <div className="flex gap-1.5 flex-shrink-0">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 flex items-center bg-muted rounded-md border border-border h-7 px-3 mx-2 min-w-0">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 opacity-40 mr-2">
            <rect x="1.5" y="1.5" width="13" height="13" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 8.5l-1 1L6.5 12l5-6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[12px] text-muted-foreground truncate select-none">
            {displayUrl}
          </span>
        </div>
        <div className="flex gap-0.5 flex-shrink-0">
          <button
            onClick={() => setShowHtml(true)}
            className={`px-2.5 py-1 rounded-md text-[11px] transition-all cursor-pointer font-medium ${
              showHtml
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-card-hover/50"
            }`}
          >
            Preview
          </button>
          <button
            onClick={() => setShowHtml(false)}
            className={`px-2.5 py-1 rounded-md text-[11px] transition-all cursor-pointer font-medium ${
              !showHtml
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-card-hover/50"
            }`}
          >
            Source
          </button>
          <button
            onClick={handleDownload}
            className="px-2.5 py-1 rounded-md text-[11px] transition-all cursor-pointer font-medium text-muted-foreground hover:text-foreground hover:bg-card-hover/50 flex items-center gap-1"
            title="Download as .html"
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Download
          </button>
        </div>
      </div>

      {showHtml ? (
        <div className={`bg-white w-full ${fullBleed ? "h-[85vh] min-h-[35rem]" : "h-[70vh] min-h-[30rem]"}`}>
          <iframe
            srcDoc={previewHtml}
            title={displayTitle}
            sandbox="allow-scripts allow-forms"
            className="w-full h-full border-0 bg-white"
          />
        </div>
      ) : (
        <pre className={`p-4 overflow-y-auto overflow-x-auto text-xs text-muted-foreground font-mono leading-relaxed bg-muted whitespace-pre-wrap ${fullBleed ? "h-[85vh] min-h-[35rem]" : "h-[70vh] min-h-[30rem]"}`}>
          {html}
        </pre>
      )}
    </motion.div>
  );
}
