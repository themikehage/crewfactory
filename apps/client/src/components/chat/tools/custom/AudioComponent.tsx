import { resolveMediaUrl } from "./media-utils";

interface AudioProps {
  src: string;
  title?: string;
  artist?: string;
  coverImage?: string;
  sessionId?: string | null;
}

export function AudioComponent({ src, title, artist, coverImage, sessionId = null }: AudioProps) {
  const audioUrl = resolveMediaUrl(src, sessionId);
  const coverUrl = coverImage ? resolveMediaUrl(coverImage, sessionId) : null;

  return (
    <div className="bg-card text-card-foreground border border-border rounded-lg p-4 shadow-sm flex flex-col gap-3 max-w-md w-full">
      <div className="flex items-center gap-3">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={title || "Album Art"}
            className="w-12 h-12 rounded-md object-cover bg-muted flex-shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center text-muted-foreground flex-shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
        )}
        <div className="flex-1 min-w-0 flex flex-col">
          <span className="text-xs font-semibold text-foreground truncate">{title || "Unknown Track"}</span>
          <span className="text-[10px] text-muted-foreground truncate">{artist || "Unknown Artist"}</span>
        </div>
      </div>

      <audio src={audioUrl} controls className="w-full h-8 text-xs bg-muted rounded-md" />
    </div>
  );
}
