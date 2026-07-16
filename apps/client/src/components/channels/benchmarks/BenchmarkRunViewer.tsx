import { useState } from "react";
import type { ChannelBenchmarkRun } from "shared";

interface Props {
  run: ChannelBenchmarkRun;
  registeredAgents: any[];
  onBack: () => void;
  onReevaluate: () => Promise<any>;
  onDelete: () => Promise<void>;
  literals: Record<string, string>;
}

export function BenchmarkRunViewer({ run, registeredAgents, onBack, onReevaluate, onDelete, literals }: Props) {
  const [activeOutputTab, setActiveOutputTab] = useState<"multi" | "single" | "snapshot">("multi");
  const [reEvaluating, setReEvaluating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPrompt, setShowPrompt] = useState(true);

  const handleReevaluate = async () => {
    setReEvaluating(true);
    try {
      await onReevaluate();
    } finally {
      setReEvaluating(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this benchmark run?")) return;
    setDeleting(true);
    try {
      await onDelete();
      onBack();
    } finally {
      setDeleting(false);
    }
  };

  const getAgentName = (id: string) => {
    const matched = registeredAgents.find((a) => a.id === id);
    return matched ? matched.name : id;
  };

  const judgeResult = run.judge.result;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background h-full">
      {/* Top Header bar */}
      <div className="h-14 border-b border-border px-5 flex items-center justify-between bg-card/40 backdrop-blur-xs flex-shrink-0 z-10 select-none">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          <div>
            <h2 className="text-sm font-bold text-foreground">{run.name}</h2>
            <span className="text-[10px] text-muted-foreground">{new Date(run.createdAt).toLocaleString()}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {run.status === "completed" && (
            <button
              onClick={handleReevaluate}
              disabled={reEvaluating}
              className="px-3 py-1.5 text-xs border border-border text-foreground hover:bg-card-hover rounded-lg transition-colors font-medium cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className={reEvaluating ? "animate-spin" : ""}>
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
              <span>{literals.btnReevaluate}</span>
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-3 py-1.5 text-xs bg-destructive/10 border border-destructive/20 hover:bg-destructive text-destructive hover:text-white rounded-lg transition-colors font-medium cursor-pointer select-none"
          >
            {literals.btnDelete}
          </button>
        </div>
      </div>

      {/* Main details body */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">
        {/* Prompt section */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setShowPrompt((p) => !p)}
            className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold text-muted-foreground border-b border-border bg-card/25 cursor-pointer select-none"
          >
            <span>{literals.promptLabel}</span>
            <span>{showPrompt ? "Colapsar" : "Expandir"}</span>
          </button>
          {showPrompt && (
            <div className="p-4 text-sm text-foreground whitespace-pre-wrap select-text leading-relaxed bg-background/50">
              {run.taskPrompt}
            </div>
          )}
        </div>

        {/* Global Summary Row */}
        {run.status === "completed" ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 select-none">
            {/* Winner card */}
            <div className="bg-card border border-border p-5 rounded-2xl flex flex-col gap-2 items-center justify-center text-center shadow-xs">
              <span className="text-xs font-semibold text-muted-foreground">{literals.winnerLabel}</span>
              {judgeResult?.winner === "multi" ? (
                <>
                  <span className="px-4 py-1.5 bg-primary/10 border border-primary/30 text-primary rounded-full text-sm font-bold shadow-xs">
                    ★ Multi-Agente
                  </span>
                  <span className="text-[10px] text-muted-foreground mt-1">Multi superó al baseline individual.</span>
                </>
              ) : judgeResult?.winner === "single" ? (
                <>
                  <span className="px-4 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-500 rounded-full text-sm font-bold shadow-xs">
                    ★ Agente Solo
                  </span>
                  <span className="text-[10px] text-muted-foreground mt-1">El baseline superó a la colaboración multi-agente.</span>
                </>
              ) : (
                <>
                  <span className="px-4 py-1.5 bg-neutral-500/10 border border-neutral-500/30 text-neutral-300 rounded-full text-sm font-bold">
                    Empate
                  </span>
                  <span className="text-[10px] text-muted-foreground mt-1">Ambas configuraciones empataron.</span>
                </>
              )}
            </div>

            {/* Multi Score Card */}
            <div className="bg-card border border-border p-5 rounded-2xl flex items-center gap-5 shadow-xs">
              <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xl font-extrabold shadow-inner">
                {judgeResult?.scores.multi ?? run.variants.multi.result?.scores?.globalScore ?? "-"}
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground">{literals.tableMulti}</h4>
                <span className="text-[10px] text-muted-foreground leading-normal block">
                  Duración: {((run.variants.multi.result?.durationMs || 0) / 1000).toFixed(1)}s
                </span>
                <span className="text-[10px] text-muted-foreground leading-normal block">
                  Tokens: {run.variants.multi.result ? `${run.variants.multi.result.tokensIn + run.variants.multi.result.tokensOut} (In: ${run.variants.multi.result.tokensIn})` : "-"}
                </span>
              </div>
            </div>

            {/* Single Score Card */}
            <div className="bg-card border border-border p-5 rounded-2xl flex items-center gap-5 shadow-xs">
              <div className="w-14 h-14 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center text-foreground text-xl font-extrabold shadow-inner">
                {judgeResult?.scores.single ?? run.variants.single.result?.scores?.globalScore ?? "-"}
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground">
                  {literals.tableSingle} ({getAgentName(run.variants.single.agentId)})
                </h4>
                <span className="text-[10px] text-muted-foreground leading-normal block">
                  Duración: {((run.variants.single.result?.durationMs || 0) / 1000).toFixed(1)}s
                </span>
                <span className="text-[10px] text-muted-foreground leading-normal block">
                  Tokens: {run.variants.single.result ? `${run.variants.single.result.tokensIn + run.variants.single.result.tokensOut} (In: ${run.variants.single.result.tokensIn})` : "-"}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl">
            {run.error || "Esta corrida falló durante su ejecución."}
          </div>
        )}

        {/* Criteria breakdown */}
        {run.status === "completed" && judgeResult?.criteriaScores && (
          <div className="bg-card border border-border p-5 rounded-2xl select-none">
            <h3 className="text-sm font-bold text-foreground mb-4">{literals.criteriaBreakdown}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted-foreground font-semibold">
                    <th className="py-2.5 px-3">Criterio</th>
                    <th className="py-2.5 px-3 text-center">{literals.tableMulti}</th>
                    <th className="py-2.5 px-3 text-center">{literals.tableSingle}</th>
                    <th className="py-2.5 px-3 text-center">Delta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {Object.keys(judgeResult.criteriaScores.multi).map((crit) => {
                    const mScore = judgeResult.criteriaScores.multi[crit] || 0;
                    const sScore = judgeResult.criteriaScores.single[crit] || 0;
                    const delta = mScore - sScore;

                    return (
                      <tr key={crit} className="text-foreground hover:bg-card-hover/40 transition-colors">
                        <td className="py-2.5 px-3 font-medium">{crit}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-primary">{mScore}</td>
                        <td className="py-2.5 px-3 text-center font-bold">{sScore}</td>
                        <td className={`py-2.5 px-3 text-center font-bold ${delta > 0 ? "text-primary" : delta < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {delta > 0 ? `+${delta}` : delta}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Judge Reasoning */}
        {run.status === "completed" && judgeResult?.reasoning && (
          <div className="bg-card border border-border p-5 rounded-2xl">
            <h3 className="text-sm font-bold text-foreground mb-3 select-none">{literals.reasoningLabel}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed select-text font-serif bg-background/30 p-4 border border-border/40 rounded-xl whitespace-pre-wrap">
              {judgeResult.reasoning}
            </p>
          </div>
        )}

        {/* Outputs Side-by-side tabs */}
        <div className="flex-1 min-h-[400px] flex flex-col bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-card/20 px-4 py-2.5 flex-shrink-0 select-none">
            <div className="flex gap-1">
              <button
                onClick={() => setActiveOutputTab("multi")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${activeOutputTab === "multi" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}
              >
                {literals.tableMulti} Output
              </button>
              <button
                onClick={() => setActiveOutputTab("single")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${activeOutputTab === "single" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}
              >
                {literals.tableSingle} Output
              </button>
              <button
                onClick={() => setActiveOutputTab("snapshot")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${activeOutputTab === "snapshot" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}
              >
                Config Snapshot
              </button>
            </div>
          </div>

          <div className="flex-1 p-5 overflow-y-auto bg-background/25">
            {activeOutputTab === "snapshot" ? (
              <pre className="text-xs text-muted-foreground font-mono leading-relaxed whitespace-pre-wrap select-text">
                {JSON.stringify(run.channelSnapshot, null, 2)}
              </pre>
            ) : (
              <pre className="text-xs text-foreground font-mono leading-relaxed whitespace-pre-wrap select-text selection:bg-primary/20">
                {activeOutputTab === "multi"
                  ? run.variants.multi.result?.finalOutput
                  : run.variants.single.result?.finalOutput}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
export default BenchmarkRunViewer;
