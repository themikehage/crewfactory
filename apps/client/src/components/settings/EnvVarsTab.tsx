import { useState } from "react";
import { useLiterals } from "@/lib";
import { literals as u } from "./EnvVarsTab.literals";

interface EnvVar {
  key: string;
  value: string;
}

interface EnvVarsTabProps {
  token: string | null;
  envVars: EnvVar[];
  envLoading: boolean;
  envError: string;
  setEnvError: (error: string) => void;
  fetchEnvVars: () => Promise<void>;
}

export function EnvVarsTab({
  token,
  envVars,
  envLoading,
  envError,
  setEnvError,
  fetchEnvVars,
}: EnvVarsTabProps) {
const l = useLiterals(u);
  const [isAddingEnv, setIsAddingEnv] = useState(false);
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvVal, setNewEnvVal] = useState("");
  const [savingEnv, setSavingEnv] = useState(false);
  const [isDevView, setIsDevView] = useState(false);
  const [bulkEnvText, setBulkEnvText] = useState("");
  const [isRevealed, setIsRevealed] = useState(false);
  const [localEnvLoading, setLocalEnvLoading] = useState(false);

  const handleSaveEnvVar = async () => {
    const formattedKey = newEnvKey.trim().toUpperCase();
    if (!formattedKey || !newEnvVal.trim()) return;

    if (!/^[A-Z_][A-Z0-9_]*$/.test(formattedKey)) {
      setEnvError("Invalid variable name. Must start with a letter or underscore and contain only letters, numbers, or underscores.");
      return;
    }

    setSavingEnv(true);
    setEnvError("");
    try {
      const res = await fetch("/api/env", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key: formattedKey, value: newEnvVal }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to save environment variable");
      }
      setNewEnvKey("");
      setNewEnvVal("");
      setIsAddingEnv(false);
      await fetchEnvVars();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Error saving environment variable";
      setEnvError(errMsg);
    } finally {
      setSavingEnv(false);
    }
  };

  const handleDeleteEnvVar = async (key: string) => {
    setEnvError("");
    try {
      const res = await fetch(`/api/env/${key}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delete environment variable");
      await fetchEnvVars();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Error deleting environment variable";
      setEnvError(errMsg);
    }
  };

  const handleToggleDevView = () => {
    if (isDevView) {
      setIsDevView(false);
      setIsRevealed(false);
      setEnvError("");
    } else {
      const text = envVars.map((v) => `${v.key}=${v.value}`).join("\n");
      setBulkEnvText(text);
      setIsDevView(true);
      setIsRevealed(false);
      setEnvError("");
    }
  };

  const handleToggleReveal = async () => {
    if (isRevealed) {
      const text = envVars.map((v) => `${v.key}=${v.value}`).join("\n");
      setBulkEnvText(text);
      setIsRevealed(false);
    } else {
      setLocalEnvLoading(true);
      setEnvError("");
      try {
        const res = await fetch("/api/env?reveal=true", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load environment variables");
        const data = await res.json();
        const unmaskedText = (data.env ?? [])
          .map((v: EnvVar) => `${v.key}=${v.value}`)
          .join("\n");
        setBulkEnvText(unmaskedText);
        setIsRevealed(true);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "Error loading environment variables";
        setEnvError(errMsg);
      } finally {
        setLocalEnvLoading(false);
      }
    }
  };

  const handleSaveBulkEnv = async () => {
    setSavingEnv(true);
    setEnvError("");
    try {
      const lines = bulkEnvText.split("\n");
      const variables: Record<string, string> = {};

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith("#")) {
          continue;
        }
        const eqIdx = line.indexOf("=");
        if (eqIdx === -1) {
          throw new Error(`Invalid format on line ${i + 1}: "${line}". Must be KEY=value`);
        }
        const key = line.slice(0, eqIdx).trim().toUpperCase();
        const value = line.slice(eqIdx + 1).trim();

        if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
          throw new Error(`Invalid key on line ${i + 1}: "${key}". Names must start with a letter or underscore and contain only alphanumeric characters or underscores.`);
        }
        if (!value) {
          throw new Error(`Value for key "${key}" cannot be empty. If you want to delete this variable, completely remove the line.`);
        }
        variables[key] = value;
      }

      const res = await fetch("/api/env", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ variables }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to update environment variables");
      }

      await fetchEnvVars();
      setIsDevView(false);
      setIsRevealed(false);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Error saving environment variables";
      setEnvError(errMsg);
    } finally {
      setSavingEnv(false);
    }
  };

  const isLoading = envLoading || localEnvLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-foreground font-semibold text-base">{l.title}</h2>
          <p className="text-muted-foreground text-[11px] mt-0.5">
            Configure custom environment variables (e.g., GITHUB_TOKEN, NOTION_TOKEN) for your agent's shell activities.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleToggleDevView}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
              isDevView
                ? "bg-primary/10 border-primary/25 text-primary"
                : "bg-card hover:bg-card-hover/50 border-input/30 text-muted-foreground hover:text-foreground"
            }`}
          >
            {isDevView ? "{l.standardView}" : "{l.developerView}"}
          </button>
          {!isDevView && (
            <button
              onClick={() => {
                setIsAddingEnv(true);
                setNewEnvKey("");
                setNewEnvVal("");
                setEnvError("");
              }}
              className="text-xs bg-primary text-background font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity flex-shrink-0 cursor-pointer"
            >
              Add Variable
            </button>
          )}
        </div>
      </div>

      {envError && (
        <p className="text-destructive text-sm p-3 bg-card rounded-lg">{envError}</p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : isDevView ? (
        <div className="space-y-4">
          <div className="bg-card rounded-lg p-3 sm:p-4 border border-input/30 space-y-3">
            <div className="flex items-center justify-between border-b border-input/30 pb-2">
              <span className="text-xs text-muted-foreground font-medium font-mono">
                .env Configuration
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleReveal}
                  className="text-[10px] bg-card-hover hover:bg-card-hover/80 text-muted-foreground hover:text-foreground font-semibold px-2 py-0.5 rounded-full select-none cursor-pointer font-mono"
                >
                  {isRevealed ? "{l.hideSecrets}" : "{l.revealSecrets}"}
                </button>
                <span className="text-[10px] bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full select-none uppercase tracking-wider font-mono">
                  Editor Mode
                </span>
              </div>
            </div>
            <textarea
              value={bulkEnvText}
              onChange={(e) => setBulkEnvText(e.target.value)}
              placeholder="# Example environment variables&#10;GITHUB_TOKEN=••••••••&#10;NOTION_TOKEN=secret_val"
              rows={12}
              className="w-full p-3 bg-background border border-input/30 rounded-lg
                         text-foreground font-mono text-xs placeholder-text-secondary/50 outline-none
                         focus:border-primary transition-colors resize-y leading-relaxed"
            />
            <div className="text-[11px] text-muted-foreground space-y-1">
              <p>• Edit variables in KEY=value format, one per line.</p>
              <p>• Existing secrets are masked as ••••••••. Keep them as is to leave their values unchanged.</p>
              <p>• Completely remove a line to delete that environment variable.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setIsDevView(false);
                setIsRevealed(false);
                setEnvError("");
              }}
              className="px-4 py-2 text-xs text-muted-foreground hover:text-foreground font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveBulkEnv}
              disabled={savingEnv}
              className="px-4 py-2 text-xs bg-primary text-background font-semibold rounded-lg
                         hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
            >
              {savingEnv ? "Saving..." : "{l.saveChanges}"}
            </button>
          </div>
        </div>
      ) : envVars.length === 0 ? (
        <div className="bg-card rounded-lg p-6 text-center border border-input/10">
          <p className="text-muted-foreground text-sm">{l.noVars}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {envVars.map((v) => (
            <div key={v.key} className="bg-card rounded-lg p-3 sm:p-4 flex items-center justify-between border border-input/10">
              <div className="min-w-0 flex-1 mr-4">
                <div className="text-foreground text-sm font-mono font-semibold truncate">
                  {v.key}
                </div>
                <div className="text-muted-foreground text-xs font-mono mt-0.5">
                  {v.value}
                </div>
              </div>
              <button
                onClick={() => handleDeleteEnvVar(v.key)}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 flex-shrink-0 cursor-pointer font-semibold"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {isAddingEnv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-lg w-full max-w-sm p-4 sm:p-6 space-y-4 border border-input/30">
            <h3 className="text-foreground font-semibold text-sm">
              Add Environment Variable
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">Variable Name</label>
                <input
                  type="text"
                  value={newEnvKey}
                  onChange={(e) => setNewEnvKey(e.target.value)}
                  placeholder="GITHUB_TOKEN"
                  autoFocus
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg
                             text-foreground placeholder-text-secondary outline-none
                             focus:border-primary transition-colors text-sm font-mono uppercase"
                />
              </div>
              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">Value</label>
                <input
                  type="password"
                  value={newEnvVal}
                  onChange={(e) => setNewEnvVal(e.target.value)}
                  placeholder={l.enterValue}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg
                             text-foreground placeholder-text-secondary outline-none
                             focus:border-primary transition-colors text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveEnvVar();
                    if (e.key === "Escape") setIsAddingEnv(false);
                  }}
                />
              </div>
            </div>
            {envError && <p className="text-destructive text-xs">{envError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setIsAddingEnv(false)}
                className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEnvVar}
                disabled={savingEnv || !newEnvKey.trim() || !newEnvVal.trim()}
                className="px-4 py-2 text-sm bg-primary text-background font-semibold rounded-lg
                           hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
              >
                {savingEnv ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
