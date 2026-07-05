import { useState, useEffect, useCallback } from "react";
import type { FileInfo } from "shared";
import { apiFetch } from "@/lib/api";
import { useLiterals } from "@/lib";
import { literals as u } from "./WorkspaceFileEditor.literals";

interface Props {
  file: FileInfo | null;
  activeRepoName: string | null;
  activeAgentId?: string | null;
  activeChannelId?: string | null;
  onSave: (path: string, content: string) => Promise<void>;
}

// Decode base64 to unicode string safely
function decodeBase64Unicode(str: string): string {
  try {
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

export function WorkspaceFileEditor({
  file,
  activeRepoName,
  activeAgentId = null,
  activeChannelId = null,
  onSave,
}: Props) {
const l = useLiterals(u);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [activeTab, setActiveTab] = useState<"code" | "preview">("code");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isImage = file?.mimeType?.startsWith("image/") || false;
  const isHtml = file?.name.endsWith(".html") || file?.name.endsWith(".htm") || false;
  const isText =
    file?.mimeType?.startsWith("text/") ||
    file?.mimeType === "application/json" ||
    file?.mimeType === "application/javascript" ||
    file?.mimeType === "application/typescript" ||
    file?.name.endsWith(".json") ||
    file?.name.endsWith(".md") ||
    file?.name.endsWith(".ts") ||
    file?.name.endsWith(".tsx") ||
    file?.name.endsWith(".js") ||
    file?.name.endsWith(".jsx") ||
    file?.name.endsWith(".html") ||
    file?.name.endsWith(".css") ||
    file?.name.endsWith(".env") ||
    file?.name.endsWith(".yml") ||
    file?.name.endsWith(".yaml") ||
    false;

  useEffect(() => {
    if (file) {
      if (isText && file.content) {
        setContent(decodeBase64Unicode(file.content));
      } else {
        setContent("");
      }
      setDirty(false);
      setSaveStatus("idle");
      setErrorMsg("");
      setActiveTab(isHtml ? "preview" : "code");
      setIsFullscreen(false);
    } else {
      setContent("");
      setDirty(false);
      setActiveTab("code");
      setIsFullscreen(false);
    }
  }, [file, isText]);

  const handleSave = useCallback(async () => {
    if (!file || saving) return;
    setSaving(true);
    setSaveStatus("idle");
    setErrorMsg("");
    try {
      await onSave(file.path, content);
      setDirty(false);
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (err: any) {
      setSaveStatus("error");
      setErrorMsg(err.message || l.saveError);
    } finally {
      setSaving(false);
    }
  }, [file, content, onSave, saving]);

  // Handle Ctrl+S keyboard shortcut inside textarea
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave]
  );

  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewBlobUrl(null);
      return;
    }
    let active = true;
    let url = "";

    const loadBlob = async () => {
      if (!isHtml && !isImage) {
        setPreviewBlobUrl(null);
        return;
      }
      try {
        const params = new URLSearchParams();
        if (activeRepoName) params.append("repo", activeRepoName);
        if (activeAgentId) params.append("agentId", activeAgentId);
        if (activeChannelId) params.append("channelId", activeChannelId);
        const contextQuery = params.toString() ? `&${params.toString()}` : "";
        const res = await apiFetch(`/api/workspace/${file.path}?raw=true${contextQuery}`);
        if (!res.ok) return;
        const blob = await res.blob();
        if (active) {
          url = URL.createObjectURL(blob);
          setPreviewBlobUrl(url);
        }
      } catch (err) {
        console.error("Failed to load preview blob:", err);
      }
    };

    loadBlob();

    return () => {
      active = false;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [file?.path, activeRepoName, activeAgentId, activeChannelId, isHtml, isImage, saveStatus]);

  if (!file) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground/50 font-sans border-t border-border sm:border-t-0 sm:border-l border-border">
        <svg
          width="32"
          height="32"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="mb-2"
        >
          <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6h8v2H6v-2zm0 4h8v2H6v-2zm0-8h4v2H6V6z" />
        </svg>
        <p className="text-xs">Select a file to inspect or edit</p>
      </div>
    );
  }

  const handleOpenRaw = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (previewBlobUrl) {
      window.open(previewBlobUrl, "_blank");
    } else {
      try {
        const params = new URLSearchParams();
        if (activeRepoName) params.append("repo", activeRepoName);
        if (activeAgentId) params.append("agentId", activeAgentId);
        if (activeChannelId) params.append("channelId", activeChannelId);
        const contextQuery = params.toString() ? `&${params.toString()}` : "";
        const res = await apiFetch(`/api/workspace/${file.path}?raw=true${contextQuery}`);
        if (!res.ok) throw new Error("Failed to load raw file");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
      } catch (err) {
        console.error("Error opening file:", err);
      }
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const params = new URLSearchParams();
      if (activeRepoName) params.append("repo", activeRepoName);
      if (activeAgentId) params.append("agentId", activeAgentId);
      if (activeChannelId) params.append("channelId", activeChannelId);
      const contextQuery = params.toString() ? `&${params.toString()}` : "";
      const res = await apiFetch(`/api/workspace/${file.path}?download=true${contextQuery}`);
      if (!res.ok) throw new Error("Failed to download");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading file:", err);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background border-t border-border sm:border-t-0 sm:border-l border-border">
      {/* Fullscreen HTML Preview Overlay */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col font-sans select-none animate-fade-in">
          <div className="h-10 px-4 border-b border-border flex items-center justify-between bg-background flex-shrink-0">
            <span className="text-xs font-mono font-semibold text-foreground truncate">
              Fullscreen Preview - {file.name}
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={handleOpenRaw}
                className="px-2.5 py-1 bg-surfaceHover hover:bg-surfaceHover/80 text-foreground text-[10px] rounded font-semibold transition-colors flex items-center gap-1 cursor-pointer"
              >
                New Tab
              </button>
              <button
                onClick={() => setIsFullscreen(false)}
                className="px-2.5 py-1 bg-primary hover:bg-primary/80 text-foreground text-[10px] rounded font-semibold transition-colors cursor-pointer"
              >
                Exit Fullscreen
              </button>
            </div>
          </div>
          <div className="flex-1 w-full h-full bg-white">
            <iframe
              src={previewBlobUrl || undefined}
              className="w-full h-full border-0"
              title={l.fullscreen}
            />
          </div>
        </div>
      )}

      {/* Editor Header Bar */}
      <div className="h-9 px-3 border-b border-border flex items-center justify-between flex-shrink-0 bg-background/80">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono font-semibold text-foreground truncate max-w-[100px] sm:max-w-none">
            {file.name}
          </span>
          {dirty && (
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse flex-shrink-0" />
          )}

          {/* HTML Tab Switcher */}
          {isHtml && (
            <div className="flex bg-background rounded p-0.5 border border-border ml-2">
              <button
                onClick={() => setActiveTab("code")}
                className={`px-2 py-0.5 rounded text-[9px] font-semibold transition-all cursor-pointer ${
                  activeTab === "code"
                    ? "bg-surfaceHover text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Code
              </button>
              <button
                onClick={() => setActiveTab("preview")}
                className={`px-2 py-0.5 rounded text-[9px] font-semibold transition-all cursor-pointer ${
                  activeTab === "preview"
                    ? "bg-surfaceHover text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Preview
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {saveStatus === "success" && (
            <span className="text-[10px] text-primary font-sans flex items-center gap-1 animate-fade-in">
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              Saved
            </span>
          )}

          {saveStatus === "error" && (
            <span
              className="text-[10px] text-destructive font-sans truncate max-w-[100px]"
              title={errorMsg}
            >
              Error
            </span>
          )}

          {isText && activeTab === "code" && (
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className={`flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-sans font-semibold transition-all cursor-pointer ${
                dirty
                  ? "bg-primary text-foreground hover:bg-primary/80 active:scale-95 shadow-sm"
                  : "bg-surfaceHover/30 text-muted-foreground/40 cursor-not-allowed"
              }`}
            >
              {saving ? (
                <div className="w-2.5 h-2.5 border border-text-primary border-t-transparent rounded-full animate-spin" />
              ) : null}
              {saving ? l.saving : l.save}
            </button>
          )}

          {/* HTML Preview Specific Actions */}
          {isHtml && activeTab === "preview" && (
            <>
              <button
                onClick={() => setIsFullscreen(true)}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-semibold text-muted-foreground hover:text-foreground hover:bg-surfaceHover/50 transition-colors cursor-pointer"
                title="Fullscreen Preview"
              >
                <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M3 4a1 1 0 011-1h3a1 1 0 010 2H5v2a1 1 0 01-2 0V4zm14 0a1 1 0 00-1-1h-3a1 1 0 100 2h2v2a1 1 0 102 0V4zM3 16a1 1 0 001 1h3a1 1 0 100-2H5v-2a1 1 0 10-2 0v3zm14 0a1 1 0 01-1 1h-3a1 1 0 110-2h2v-2a1 1 0 112 0v3z" />
                </svg>
                Fullscreen
              </button>
              <button
                onClick={handleOpenRaw}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-semibold text-muted-foreground hover:text-foreground hover:bg-surfaceHover/50 transition-colors cursor-pointer"
                title="Open in new tab"
              >
                <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                  <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                </svg>
                New Tab
              </button>
            </>
          )}

          <button
            onClick={handleDownload}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-semibold text-muted-foreground hover:text-foreground hover:bg-surfaceHover/50 transition-colors cursor-pointer"
            title="Download file"
          >
            <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
            Download
          </button>
        </div>
      </div>

      {/* Editor Content Area */}
      <div className="flex-1 overflow-hidden min-h-0 relative">
        {isText && activeTab === "code" ? (
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setDirty(true);
            }}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            className="w-full h-full bg-transparent text-foreground font-mono text-[11px] leading-relaxed p-3.5 outline-none resize-none border-0 focus:ring-0"
            placeholder="File is empty"
          />
        ) : isHtml && activeTab === "preview" ? (
          <div className="w-full h-full bg-white">
            <iframe
              src={previewBlobUrl || undefined}
              className="w-full h-full border-0"
              title="HTML Preview Pane"
            />
          </div>
        ) : isImage ? (
          <div className="w-full h-full overflow-auto bg-black/10 flex items-center justify-center p-4">
            <img
              src={previewBlobUrl || undefined}
              alt={file.name}
              className="max-w-full max-h-full object-contain rounded border border-border shadow-md"
            />
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground font-sans p-6 text-center">
            <svg
              width="24"
              height="24"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="text-muted-foreground/50 mb-2"
            >
              <path
                fillRule="evenodd"
                d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-xs mb-3 font-semibold">Binary or unsupported preview file type</p>
            <p className="text-[10px] text-muted-foreground/50 mb-4 max-w-xs">
              File: {file.name} ({Math.round(file.size / 1024)} KB)
            </p>
            <button
              onClick={handleDownload}
              className="px-4 py-1.5 bg-surfaceHover hover:bg-surfaceHover/80 text-foreground text-xs rounded font-semibold transition-colors cursor-pointer"
            >
              Download File
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
