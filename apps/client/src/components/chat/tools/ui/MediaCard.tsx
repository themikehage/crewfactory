import { useState, useEffect } from "react";
import { wsClient } from "@/lib/ws-client";

interface Props {
  args: {
    mediaPath: string;
    title: string;
    prompt?: string;
    aspectRatio?: string;
  };
  sessionId: string | null;
}

export function MediaCard({ args, sessionId }: Props) {
  const { mediaPath, title = "Multimedia", prompt, aspectRatio = "16:9" } = args || {};
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [mediaPath]);

  const getAspectClass = () => {
    switch (aspectRatio) {
      case "1:1":
        return "aspect-square";
      case "4:3":
        return "aspect-4/3";
      case "16:9":
      default:
        return "aspect-video";
    }
  };

  const handleAction = (type: "regenerate" | "variation") => {
    if (!sessionId) return;
    const promptText = type === "regenerate"
      ? `Regenerar la imagen: "${prompt || title}"`
      : `Crear variaciones basadas en la imagen: "${prompt || title}"`;
    wsClient.send({
      type: "prompt",
      sessionId,
      message: promptText,
    });
  };

  // Convert absolute local paths (e.g. C:\workspace\...) to safe preview paths if needed
  const getSafeSrc = () => {
    if (!mediaPath) return "";
    // Si ya es una URL web o un base64, usarlo directamente
    if (mediaPath.startsWith("http") || mediaPath.startsWith("data:")) return mediaPath;
    
    // De lo contrario, mapearlo al endpoint del preview del server
    return `/api/assets/uploads?path=${encodeURIComponent(mediaPath)}`;
  };

  return (
    <div className="w-full max-w-sm rounded-xl border border-input/40 bg-card/40 overflow-hidden font-sans shadow-md my-3 transition-colors">
      {/* Visual Container */}
      <div className={`w-full bg-bg relative overflow-hidden flex items-center justify-center ${getAspectClass()}`}>
        {hasError ? (
          <span className="text-xs text-muted-foreground/60 p-4 text-center font-mono">
            [Media Asset: {title}]
          </span>
        ) : (
          <img
            src={getSafeSrc()}
            alt={title}
            className="w-full h-full object-cover"
            onError={() => setHasError(true)}
          />
        )}
      </div>

      {/* Info & Metadata */}
      <div className="p-3 border-t border-input/20 space-y-2">
        <h4 className="text-xs font-bold text-foreground truncate">{title}</h4>
        {prompt && (
          <div className="bg-muted/40 rounded-lg p-2 border border-input/10">
            <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider block mb-0.5">Prompt de generación</span>
            <p className="text-[10px] text-foreground/80 leading-relaxed font-mono line-clamp-3 select-all">{prompt}</p>
          </div>
        )}
      </div>

      {/* Media quick actions */}
      <div className="flex items-center gap-1.5 px-3 pb-3">
        <button
          onClick={() => handleAction("regenerate")}
          className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded bg-card hover:bg-card-hover/80 text-[10px] font-bold text-foreground border border-input transition-colors cursor-pointer"
        >
          <svg className="w-3 h-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.5" />
          </svg>
          Regenerar
        </button>
        <button
          onClick={() => handleAction("variation")}
          className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded bg-card hover:bg-card-hover/80 text-[10px] font-bold text-foreground border border-input transition-colors cursor-pointer"
        >
          <svg className="w-3 h-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Variaciones
        </button>
      </div>
    </div>
  );
}
