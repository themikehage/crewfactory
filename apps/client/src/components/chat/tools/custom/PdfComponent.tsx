import { resolveMediaUrl } from "./media-utils";

interface PdfProps {
  src: string;
  title?: string;
  page?: number;
  scale?: number;
  sessionId?: string | null;
}

export function PdfComponent({ src, title, page, scale, sessionId = null }: PdfProps) {
  let pdfUrl = resolveMediaUrl(src, sessionId);
  
  // Append PDF specific parameters for hash navigation if provided
  const hashes: string[] = [];
  if (page) hashes.push(`page=${page}`);
  if (scale) hashes.push(`zoom=${scale * 100}`);
  if (hashes.length > 0) {
    pdfUrl = `${pdfUrl}#${hashes.join("&")}`;
  }

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = title || src.split("/").pop() || "document.pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="flex flex-col border border-border rounded-lg overflow-hidden bg-card text-xs w-full">
      <div className="bg-muted/70 px-4 py-2 border-b border-border/80 flex justify-between items-center text-muted-foreground font-semibold">
        <span>{title || "PDF Document"}</span>
        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            className="hover:text-foreground hover:bg-muted px-2 py-0.5 rounded transition-colors text-[10px]"
          >
            Download
          </button>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground hover:bg-muted px-2 py-0.5 rounded transition-colors text-[10px]"
          >
            Open in Tab
          </a>
        </div>
      </div>
      <div className="w-full h-[60vh] min-h-[25rem] bg-muted/20">
        <iframe
          src={pdfUrl}
          title={title || "PDF document"}
          className="w-full h-full border-0 bg-transparent"
        />
      </div>
    </div>
  );
}
