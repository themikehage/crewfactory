import { useState, useEffect, useCallback, useRef } from "react";
import type { PreviewState } from "shared";
import { useAuth } from "@/contexts/AuthContext";
import { useLiterals } from "@/lib";
import { literals as u } from "./PreviewPanel.literals";

interface Props {
  activeRepoName: string | null;
}

const FRAMEWORK_LABELS: Record<string, string> = {
  auto: "Auto-detect",
  vite: "Vite",
  next: "Next.js",
  nuxt: "Nuxt",
  astro: "Astro",
  html: "Static HTML",
  custom: "Custom",
};

function usePreviewStatus(repoName: string) {
  const [state, setState] = useState<PreviewState | null>(null);
  const [buildLogs, setBuildLogs] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!repoName) return;
    const t = localStorage.getItem("token") || "";
    fetch(`/api/preview/state?repo=${encodeURIComponent(repoName)}`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then((r) => r.json())
      .then((data) => setState(data))
      .catch(() => {});
  }, [repoName]);

  const fetchConfig = useCallback(async () => {
    if (!repoName) return null;
    const t = localStorage.getItem("token") || "";
    try {
      const r = await fetch(`/api/preview/config?repo=${encodeURIComponent(repoName)}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      return await r.json();
    } catch {
      return null;
    }
  }, [repoName]);

  useEffect(() => {
    if (!repoName) return;

    const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProto}//${location.host}/ws`;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    let closed = false;

    const connect = () => {
      const t = localStorage.getItem("token");
      if (!t || closed) return;

      const sock = new WebSocket(wsUrl);
      wsRef.current = sock;
      sock.onopen = () => {
        reconnectAttempts = 0;
        sock.send(JSON.stringify({ type: "auth", token: t }));
      };

      sock.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.type === "preview_status" && data.repoName === repoName) {
            setState((prev) => ({
              repoName: data.repoName,
              status: data.status || prev?.status || "idle",
              distExists: data.distExists ?? prev?.distExists ?? false,
              indexHtmlExists: data.indexHtmlExists ?? prev?.indexHtmlExists ?? false,
              lastBuildAt: data.lastBuildAt ?? prev?.lastBuildAt ?? null,
              error: data.error,
              config: data.config || prev?.config,
            }));
          }
          if (data.type === "preview_build_log" && data.repoName === repoName) {
            setBuildLogs((prev) => [...prev, data.line]);
          }
        } catch {}
      };

      sock.onclose = () => {
        wsRef.current = null;
        if (closed) return;
        const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000);
        reconnectAttempts++;
        reconnectTimer = setTimeout(connect, delay);
      };

      sock.onerror = () => sock.close();
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [repoName]);

  return { state, buildLogs, setBuildLogs, fetchConfig };
}

