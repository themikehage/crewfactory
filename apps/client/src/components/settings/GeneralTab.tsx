import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { LocaleSelector } from "./LocaleSelector";
import { ThemeToggle } from "./ThemeToggle";
import { useLiterals } from "@/lib";
import { literals as u } from "./GeneralTab.literals";
import { Dropdown } from "@/components/ui/Dropdown";
import { apiFetch } from "@/lib/api";

export function GeneralTab() {
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

  const [visionModel, setVisionModel] = useState("");
  const [imageGenModel, setImageGenModel] = useState("");
  const [visionModels, setVisionModels] = useState<Array<{ id: string; name: string; provider: string }>>([]);
  const [imageGenModels, setImageGenModels] = useState<Array<{ id: string; name: string; provider: string; description?: string; cost?: number; rpm?: number; concurrency?: number | null }>>([]);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [subagentMaxDepth, setSubagentMaxDepth] = useState<number>(1);

  // Vision Diagnostic Test State
  const [visionTestPrompt, setVisionTestPrompt] = useState("Describe this image in one word");
  const [visionTestFile, setVisionTestFile] = useState<File | null>(null);
  const [visionTestBase64, setVisionTestBase64] = useState<string | null>(null);
  const [visionTestMime, setVisionTestMime] = useState<string | null>(null);
  const [testingVision, setTestingVision] = useState(false);
  const [visionResult, setVisionResult] = useState<string | null>(null);
  const [visionError, setVisionError] = useState<string | null>(null);

  // Image Generation Diagnostic Test State
  const [imageTestPrompt, setImageTestPrompt] = useState("A cute coding robot logo, clean futuristic green theme");
  const [testingImage, setTestingImage] = useState(false);
  const [imageResult, setImageResult] = useState<string | null>(null);
  const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (imageBlobUrl) {
        window.URL.revokeObjectURL(imageBlobUrl);
      }
    };
  }, [imageBlobUrl]);

  const handleVisionFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        setVisionTestFile(file);
        setVisionTestBase64(base64);
        setVisionTestMime(file.type);
        setVisionResult(null);
        setVisionError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTestVision = async () => {
    setTestingVision(true);
    setVisionResult(null);
    setVisionError(null);
    try {
      const res = await apiFetch("/api/settings/test-vision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          modelId: visionModel,
          prompt: visionTestPrompt,
          image: visionTestBase64 || undefined,
          mimeType: visionTestMime || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      if (data.ok) {
        setVisionResult(data.response);
      } else {
        setVisionError(data.error || "Unknown diagnostic error");
      }
    } catch (err: any) {
      setVisionError(err.message || String(err));
    } finally {
      setTestingVision(false);
    }
  };

  const handleTestImageGen = async () => {
    setTestingImage(true);
    setImageResult(null);
    setImageError(null);
    if (imageBlobUrl) {
      window.URL.revokeObjectURL(imageBlobUrl);
      setImageBlobUrl(null);
    }
    try {
      const res = await apiFetch("/api/settings/test-image-gen", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          modelId: imageGenModel,
          prompt: imageTestPrompt,
          size: "1024x1024",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      if (data.ok && data.imageUrl) {
        setImageResult(data.imageUrl);

        const fileRes = await apiFetch(data.imageUrl + "?raw=true");
        if (!fileRes.ok) {
          throw new Error("Failed to download generated image for preview.");
        }
        const blob = await fileRes.blob();
        const objUrl = window.URL.createObjectURL(blob);
        setImageBlobUrl(objUrl);
      } else {
        setImageError(data.error || "Unknown image generation error");
      }
    } catch (err: any) {
      setImageError(err.message || String(err));
    } finally {
      setTestingImage(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const settingsRes = await apiFetch("/api/settings");
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          setVisionModel(settingsData.visionModel || "");
          setImageGenModel(settingsData.imageGenModel || "");
          setSubagentMaxDepth(settingsData.subagentMaxDepth ?? 1);
        }

        const modelsRes = await apiFetch("/api/models");
        if (modelsRes.ok) {
          const modelsData = await modelsRes.json();
          const filtered = (modelsData.models || []).filter((m: any) => m.input?.includes("image"));
          setVisionModels(filtered);
        }

        const imgModelsRes = await apiFetch("/api/models/images");
        if (imgModelsRes.ok) {
          const imgModelsData = await imgModelsRes.json();
          setImageGenModels(imgModelsData.models || []);
        }
      } catch (err) {
        console.error("Failed to load settings models:", err);
      } finally {
        setSettingsLoading(false);
      }
    };
    loadData();
  }, []);

  const handleUpdateVisionModel = async (model: string) => {
    setVisionModel(model);
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ visionModel: model }),
      });
    } catch (err) {
      console.error("Failed to update vision model settings:", err);
    }
  };

  const handleUpdateImageGenModel = async (model: string) => {
    setImageGenModel(model);
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageGenModel: model }),
      });
    } catch (err) {
      console.error("Failed to update image generation model settings:", err);
    }
  };

  const handleUpdateSubagentMaxDepth = async (depth: number) => {
    setSubagentMaxDepth(depth);
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ subagentMaxDepth: depth }),
      });
    } catch (err) {
      console.error("Failed to update subagent max depth settings:", err);
    }
  };

  const handleExportBackup = async () => {
    setExporting(true);
    setImportError("");
    setImportSuccess("");
    try {
      const res = await apiFetch(`/api/backup/export?type=${exportType}`);
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
      const errMsg = err instanceof Error ? err.message : l.errorExporting;
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

      const res = await apiFetch(`/api/backup/import?mode=${importMode}`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to import backup");
      }

      setImportSuccess(l.backupImported.replace("{mode}", importMode));
      setImportFile(null);
      setShowOverwriteModal(false);

      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : l.errorImporting;
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
            <div className="text-muted-foreground text-[11px]">{l.activeSession}</div>
          </div>
        </div>
        <button
          onClick={logout}
          className="text-xs bg-destructive/10 text-destructive hover:bg-destructive/20 border border-error/20 px-3.5 py-1.5 rounded-lg font-semibold transition-all cursor-pointer"
        >
          {l.signOut}
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

      <div className="bg-card rounded-lg p-4 border border-input/30 space-y-4">
        <h3 className="text-foreground font-semibold text-sm">{l.aiToolsConfig}</h3>
        <p className="text-muted-foreground text-[11px]">
          {l.aiToolsDesc}
        </p>
        {settingsLoading ? (
          <div className="text-xs text-muted-foreground animate-pulse">{l.loadingModels}</div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5 border-b border-input/10 pb-4">
              <label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                {l.visionModel}
              </label>
              <Dropdown<string>
                value={visionModel}
                onChange={handleUpdateVisionModel}
                options={visionModels.map(m => ({
                  value: `${m.provider}/${m.id}`,
                  label: `${m.name} (${m.provider})`,
                }))}
                placeholder={l.selectVisionModel}
                matchWidth
              />

              {visionModel && (
                <div className="mt-2 bg-background/50 p-3 rounded-lg border border-input/20 space-y-3 text-xs">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
                    {l.diagnoseVision}
                  </span>

                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={visionTestPrompt}
                        onChange={(e) => setVisionTestPrompt(e.target.value)}
                        placeholder={l.promptAnalyzeImage}
                        className="flex-1 px-3 py-1.5 bg-background border border-input rounded-lg text-foreground outline-none focus:border-primary text-xs"
                      />
                      <div className="flex gap-2">
                        <label className="flex items-center justify-center px-3 py-1.5 bg-background hover:bg-card-hover/20 border border-input rounded-lg cursor-pointer transition-colors text-muted-foreground hover:text-foreground text-[11px] font-semibold">
                          <span>{visionTestFile ? l.imageLoaded : l.uploadImage}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleVisionFileChange}
                            className="hidden"
                          />
                        </label>
                        {visionTestFile && (
                          <button
                            type="button"
                            onClick={() => {
                              setVisionTestFile(null);
                              setVisionTestBase64(null);
                              setVisionTestMime(null);
                            }}
                            className="px-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors border border-destructive/25 text-[11px] font-semibold"
                          >
                            {l.clear}
                          </button>
                        )}
                      </div>
                    </div>

                    {visionTestFile && visionTestBase64 && (
                      <div className="flex items-center gap-2 bg-background p-2 rounded-lg border border-input/10">
                        <img src={`data:${visionTestMime};base64,${visionTestBase64}`} alt="preview" className="w-10 h-10 object-cover rounded-md border border-input/30" />
                        <div className="text-[10px] text-muted-foreground truncate flex-1">{visionTestFile.name}</div>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={testingVision}
                      onClick={handleTestVision}
                      className="w-full text-center text-xs bg-primary/10 text-primary hover:bg-primary/20 border border-primary/25 py-2 rounded-lg font-semibold transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {testingVision ? l.analyzingImage : l.runVisionTest}
                    </button>
                  </div>

                  {visionResult && (
                    <div className="p-2.5 bg-success/5 border border-success/20 text-success rounded-md whitespace-pre-wrap leading-relaxed select-all font-mono text-[11px]">
                      <span className="font-bold block mb-1">{l.response}</span>
                      {visionResult}
                    </div>
                  )}

                  {visionError && (
                    <div className="p-2.5 bg-destructive/5 border border-error/20 text-destructive rounded-md whitespace-pre-wrap font-mono text-[11px] break-words select-all">
                      <span className="font-bold block mb-1">{l.diagnosticFailure}</span>
                      {visionError}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                {l.imageGenModel}
              </label>
              <Dropdown<string>
                value={imageGenModel}
                onChange={handleUpdateImageGenModel}
                options={imageGenModels.map(m => ({
                  value: m.id,
                  label: m.name,
                }))}
                placeholder={l.selectImageGenModel}
                matchWidth
              />

              {(() => {
                const selected = imageGenModels.find(m => m.id === imageGenModel);
                if (!selected) return null;
                return (
                  <div className="mt-2 bg-background p-3 rounded-lg border border-input/20 space-y-2 text-xs">
                    {selected.description && (
                      <p className="text-muted-foreground leading-relaxed">
                        {selected.description}
                      </p>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2.5 border-t border-input/10">
                      {selected.cost !== undefined && (
                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">{l.cost}</span>
                          <span className="text-foreground font-semibold">${selected.cost}{l.perImage}</span>
                        </div>
                      )}
                      {selected.rpm !== undefined && (
                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">{l.rateLimit}</span>
                          <span className="text-foreground font-semibold">{selected.rpm} {l.rpm}</span>
                        </div>
                      )}
                      {selected.concurrency !== undefined && selected.concurrency !== null && (
                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">{l.concurrency}</span>
                          <span className="text-foreground font-semibold">{selected.concurrency} {l.concurrent}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {imageGenModel && (
                <div className="mt-2 bg-background/50 p-3 rounded-lg border border-input/20 space-y-3 text-xs">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
                    {l.diagnoseImageGen}
                  </span>

                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={imageTestPrompt}
                        onChange={(e) => setImageTestPrompt(e.target.value)}
                        placeholder={l.promptGenerateImage}
                        className="flex-1 px-3 py-1.5 bg-background border border-input rounded-lg text-foreground outline-none focus:border-primary text-xs"
                      />
                      <button
                        type="button"
                        disabled={testingImage || !imageTestPrompt.trim()}
                        onClick={handleTestImageGen}
                        className="px-4 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/25 rounded-lg font-semibold transition-all disabled:opacity-50 cursor-pointer text-[11px]"
                      >
                        {testingImage ? l.generating : l.generateTestImage}
                      </button>
                    </div>
                  </div>

                  {imageResult && (
                    <div className="p-2.5 bg-success/5 border border-success/20 text-success rounded-md space-y-2">
                      <span className="font-bold block text-[11px]">{l.imageGenerated}</span>
                      <div className="relative group max-w-sm rounded-lg overflow-hidden border border-input/40 bg-card p-1">
                        {imageBlobUrl ? (
                          <img src={imageBlobUrl} alt="Generated Test" className="w-full h-auto object-contain rounded-md" />
                        ) : (
                          <div className="w-full h-32 flex items-center justify-center bg-card text-[11px] text-muted-foreground">{l.loadingImagePreview}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {imageError && (
                    <div className="p-2.5 bg-destructive/5 border border-error/20 text-destructive rounded-md whitespace-pre-wrap font-mono text-[11px] break-words select-all">
                      <span className="font-bold block mb-1">{l.diagnosticFailure}</span>
                      {imageError}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-card rounded-lg p-4 border border-input/30 space-y-4">
        <h3 className="text-foreground font-semibold text-sm">{l.subagents}</h3>
        <p className="text-muted-foreground text-[11px]">
          {l.subagentMaxDepthDesc}
        </p>
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between text-xs font-semibold text-foreground">
            <span>{l.subagentMaxDepth}</span>
            <span className="bg-primary/10 text-primary px-2.5 py-0.5 rounded-full font-mono text-[10px]">
              {subagentMaxDepth === 0
                ? l.noSubagents
                : subagentMaxDepth === 1
                  ? l.directSubagentsOnly
                  : l.nestedSubagents.replace("{depth}", String(subagentMaxDepth))}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="5"
            step="1"
            value={subagentMaxDepth}
            onChange={(e) => handleUpdateSubagentMaxDepth(parseInt(e.target.value, 10))}
            className="w-full accent-accent bg-background cursor-pointer h-1.5 rounded-lg border-none outline-none"
          />
          {subagentMaxDepth > 1 && (
            <p className="text-warning text-[10px] bg-warning/5 border border-warning/15 p-2 rounded-lg leading-relaxed">
              {l.warningMaxDepth}
            </p>
          )}
        </div>
      </div>

      <div className="bg-card rounded-lg p-4 border border-input/30 space-y-2">
        <h3 className="text-foreground font-semibold text-sm">{l.mcpLink}</h3>
        <p className="text-muted-foreground text-[11px]">{l.mcpDesc}</p>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("navigate", { detail: { path: "/mcps" } }))}
          className="text-xs bg-primary/10 text-primary hover:bg-primary/20 border border-primary/25 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer"
        >
          {l.openMCP}
        </button>
      </div>

      <div className="bg-card rounded-lg p-4 border border-input/30">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-foreground font-semibold text-sm">{l.password}</h3>
          {!showPasswordForm && (
            <button
              onClick={() => {
                setShowPasswordForm(true);
                setPwError("");
                setPwSuccess(false);
              }}
              className="text-xs bg-primary/10 text-primary hover:bg-primary/20 border border-primary/25 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer"
            >
              {l.change}
            </button>
          )}
        </div>
        {showPasswordForm && (
          <div className="space-y-3">
            <input
              type="password"
              placeholder={l.currentPassword}
              value={pwCurrent}
              onChange={(e) => setPwCurrent(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder-text-secondary outline-none focus:border-primary transition-colors text-sm"
            />
            <input
              type="password"
              placeholder={l.newPassword}
              value={pwNew}
              onChange={(e) => setPwNew(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder-text-secondary outline-none focus:border-primary transition-colors text-sm"
            />
            <input
              type="password"
              placeholder={l.confirmPassword}
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder-text-secondary outline-none focus:border-primary transition-colors text-sm"
            />
            {pwError && <p className="text-destructive text-xs">{pwError}</p>}
            {pwSuccess && <p className="text-primary text-xs">{l.passwordUpdated}</p>}
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
                {l.cancel}
              </button>
              <button
                onClick={async () => {
                  if (!pwCurrent || !pwNew || !pwConfirm) {
                    setPwError(l.allFieldsRequired);
                    return;
                  }
                  if (pwNew !== pwConfirm) {
                    setPwError(l.passwordsDoNotMatch);
                    return;
                  }
                  if (pwNew.length < 8) {
                    setPwError(l.passwordMinLength);
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
                    const errMsg = err instanceof Error ? err.message : l.failedChangePassword;
                    setPwError(errMsg);
                  } finally {
                    setPwSaving(false);
                  }
                }}
                disabled={pwSaving}
                className="text-xs bg-primary/10 text-primary hover:bg-primary/20 border border-primary/25 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer disabled:opacity-50"
              >
                {pwSaving ? l.saving : l.save}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-card rounded-lg p-4 border border-input/30 space-y-4">
        <h3 className="text-foreground font-semibold text-sm">{l.systemStatus}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="space-y-0.5">
            <div className="text-muted-foreground font-medium">{l.apiBaseUrl}</div>
            <div className="text-foreground font-mono break-words">/api/v1</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-muted-foreground font-medium">{l.sessionStorage}</div>
            <div className="text-foreground">{l.jwtFilesystem}</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-muted-foreground font-medium">{l.workspaceContext}</div>
            <div className="text-foreground font-mono break-words">themikehage/crewfactory</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-muted-foreground font-medium">{l.healthStatus}</div>
            <div className="text-primary flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              {l.online}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-lg p-4 border border-input/30 space-y-4">
        <div>
          <h3 className="text-foreground font-semibold text-sm">{l.backupPortability}</h3>
          <p className="text-muted-foreground text-[11px] mt-0.5">
            {l.backupDesc}
          </p>
        </div>

        <div className="border-t border-input/30 pt-3 space-y-3">
          <div className="text-xs font-semibold text-foreground">{l.exportOptions}</div>
          <div className="flex flex-col gap-2 text-xs">
            <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
              <input
                type="radio"
                name="exportType"
                checked={exportType === "light"}
                onChange={() => setExportType("light")}
                className="accent-accent"
              />
              <span>{l.lightweight}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
              <input
                type="radio"
                name="exportType"
                checked={exportType === "full"}
                onChange={() => setExportType("full")}
                className="accent-accent"
              />
              <span>{l.fullBackup}</span>
            </label>
          </div>
          <button
            onClick={handleExportBackup}
            disabled={exporting}
            className="text-xs bg-primary/10 text-primary hover:bg-primary/20 border border-primary/25 px-4 py-2 rounded-lg font-semibold transition-all cursor-pointer disabled:opacity-50"
          >
            {exporting ? l.generatingBackup : l.exportDownload}
          </button>
        </div>

        <div className="border-t border-input/30 pt-3 space-y-3">
          <div className="text-xs font-semibold text-foreground">{l.importBackup}</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{l.importMode}</label>
              <Dropdown<"merge" | "overwrite">
                value={importMode}
                onChange={setImportMode}
                options={[
                  { value: "merge" as const, label: l.mergeMode },
                  { value: "overwrite" as const, label: l.overwriteMode },
                ]}
                matchWidth
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{l.selectZipFile}</label>
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
              className={`text-xs px-4 py-2 rounded-lg font-semibold transition-all cursor-pointer disabled:opacity-50 ${importMode === "overwrite"
                  ? "bg-destructive/10 text-destructive hover:bg-destructive/20 border border-error/25"
                  : "bg-primary/10 text-primary hover:bg-primary/20 border border-primary/25"
                }`}
            >
              {importing ? l.importingBackup : importMode === "overwrite" ? l.restoreOverwrite : l.importMerge}
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
              {l.destructiveOverwrite}
            </h3>
            <p className="text-muted-foreground text-xs leading-relaxed">
              {l.overwriteWarning1} <strong className="text-foreground">{l.overwriteModeLabel}</strong> {l.overwriteWarning2}
            </p>

            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-2">
              <div className="text-primary font-semibold text-xs">{l.safeRecommendation}</div>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                {l.backupRecommendation}
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
                {l.downloadBackupNow}
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-muted-foreground text-xs uppercase font-bold tracking-wider">
                {l.typeOverwriteConfirm}
              </label>
              <input
                type="text"
                value={overwriteConfirmation}
                onChange={(e) => setOverwriteConfirmation(e.target.value)}
                placeholder={l.overwritePlaceholder}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground outline-none focus:border-error transition-colors text-sm uppercase"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setShowOverwriteModal(false)}
                className="text-xs bg-card-hover/20 text-muted-foreground hover:text-foreground border border-input/30 px-3.5 py-2 rounded-lg font-semibold transition-all cursor-pointer"
              >
                {l.cancel}
              </button>
              <button
                disabled={overwriteConfirmation.toUpperCase() !== "OVERWRITE"}
                onClick={() => handleImportBackup(true)}
                className="text-xs bg-destructive/10 text-destructive hover:bg-destructive/20 border border-error/25 px-3.5 py-2 rounded-lg font-semibold transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {l.confirmWipe}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
