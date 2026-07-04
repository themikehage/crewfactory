import { useState, useEffect } from "react";

interface OptimizationHistoryEntry {
  iteration: number;
  avgScore: number;
  prompts: Record<string, string>;
  timestamp: string;
}

interface Props {
  channelId: string;
}

export function ChannelOptimizePanel({ channelId }: Props) {
  const [history, setHistory] = useState<OptimizationHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<OptimizationHistoryEntry | null>(null);

  const fetchHistory = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/channels/${channelId}/optimize`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.exists) {
          setHistory(data.history || []);
          if (data.history?.length > 0) {
            setSelectedEntry(data.history[data.history.length - 1]);
          }
        } else {
          setHistory([]);
        }
      }
    } catch (e) {
      console.error("Failed to load optimization history:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleOptimize = async () => {
    setError(null);
    setRunning(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/channels/${channelId}/optimize`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to start optimization loop");

      // Poll history every 3s
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const checkRes = await fetch(`/api/channels/${channelId}/optimize`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (checkRes.ok) {
            const data = await checkRes.json();
            if (data.exists && data.history?.length > 0) {
              setHistory(data.history);
              setSelectedEntry(data.history[data.history.length - 1]);
              
              // If we reached iteration 3, we stop polling
              const maxIter = Math.max(...data.history.map((h: any) => h.iteration));
              if (maxIter >= 3) {
                setRunning(false);
                clearInterval(interval);
              }
            }
          }
        } catch {}

        if (attempts > 120) { // 6 minutes timeout
          setRunning(false);
          setError("El loop de optimización tardó demasiado. Por favor verifica los logs.");
          clearInterval(interval);
        }
      }, 3000);

    } catch (err: any) {
      setError(err.message || "Failed to trigger optimization loop");
      setRunning(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [channelId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-muted-foreground text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span>Cargando historial de optimizaciones...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between pb-4 border-b border-input/60">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Optimización de Prompts (Meta-Loop)</h3>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            Ajusta iterativamente las instrucciones del Lead Agent para maximizar la precisión del canal.
          </p>
        </div>
        <button
          onClick={handleOptimize}
          disabled={running}
          className="px-3.5 py-1.5 bg-primary hover:opacity-90 disabled:opacity-50 text-background text-[11px] font-semibold rounded-lg shadow-sm transition-opacity flex items-center gap-1.5 cursor-pointer"
        >
          {running ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-bg border-t-transparent rounded-full animate-spin" />
              <span>Optimizando...</span>
            </>
          ) : (
            <>
              <span>Iniciar Optimización</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-error/20 text-destructive rounded-lg text-xs">
          {error}
        </div>
      )}

      {running && history.length === 0 && (
        <div className="p-12 bg-card border border-input rounded-2xl flex flex-col items-center justify-center text-center space-y-3">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 border-4 border-primary/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-foreground">Iniciando Optimización...</p>
            <p className="text-[10px] text-muted-foreground/60">
              Evaluando el canal mediante benchmarks y refinando instrucciones. Cada iteración tarda unos momentos.
            </p>
          </div>
        </div>
      )}

      {history.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 space-y-3">
            <h4 className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Iteraciones</h4>
            <div className="space-y-2">
              {history.map((entry) => (
                <button
                  key={entry.iteration}
                  onClick={() => setSelectedEntry(entry)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                    selectedEntry?.iteration === entry.iteration
                      ? "bg-card border-primary/30 text-foreground"
                      : "bg-card/50 border-input/40 text-muted-foreground hover:text-foreground hover:border-input"
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold">Iteración {entry.iteration}</div>
                    <div className="text-[9px] text-muted-foreground/60">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  <div className="text-xs font-bold text-primary">{entry.avgScore.toFixed(1)}%</div>
                </button>
              ))}
            </div>

            {running && (
              <div className="p-4 bg-primary/5 border border-primary/15 rounded-xl flex items-center gap-2.5 text-[10px] text-primary">
                <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span>Ejecutando iteración {history.length + 1}...</span>
              </div>
            )}
          </div>

          <div className="md:col-span-2 space-y-4">
            {selectedEntry && (
              <div className="bg-card border border-input rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-input/60 pb-3">
                  <div>
                    <h4 className="text-xs font-bold text-foreground">Detalle de Prompts Sugeridos</h4>
                    <p className="text-[9px] text-muted-foreground/60 mt-0.5">
                      Instrucciones refinadas y guardadas para el Lead Agent en la Iteración {selectedEntry.iteration}.
                    </p>
                  </div>
                  <div className="text-xs font-extrabold bg-primary/10 border border-primary/20 px-3 py-1 rounded-full text-primary">
                    Score: {selectedEntry.avgScore.toFixed(1)}%
                  </div>
                </div>

                <div className="space-y-3">
                  {Object.entries(selectedEntry.prompts).map(([agentId, prompt]) => (
                    <div key={agentId} className="space-y-1">
                      <div className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">
                        Prompt de Sistema (ID: {agentId})
                      </div>
                      <pre className="p-4 bg-background/55 border border-input/40 rounded-xl text-[10px] text-foreground font-mono whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto select-text">
                        {prompt}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        !running && (
          <div className="p-12 bg-card border border-input rounded-2xl flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-background border border-input flex items-center justify-center text-primary text-lg">
              🎯
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-foreground">Sin Historial de Optimización</p>
              <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                Haz clic en el botón superior para correr el loop de optimización meta-agente. Ejecutaremos el suite de pruebas y usaremos el LLM para corregir desviaciones en las instrucciones del Lead Agent.
              </p>
            </div>
            <button
              onClick={handleOptimize}
              className="px-4 py-2 bg-card hover:bg-card-hover border border-input/80 text-foreground rounded-xl font-medium text-xs shadow-sm transition-colors cursor-pointer"
            >
              Comenzar Optimización
            </button>
          </div>
        )
      )}
    </div>
  );
}
