import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import type { RunSummary } from "@/hooks/useChannelBenchmark";

interface Props {
  runs: RunSummary[];
}

export function ScoreEvolutionChart({ runs }: Props) {
  const data = [...runs]
    .filter((r) => r.status === "completed" && r.scores)
    .reverse()
    .map((r, i) => ({
      index: i + 1,
      name: r.name || `Run ${i + 1}`,
      "Multi-Agent": r.scores?.multi ?? 0,
      "Single Agent": r.scores?.single ?? 0,
    }));

  if (data.length < 2) return null;

  return (
    <div className="bg-card border border-border p-4 rounded-xl">
      <h3 className="text-sm font-semibold text-foreground mb-4 select-none">Evolución de Puntaje</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
            <XAxis dataKey="name" stroke="#a2a2a2" fontSize={11} tickLine={false} />
            <YAxis domain={[0, 100]} stroke="#a2a2a2" fontSize={11} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: "#171717", borderColor: "#262626", borderRadius: "8px" }}
              labelStyle={{ fontWeight: "bold", color: "#e2e8f0" }}
            />
            <Legend verticalAlign="top" height={36} />
            <Line
              type="monotone"
              dataKey="Multi-Agent"
              stroke="#4ade80"
              strokeWidth={2}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="Single Agent"
              stroke="#a2a2a2"
              strokeWidth={2}
              strokeDasharray="5 5"
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
export default ScoreEvolutionChart;
