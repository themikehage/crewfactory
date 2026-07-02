import { motion } from "framer-motion";
import type { Experiment } from "@/types/laboratory";

interface Props {
  activeExp: Experiment;
}

export function ComparativeMetrics({ activeExp }: Props) {
  if (activeExp.status !== "completed") return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-surface border border-surface-hover p-5 rounded-2xl shadow-sm space-y-4">
        <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Desempeño Comparativo (Puntuaciones Globales)</h3>
        <div className="space-y-4 pt-2">
          {[
            { label: "Single Agent (Baseline)", score: activeExp.variants.single.result?.scores?.globalScore || 0, color: "#6b7280" },
            { label: "Multi No Leader", score: activeExp.variants.multiNoLeader.result?.scores?.globalScore || 0, color: "#3b82f6" },
            { label: "Multi With Leader", score: activeExp.variants.multiWithLeader.result?.scores?.globalScore || 0, color: "#a855f7" }
          ].map((item, idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex justify-between items-center text-[10px] font-semibold text-text-secondary">
                <span>{item.label}</span>
                <span className="text-text-primary">{item.score} / 100</span>
              </div>
              <div className="w-full bg-bg h-3 rounded-full overflow-hidden border border-surface-hover">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${item.score}%` }}
                  transition={{ duration: 0.8, delay: idx * 0.1 }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: item.color }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-surface border border-surface-hover p-5 rounded-2xl shadow-sm space-y-3">
        <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Matriz de Métricas Cuantitativas</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-surface-hover text-text-secondary/70">
                <th className="py-2">Variante</th>
                <th className="py-2 text-center">Global</th>
                <th className="py-2 text-center">Calidad</th>
                <th className="py-2 text-center">Tiempo (s)</th>
                <th className="py-2 text-center">Tokens</th>
                <th className="py-2 text-center">Acuerdo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-hover text-text-secondary">
              {[
                { name: "Single Agent", variant: activeExp.variants.single },
                { name: "Multi No Leader", variant: activeExp.variants.multiNoLeader },
                { name: "Multi With Leader", variant: activeExp.variants.multiWithLeader }
              ].map((row, idx) => {
                const res = row.variant.result;
                const globalScore = res?.scores?.globalScore ?? "-";
                const qualityScore = res?.scores?.taskQuality ?? "-";
                const seconds = res ? (res.durationMs / 1000).toFixed(1) : "-";
                const tokens = res ? (res.tokensIn + res.tokensOut).toLocaleString() : "-";
                const agreement = res ? (res.agreementReached ? "Si" : "No") : "-";

                return (
                  <tr key={idx} className="hover:bg-surface-hover/20">
                    <td className="py-2.5 font-semibold text-text-primary">{row.name}</td>
                    <td className="py-2.5 text-center font-bold text-accent">{globalScore}</td>
                    <td className="py-2.5 text-center">{qualityScore}</td>
                    <td className="py-2.5 text-center">{seconds}s</td>
                    <td className="py-2.5 text-center">{tokens}</td>
                    <td className="py-2.5 text-center">{agreement}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
