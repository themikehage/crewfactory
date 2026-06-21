import { useState, useEffect, useCallback, useRef } from "react";

interface ProviderInfo {
  id: string;
  name: string;
  authStatus: { configured: boolean };
  models: Array<{ id: string; name: string; reasoning: boolean }>;
}

interface SelectedModel {
  provider: string;
  modelId: string;
  modelName: string;
}

interface Props {
  sessionId: string | null;
}

const STORAGE_KEY = "pi-selected-model";

export function ModelSelector({ sessionId }: Props) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selected, setSelected] = useState<SelectedModel | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [open, setOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<SelectedModel | null>(selected);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch("/api/providers", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        const configured = (data.providers ?? []).filter(
          (p: ProviderInfo) => p.authStatus.configured
        );
        setProviders(configured);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveProvider(null);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

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
    if (!sessionId || !selectedRef.current) return;
    applyModelToSession(selectedRef.current, sessionId);
  }, [sessionId, applyModelToSession]);

  const handleSelectModel = useCallback(
    async (provider: string, modelId: string, modelName: string) => {
      const newSelection: SelectedModel = { provider, modelId, modelName };
      setSelected(newSelection);
      selectedRef.current = newSelection;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSelection));
      setOpen(false);
      setActiveProvider(null);

      if (!sessionId) return;
      await applyModelToSession(newSelection, sessionId);
    },
    [sessionId, applyModelToSession]
  );

  const currentProvider = activeProvider
    ? providers.find((p) => p.id === activeProvider)
    : null;

  return (
    <div className="max-w-3xl mx-auto mt-2 relative" ref={dropdownRef}>
      <button
        onClick={() => {
          setOpen(!open);
          setActiveProvider(null);
        }}
        className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors px-1 py-0.5"
      >
        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm0 2h12v2H4V6zm0 4h3v4H4v-4zm5 0h7v4H9v-4z" clipRule="evenodd" />
        </svg>
        <span className="truncate max-w-[200px]">
          {selected ? selected.modelName : "Select model"}
        </span>
        {error && (
          <span className="text-error ml-1" title={error}>!</span>
        )}
        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-64 bg-surface border border-surface-hover rounded-lg shadow-lg z-50 overflow-hidden">
          {activeProvider && currentProvider ? (
            <>
              <button
                onClick={() => setActiveProvider(null)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors border-b border-surface-hover"
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
                    className={`w-full text-left px-4 py-2 text-xs transition-colors ${
                      selected?.provider === currentProvider.id && selected?.modelId === m.id
                        ? "bg-accent/15 text-accent"
                        : "text-text-primary hover:bg-surface-hover"
                    }`}
                  >
                    <div className="truncate">{m.name}</div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="max-h-56 overflow-y-auto">
                {providers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActiveProvider(p.id)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs text-text-primary hover:bg-surface-hover transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          selected?.provider === p.id ? "bg-accent" : "bg-success"
                        }`}
                      />
                      <span className="truncate">{p.name}</span>
                    </div>
                    <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className="text-text-secondary flex-shrink-0 ml-2">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                ))}
              </div>
              <a
                href="/settings"
                onClick={(e) => {
                  e.preventDefault();
                  window.dispatchEvent(new CustomEvent("navigate-settings"));
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-accent hover:bg-surface-hover transition-colors border-t border-surface-hover"
              >
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Connect more providers
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
