import { useState } from "react";
import { useChannelBenchmark } from "@/hooks/useChannelBenchmark";
import { useLiterals } from "@/lib";
import { literals as u } from "./ChannelBenchmarkTab.literals";
import { RunBenchmarkModal } from "./RunBenchmarkModal";
import { BenchmarkProgressCard } from "./BenchmarkProgressCard";
import { BenchmarkRunViewer } from "./BenchmarkRunViewer";
import { ScoreEvolutionChart } from "./ScoreEvolutionChart";
import type { ChannelMember } from "shared";

interface Props {
  channelId: string;
  members: ChannelMember[];
  registeredAgents: any[];
}

export function ChannelBenchmarkTab({ channelId, members, registeredAgents }: Props) {
  const l = useLiterals(u);
  const {
    runs,
    loading,
    error,
    activeRunId,
    progressStep,
    judgeDelta,
    startBenchmark,
    stopBenchmark,
    deleteRun,
    reEvaluateRun,
    getRunDetails,
  } = useChannelBenchmark(channelId);

  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<any | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const handleViewDetails = async (runId: string) => {
    setViewLoading(true);
    try {
      const details = await getRunDetails(runId);
      setSelectedRun(details);
      setSelectedRunId(runId);
    } catch (err) {
      console.error(err);
    } finally {
      setViewLoading(false);
    }
  };

  const handleReevaluate = async () => {
    if (!selectedRunId) return;
    const updated = await reEvaluateRun(selectedRunId);
    setSelectedRun(updated);
    return updated;
  };

  if (activeRunId) {
    return (
      <div className="flex-1 p-5 overflow-y-auto bg-background h-full">
        <BenchmarkProgressCard
          activeStep={progressStep}
          judgeDelta={judgeDelta}
          onStop={stopBenchmark}
          literals={l}
        />
      </div>
    );
  }

  if (selectedRunId && selectedRun) {
    return (
      <BenchmarkRunViewer
        run={selectedRun}
        registeredAgents={registeredAgents}
        onBack={() => {
          setSelectedRunId(null);
          setSelectedRun(null);
        }}
        onReevaluate={handleReevaluate}
        onDelete={() => deleteRun(selectedRunId)}
        literals={l}
      />
    );
  }

  return (
    <div className="flex-1 p-5 overflow-y-auto bg-background flex flex-col gap-6 h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4 flex-shrink-0 select-none">
        <div>
          <h2 className="text-base font-bold text-foreground">{l.title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Compare and validate channel collaboration configurations</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="px-4 py-2 text-xs font-semibold bg-primary hover:bg-primary/95 text-white rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-primary/20"
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          <span>{l.btnNew}</span>
        </button>
      </div>

      {error && (
        <div className="p-3.5 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-xl flex items-center justify-between flex-shrink-0 select-none">
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center min-h-[200px]">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : runs.length === 0 ? (
        <div className="flex-1 border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center p-8 text-center max-w-lg mx-auto my-12 gap-4 select-none">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary">
            <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground mb-1">No Benchmarks Run</h4>
            <p className="text-xs text-muted-foreground leading-normal max-w-sm">{l.noRuns}</p>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="px-4 py-2 text-xs font-semibold bg-primary hover:bg-primary/95 text-white rounded-xl transition-colors cursor-pointer"
          >
            {l.btnNew}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* History list */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xs select-none">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted-foreground font-semibold bg-card/25">
                    <th className="py-3 px-4">{l.tableDate}</th>
                    <th className="py-3 px-4">{l.tableName}</th>
                    <th className="py-3 px-4 text-center">{l.tableWinner}</th>
                    <th className="py-3 px-4 text-center">{l.tableMulti}</th>
                    <th className="py-3 px-4 text-center">{l.tableSingle}</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {runs.map((run) => (
                    <tr key={run.runId} className="text-foreground hover:bg-card-hover/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-muted-foreground text-[10px]">
                        {new Date(run.createdAt).toLocaleDateString()} {new Date(run.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3.5 px-4 font-semibold">{run.name}</td>
                      <td className="py-3.5 px-4 text-center">
                        {run.status === "completed" ? (
                          run.winner === "multi" ? (
                            <span className="px-2 py-0.5 bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold rounded-md">
                              Multi
                            </span>
                          ) : run.winner === "single" ? (
                            <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-bold rounded-md">
                              Single
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-neutral-800 border border-neutral-700 text-neutral-300 text-[10px] font-bold rounded-md">
                              Tie
                            </span>
                          )
                        ) : (
                          <span className="px-2 py-0.5 bg-destructive/10 border border-destructive/20 text-destructive text-[10px] font-bold rounded-md">
                            Failed
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-primary">
                        {run.status === "completed" && run.scores ? run.scores.multi : "-"}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold">
                        {run.status === "completed" && run.scores ? run.scores.single : "-"}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleViewDetails(run.runId)}
                          disabled={viewLoading}
                          className="px-2.5 py-1.5 text-[10px] font-semibold border border-border text-foreground hover:bg-card-hover rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {l.btnDetails}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Chart block */}
          <ScoreEvolutionChart runs={runs} />
        </div>
      )}

      {showNewModal && (
        <RunBenchmarkModal
          onClose={() => setShowNewModal(false)}
          onSubmit={startBenchmark}
          members={members}
          registeredAgents={registeredAgents}
          literals={l}
        />
      )}
    </div>
  );
}
export default ChannelBenchmarkTab;
