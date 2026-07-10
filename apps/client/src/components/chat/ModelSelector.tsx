import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "@/hooks/useRouter";
import { PortalPopover } from "./PortalPopover";
import { useLiterals } from "@/lib";
import { literals as u } from "./ChatInput.literals";

interface ProviderInfo {
  id: string;
  name: string;
  authStatus: { configured: boolean };
  models: Array<{ id: string; name: string; reasoning: boolean; input?: string[] }>;
}

interface SelectedModel {
  provider: string;
  modelId: string;
  modelName: string;
}

interface Props {
  sessionId: string | null;
  disabled?: boolean;
  value?: string;
  onChange?: (modelId: string) => void;
  compact?: boolean;
}

const STORAGE_KEY = "crewfy-selected-model";
const RECENT_MODELS_KEY = "crewfy-recent-models";

function parseModelString(modelId: string): SelectedModel | null {
  const idx = modelId.indexOf("/");
  if (idx === -1) return null;
  return { provider: modelId.slice(0, idx), modelId: modelId.slice(idx + 1), modelName: modelId.slice(idx + 1) };
}

export function ModelSelector({ sessionId, disabled = false, value, onChange, compact = false }: Props) {
  const controlled = onChange !== undefined;
  const l = useLiterals(u);

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selected, setSelected] = useState<SelectedModel | null>(() => {
    if (controlled) {
      return value ? parseModelString(value) : null;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem("crewfy-selected-model");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [recentModels, setRecentModels] = useState<SelectedModel[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_MODELS_KEY) ?? localStorage.getItem("pi-recent-models");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [open, setOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedRef = useRef<SelectedModel | null>(selected);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { navigate } = useRouter();

  const applyModelToSession = useCallback(
    async (model: SelectedModel, sid: string) => {
      const token = localStorage.getItem("token");
      try {
        const res = await fetch(`/api/sessions/${sid}/model`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            provider: model.provider,
            modelId: model.modelId,
            thinkingLevel: "medium",
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Failed to set model");
        } else {
          setError(null);
        }
      } catch {
        setError("Failed to set model");
      }
    },
    []
  );


  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    if (controlled && value) {
      const parsed = parseModelString(value);
      if (parsed) setSelected(parsed);
    }
  }, [controlled, value]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch("/api/providers", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        const configured = (data.providers ?? [])
          .filter((p: ProviderInfo) => p.authStatus.configured)
          .sort((a: ProviderInfo, b: ProviderInfo) => a.name.localeCompare(b.name));
        setProviders(configured);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (providers.length === 0) return;

    if (selected) {
      const providerExists = providers.find((p) => p.id === selected.provider);
      const modelExists = providerExists?.models.some((m) => m.id === selected.modelId);

      if (!providerExists || !modelExists) {
        const firstProvider = providers[0];
        const firstModel = firstProvider.models[0];
        if (firstModel) {
          const fallbackSelection = {
            provider: firstProvider.id,
            modelId: firstModel.id,
            modelName: firstModel.name,
          };
          setSelected(fallbackSelection);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(fallbackSelection));
          setError(null);
          if (sessionId) {
            applyModelToSession(fallbackSelection, sessionId);
          }
        }
      }
    } else {
      const firstProvider = providers[0];
      const firstModel = firstProvider.models[0];
      if (firstModel) {
        const fallbackSelection = {
          provider: firstProvider.id,
          modelId: firstModel.id,
          modelName: firstModel.name,
        };
        setSelected(fallbackSelection);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fallbackSelection));
        setError(null);
        if (sessionId) {
          applyModelToSession(fallbackSelection, sessionId);
        }
      }
    }
  }, [providers, selected, sessionId, applyModelToSession]);

  useEffect(() => {
    if (!sessionId || !selectedRef.current) return;
    applyModelToSession(selectedRef.current, sessionId);
  }, [sessionId, applyModelToSession]);

  const handleSelectModel = useCallback(
    async (provider: string, modelId: string, modelName: string) => {
      const newSelection: SelectedModel = { provider, modelId, modelName };
      setSelected(newSelection);
      selectedRef.current = newSelection;
      setOpen(false);
      setActiveProvider(null);

      setRecentModels((prev) => {
        const filtered = prev.filter(
          (rm) => !(rm.provider === provider && rm.modelId === modelId)
        );
        const updated = [newSelection, ...filtered].slice(0, 5);
        localStorage.setItem(RECENT_MODELS_KEY, JSON.stringify(updated));
        return updated;
      });

      if (controlled) {
        onChange(`${provider}/${modelId}`);
        return;
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSelection));

      if (!sessionId) return;
      await applyModelToSession(newSelection, sessionId);
    },
    [controlled, onChange, sessionId, applyModelToSession]
  );

  const isModelAvailable = useCallback(
    (model: SelectedModel) => {
      const p = providers.find((prov) => prov.id === model.provider);
      return !!p?.models.some((m) => m.id === model.modelId);
    },
    [providers]
  );

  const currentProvider = activeProvider
    ? providers.find((p) => p.id === activeProvider)
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => {
          if (disabled) return;
          setOpen(!open);
          setActiveProvider(null);
        }}
        disabled={disabled}
        className={
          compact
            ? `flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-border/40 bg-[#171717] hover:bg-[#313131] text-xs text-muted-foreground hover:text-foreground transition-all cursor-pointer ${
                disabled ? "opacity-50 cursor-not-allowed" : ""
              }`
            : `flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5 cursor-pointer ${
                disabled ? "opacity-50 cursor-not-allowed" : ""
              }`
        }
      >
        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="text-primary flex-shrink-0">
          <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm0 2h12v2H4V6zm0 4h3v4H4v-4zm5 0h7v4H9v-4z" clipRule="evenodd" />
        </svg>
        <span className={compact ? "truncate max-w-[120px]" : "truncate max-w-[200px]"}>
          {selected ? selected.modelName : "Select model"}
        </span>
        {error && (
          <span className="text-destructive ml-1" title={error}>!</span>
        )}
        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className={`transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`}>
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      <PortalPopover triggerRef={triggerRef} open={open} onClose={() => { setOpen(false); setActiveProvider(null); }}>
        <div className="w-72 bg-[#171717] border border-border rounded-xl shadow-xl overflow-hidden flex flex-col max-h-80">
          {activeProvider && currentProvider ? (
            <>
              <button
                onClick={() => setActiveProvider(null)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-card-hover transition-colors border-b border-input"
              >
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {currentProvider.name}
              </button>
              <div className="max-h-48 overflow-y-auto">
                {currentProvider.models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handleSelectModel(currentProvider.id, m.id, m.name)}
                    className={`w-full px-4 py-2 text-xs transition-colors flex items-center justify-between gap-2 ${
                      selected?.provider === currentProvider.id && selected?.modelId === m.id
                        ? "bg-primary/15 text-primary"
                        : "text-foreground hover:bg-card-hover"
                    }`}
                  >
                    <span className="truncate">{m.name}</span>
                    {m.input?.includes("image") && (
                      <span className="text-[9px] font-semibold bg-primary/20 text-primary border border-primary/30 px-1 rounded flex-shrink-0">
                        Vision
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="max-h-56 overflow-y-auto">
                {recentModels.length > 0 && (
                  <div className="border-b border-input pb-1.5 mb-1.5">
                    <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {l.recentModels}
                    </div>
                    {[...recentModels]
                      .sort((a, b) => {
                        const aAvailable = isModelAvailable(a);
                        const bAvailable = isModelAvailable(b);
                        if (aAvailable && !bAvailable) return -1;
                        if (!aAvailable && bAvailable) return 1;
                        return 0;
                      })
                      .map((rm) => {
                        const isAvailable = isModelAvailable(rm);
                        return (
                          <button
                            key={`${rm.provider}/${rm.modelId}`}
                            disabled={!isAvailable}
                            onClick={() => handleSelectModel(rm.provider, rm.modelId, rm.modelName)}
                            className={`w-full flex items-center justify-between px-3 py-1.5 text-xs transition-colors ${
                              isAvailable
                                ? "text-foreground hover:bg-card-hover cursor-pointer"
                                : "text-muted-foreground opacity-40 cursor-not-allowed"
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate min-w-0">
                              <span
                                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                  isAvailable ? "bg-primary" : "bg-card-hover"
                                }`}
                              />
                              <span className="truncate">{rm.modelName}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground truncate ml-2">
                              {providers.find((pr) => pr.id === rm.provider)?.name ?? rm.provider}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                )}
                {providers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActiveProvider(p.id)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs text-foreground hover:bg-card-hover transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          selected?.provider === p.id ? "bg-primary" : "bg-primary"
                        }`}
                      />
                      <span className="truncate">{p.name}</span>
                    </div>
                    <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className="text-muted-foreground flex-shrink-0 ml-2">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  navigate("/settings");
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-card-hover transition-colors border-t border-input"
              >
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                {l.connectProviders}
              </button>
            </>
          )}
        </div>
      </PortalPopover>
    </>
  );
}
