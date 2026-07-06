import { useState, useEffect } from "react";
import { useChannel } from "@/hooks/useChannel";
import { ChannelMessageList } from "@/components/channels/ChannelMessageList";
import { ChannelInput } from "@/components/channels/ChannelInput";
import { useLiterals } from "@/lib";
import { literals as u } from "@/pages/LaboratoryPage.literals";

interface VariantViewerProps {
  experimentId: string;
  variantKey: "single" | "multiNoLeader" | "multiWithLeader";
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
  const channelId = `lab_${experimentId}_${variantKey}`;
  const targetChannelId = activeSessionId ? channelId : null;
  const { messages, streamingAgents, sendMessage } = useChannel(targetChannelId, activeSessionId);

  const [registeredAgents, setRegisteredAgents] = useState<any[]>([]);
  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch("/api/agents", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setRegisteredAgents(data.agents || []))
      .catch(() => {});
  }, []);

  const mentionNames = ["user", ...registeredAgents.map((a) => a.name)];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[560px] min-h-0 bg-card/10 rounded-2xl border border-input/60 overflow-hidden">
      {/* Panel del Chat (70%) */}
      <div className="lg:col-span-2 flex flex-col h-full bg-card/5 min-h-0 border-r border-input/40 relative text-left">
        <div className="absolute inset-0 flex flex-col min-h-0">
          <div className="px-4 py-2.5 border-b border-input/30 bg-card/10 flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold tracking-wide">{l.experimentChat}</span>
            {status === "running" && (
              <span className="flex items-center gap-1.5 text-primary font-bold animate-pulse">
                <span className="w-2 h-2 bg-primary rounded-full animate-ping" />
                Debatiendo en vivo...
              </span>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto bg-background/25">
            <ChannelMessageList
              messages={messages}
              streamingAgents={streamingAgents}
              mentionNames={mentionNames}
              sessionId={activeSessionId}
              activeChannelId={channelId}
            />
          </div>
          {activeSessionId && (
            <ChannelInput onSend={sendMessage} />
          )}
        </div>
      </div>

      {/* Panel de Telemetría (30%) */}
      <div className="p-5 flex flex-col bg-card/10 min-h-0 overflow-y-auto text-left justify-between">
        <div className="space-y-6">
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
                </div>
              </div>

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
                  Los agentes están analizando y colaborando en tiempo real. Seguí la conversación a la izquierda.
                </span>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-center text-xs text-muted-foreground italic bg-background/20 rounded-xl border border-dashed border-input/60">
                Esperando el inicio de la corrida...
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
