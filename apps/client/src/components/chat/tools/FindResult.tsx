import { openInWorkspace } from "./workspace";

function getExt(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function FileIcon({ name }: { name: string }) {
  const ext = getExt(name);
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) {
    return (
      <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="text-primary flex-shrink-0">
        <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="text-primary/60 flex-shrink-0">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
    </svg>
  );
}

interface Props {
  text: string;
}

export function FindResult({ text }: Props) {
  const files = text.trim().split("\n").filter(Boolean);

  if (files.length === 0) {
    return <p className="text-muted-foreground text-xs italic">No files matched</p>;
  }

  return (
    <div className="space-y-0.5">
      {files.map((file, i) => (
        <button
          key={i}
          onClick={() => openInWorkspace(file)}
          className="flex items-center gap-1.5 py-0.5 hover:bg-card-hover/40 rounded px-1 -mx-1 transition-colors cursor-pointer w-full text-left"
        >
          <FileIcon name={file} />
          <span className="font-mono text-[11px] text-primary/80 hover:underline underline-offset-2">{file}</span>
        </button>
      ))}
    </div>
  );
}
