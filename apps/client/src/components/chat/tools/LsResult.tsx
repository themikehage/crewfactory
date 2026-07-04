import { openInWorkspace } from "./workspace";

function getExtColor(name: string): string {
  if (name.endsWith("/")) return "text-primary";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["js", "ts", "tsx", "jsx"].includes(ext)) return "text-warning";
  if (["html", "htm"].includes(ext)) return "text-highlight";
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return "text-primary";
  if (["md", "txt"].includes(ext)) return "text-muted-foreground";
  if (["json", "yaml", "yml", "toml"].includes(ext)) return "text-primary/70";
  return "text-muted-foreground";
}

function FolderIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="text-primary flex-shrink-0">
      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
    </svg>
  );
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) {
    return (
      <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="text-primary flex-shrink-0">
        <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="text-muted-foreground/50 flex-shrink-0">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
    </svg>
  );
}

interface Props {
  text: string;
}

export function LsResult({ text }: Props) {
  const entries = text.trim().split("\n").filter(Boolean);

  if (entries.length === 0) {
    return <p className="text-muted-foreground/50 text-xs italic">Empty directory</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
      {entries.map((entry, i) => {
        const isDir = entry.endsWith("/");
        const name = entry;
        return (
          <button
            key={i}
            onClick={() => openInWorkspace(name)}
            className="flex items-center gap-1.5 py-0.5 min-w-0 hover:bg-card-hover/40 rounded px-1 -mx-1 transition-colors cursor-pointer w-full text-left"
          >
            {isDir ? <FolderIcon /> : <FileIcon name={name} />}
            <span className={`font-mono text-[11px] truncate ${getExtColor(name)} hover:underline underline-offset-2`}>
              {name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
