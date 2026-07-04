import { useState } from "react";
import { openInWorkspace } from "./workspace";

interface ContentBlock {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

interface Props {
  content: ContentBlock[];
  args: Record<string, unknown>;
}

function getLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rs: "rust", go: "go", sh: "bash", bash: "bash",
    html: "html", css: "css", json: "json", yaml: "yaml", yml: "yaml",
    md: "markdown", txt: "text", toml: "toml",
  };
  return map[ext] ?? "text";
}

export function ReadResult({ content, args }: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const path = (args.path as string) || "";

  const imageBlock = content.find(b => b.type === "image");
  const textBlock = content.find(b => b.type === "text");
  const text = textBlock?.text ?? "";

  if (imageBlock?.data && imageBlock.mimeType) {
    const src = `data:${imageBlock.mimeType};base64,${imageBlock.data}`;
    return (
      <>
        <div
          className="inline-block cursor-zoom-in rounded overflow-hidden border border-input max-w-full"
          onClick={() => setLightboxOpen(true)}
        >
          <img src={src} alt={path} className="max-h-48 object-contain" />
        </div>
        <p className="text-[10px] text-muted-foreground/50 font-mono mt-1">{imageBlock.mimeType}</p>
        {lightboxOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm cursor-zoom-out"
            onClick={() => setLightboxOpen(false)}
          >
            <img src={src} alt={path} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
          </div>
        )}
      </>
    );
  }

  const lines = text.split("\n");
  const lang = getLanguage(path);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5 text-[10px] font-mono">
        <button
          onClick={() => path && openInWorkspace(path)}
          className="text-primary/60 hover:text-primary hover:underline underline-offset-2 transition-colors cursor-pointer"
        >
          {lang}
        </button>
        <span className="text-muted-foreground/50">{lines.length} lines</span>
      </div>
      <pre className="text-[11px] font-mono leading-relaxed text-muted-foreground whitespace-pre-wrap break-all bg-muted p-3 rounded-md max-h-64 overflow-y-auto border border-input/40">
        {text}
      </pre>
    </div>
  );
}
