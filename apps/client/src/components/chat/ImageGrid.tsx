import { useCallback, useState, useEffect } from "react";

interface ImageItem {
  url: string;
  title?: string;
}

interface Props {
  images: ImageItem[];
  sessionId: string | null;
  activeRepoName?: string | null;
  activeAgentId?: string | null;
  activeChannelId?: string | null;
}

export function resolveImageUrl(
  url: string,
  sessionId: string | null,
  activeRepoName?: string | null,
  activeAgentId?: string | null,
  activeChannelId?: string | null
): string {
  if (!url) return "";

  if (url.startsWith("data:image/") || url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  if (sessionId && (url.includes("/tmp/") || url.includes("C:\\tmp\\") || url.includes("C:/tmp/"))) {
    const sessionMarker = `sessions/${sessionId}/`;
    const idx = url.indexOf(sessionMarker);
    if (idx !== -1) {
      const relativePath = url.substring(idx + sessionMarker.length);
      const cleanedPath = relativePath.replace(/\\/g, "/");
      return `/api/sessions/${sessionId}/files/${cleanedPath}`;
    }

    const match = url.match(/sessions\/([a-zA-Z0-9-]+)\/(.+)/);
    if (match) {
      const cleanedPath = match[2].replace(/\\/g, "/");
      return `/api/sessions/${match[1]}/files/${cleanedPath}`;
    }

    const baseName = url.split(/[\\/]/).pop();
    if (baseName) {
      return `/api/sessions/${sessionId}/files/${baseName}`;
    }
  }

  let cleanPath = url.replace(/\\/g, "/");
  if (cleanPath.startsWith("workspace/")) {
    cleanPath = cleanPath.substring("workspace/".length);
  }
  const params = new URLSearchParams();
  if (activeRepoName) params.append("repo", activeRepoName);
  if (activeAgentId) params.append("agentId", activeAgentId);
  if (activeChannelId) params.append("channelId", activeChannelId);
  params.append("raw", "true");
  return `/api/workspace/${cleanPath}?${params.toString()}`;
}

interface AuthenticatedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

export function AuthenticatedImage({ src, ...props }: AuthenticatedImageProps) {
  const [blobUrl, setBlobUrl] = useState<string>("");

  useEffect(() => {
    if (!src) return;
    if (!src.startsWith("/api/")) {
      setBlobUrl(src);
      return;
    }

    let active = true;
    let url = "";

    const loadImg = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(src, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const blob = await res.blob();
        if (active) {
          url = URL.createObjectURL(blob);
          setBlobUrl(url);
        }
      } catch (err) {
        console.error("Failed to load image:", err);
      }
    };

    loadImg();

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [src]);

  if (!blobUrl) return null;

  return <img src={blobUrl} {...props} />;
}

export function ImageGrid({
  images,
  sessionId,
  activeRepoName,
  activeAgentId = null,
  activeChannelId = null,
}: Props) {
  const [downloading, setDownloading] = useState<string | null>(null);

  const downloadImage = useCallback(async (resolvedUrl: string, filename?: string) => {
    setDownloading(resolvedUrl);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(resolvedUrl, {
        headers: resolvedUrl.startsWith("/api/") && token
          ? { Authorization: `Bearer ${token}` }
          : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      
      const ext = blob.type.split("/")[1] || "png";
      let downloadName = filename || "image";
      const hasExt = /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(downloadName);
      if (!hasExt) {
        downloadName = `${downloadName}.${ext}`;
      }
      
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      const a = document.createElement("a");
      a.href = resolvedUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.click();
    } finally {
      setDownloading(null);
    }
  }, []);

  const openImageInNewTab = async (resolvedUrl: string) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(resolvedUrl, {
        headers: resolvedUrl.startsWith("/api/") && token
          ? { Authorization: `Bearer ${token}` }
          : {},
      });
      if (!res.ok) throw new Error("Failed to load image");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");
    } catch (err) {
      console.error("Failed to open image in new tab:", err);
    }
  };

  const downloadAll = useCallback(async () => {
    for (const img of images) {
      const resolved = resolveImageUrl(img.url, sessionId, activeRepoName, activeAgentId, activeChannelId);
      await downloadImage(resolved, img.title);
    }
  }, [images, sessionId, activeRepoName, activeAgentId, activeChannelId, downloadImage]);

  if (images.length === 0) return null;

  return (
    <div className="my-3 font-sans">
      {images.length > 1 && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-text-secondary/70 uppercase tracking-wider">
            {images.length} image{images.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={downloadAll}
            disabled={downloading !== null}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px]
                       text-text-secondary hover:text-text-primary hover:bg-surface-hover/50
                       transition-colors disabled:opacity-50 cursor-pointer"
          >
            <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Download All
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-w-full">
        {images.map((img, i) => {
          const resolved = resolveImageUrl(img.url, sessionId, activeRepoName, activeAgentId, activeChannelId);
          const isDownloading = downloading === resolved;
          return (
            <div
              key={i}
              className="group relative rounded-lg overflow-hidden border border-surface-hover bg-surface hover:border-accent/40 shadow-sm transition-all"
            >
              <div className="aspect-square w-full overflow-hidden bg-black/10 flex items-center justify-center">
                <AuthenticatedImage
                  src={resolved}
                  alt={img.title || "Image content"}
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                />
              </div>

              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  onClick={() => downloadImage(resolved, img.title)}
                  disabled={isDownloading}
                  className="p-1.5 bg-white/20 rounded-full hover:bg-white/40 transition-colors disabled:opacity-50 cursor-pointer"
                  title="Download image"
                >
                  {isDownloading ? (
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="animate-spin text-white">
                      <path fillRule="evenodd" d="M4 10a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="text-white">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => openImageInNewTab(resolved)}
                  className="p-1.5 bg-white/20 rounded-full hover:bg-white/40 transition-colors cursor-pointer"
                  title="Open in new tab"
                >
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="text-white">
                    <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                    <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                  </svg>
                </button>
              </div>

              {img.title && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-[10px] text-text-primary truncate">
                  {img.title}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
