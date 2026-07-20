import { useState, useEffect, useCallback, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { useLiterals } from "@/lib";
import { literals as u } from "./AnalyticsPage.literals";
import {
  ComposedChart,
  Area,
  Bar,
  BarChart,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Calendar, Layers, Cpu, ShieldAlert, Zap, Hourglass, AlertCircle, RefreshCw } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";

interface AnalyticsData {
  totalSessions: number;
  totalTokens: number;
  totalToolCalls: number;
  totalErrors: number;
  totalDurationMs: number;
  avgDurationMs: number;
  avgTokensPerSession: number;
  sessionsByDay: { date: string; count: number; tokens: number }[];
  topTools: { tool: string; count: number }[];
  topModels: { model: string; count: number }[];
  errorRate: number;
  topErrors: { tool: string; count: number }[];
}

interface FilterOption {
  id: string;
  name: string;
}

const COLORS = ["#4ade80", "#3b82f6", "#a855f7", "#fbbf24", "#f43f5e", "#06b6d4"];

export function AnalyticsPage() {
  const l = useLiterals(u);

  // Set default dates to last 30 days
  const defaultTo = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
  const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("");

  const [projects, setProjects] = useState<FilterOption[]>([]);
  const [agents, setAgents] = useState<FilterOption[]>([]);
  const [teams, setTeams] = useState<FilterOption[]>([]);

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch filters on mount
  useEffect(() => {
    async function loadFilters() {
      try {
        const [projRes, agentRes, teamRes] = await Promise.all([
          apiFetch("/api/workspace-projects"),
          apiFetch("/api/agents"),
          apiFetch("/api/teams"),
        ]);

        if (projRes.ok) {
          const d = await projRes.json();
          const items = (d.projects || d.repos || []).map((x: any) => ({
            id: x.name,
            name: x.name,
          }));
          setProjects(items);
        }
        if (agentRes.ok) {
          const d = await agentRes.json();
          setAgents(d.agents || []);
        }
        if (teamRes.ok) {
          const d = await teamRes.json();
          setTeams(d.teams || []);
        }
      } catch (err) {
        console.error("Failed to load analytics filters:", err);
      }
    }
    loadFilters();
  }, []);

  const loadAnalytics = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams();
      if (from) params.append("from", from);
      if (to) params.append("to", to);
      if (selectedProject) params.append("projectName", selectedProject);
      if (selectedAgent) params.append("agentId", selectedAgent);
      if (selectedTeam) params.append("teamId", selectedTeam);

      const res = await apiFetch(`/api/sessions/analytics?${params.toString()}`);
      if (res.ok) {
        const d = await res.json();
        setData(d);
      }
    } catch (err) {
      console.error("Failed to load analytics data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [from, to, selectedProject, selectedAgent, selectedTeam]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const formatDuration = (ms: number) => {
    if (!ms) return `0${l.seconds}`;
    const totalSec = Math.floor(ms / 1000);
    if (totalSec < 60) return `${totalSec}${l.seconds}`;
    const totalMin = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (totalMin < 60) return `${totalMin}${l.minutes} ${sec}${l.seconds}`;
    const h = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    return `${h}${l.hours} ${min}${l.minutes}`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const kpis = useMemo(() => {
    if (!data) return [];
    return [
      {
        id: "sessions",
        label: l.kpiSessions,
        value: data.totalSessions.toString(),
        icon: <Layers className="w-4 h-4 text-blue-400" />,
        bg: "border-blue-500/10 bg-blue-500/2",
      },
      {
        id: "tokens",
        label: l.kpiTokens,
        value: formatNumber(data.totalTokens),
        icon: <Zap className="w-4 h-4 text-emerald-400" />,
        bg: "border-emerald-500/10 bg-emerald-500/2",
      },
      {
        id: "toolcalls",
        label: l.kpiToolCalls,
        value: formatNumber(data.totalToolCalls),
        icon: <Cpu className="w-4 h-4 text-purple-400" />,
        bg: "border-purple-500/10 bg-purple-500/2",
      },
      {
        id: "duration",
        label: l.kpiAvgDuration,
        value: formatDuration(data.avgDurationMs),
        icon: <Hourglass className="w-4 h-4 text-amber-400" />,
        bg: "border-amber-500/10 bg-amber-500/2",
      },
      {
        id: "errors",
        label: l.kpiErrorRate,
        value: `${Math.round(data.errorRate * 100)}%`,
        icon: <ShieldAlert className="w-4 h-4 text-rose-400" />,
        bg: "border-rose-500/10 bg-rose-500/2",
      },
    ];
  }, [data, l]);

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-y-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 pb-4">
        <div className="space-y-1">
          <h1 className="text-lg font-bold text-foreground tracking-tight">{l.title}</h1>
          <p className="text-xs text-muted-foreground">{l.subtitle}</p>
        </div>
        <button
          onClick={() => loadAnalytics(true)}
          disabled={loading || refreshing}
          className="p-2 hover:bg-card-hover rounded-xl border border-input text-muted-foreground hover:text-foreground disabled:opacity-50 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "..." : ""}
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-3 bg-card/40 border border-input rounded-xl items-end">
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {l.filterFrom}
          </label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full bg-background border border-input rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {l.filterTo}
          </label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full bg-background border border-input rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-bold text-muted-foreground">
            {l.filterProject}
          </label>
          <Dropdown<string>
            value={selectedProject}
            onChange={setSelectedProject}
            options={[
              { value: "", label: l.allProjects },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
            size="sm"
            className="w-full"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-bold text-muted-foreground">
            {l.filterAgent}
          </label>
          <Dropdown<string>
            value={selectedAgent}
            onChange={setSelectedAgent}
            options={[
              { value: "", label: l.allAgents },
              ...agents.map((a) => ({ value: a.id, label: a.name })),
            ]}
            size="sm"
            className="w-full"
          />
        </div>

        <div className="col-span-2 md:col-span-1 space-y-1.5">
          <label className="text-[10px] uppercase font-bold text-muted-foreground">
            {l.filterChannel}
          </label>
          <Dropdown<string>
            value={selectedTeam}
            onChange={setSelectedTeam}
            options={[
              { value: "", label: l.allChannels },
              ...teams.map((t) => ({ value: t.id, label: `${t.name}` })),
            ]}
            size="sm"
            className="w-full"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 space-y-3">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground font-medium">{l.loading}</span>
        </div>
      ) : !data || data.totalSessions === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-input rounded-2xl p-12 text-center text-muted-foreground space-y-2">
          <AlertCircle className="w-8 h-8 text-muted-foreground/50" />
          <p className="text-xs font-semibold text-foreground">{l.noData}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {kpis.map((kpi) => (
              <div
                key={kpi.id}
                className={`border rounded-2xl p-4 flex flex-col space-y-2 transition-all hover:scale-101 shadow-sm ${kpi.bg}`}
              >
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[10px] uppercase font-bold tracking-wider">{kpi.label}</span>
                  {kpi.icon}
                </div>
                <span className="text-xl font-bold text-foreground leading-none">{kpi.value}</span>
              </div>
            ))}
          </div>

          {/* Activity Over Time Chart */}
          <div className="bg-card border border-input rounded-2xl p-4 md:p-6 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground mb-4">
              {l.chartActivityTitle}
            </h2>
            <div className="w-full h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.sessionsByDay}>
                  <defs>
                    <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4ade80" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                  <XAxis dataKey="date" stroke="#737373" fontSize={10} tickLine={false} />
                  <YAxis yAxisId="left" stroke="#737373" fontSize={10} tickLine={false} />
                  <YAxis yAxisId="right" orientation="right" stroke="#4ade80" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#171717",
                      borderColor: "#262626",
                      borderRadius: "12px",
                      fontSize: "11px",
                      color: "#e5e5e5",
                    }}
                  />
                  <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: "11px" }} />
                  <Bar yAxisId="left" dataKey="count" fill="#3b82f6" name="Sessions" radius={[3, 3, 0, 0]} maxBarSize={20} />
                  <Area yAxisId="right" type="monotone" dataKey="tokens" stroke="#4ade80" strokeWidth={2} fillOpacity={1} fill="url(#colorTokens)" name="Tokens" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Top Tools Bar Chart */}
            <div className="bg-card border border-input rounded-2xl p-4 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-wider text-foreground mb-4">
                {l.chartToolsTitle}
              </h2>
              <div className="h-64">
                {data.topTools.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-[11px] text-muted-foreground">
                    No tools recorded
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={data.topTools.slice(0, 5)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#262626" horizontal={false} />
                      <XAxis type="number" stroke="#737373" fontSize={9} tickLine={false} />
                      <YAxis type="category" dataKey="tool" stroke="#737373" fontSize={9} tickLine={false} width={80} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#171717",
                          borderColor: "#262626",
                          borderRadius: "8px",
                          fontSize: "11px",
                        }}
                      />
                      <Bar dataKey="count" fill="#a855f7" radius={[0, 4, 4, 0]} maxBarSize={15} name="Executions" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Model Distribution Pie Chart */}
            <div className="bg-card border border-input rounded-2xl p-4 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-wider text-foreground mb-4">
                {l.chartModelsTitle}
              </h2>
              <div className="h-64">
                {data.topModels.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-[11px] text-muted-foreground">
                    No models recorded
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.topModels}
                        dataKey="count"
                        nameKey="model"
                        cx="50%"
                        cy="46%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={3}
                      >
                        {data.topModels.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#171717",
                          borderColor: "#262626",
                          borderRadius: "8px",
                          fontSize: "11px",
                        }}
                      />
                      <Legend verticalAlign="bottom" align="center" iconSize={8} iconType="circle" wrapperStyle={{ fontSize: "10px", lineHeight: "16px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Top Errors Bar Chart */}
            <div className="bg-card border border-input rounded-2xl p-4 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-wider text-foreground mb-4">
                {l.chartErrorsTitle}
              </h2>
              <div className="h-64">
                {data.topErrors.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-[11px] text-muted-foreground">
                    No errors recorded
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.topErrors.slice(0, 5)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                      <XAxis dataKey="tool" stroke="#737373" fontSize={9} tickLine={false} />
                      <YAxis stroke="#737373" fontSize={9} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#171717",
                          borderColor: "#262626",
                          borderRadius: "8px",
                          fontSize: "11px",
                        }}
                      />
                      <Bar dataKey="count" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={20} name="Errors" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
