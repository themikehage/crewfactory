import { useState, useEffect, useCallback } from "react";
import type { FileInfo } from "shared";

interface Props {
  file: FileInfo | null;
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

export function WorkspaceFileEditor({ file, onSave }: Props) {
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const isImage = file?.mimeType?.startsWith("image/") || false;
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
    } else {
      setContent("");
      setDirty(false);
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
      setErrorMsg(err.message || "Failed to save file");
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

  if (!file) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-secondary/50 font-sans border-t border-surface sm:border-t-0 sm:border-l border-surface">
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

  const token = localStorage.getItem("token");
  const imageUrl = `/api/workspace/${file.path}?raw=true&token=${encodeURIComponent(
    token || ""
  )}`;
  const downloadUrl = `/api/workspace/${file.path}?download=true&token=${encodeURIComponent(
    token || ""
  )}`;

  return (
    <div className="h-full flex flex-col bg-[#0b0f19] border-t border-surface sm:border-t-0 sm:border-l border-surface">
      {/* Editor Header Bar */}
      <div className="h-9 px-3 border-b border-surface flex items-center justify-between flex-shrink-0 bg-[#0d1321]/80">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono font-semibold text-text-primary truncate">
            {file.name}
          </span>
          {dirty && (
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse flex-shrink-0" />
          )}
        </div>

        <div className="flex items-center gap-3">
          {saveStatus === "success" && (
            <span className="text-[10px] text-success font-sans flex items-center gap-1 animate-fade-in">
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
              className="text-[10px] text-error font-sans truncate max-w-[150px]"
              title={errorMsg}
            >
              Error saving
            </span>
          )}

          {isText && (
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className={`flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-sans font-semibold transition-all cursor-pointer ${
                dirty
                  ? "bg-accent text-text-primary hover:bg-accent/80 active:scale-95 shadow-sm"
                  : "bg-surfaceHover/30 text-text-secondary/40 cursor-not-allowed"
              }`}
            >
              {saving ? (
                <div className="w-2.5 h-2.5 border border-text-primary border-t-transparent rounded-full animate-spin" />
              ) : null}
              {saving ? "Saving" : "Save"}
            </button>
          )}

          <a
            href={downloadUrl}
            download={file.name}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-semibold text-text-secondary hover:text-text-primary hover:bg-surfaceHover/50 transition-colors"
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
          </a>
        </div>
      </div>

      {/* Editor Content Area */}
      <div className="flex-1 overflow-hidden min-h-0 relative">
        {isText ? (
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setDirty(true);
            }}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            className="w-full h-full bg-transparent text-text-primary font-mono text-[11px] leading-relaxed p-3.5 outline-none resize-none border-0 focus:ring-0"
            placeholder="File is empty"
          />
        ) : isImage ? (
          <div className="w-full h-full overflow-auto bg-black/10 flex items-center justify-center p-4">
            <img
              src={imageUrl}
              alt={file.name}
              className="max-w-full max-h-full object-contain rounded border border-surface shadow-md"
            />
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-text-secondary font-sans p-6 text-center">
            <svg
              width="24"
              height="24"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="text-text-secondary/50 mb-2"
            >
              <path
                fillRule="evenodd"
                d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-xs mb-3 font-semibold">Binary or unsupported preview file type</p>
            <p className="text-[10px] text-text-secondary/50 mb-4 max-w-xs">
              File: {file.name} ({Math.round(file.size / 1024)} KB)
            </p>
            <a
              href={downloadUrl}
              download={file.name}
              className="px-4 py-1.5 bg-surfaceHover hover:bg-surfaceHover/80 text-text-primary text-xs rounded font-semibold transition-colors"
            >
              Download File
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
