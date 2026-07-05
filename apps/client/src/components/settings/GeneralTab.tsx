import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { LocaleSelector } from "./LocaleSelector";
import { ThemeToggle } from "./ThemeToggle";
import { useLiterals } from "@/lib";
import { literals as u } from "./GeneralTab.literals";

interface GeneralTabProps {
  token: string | null;
}

export function GeneralTab({ token }: GeneralTabProps) {
  const { user, logout, changePassword } = useAuth();
  const l = useLiterals(u);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  const [exportType, setExportType] = useState<"light" | "full">("light");
  const [importMode, setImportMode] = useState<"merge" | "overwrite">("merge");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState("");
  const [showOverwriteModal, setShowOverwriteModal] = useState(false);
  const [overwriteConfirmation, setOverwriteConfirmation] = useState("");
  const [exporting, setExporting] = useState(false);

  const handleExportBackup = async () => {
    setExporting(true);
    setImportError("");
    setImportSuccess("");
    try {
      const res = await fetch(`/api/backup/export?type=${exportType}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to download backup");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `crewfactory-backup-${user?.username}-${exportType}-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Error exporting backup";
      setImportError(errMsg);
    } finally {
      setExporting(false);
    }
  };

  const handleImportBackup = async (skipModal = false) => {
    if (!importFile) return;

    if (importMode === "overwrite" && !skipModal) {
      setShowOverwriteModal(true);
      setOverwriteConfirmation("");
      return;
    }

    setImporting(true);
    setImportError("");
    setImportSuccess("");
    try {
      const formData = new FormData();
      formData.append("file", importFile);

      const res = await fetch(`/api/backup/import?mode=${importMode}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to import backup");
      }

      setImportSuccess(`Backup imported successfully via ${importMode} mode.`);
      setImportFile(null);
      setShowOverwriteModal(false);

      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Error importing backup";
      setImportError(errMsg);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-lg p-4 flex items-center justify-between border border-input/30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold font-mono uppercase select-none">
            {user?.username?.[0] || "?"}
          </div>
          <div>
            <div className="text-foreground text-sm font-medium">{user?.username}</div>
            <div className="text-muted-foreground text-[11px]">Active Session</div>
          </div>
        </div>
        <button
          onClick={logout}
          className="text-xs bg-destructive/10 text-destructive hover:bg-destructive/20 border border-error/20 px-3.5 py-1.5 rounded-lg font-semibold transition-all cursor-pointer"
        >
          Sign Out
        </button>
      </div>

      <div className="bg-card rounded-lg p-4 border border-input/30 space-y-4">
        <h3 className="text-foreground font-semibold text-sm">{l.appearance}</h3>
        <div className="flex flex-col gap-3">
          <ThemeToggle />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider w-14">
              {l.language}
            </span>
            <LocaleSelector />
          </div>
        </div>
      </div>

      <div className="bg-card rounded-lg p-4 border border-input/30 space-y-2">
        <h3 className="text-foreground font-semibold text-sm">{l.mcpLink}</h3>
        <p className="text-muted-foreground text-[11px]">{l.mcpDesc}</p>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("navigate", { detail: { path: "/mcps" } }))}
          className="text-xs bg-primary/10 text-primary hover:bg-primary/20 border border-primary/25 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer"
        >
          Open MCP Marketplace
        </button>
      </div>

      <div className="bg-card rounded-lg p-4 border border-input/30">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-foreground font-semibold text-sm">Password</h3>
          {!showPasswordForm && (
            <button
              onClick={() => {
                setShowPasswordForm(true);
                setPwError("");
                setPwSuccess(false);
              }}
              className="text-xs bg-primary/10 text-primary hover:bg-primary/20 border border-primary/25 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer"
            >
              Change
            </button>
          )}
        </div>
        {showPasswordForm && (
          <div className="space-y-3">
            <input
              type="password"
              placeholder="Current password"
              value={pwCurrent}
              onChange={(e) => setPwCurrent(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder-text-secondary outline-none focus:border-primary transition-colors text-sm"
            />
            <input
              type="password"
              placeholder="New password"
              value={pwNew}
              onChange={(e) => setPwNew(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder-text-secondary outline-none focus:border-primary transition-colors text-sm"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder-text-secondary outline-none focus:border-primary transition-colors text-sm"
            />
            {pwError && <p className="text-destructive text-xs">{pwError}</p>}
            {pwSuccess && <p className="text-primary text-xs">Password updated successfully.</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowPasswordForm(false);
                  setPwCurrent("");
                  setPwNew("");
                  setPwConfirm("");
                  setPwError("");
                  setPwSuccess(false);
                }}
                className="text-xs bg-card-hover/20 text-muted-foreground hover:text-foreground border border-input/30 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!pwCurrent || !pwNew || !pwConfirm) {
                    setPwError("All fields are required");
                    return;
                  }
                  if (pwNew !== pwConfirm) {
                    setPwError("New passwords do not match");
                    return;
                  }
                  if (pwNew.length < 8) {
                    setPwError("New password must be at least 8 characters");
                    return;
                  }
                  setPwSaving(true);
                  setPwError("");
                  setPwSuccess(false);
                  try {
                    await changePassword(pwCurrent, pwNew);
                    setPwSuccess(true);
                    setPwCurrent("");
                    setPwNew("");
                    setPwConfirm("");
                  } catch (err: unknown) {
                    const errMsg = err instanceof Error ? err.message : "Failed to change password";
                    setPwError(errMsg);
                  } finally {
                    setPwSaving(false);
                  }
                }}
                disabled={pwSaving}
                className="text-xs bg-primary/10 text-primary hover:bg-primary/20 border border-primary/25 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer disabled:opacity-50"
              >
                {pwSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-card rounded-lg p-4 border border-input/30 space-y-4">
        <h3 className="text-foreground font-semibold text-sm">System Status</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="space-y-0.5">
            <div className="text-muted-foreground font-medium">API Base URL</div>
            <div className="text-foreground font-mono break-all">/api/v1</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-muted-foreground font-medium">Session Storage</div>
            <div className="text-foreground">JWT + Server Filesystem</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-muted-foreground font-medium">Workspace Context</div>
            <div className="text-foreground font-mono break-all">themikehage/crewfactory</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-muted-foreground font-medium">Health Status</div>
            <div className="text-primary flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Online
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-lg p-4 border border-input/30 space-y-4">
        <div>
          <h3 className="text-foreground font-semibold text-sm">Backup & Portability</h3>
          <p className="text-muted-foreground text-[11px] mt-0.5">
            Export your configuration and workspaces or import a zip backup.
          </p>
        </div>

        <div className="border-t border-input/30 pt-3 space-y-3">
          <div className="text-xs font-semibold text-foreground">Export Options</div>
          <div className="flex flex-col gap-2 text-xs">
            <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
              <input
                type="radio"
                name="exportType"
                checked={exportType === "light"}
                onChange={() => setExportType("light")}
                className="accent-accent"
              />
              <span>Lightweight (Configs, custom skills, agent/channel definitions)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
              <input
                type="radio"
                name="exportType"
                checked={exportType === "full"}
                onChange={() => setExportType("full")}
                className="accent-accent"
              />
              <span>Full Backup (Includes repos & uploads, skips node_modules)</span>
            </label>
          </div>
          <button
            onClick={handleExportBackup}
            disabled={exporting}
            className="text-xs bg-primary/10 text-primary hover:bg-primary/20 border border-primary/25 px-4 py-2 rounded-lg font-semibold transition-all cursor-pointer disabled:opacity-50"
          >
            {exporting ? "Generating Backup..." : "Export & Download"}
          </button>
        </div>

        <div className="border-t border-input/30 pt-3 space-y-3">
          <div className="text-xs font-semibold text-foreground">Import Backup</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Import Mode</label>
              <select
                value={importMode}
                onChange={(e) => setImportMode(e.target.value as "merge" | "overwrite")}
                className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-foreground outline-none focus:border-primary transition-colors text-xs"
              >
                <option value="merge">Merge (Keep current, update matching)</option>
                <option value="overwrite">Overwrite (Wipe all data, restore zip)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Select ZIP File</label>
              <input
                type="file"
                accept=".zip"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 0) {
                    setImportFile(files[0]);
                    setImportError("");
                    setImportSuccess("");
                  }
                }}
                className="w-full text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-card-hover/30 file:text-foreground hover:file:bg-card-hover/50 file:cursor-pointer"
              />
            </div>
          </div>

          {importError && (
            <div className="p-3 bg-destructive/10 border border-error/20 rounded-lg text-destructive text-xs">
              {importError}
            </div>
          )}

          {importSuccess && (
            <div className="p-3 bg-primary/10 border border-success/20 rounded-lg text-primary text-xs">
              {importSuccess}
            </div>
          )}

          {importFile && (
            <button
              onClick={() => handleImportBackup(false)}
              disabled={importing}
              className={`text-xs px-4 py-2 rounded-lg font-semibold transition-all cursor-pointer disabled:opacity-50 ${
                importMode === "overwrite"
                  ? "bg-destructive/10 text-destructive hover:bg-destructive/20 border border-error/25"
                  : "bg-primary/10 text-primary hover:bg-primary/20 border border-primary/25"
              }`}
            >
              {importing ? "Importing Backup..." : importMode === "overwrite" ? "Restore Backup (Wipe & Write)" : "Import & Merge"}
            </button>
          )}
        </div>
      </div>

      {showOverwriteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-input/80 rounded-xl p-5 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-destructive font-bold text-base flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Destructive Overwrite Action
            </h3>
            <p className="text-muted-foreground text-xs leading-relaxed">
              You are about to restore a backup using <strong className="text-foreground">Overwrite</strong> mode. This will permanently delete all your existing configuration, credentials, agents, channels, and projects.
            </p>

            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-2">
              <div className="text-primary font-semibold text-xs">Safe Recommendation:</div>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                We highly recommend exporting and downloading a backup of your current setup before overwriting.
              </p>
              <button
                onClick={() => {
                  const backupExportType = exportType;
                  setExportType("light");
                  handleExportBackup();
                  setExportType(backupExportType);
                }}
                className="w-full text-center text-[11px] font-semibold text-primary hover:text-primary/80 border border-primary/25 hover:bg-primary/5 py-1.5 rounded-md transition-all cursor-pointer"
              >
                Download Backup Now
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-muted-foreground text-xs uppercase font-bold tracking-wider">
                Type "OVERWRITE" to confirm
              </label>
              <input
                type="text"
                value={overwriteConfirmation}
                onChange={(e) => setOverwriteConfirmation(e.target.value)}
                placeholder="OVERWRITE"
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground outline-none focus:border-error transition-colors text-sm uppercase"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setShowOverwriteModal(false)}
                className="text-xs bg-card-hover/20 text-muted-foreground hover:text-foreground border border-input/30 px-3.5 py-2 rounded-lg font-semibold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={overwriteConfirmation.toUpperCase() !== "OVERWRITE"}
                onClick={() => handleImportBackup(true)}
                className="text-xs bg-destructive/10 text-destructive hover:bg-destructive/20 border border-error/25 px-3.5 py-2 rounded-lg font-semibold transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Confirm & Wipe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