export function PreviewPanel({ activeRepoName }: Props) {
const l = useLiterals(u);
  const repoName = activeRepoName || "";
  const { user } = useAuth();
  const { state: previewState, buildLogs, setBuildLogs, fetchConfig } = usePreviewStatus(repoName);
  const [buildKey, setBuildKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [configForm, setConfigForm] = useState({
    framework: "auto",
    buildCommand: "",
    outputDir: "",
  });
  const [saving, setSaving] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logOpen && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [buildLogs, logOpen]);

  // Use dedicated preview server (port 3001) for complete origin isolation.
  // The preview server is separate from the main Hono server, so no catch-all
  // SPA fallback can intercept preview asset requests.
  const PREVIEW_BASE =
    (import.meta.env.VITE_PREVIEW_BASE_URL as string | undefined) ||
    `${window.location.protocol}//${window.location.hostname}:3001`;

  const previewSrc =
    repoName && user?.username
      ? `${PREVIEW_BASE}/${encodeURIComponent(user.username)}/${encodeURIComponent(repoName)}/index.html`
      : null;

  const lastBuildAt = previewState?.lastBuildAt ?? null;
  const iframeKey = `${previewSrc}-${buildKey}-${lastBuildAt}`;

  const handleOpenConfig = useCallback(async () => {
    setConfigOpen(true);
    const cfg = await fetchConfig();
    if (cfg) {
      setConfigForm({
        framework: cfg.framework || "auto",
        buildCommand: cfg.buildCommand || "",
        outputDir: cfg.outputDir || "",
      });
    }
  }, [fetchConfig]);

  const handleSaveConfig = useCallback(async () => {
    if (!repoName) return;
    setSaving(true);
    const t = localStorage.getItem("token") || "";
    try {
      await fetch(`/api/preview/config?repo=${encodeURIComponent(repoName)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${t}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(configForm),
      });
      setConfigOpen(false);
      setBuildLogs([]);
    } finally {
      setSaving(false);
    }
  }, [repoName, configForm, setBuildLogs]);

  const handleBuildNow = useCallback(async () => {
    if (!repoName) return;
    setBuildLogs([]);
    setLogOpen(true);
    const t = localStorage.getItem("token") || "";
    try {
      await fetch(`/api/preview/build?repo=${encodeURIComponent(repoName)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${t}` },
      });
    } catch {}
  }, [repoName, setBuildLogs]);

  const handleReload = useCallback(() => {
    setBuildKey((k) => k + 1);
  }, []);

  const handleOpenNewTab = useCallback(() => {
    if (previewSrc) window.open(previewSrc, "_blank", "noreferrer");
  }, [previewSrc]);

  const isBuilding = previewState?.status === "building";

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
          <div className={`${base} bg-primary/10 border-success/30 text-primary`}>
            <div className="w-3 h-3 rounded-full bg-primary" />
            Ready
          </div>
        );
      case "error":
        return (
          <div className={`${base} bg-destructive/10 border-error/30 text-destructive`}>
            <div className="w-3 h-3 rounded-full bg-destructive" />
            Build failed
          </div>
        );
      default:
        return (
          <div className={`${base} bg-text-secondary/5 border-text-secondary/15 text-muted-foreground/50`}>
            <div className="w-3 h-3 rounded-full bg-text-secondary/20" />
            No build yet
          </div>
        );
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-background">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-card/60 flex-shrink-0">
        <div className="flex items-center gap-2">
          {statusBadge()}
          {repoName && (
            <>
              <button
                onClick={handleBuildNow}
                disabled={isBuilding}
                className="px-2 py-1 text-[10px] font-medium bg-primary text-black rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                  <polygon points="2,0 10,5 2,10" />
                </svg>
                Build Now
              </button>
              <button
                onClick={handleOpenConfig}
                className="p-1 text-muted-foreground hover:text-foreground hover:bg-card-hover/50 rounded transition-colors cursor-pointer"
                title={l.configure}
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReload}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-card-hover/50 rounded transition-colors cursor-pointer"
            title={l.reload}
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
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-card-hover/50 rounded transition-colors cursor-pointer"
            title={l.openTab}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
              <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 100-2H5z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Build log panel */}
      {logOpen && buildLogs.length > 0 && (
        <div className="flex-shrink-0 border-b border-border">
          <div className="flex items-center justify-between px-3 py-1 bg-muted/80">
            <span className="text-[10px] font-mono text-muted-foreground font-semibold uppercase tracking-wider">
              Build Log
            </span>
            <button
              onClick={() => setLogOpen(false)}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
          <pre className="max-h-40 overflow-y-auto bg-muted/40 p-3 text-[11px] font-mono text-muted-foreground leading-relaxed">
            {buildLogs.map((line, i) => (
              <div
                key={i}
                className={
                  line.startsWith("$ ")
                    ? "text-primary/80"
                    : line.startsWith("Build")
                      ? "text-foreground"
                      : ""
                }
              >
                {line}
              </div>
            ))}
            <div ref={logEndRef} />
          </pre>
        </div>
      )}

      {/* Error banner */}
      {previewState?.status === "error" && previewState?.error && !logOpen && (
        <div className="px-3 py-1.5 bg-destructive/10 border-b border-error/20 text-destructive text-[10px] font-mono leading-relaxed flex-shrink-0 max-h-16 overflow-y-auto">
          {previewState.error}
        </div>
      )}

      {/* Iframe container */}
      <div className="flex-1 flex items-start justify-center overflow-auto bg-muted p-2 sm:p-4 min-h-0">
        {!repoName ||
        (previewState?.status === "idle" && !previewState?.distExists && buildLogs.length === 0) ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 gap-3">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              className="opacity-30"
            >
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
            <p className="text-sm font-medium">
              {!repoName ? "Select a project to preview" : "No build output yet"}
            </p>
            <p className="text-xs text-center max-w-xs">
              {repoName
                ? "Configure your build settings and click Build Now."
                : "Select a project from the Projects page."}
            </p>
            {repoName && (
              <div className="flex gap-2 mt-1">
                <button
                  onClick={handleOpenConfig}
                  className="px-3 py-1.5 text-xs font-medium bg-card-hover text-foreground rounded-md hover:bg-card-hover/70 transition-colors cursor-pointer"
                >
                  Configure
                </button>
                <button
                  onClick={handleBuildNow}
                  className="px-3 py-1.5 text-xs font-medium bg-primary text-black rounded-md hover:bg-primary/90 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                    <polygon points="2,0 10,5 2,10" />
                  </svg>
                  Build Now
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-2xl overflow-hidden w-full h-full max-w-full">
            <iframe
              key={iframeKey}
              ref={iframeRef}
              src={previewSrc || ""}
              className="w-full h-full border-0"
              title="Project Preview"
            />
          </div>
        )}
      </div>

      {/* Config drawer */}
      {configOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setConfigOpen(false)}
          />
          <div className="fixed right-0 top-0 h-full w-80 sm:w-96 bg-card border-l border-input z-50 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-input">
              <span className="text-sm font-semibold text-foreground">
                Preview Settings
              </span>
              <button
                onClick={() => setConfigOpen(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Framework
                </label>
                <select
                  value={configForm.framework}
                  onChange={(e) => {
                    const fw = e.target.value;
                    const presets: Record<string, { cmd: string; dir: string }> = {
                      vite: { cmd: "npx --yes vite build", dir: "dist" },
                      next: { cmd: "npx --yes next build", dir: ".next" },
                      nuxt: { cmd: "npx --yes nuxt build", dir: ".output" },
                      astro: { cmd: "npx --yes astro build", dir: "dist" },
                      html: { cmd: "", dir: "." },
                      custom: {
                        cmd: configForm.buildCommand || "npm run build",
                        dir: configForm.outputDir || "dist",
                      },
                    };
                    const preset = presets[fw];
                    if (preset && fw !== "custom" && fw !== "auto") {
                      setConfigForm({
                        framework: fw,
                        buildCommand: preset.cmd,
                        outputDir: preset.dir,
                      });
                    } else {
                      setConfigForm((prev) => ({ ...prev, framework: fw }));
                    }
                  }}
                  className="w-full bg-background border border-input hover:border-primary/40 focus:border-primary outline-none text-foreground px-2.5 py-1.5 rounded text-xs transition-all"
                >
                  {Object.entries(FRAMEWORK_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Build Command
                </label>
                <input
                  type="text"
                  value={configForm.buildCommand}
                  onChange={(e) =>
                    setConfigForm((prev) => ({
                      ...prev,
                      buildCommand: e.target.value,
                    }))
                  }
                  placeholder={
                    configForm.framework === "html"
                      ? "No build needed"
                      : "e.g. npm run build"
                  }
                  disabled={configForm.framework === "html"}
                  className="w-full bg-background border border-input hover:border-primary/40 focus:border-primary outline-none text-foreground px-2.5 py-1.5 rounded text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed font-mono"
                />
                <p className="text-[10px] text-muted-foreground/50 mt-1">
                  Shell command to build the project (runs in the repo root)
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Output Directory
                </label>
                <input
                  type="text"
                  value={configForm.outputDir}
                  onChange={(e) =>
                    setConfigForm((prev) => ({
                      ...prev,
                      outputDir: e.target.value,
                    }))
                  }
                  placeholder="dist"
                  className="w-full bg-background border border-input hover:border-primary/40 focus:border-primary outline-none text-foreground px-2.5 py-1.5 rounded text-xs transition-all font-mono"
                />
                <p className="text-[10px] text-muted-foreground/50 mt-1">
                  Relative path to the build output directory
                </p>
              </div>
            </div>

            <div className="border-t border-input p-4 flex gap-2">
              <button
                onClick={() => setConfigOpen(false)}
                className="flex-1 px-3 py-2 text-xs font-medium bg-card-hover text-foreground rounded-md hover:bg-card-hover/70 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfig}
                disabled={saving}
                className="flex-1 px-3 py-2 text-xs font-medium bg-primary text-black rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
