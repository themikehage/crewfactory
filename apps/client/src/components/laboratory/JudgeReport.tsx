import { useState, useEffect } from "react";
import type { Experiment } from "@/types/laboratory";
import { wsClient } from "@/lib/ws-client";
import { Dropdown } from "@/components/ui/Dropdown";

type VariantKey = "single" | "multiNoLeader" | "multiWithLeader";

const VARIANT_LABELS: Record<VariantKey, string> = {
  single: "Baseline",
  multiNoLeader: "H. Horizontal",
  multiWithLeader: "H. Jerárquico",
};

interface JudgeReportProps {
  exp: Experiment;
  onJudge?: (model?: string) => void;
  isJudging: boolean;
  onNavigate: (tab: VariantKey) => void;
}

export function JudgeReport({
  exp,
  onJudge,
  isJudging,
  onNavigate,
}: JudgeReportProps) {
  const [models, setModels] = useState<Array<{ id: string; name: string; provider: string }>>([]);
  const [selectedJudgeModel, setSelectedJudgeModel] = useState<string>("");
  const [streamingText, setStreamingText] = useState("");
  const [streamingThinking, setStreamingThinking] = useState("");

  useEffect(() => {
    if (isJudging) {
      setStreamingText("");
      setStreamingThinking("");
    }
  }, [isJudging]);

  useEffect(() => {
    const unsub = wsClient.subscribe("judge_streaming", (data: any) => {
      if (data.experimentId === exp.id) {
        if (data.textDelta) {
          setStreamingText((prev) => prev + data.textDelta);
        }
        if (data.thinkingDelta) {
          setStreamingThinking((prev) => prev + data.thinkingDelta);
        }
      }
    });

    return () => {
      unsub();
    };
  }, [exp.id]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch("/api/models", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setModels(data.models || []))
      .catch((e) => console.error("Failed to load models for LLM Judge:", e));
  }, []);

  const variantKeys: VariantKey[] = ["single", "multiNoLeader", "multiWithLeader"];
  const hasScores = variantKeys.some((k) => !!exp.variants[k]?.result?.scores);

  const winner = hasScores
    ? variantKeys.reduce((best, k) => {
        const s = exp.variants[k]?.result?.scores?.globalScore ?? -1;
        const b = exp.variants[best]?.result?.scores?.globalScore ?? -1;
        return s > b ? k : best;
      }, variantKeys[0])
    : null;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6 text-left">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground">Reporte Comparativo</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Evaluación del LLM-Judge sobre las tres variantes</p>
        </div>
        <div className="flex items-center gap-2">
          <Dropdown<string>
            value={selectedJudgeModel}
            onChange={setSelectedJudgeModel}
            options={[
              { value: "", label: "Default (Lab Model)" },
              ...models.map((m) => ({
                value: `${m.provider}/${m.id}`,
                label: `${m.provider}/${m.name || m.id}`,
              })),
            ]}
            disabled={isJudging}
            placeholder="Default (Lab Model)"
          />
          <button
            onClick={() => onJudge?.(selectedJudgeModel || undefined)}
            disabled={isJudging}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-primary/10 border border-primary/30 text-primary rounded-lg hover:bg-primary/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isJudging ? (
              <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            )}
            {isJudging ? "Evaluando..." : "Re-evaluar"}
          </button>
        </div>
      </div>

      {isJudging && (
        <div className="space-y-4 bg-surface border border-input/60 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase font-bold text-primary tracking-wider flex items-center gap-1.5 font-mono">
              <span className="w-2 h-2 bg-primary rounded-full animate-ping" />
              Judge Evaluando en Vivo (Streaming)...
            </h3>
          </div>
          {streamingThinking && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block font-mono">Razonamiento Interno (Pensamientos):</span>
              <div className="text-xs font-mono bg-background/50 border border-input/30 p-3 rounded-xl max-h-48 overflow-y-auto whitespace-pre-wrap text-muted-foreground leading-relaxed italic">
                {streamingThinking}
              </div>
            </div>
          )}
          {streamingText && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block font-mono">Respuesta de Evaluación:</span>
              <div className="text-xs font-mono bg-background border border-input/30 p-3 rounded-xl max-h-64 overflow-y-auto whitespace-pre-wrap text-foreground leading-relaxed">
                {streamingText}
              </div>
            </div>
          )}
          {!streamingThinking && !streamingText && (
            <p className="text-xs text-muted-foreground italic font-mono">Iniciando el proceso de juicio LLM...</p>
          )}
        </div>
      )}

      {/* Score Cards */}
      <div className="grid grid-cols-3 gap-4">
        {variantKeys.map((k) => {
          const result = exp.variants[k]?.result;
          const scores = result?.scores;
          const isWinner = winner === k && hasScores;
          return (
            <button
              key={k}
              onClick={() => onNavigate(k)}
              className={`text-left p-4 rounded-2xl border transition-all cursor-pointer group ${
                isWinner
                  ? "bg-primary/5 border-primary/40 shadow-[0_0_20px_rgba(74,222,128,0.08)]"
                  : "bg-card/20 border-input/60 hover:bg-card/40 hover:border-input"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xs font-bold text-foreground">{VARIANT_LABELS[k]}</p>
                  {result && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold uppercase mt-1 inline-block ${
                      result.status === "completed"
                        ? "bg-primary/10 text-primary"
                        : "bg-destructive/10 text-destructive"
                    }`}>
                      {result.status}
                    </span>
                  )}
                </div>
                {isWinner && (
                  <span className="text-base" title="Ganadora">🏆</span>
                )}
              </div>

              {scores ? (
                <>
                  <div className="flex items-end gap-1 mb-3">
                    <span className="text-3xl font-black text-primary">{scores.globalScore}</span>
                    <span className="text-xs text-muted-foreground mb-1">/100</span>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Calidad</span>
                      <span className="font-bold text-foreground">{scores.taskQuality}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Eficiencia</span>
                      <span className="font-bold text-foreground">{scores.efficiencyScore}</span>
                    </div>
                    {scores.negotiationScore !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Negociación</span>
                        <span className="font-bold text-foreground">{scores.negotiationScore}</span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground italic mt-2">Sin evaluación</p>
              )}
            </button>
          );
        })}
      </div>

      {/* Criteria breakdown table */}
      {hasScores && (() => {
        const allCriteria = Array.from(
          new Set(variantKeys.flatMap((k) => Object.keys(exp.variants[k]?.result?.scores?.criteriaScores ?? {})))
        );
        if (allCriteria.length === 0) return null;
        return (
          <div className="space-y-3">
            <h3 className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Desglose por Criterio</h3>
            <div className="bg-card/20 border border-input/60 rounded-2xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-input/40 bg-card/30">
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-bold uppercase tracking-wider">Criterio</th>
                    {variantKeys.map((k) => (
                      <th key={k} className="text-center px-3 py-2.5 text-muted-foreground font-bold uppercase tracking-wider">
                        {VARIANT_LABELS[k]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allCriteria.map((crit) => (
                    <tr key={crit} className="border-b border-input/20 last:border-0 hover:bg-card/20 transition-colors">
                      <td className="px-4 py-2.5 text-muted-foreground font-medium">{crit}</td>
                      {variantKeys.map((k) => {
                        const s = exp.variants[k]?.result?.scores?.criteriaScores?.[crit];
                        const isTop = s !== undefined && variantKeys.every((ok) => ok === k || (exp.variants[ok]?.result?.scores?.criteriaScores?.[crit] ?? -1) <= s);
                        return (
                          <td key={k} className="text-center px-3 py-2.5">
                            {s !== undefined ? (
                              <span className={`font-bold ${
                                isTop ? "text-primary" : "text-foreground"
                              }`}>{s}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Reasoning summaries */}
      {hasScores && (
        <div className="space-y-3">
          <h3 className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Razonamiento del Judge</h3>
          <div className="space-y-2">
            {variantKeys.map((k) => {
              const reasoning = exp.variants[k]?.result?.scores?.judgeReasoning;
              if (!reasoning) return null;
              return (
                <div key={k} className="bg-card/20 border border-input/40 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{VARIANT_LABELS[k]}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed italic">{reasoning}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!hasScores && !isJudging && (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <svg className="w-10 h-10 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-muted-foreground">No hay evaluación disponible todavía.</p>
          <p className="text-[11px] text-muted-foreground/60">Presioná Re-evaluar para iniciar el juicio LLM.</p>
        </div>
      )}
    </div>
  );
}
