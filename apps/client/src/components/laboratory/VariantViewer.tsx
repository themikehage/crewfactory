import { useState } from "react";
import { ChannelChatArea } from "@/components/channels/ChannelChatArea";
import { useLiterals } from "@/lib";
import { literals as u } from "@/pages/LaboratoryPage.literals";

interface VariantViewerProps {
  experimentId: string;
  variantKey: "single" | "multiWithLeader";
  activeSessionId: string | null;
  status: string;
  result: any;
  criteria?: string[];
  expName?: string;
  expDescription?: string;
}

function CriteriaBar({ label, score }: { label: string; score: number }) {
  const color = score >= 80 ? "bg-primary" : score >= 60 ? "bg-yellow-400" : "bg-destructive";
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-[11px] text-muted-foreground font-medium truncate max-w-[140px]">{label}</span>
        <span className="text-[11px] font-bold text-foreground">{score}</span>
      </div>
      <div className="h-1.5 bg-background rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export function VariantViewer({
  experimentId,
  variantKey,
  activeSessionId,
  status,
  result,
  criteria,
  expName,
  expDescription
}: VariantViewerProps) {
  const l = useLiterals(u);
  const [activeSubTab, setActiveSubTab] = useState<"chat" | "telemetry">("chat");

  const channelId = `lab_${experimentId}_${variantKey}`;

  return (
    <div className="flex flex-col h-full bg-card/10 border border-input/60 p-4">
      {/* Subtabs Header */}
      <div className="flex items-center justify-between border-b border-border/40 pb-3 mb-4 flex-shrink-0">
        <div className="flex items-center gap-1 bg-background border border-input rounded-lg p-0.5">
          <button
            onClick={() => setActiveSubTab("chat")}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              activeSubTab === "chat"
                ? "bg-card text-foreground border border-input/85 shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setActiveSubTab("telemetry")}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              activeSubTab === "telemetry"
                ? "bg-card text-foreground border border-input/85 shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Evaluación
          </button>
        </div>

        <div className="flex items-center gap-2">
          {status === "running" && (
            <span className="flex items-center gap-1.5 text-primary font-bold text-xs animate-pulse">
              <span className="w-2 h-2 bg-primary rounded-full animate-ping" />
              Debatiendo en vivo...
            </span>
          )}
          {status === "completed" && (
            <span className="text-xs px-2 py-0.5 rounded-lg bg-primary/10 text-primary border border-primary/20 font-bold uppercase">
              Completado
            </span>
          )}
          {status === "failed" && (
            <span className="text-xs px-2 py-0.5 rounded-lg bg-destructive/10 text-destructive border border-error/20 font-bold uppercase">
              Error
            </span>
          )}
        </div>
      </div>

      {/* Visores */}
      <div className="flex-1 min-h-0 relative">
        {activeSubTab === "chat" ? (
          <div className="absolute inset-0 flex flex-col bg-card/5 rounded-xl border border-input/40 overflow-hidden">
            <ChannelChatArea
              activeChannel={{ id: channelId, name: expName || "Visor" }}
              sessionId={activeSessionId}
              variantMode={true}
            />
          </div>
        ) : (
          <div className="absolute inset-0 overflow-y-auto space-y-6 text-left p-2">
            {expName && (
              <div>
                <p className="text-xs font-bold text-foreground leading-snug">{expName}</p>
                {expDescription && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{expDescription}</p>
                )}
              </div>
            )}

            {criteria && criteria.length > 0 && (
              <div>
                <h4 className="text-xs uppercase font-bold text-muted-foreground tracking-wider block mb-2">
                  Rúbrica de Evaluación
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {criteria.map((c, i) => (
                    <span
                      key={i}
                      className="text-xs px-2.5 py-1 bg-background border border-input rounded-lg text-muted-foreground font-semibold"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h4 className="text-xs uppercase font-bold text-muted-foreground tracking-wider block mb-2">
                Telemetría y Estado
              </h4>
              <div className="flex items-center justify-between bg-background/50 border border-input/60 rounded-xl p-3.5">
                <span className="text-xs font-semibold text-foreground">{l.runStatus}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-lg font-mono font-bold uppercase tracking-wider ${
                    status === "completed"
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : status === "running"
                      ? "bg-blue-500/10 text-blue-400 border border-blue-400/20 animate-pulse"
                      : status === "failed"
                      ? "bg-destructive/10 text-destructive border border-error/20"
                      : "bg-background text-muted-foreground border border-input"
                  }`}
                >
                  {status}
                </span>
              </div>
            </div>

            {result ? (
              <div className="space-y-5">
                {/* Score Matrix */}
                {result.scores && (
                  <div className="space-y-3">
                    <h4 className="text-xs uppercase font-bold text-muted-foreground tracking-wider">
                      Evaluación LLM-Judge
                    </h4>
                    <div className="bg-background/40 border border-input/40 rounded-xl p-4 space-y-4">
                      <div className="flex flex-col items-center py-2">
                        <div className="relative w-20 h-20 flex items-center justify-center rounded-full bg-primary/5 border border-primary/25 shadow-[0_0_15px_rgba(74,222,128,0.05)]">
                          <span className="text-2xl font-black text-primary">{result.scores.globalScore}</span>
                        </div>
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-2.5">
                          Global Score
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-input/30">
                        <div className="text-center p-2 bg-background/25 rounded-lg border border-input/30">
                          <p className="text-xs text-muted-foreground font-bold uppercase">{l.quality}</p>
                          <p className="text-base font-black text-foreground mt-0.5">{result.scores.taskQuality}</p>
                        </div>
                        <div className="text-center p-2 bg-background/25 rounded-lg border border-input/30">
                          <p className="text-xs text-muted-foreground font-bold uppercase">{l.efficiency}</p>
                          <p className="text-base font-black text-foreground mt-0.5">{result.scores.efficiencyScore}</p>
                        </div>
                      </div>

                      {/* Criteria breakdown */}
                      {result.scores.criteriaScores && Object.keys(result.scores.criteriaScores).length > 0 && (
                        <div className="space-y-2.5 pt-2 border-t border-input/30">
                          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Por criterio</p>
                          {Object.entries(result.scores.criteriaScores).map(([crit, score]) => (
                            <CriteriaBar key={crit} label={crit} score={score as number} />
                          ))}
                        </div>
                      )}

                      {/* Judge reasoning */}
                      {result.scores.judgeReasoning && (
                        <details className="pt-2 border-t border-input/30">
                          <summary className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider cursor-pointer hover:text-foreground transition-colors">
                            Razonamiento del Judge
                          </summary>
                          <p className="text-[11px] text-muted-foreground leading-relaxed mt-2 italic">
                            {result.scores.judgeReasoning}
                          </p>
                        </details>
                      )}
                    </div>
                  </div>
                )}

                {/* Estadísticas */}
                <div className="space-y-3">
                  <h4 className="text-xs uppercase font-bold text-muted-foreground tracking-wider">
                    Métricas de Ejecución
                  </h4>
                  <div className="bg-background/40 border border-input/40 rounded-xl p-3.5 space-y-2.5 text-xs font-mono text-muted-foreground leading-relaxed">
                    <div className="flex justify-between">
                      <span>Duración:</span>
                      <span className="text-foreground font-bold">{(result.durationMs / 1000).toFixed(1)}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tokens entrada:</span>
                      <span className="text-foreground">{result.tokensIn}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tokens salida:</span>
                      <span className="text-foreground">{result.tokensOut}</span>
                    </div>
                     {result.negotiationRounds !== undefined && (
                      <div className="flex justify-between">
                        <span>Rondas debate:</span>
                        <span className="text-foreground">{result.negotiationRounds}</span>
                      </div>
                    )}
                    {result.escalationsToLeader !== undefined && (
                      <div className="flex justify-between">
                        <span>Escalaciones:</span>
                        <span className="text-foreground">{result.escalationsToLeader}</span>
                      </div>
                    )}
                    {result.divergenceEventsCount !== undefined && (
                      <div className="flex justify-between">
                        <span>Divergencias detectadas:</span>
                        <span className="text-foreground font-bold">{result.divergenceEventsCount}</span>
                      </div>
                    )}
                    {result.arbitrationRoundsCount !== undefined && (
                      <div className="flex justify-between">
                        <span>Resoluciones ejecutadas:</span>
                        <span className="text-foreground font-bold">{result.arbitrationRoundsCount}</span>
                      </div>
                    )}
                    {result.protocolActivationRate !== undefined && (
                      <div className="flex justify-between">
                        <span>Tasa de activación del debate:</span>
                        <span className="text-foreground font-bold">{Math.round(result.protocolActivationRate * 100)}%</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Protocol Trace Panel for Deliberative Protocol */}
                {result.divergenceEventsCount !== undefined && result.divergenceEventsCount > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs uppercase font-bold text-muted-foreground tracking-wider">
                      Trazabilidad de Deliberación
                    </h4>
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-3.5 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-primary rounded-full animate-ping" />
                        <p className="text-xs font-bold text-primary uppercase tracking-wide">
                          Conflicto Detectado y Resuelto
                        </p>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        El sistema detectó de forma autónoma divergencias o vetos entre los agentes especialistas durante el debate. Se congeló la conversación y se invocó al árbitro líder, quien emitió una resolución vinculante que destrabó el conflicto.
                      </p>
                      <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pt-1.5 border-t border-primary/10">
                        <div>
                          <span className="block text-sm font-black text-foreground">{result.divergenceEventsCount}</span>
                          Divergencias
                        </div>
                        <div>
                          <span className="block text-sm font-black text-foreground">{result.arbitrationRoundsCount}</span>
                          Resoluciones
                        </div>
                        <div>
                          <span className="block text-sm font-black text-foreground">{Math.round(result.protocolActivationRate * 100)}%</span>
                          Deliberación
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Mostrar resultado final textual (o error) */}
                {result.finalOutput && (
                  <div className="space-y-2">
                    <h4 className="text-xs uppercase font-bold text-muted-foreground tracking-wider">
                      {result.status === "failed" ? l.errorDetail : l.finalResult}
                    </h4>
                    <pre className={`text-xs border rounded-xl p-3 max-h-32 overflow-y-auto whitespace-pre-wrap font-mono text-left leading-relaxed ${
                      result.status === "failed" 
                        ? "bg-destructive/5 text-destructive border-error/20" 
                        : "bg-background/30 text-muted-foreground border-input"
                    }`}>
                      {result.finalOutput}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              status === "running" ? (
                <div className="flex-1 flex flex-col items-center justify-center py-16 text-center text-xs text-muted-foreground space-y-3">
                  <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="font-semibold tracking-wide text-primary">Debate en progreso...</span>
                  <span className="text-xs text-muted-foreground max-w-[200px]">
                    Los agentes están analizando y colaborando en tiempo real.
                  </span>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-16 text-center text-xs text-muted-foreground italic bg-background/20 rounded-xl border border-dashed border-input/60">
                  Esperando el inicio de la corrida...
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
