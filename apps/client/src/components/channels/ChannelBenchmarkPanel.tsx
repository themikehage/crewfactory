import { useState, useEffect } from "react";
import { RichMarkdown } from "@/components/chat/RichMarkdown";

interface Props {
  channelId: string;
}

export function ChannelBenchmarkPanel({ channelId }: Props) {
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBenchmark = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/channels/${channelId}/benchmark`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.exists) {
          setReport(data.reportMd);
        } else {
          setReport(null);
        }
      }
    } catch (e) {
      console.error("Failed to load benchmark:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleRun = async () => {
    setError(null);
    setRunning(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/channels/${channelId}/benchmark`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to start benchmark runner");
      
      // Start polling for results
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const checkRes = await fetch(`/api/channels/${channelId}/benchmark`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (checkRes.ok) {
            const data = await checkRes.json();
            if (data.exists) {
              setReport(data.reportMd);
              setRunning(false);
              clearInterval(interval);
            }
          }
        } catch {}
        
        if (attempts > 60) { // 2 minutes timeout
          setRunning(false);
          setError("El benchmark tardó demasiado. Por favor verifica los logs del servidor.");
          clearInterval(interval);
        }
      }, 2000);

    } catch (err: any) {
      setError(err.message || "Failed to trigger benchmark suite");
      setRunning(false);
    }
  };

  useEffect(() => {
    fetchBenchmark();
  }, [channelId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-text-secondary text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span>Cargando datos de benchmark...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between pb-4 border-b border-surface-hover/60">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Benchmark de Eficiencia (A vs B)</h3>
          <p className="text-[10px] text-text-secondary/60 mt-0.5">
            Mide y compara el rendimiento del canal multi-agente frente a una ejecución single-agent (baseline).
          </p>
        </div>
        <button
          onClick={handleRun}
          disabled={running}
          className="px-3.5 py-1.5 bg-accent hover:opacity-90 disabled:opacity-50 text-bg text-[11px] font-semibold rounded-lg shadow-sm transition-opacity flex items-center gap-1.5 cursor-pointer"
        >
          {running ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-bg border-t-transparent rounded-full animate-spin" />
              <span>Ejecutando...</span>
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              <span>Ejecutar Benchmark</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-error/10 border border-error/20 text-error rounded-lg text-xs">
          {error}
        </div>
      )}

      {running && !report && (
        <div className="p-12 bg-surface border border-surface-hover rounded-2xl flex flex-col items-center justify-center text-center space-y-3">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 border-4 border-accent/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-text-primary">Ejecutando pruebas del benchmark...</p>
            <p className="text-[10px] text-text-secondary/60">
              Corriendo Conditions A (Baseline) y B (Canal) sobre los briefs del dataset de prueba. Esto tomará unos momentos.
            </p>
          </div>
        </div>
      )}

      {report ? (
        <div className="p-5 bg-surface border border-surface-hover rounded-2xl shadow-sm text-xs leading-relaxed overflow-x-auto relative">
          {running && (
            <div className="absolute top-3 right-3 flex items-center gap-1.5 text-[10px] text-accent font-semibold bg-accent/10 border border-accent/20 px-2.5 py-1 rounded-full">
              <div className="w-2 h-2 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <span>Actualizando reporte en vivo...</span>
            </div>
          )}
          <RichMarkdown content={report} />
        </div>
      ) : (
        !running && (
          <div className="p-12 bg-surface border border-surface-hover rounded-2xl flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-bg border border-surface-hover flex items-center justify-center text-accent text-lg">
              📊
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-text-primary">Sin Reportes Disponibles</p>
              <p className="text-[10px] text-text-secondary/60 leading-relaxed">
                Haz clic en el botón superior para correr las pruebas. Evaluaremos la precisión de fichas estimadas, tiempo transcurrido y tokens de contexto utilizados.
              </p>
            </div>
            <button
              onClick={handleRun}
              className="px-4 py-2 bg-surface hover:bg-surface-hover border border-surface-hover/80 text-text-primary rounded-xl font-medium text-xs shadow-sm transition-colors cursor-pointer"
            >
              Comenzar Evaluación
            </button>
          </div>
        )
      )}
    </div>
  );
}
