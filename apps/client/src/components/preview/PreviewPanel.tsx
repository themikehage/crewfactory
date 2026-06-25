import { useState, useEffect, useCallback } from "react";
import type { PreviewState } from "shared";

interface Props {
  activeRepoName: string | null;
}

const RESOLUTIONS = [
  { label: "375", width: 375 },
  { label: "768", width: 768 },
  { label: "1280", width: 1280 },
  { label: "Full", width: null },
] as const;

export function PreviewPanel({ activeRepoName }: Props) {
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);
  const [resolutionIndex, setResolutionIndex] = useState(0);
  const [buildKey, setBuildKey] = useState(0);

  const repoName = activeRepoName || "";
  const token = localStorage.getItem("token") || "";

  const previewSrc =
    repoName && token
      ? `/api/preview/index.html?repo=${encodeURIComponent(repoName)}&token=${encodeURIComponent(token)}`
      : null;

  // Fetch initial state
  useEffect(() => {
    if (!repoName) return;
    const t = localStorage.getItem("token") || "";
    fetch(`/api/preview/state?repo=${encodeURIComponent(repoName)}`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then((r) => r.json())
      .then((data) => setPreviewState(data))
      .catch(() => {});
  }, [repoName]);

  // Subscribe to preview WebSocket events (no sessionId needed — broadcastToUser)
  useEffect(() => {
    if (!repoName) return;

    const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProto}//${location.host}/ws`;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;

    const connect = () => {
      const t = localStorage.getItem("token");
      if (!t) return;

      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        reconnectAttempts = 0;
        ws!.send(JSON.stringify({ type: "auth", token: t }));
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.type === "preview_status" && data.repoName === repoName) {
            setPreviewState((prev) => ({
              repoName: data.repoName,
              status: data.status || prev?.status || "idle",
              distExists: data.distExists ?? prev?.distExists ?? false,
              indexHtmlExists: data.indexHtmlExists ?? prev?.indexHtmlExists ?? false,
              lastBuildAt: data.lastBuildAt ?? prev?.lastBuildAt ?? null,
              error: data.error,
            }));
          }
        } catch {}
      };

      ws.onclose = () => {
        const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000);
        reconnectAttempts++;
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => ws?.close();
    };

    connect();
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [repoName]);

  const handleReload = useCallback(() => {
    setBuildKey((k) => k + 1);
  }, []);

  const handleOpenNewTab = useCallback(() => {
    if (previewSrc) window.open(previewSrc, "_blank", "noopener");
  }, [previewSrc]);

  const statusBadge = () => {
    const base = "flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border";
    switch (previewState?.status) {
      case "building":
        return (
          <div className={`${base} bg-warning/10 border-warning/30 text-warning`}>
            <div className="w-3 h-3 border-2 border-warning border-t-transparent rounded-full animate-spin" />
            Building...
          </div>
        );
      case "ready":
        return (
          <div className={`${base} bg-success/10 border-success/30 text-success`}>
            <div className="w-3 h-3 rounded-full bg-success" />
            Ready
          </div>
        );
      case "error":
        return (
          <div className={`${base} bg-error/10 border-error/30 text-error`}>
            <div className="w-3 h-3 rounded-full bg-error" />
            Build failed
          </div>
        );
      default:
        return (
          <div className={`${base} bg-text-secondary/5 border-text-secondary/15 text-text-secondary/50`}>
            <div className="w-3 h-3 rounded-full bg-text-secondary/20" />
            No build yet
          </div>
        );
    }
  };

  const iframeWidth = RESOLUTIONS[resolutionIndex].width;

  return (
    <div className="w-full h-full flex flex-col bg-bg">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-surface bg-surface/60 flex-shrink-0">
        <div className="flex items-center gap-2">
          {statusBadge()}
        </div>

        <div className="flex items-center gap-2">
          {/* Resolution toggle */}
          <div className="flex bg-bg/60 p-0.5 rounded-lg border border-surface-hover/30 gap-0.5">
            {RESOLUTIONS.map((res, i) => (
              <button
                key={res.label}
                onClick={() => setResolutionIndex(i)}
                className={`px-2 py-1 text-[10px] font-medium rounded-md transition-all cursor-pointer ${
                  resolutionIndex === i
                    ? "bg-accent text-black"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {res.label}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-surface-hover/50" />

          <button
            onClick={handleReload}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-hover/50 rounded transition-colors cursor-pointer"
            title="Reload preview"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.259.627 5.002 5.002 0 009.23 1.316H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          <button
            onClick={handleOpenNewTab}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-hover/50 rounded transition-colors cursor-pointer"
            title="Open in new tab"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
              <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 100-2H5z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Error banner */}
      {previewState?.status === "error" && previewState?.error && (
        <div className="px-3 py-1.5 bg-error/10 border-b border-error/20 text-error text-[10px] font-mono leading-relaxed flex-shrink-0 max-h-16 overflow-y-auto">
          {previewState.error}
        </div>
      )}

      {/* Iframe container */}
      <div className="flex-1 flex items-start justify-center overflow-auto bg-[#0a0a0a] p-2 sm:p-4 min-h-0">
        {(!repoName || previewState?.status === "idle" && !previewState?.distExists) ? (
          <div className="flex flex-col items-center justify-center h-full text-text-secondary/60 gap-3">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="opacity-30">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
            <p className="text-sm font-medium">
              {!repoName ? "Select a project to preview" : "No build output yet"}
            </p>
            <p className="text-xs text-center max-w-xs">
              Ask the agent to build the project (e.g. run <code className="text-accent/80 bg-bg/60 px-1 rounded">bun run build</code>), and the preview will appear here automatically.
            </p>
          </div>
        ) : (
          <div
            className="bg-white rounded-lg shadow-2xl overflow-hidden transition-all duration-300"
            style={{
              width: iframeWidth ? `${iframeWidth}px` : "100%",
              maxWidth: iframeWidth ? `${iframeWidth}px` : "100%",
              height: iframeWidth ? "100%" : "100%",
            }}
          >
            <iframe
              key={buildKey}
              src={previewSrc || ""}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
              title="Project Preview"
            />
          </div>
        )}
      </div>
    </div>
  );
}
