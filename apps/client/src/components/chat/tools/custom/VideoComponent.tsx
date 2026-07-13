import { resolveMediaUrl } from "./media-utils";

interface VideoProps {
  src: string;
  poster?: string;
  title?: string;
  autoplay?: boolean;
  muted?: boolean;
  controls?: boolean;
  sessionId?: string | null;
}

export function VideoComponent({
  src,
  poster,
  title,
  autoplay = false,
  muted = true,
  controls = true,
  sessionId = null,
}: VideoProps) {
  const videoUrl = resolveMediaUrl(src, sessionId);
  const posterUrl = poster ? resolveMediaUrl(poster, sessionId) : undefined;

  return (
    <div className="flex flex-col border border-border rounded-lg overflow-hidden bg-card text-xs w-full">
      {title && (
        <div className="bg-muted/70 px-4 py-2 border-b border-border/80 text-muted-foreground font-semibold">
          {title}
        </div>
      )}
      <div className="relative bg-black w-full aspect-video flex items-center justify-center">
        <video
          src={videoUrl}
          poster={posterUrl}
          autoPlay={autoplay}
          muted={muted}
          controls={controls}
          className="w-full h-full object-contain"
        />
      </div>
    </div>
  );
}
