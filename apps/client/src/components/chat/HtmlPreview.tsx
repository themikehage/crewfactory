import { useState } from "react";

interface Props {
  html: string;
}

export function HtmlPreview({ html }: Props) {
  const [showHtml, setShowHtml] = useState(true);

  const handleDownload = () => {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    a.download = titleMatch
      ? `${titleMatch[1].trim() || "output"}.html`
      : "output.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-surface-hover shadow-md text-xs bg-surface font-sans">
      <div className="bg-surface-hover/30 px-3 py-2 border-b border-surface-hover flex justify-between items-center">
        <span className="font-semibold text-text-secondary text-[11px] uppercase tracking-wider">
          HTML Document Output
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={() => setShowHtml(true)}
            className={`px-2 py-0.5 rounded transition-colors text-[10px] cursor-pointer ${
              showHtml
                ? "bg-accent/20 text-accent font-semibold"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Preview
          </button>
          <button
            onClick={() => setShowHtml(false)}
            className={`px-2 py-0.5 rounded transition-colors text-[10px] cursor-pointer ${
              !showHtml
                ? "bg-accent/20 text-accent font-semibold"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Source
          </button>
          <button
            onClick={handleDownload}
            className="px-2 py-0.5 rounded transition-colors text-[10px] cursor-pointer text-text-secondary hover:text-text-primary hover:bg-surface-hover/50"
            title="Download as .html"
          >
            <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" className="inline-block mr-0.5">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Download
          </button>
        </div>
      </div>
      {showHtml ? (
        <div className="bg-white p-1 h-80 relative">
          <iframe
            srcDoc={html}
            title="HTML output preview"
            sandbox="allow-scripts allow-forms"
            className="w-full h-full border-0 bg-white"
          />
        </div>
      ) : (
        <pre className="p-3 max-h-80 overflow-y-auto overflow-x-auto text-[10px] text-text-secondary font-mono leading-normal bg-code-bg">
          {html}
        </pre>
      )}
    </div>
  );
}
