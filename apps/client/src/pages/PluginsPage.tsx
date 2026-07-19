import { useState, useEffect } from "react";
import { useLiterals } from "@/lib";
import { literals as u } from "./PluginsPage.literals";
import { apiFetch } from "@/lib/api";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

export function PluginsPage() {
  const l = useLiterals(u);
  const navigate = useNavigate();

  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [memoryAutoStore, setMemoryAutoStore] = useState(false);

  // Estado de Exa Search (si está la API Key)
  const [hasExaKey, setHasExaKey] = useState(false);
  const [exaGlobalActive, setExaGlobalActive] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const fetchData = async () => {
    try {
      setLoading(true);
      setError("");

      const [resSettings, resEnv] = await Promise.all([
        apiFetch("/api/settings"),
        apiFetch("/api/env"),
      ]);

      if (!resSettings.ok || !resEnv.ok) {
        throw new Error(l.fetchError);
      }

      const settingsData = await resSettings.json();
      const envData = await resEnv.json();

      setMemoryEnabled(settingsData.memoryEnabled ?? false);
      setMemoryAutoStore(settingsData.memoryAutoStore ?? false);

      const envList = (envData.env ?? []) as Array<{ key: string }>;
      const exaKeyExists = envList.some((e) => e.key === "EXA_API_KEY");
      setHasExaKey(exaKeyExists);

      // Leemos de localStorage si el usuario tiene exa habilitado globalmente
      const exaGlobal = localStorage.getItem("exa-search-global-active") === "true";
      setExaGlobalActive(exaGlobal);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : l.fetchError;
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpdateMemorySettings = async (updates: {
    memoryEnabled?: boolean;
    memoryAutoStore?: boolean;
  }) => {
    setSaving(true);
    setSuccessMsg("");
    setError("");

    try {
      const res = await apiFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        throw new Error(l.saveError);
      }

      const data = await res.json();
      setMemoryEnabled(data.settings.memoryEnabled ?? false);
      setMemoryAutoStore(data.settings.memoryAutoStore ?? false);

      setSuccessMsg(l.saveSuccess);
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : l.saveError;
      setError(errMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleExaGlobal = (val: boolean) => {
    setExaGlobalActive(val);
    localStorage.setItem("exa-search-global-active", String(val));
    setSuccessMsg(l.saveSuccess);
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-bg">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg text-text-primary overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-8 w-full">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">{l.pluginsTitle}</h1>
          <p className="text-sm text-text-secondary">{l.pluginsSubtitle}</p>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div className="p-3.5 bg-error/10 border border-error/20 rounded-lg text-xs text-error font-semibold animate-pulse">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="p-3.5 bg-accent/10 border border-accent/20 rounded-lg text-xs text-accent font-semibold">
            {successMsg}
          </div>
        )}

        <div className="grid gap-6">
          {/* Card Memory */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="p-5 sm:p-6 bg-surface border border-border/20 rounded-xl space-y-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-bold text-text-primary">{l.cardMemoryTitle}</h2>
                  <span
                    className={`px-2 py-0.5 rounded text-2xs font-bold font-mono tracking-wide ${
                      memoryEnabled ? "bg-accent/10 text-accent" : "bg-text-secondary/15 text-text-secondary"
                    }`}
                  >
                    {memoryEnabled ? l.statusEnabled : l.statusDisabled}
                  </span>
                </div>
                <p className="text-sm text-text-secondary leading-relaxed">{l.cardMemoryDesc}</p>
              </div>
            </div>

            <div className="border-t border-border/10 pt-4 space-y-4">
              {/* Toggle Principal */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text-primary">{l.enablePlugin}</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={memoryEnabled}
                    disabled={saving}
                    onChange={(e) => handleUpdateMemorySettings({ memoryEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-border/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-primary after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
                </label>
              </div>

              {/* Sub-toggles (se muestran con indentación cuando está activo) */}
              {memoryEnabled && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="pl-5 border-l-2 border-border/15 space-y-4 pt-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary">{l.autoStoreInteractions}</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={memoryAutoStore}
                        disabled={saving}
                        onChange={(e) => handleUpdateMemorySettings({ memoryAutoStore: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4.5 bg-border/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-primary after:border-border after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-accent"></div>
                    </label>
                  </div>
                </motion.div>
              )}

              <p className="text-2xs text-text-secondary leading-snug">{l.localOnlyNotice}</p>
            </div>
          </motion.div>

          {/* Card Exa Search */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="p-5 sm:p-6 bg-surface border border-border/20 rounded-xl space-y-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-bold text-text-primary">{l.cardExaTitle}</h2>
                  <span
                    className={`px-2 py-0.5 rounded text-2xs font-bold font-mono tracking-wide ${
                      hasExaKey ? "bg-accent/10 text-accent" : "bg-warning/10 text-warning"
                    }`}
                  >
                    {hasExaKey ? l.statusConfigured : l.statusMissingKey}
                  </span>
                </div>
                <p className="text-sm text-text-secondary leading-relaxed">{l.cardExaDesc}</p>
              </div>
            </div>

            <div className="border-t border-border/10 pt-4 space-y-4">
              {hasExaKey ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-text-primary">{l.globalActivation}</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exaGlobalActive}
                      onChange={(e) => handleToggleExaGlobal(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-border/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-primary after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
                  </label>
                </div>
              ) : (
                <div className="p-4 bg-warning/5 border border-warning/15 rounded-lg space-y-2">
                  <p className="text-xs text-warning leading-snug">{l.missingKeyWarning}</p>
                  <button
                    onClick={() => navigate("/settings")}
                    className="text-xs text-accent font-semibold hover:underline cursor-pointer"
                  >
                    {l.configureKeyLink} &rarr;
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
