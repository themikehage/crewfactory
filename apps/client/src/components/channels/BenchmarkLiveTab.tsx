import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { useWebSocket } from "@/hooks/useWebSocket";
import { RichMarkdown } from "@/components/chat/RichMarkdown";
import type { Channel } from "shared";
import { useLiterals } from "@/lib";
import { literals as u } from "./BenchmarkLiveTab.literals";

interface Metrics {
  runId: string;
  channel: {
    output: string;
    durationMs: number;
    tokensInput: number;
    tokensOutput: number;
    costEstimate: number;
    roundsCount: number;
  };
  baseline: {
    output: string;
    durationMs: number;
    tokensInput: number;
    tokensOutput: number;
    costEstimate: number;
    error?: string;
  };
}

interface JudgeScores {
  completeness: number;
  structure: number;
  technicalPrecision: number;
  globalScore: number;
}

interface JudgeData {
  channel: { scores: JudgeScores; explanation: string };
  baseline: { scores: JudgeScores; explanation: string };
}

interface Props {
  channelId: string;
  channel: Channel | null;
  sessionId: string | null;
  channelMessages: string;
}

export function BenchmarkLiveTab({ channelId, channel, sessionId, channelMessages }: Props) {
const l = useLiterals(u);
  const [benchmarkState, setBenchmarkState] = useState<"idle" | "running" | "complete">("idle");
  const [baselineOutput, setBaselineOutput] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [judgeState, setJudgeState] = useState<"idle" | "running" | "complete" | "error">("idle");
  const [judgeData, setJudgeData] = useState<JudgeData | null>(null);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const { subscribe } = useWebSocket(sessionId);

  useEffect(() => {
    const unsub1 = subscribe("global_log", (data: any) => {
      if (!data.event || data.event.sourceId !== channelId) return;
      const event = data.event;

      if (event.eventType === "benchmark_start") {
        setBenchmarkState("running");
        setBaselineOutput("");
        setError(null);
        setMetrics(null);
        setJudgeState("idle");
        setJudgeData(null);
        setJudgeError(null);
        setRunId(event.detail?.runId || null);
      }

      if (event.eventType === "benchmark_token") {
        setBaselineOutput((prev) => prev + (event.detail?.token || ""));
      }

      if (event.eventType === "benchmark_complete") {
        setBenchmarkState("complete");
        if (event.detail?.metrics) {
          setMetrics(event.detail.metrics);
        }
      }

      if (event.eventType === "benchmark_error") {
        setError(event.detail?.error || l.unknownError);
        setBenchmarkState("complete");
      }

      if (event.eventType === "judge_start") {
        setJudgeState("running");
        setJudgeError(null);
        setJudgeData(null);
      }

      if (event.eventType === "judge_complete") {
        setJudgeState("complete");
        if (event.detail?.result) {
          setJudgeData(event.detail.result);
        }
      }

      if (event.eventType === "judge_error") {
        setJudgeState("error");
        setJudgeError(event.detail?.error || l.judgeError);
      }
    });

    return () => {
      unsub1();
    };
  }, [channelId, subscribe]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [baselineOutput]);

  const formatMs = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatCost = (cost: number) => `$${cost.toFixed(4)}`;

  const handleRunJudge = useCallback(async () => {
    if (!runId) return;
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/channels/${channelId}/benchmark/history/${runId}/judge`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || l.judgeFailed);
      }
    } catch (err: any) {
      setJudgeState("error");
      setJudgeError(err.message || l.runJudgeError);
    }
  }, [channelId, runId]);

  if (benchmarkState === "idle") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-card border border-input flex items-center justify-center mb-4">
          <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor" className="text-muted-foreground/40">
            <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-foreground">Waiting for benchmark</p>
        <p className="text-xs text-muted-foreground mt-1.5 max-w-xs leading-relaxed">
          Send a message in the chat to trigger a baseline comparison. The single-agent output will appear here in real-time.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-input/60">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {benchmarkState === "running" ? "Baseline Agent" : "Benchmark Results"}
          </h3>
          <p className="text-[10px] text-muted-foreground/60">
            {benchmarkState === "running"
              ? "Single-agent processing the same prompt in parallel..."
              : "Channel vs Single-Agent comparison"}
          </p>
        </div>
        {benchmarkState === "running" && (
          <div className="flex items-center gap-1.5 bg-primary/10 px-2.5 py-1 rounded-full text-[9px] text-primary border border-primary/20 animate-pulse">
            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-ping" />
            <span>Running</span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-error/20 text-destructive rounded-lg text-xs">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="flex flex-col bg-card border border-input rounded-xl overflow-hidden">
          <div className="px-3 py-2 bg-card-hover/30 border-b border-input/20 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
            <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">
              Channel ({channel?.members?.length ?? 0} agents)
            </span>
          </div>
          <div className="p-3 text-[11px] text-muted-foreground leading-relaxed max-h-[300px] overflow-y-auto font-mono">
            {channelMessages ? (
              <RichMarkdown content={channelMessages} />
            ) : (
              <span className="text-muted-foreground/40">Output will appear here as the channel processes the request...</span>
            )}
          </div>
        </div>

        <div className="flex flex-col bg-card border border-input rounded-xl overflow-hidden">
          <div className="px-3 py-2 bg-card-hover/30 border-b border-input/20 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary/60 flex-shrink-0" />
            <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">
              Baseline ({channel?.benchmark?.baselineModelId || "default"})
            </span>
          </div>
          <div ref={outputRef} className="p-3 text-[11px] text-muted-foreground leading-relaxed max-h-[300px] overflow-y-auto font-mono">
            {baselineOutput ? (
              <RichMarkdown content={baselineOutput} />
            ) : benchmarkState === "running" ? (
              <span className="text-muted-foreground/40 animate-pulse">Generating baseline response...</span>
            ) : (
              <span className="text-muted-foreground/40">Waiting for baseline to start...</span>
            )}
          </div>
        </div>
      </div>

      {metrics && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-input rounded-xl p-4 space-y-3"
        >
          <h4 className="text-[10px] font-bold text-foreground uppercase tracking-wider">Automatic Metrics</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[10px]">
              <thead>
                <tr className="border-b border-input text-muted-foreground/60">
                  <th className="py-1.5 pr-3">Metric</th>
                  <th className="py-1.5 px-3 text-center">Channel</th>
                  <th className="py-1.5 px-3 text-center">Baseline</th>
                  <th className="py-1.5 pl-3 text-center">Delta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-hover/40 text-foreground">
                <tr>
                  <td className="py-2 pr-3 text-muted-foreground">Time</td>
                  <td className="py-2 px-3 text-center">{formatMs(metrics.channel.durationMs)}</td>
                  <td className="py-2 px-3 text-center">{formatMs(metrics.baseline.durationMs)}</td>
                  <td className="py-2 pl-3 text-center text-muted-foreground">
                    {metrics.channel.durationMs > 0 && metrics.baseline.durationMs > 0
                      ? `${((metrics.channel.durationMs / metrics.baseline.durationMs - 1) * 100).toFixed(0)}%`
                      : "-"}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 text-muted-foreground">Tokens In</td>
                  <td className="py-2 px-3 text-center">{metrics.channel.tokensInput.toLocaleString()}</td>
                  <td className="py-2 px-3 text-center">{metrics.baseline.tokensInput.toLocaleString()}</td>
                  <td className="py-2 pl-3 text-center text-muted-foreground">-</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 text-muted-foreground">Tokens Out</td>
                  <td className="py-2 px-3 text-center">{metrics.channel.tokensOutput.toLocaleString()}</td>
                  <td className="py-2 px-3 text-center">{metrics.baseline.tokensOutput.toLocaleString()}</td>
                  <td className="py-2 pl-3 text-center text-muted-foreground">
                    {metrics.channel.tokensOutput > 0 && metrics.baseline.tokensOutput > 0
                      ? `${((metrics.channel.tokensOutput / metrics.baseline.tokensOutput - 1) * 100).toFixed(0)}%`
                      : "-"}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 text-muted-foreground">Total Tokens</td>
                  <td className="py-2 px-3 text-center font-semibold">
                    {(metrics.channel.tokensInput + metrics.channel.tokensOutput).toLocaleString()}
                  </td>
                  <td className="py-2 px-3 text-center font-semibold">
                    {(metrics.baseline.tokensInput + metrics.baseline.tokensOutput).toLocaleString()}
                  </td>
                  <td className="py-2 pl-3 text-center text-muted-foreground">-</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 text-muted-foreground">Est. Cost</td>
                  <td className="py-2 px-3 text-center">{formatCost(metrics.channel.costEstimate)}</td>
                  <td className="py-2 px-3 text-center">{formatCost(metrics.baseline.costEstimate)}</td>
                  <td className="py-2 pl-3 text-center text-muted-foreground">-</td>
                </tr>
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {metrics && benchmarkState === "complete" && (
        <div className="bg-card border border-input rounded-xl p-4 space-y-3">
          <h4 className="text-[10px] font-bold text-foreground uppercase tracking-wider">
            Quality Evaluation
          </h4>

          {judgeState === "idle" && (
            <div className="flex flex-col items-center gap-3 py-3">
              <p className="text-[10px] text-muted-foreground/60 text-center max-w-sm">
                Run an independent LLM evaluator to score both outputs on completeness, structure, and technical precision.
              </p>
              <button
                onClick={handleRunJudge}
                className="px-4 py-2 bg-primary hover:opacity-90 text-background text-[11px] font-semibold rounded-lg shadow-sm transition-opacity flex items-center gap-2 cursor-pointer"
              >
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                <span>Run LLM Judge</span>
              </button>
            </div>
          )}

          {judgeState === "running" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="relative w-8 h-8">
                <div className="absolute inset-0 border-3 border-primary/20 rounded-full" />
                <div className="absolute inset-0 border-3 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-[10px] text-muted-foreground/60">Evaluating with LLM judge...</p>
            </div>
          )}

          {judgeState === "error" && (
            <div className="space-y-3">
              <div className="p-3 bg-destructive/10 border border-error/20 text-destructive rounded-lg text-[10px]">
                {judgeError}
              </div>
              <button
                onClick={handleRunJudge}
                className="px-3 py-1.5 bg-card-hover hover:bg-card rounded-lg text-foreground text-[10px] font-medium border border-input transition-colors cursor-pointer"
              >
                Retry Judge
              </button>
            </div>
          )}

          {judgeState === "complete" && judgeData && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[10px]">
                  <thead>
                    <tr className="border-b border-input text-muted-foreground/60">
                      <th className="py-1.5 pr-3">Metric</th>
                      <th className="py-1.5 px-3 text-center">Channel</th>
                      <th className="py-1.5 px-3 text-center">Baseline</th>
                      <th className="py-1.5 pl-3 text-center">Delta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-hover/40 text-foreground">
                    {([
                      { key: "completeness" as const, label: "Completeness" },
                      { key: "structure" as const, label: "Structure" },
                      { key: "technicalPrecision" as const, label: "Tech. Precision" },
                    ]).map(({ key, label }) => {
                      const chScore = judgeData.channel.scores[key];
                      const blScore = judgeData.baseline.scores[key];
                      const delta = chScore - blScore;
                      return (
                        <tr key={key}>
                          <td className="py-2 pr-3 text-muted-foreground">{label}</td>
                          <td className="py-2 px-3 text-center">{chScore}/100</td>
                          <td className="py-2 px-3 text-center">{blScore}/100</td>
                          <td className={`py-2 pl-3 text-center font-medium ${delta >= 0 ? "text-primary" : "text-destructive"}`}>
                            {delta >= 0 ? "+" : ""}{delta}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-input">
                      <td className="py-2 pr-3 text-muted-foreground font-semibold">Global Score</td>
                      <td className="py-2 px-3 text-center font-bold text-primary">
                        {judgeData.channel.scores.globalScore}/100
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-foreground">
                        {judgeData.baseline.scores.globalScore}/100
                      </td>
                      <td className={`py-2 pl-3 text-center font-bold ${judgeData.channel.scores.globalScore >= judgeData.baseline.scores.globalScore ? "text-primary" : "text-destructive"}`}>
                        {judgeData.channel.scores.globalScore >= judgeData.baseline.scores.globalScore ? "+" : ""}
                        {judgeData.channel.scores.globalScore - judgeData.baseline.scores.globalScore}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {judgeData.channel.explanation && (
                <div className="p-3 bg-background/40 border border-input/40 rounded-lg">
                  <p className="text-[10px] text-muted-foreground/60 font-semibold mb-1 uppercase tracking-wider">Explanation</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{judgeData.channel.explanation}</p>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={handleRunJudge}
                  className="px-3 py-1.5 bg-card-hover hover:bg-card rounded-lg text-foreground text-[10px] font-medium border border-input transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                  <span>Re-run Judge</span>
                </button>
              </div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
