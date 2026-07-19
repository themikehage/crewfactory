import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useChannel } from "@/hooks/useChannel";
import { useAgents } from "@/hooks/useAgents";
import { ChannelMessages } from "@/components/channels/ChannelMessages";
import { ChannelInput } from "@/components/channels/ChannelInput";
import { MembersPanel } from "@/components/channels/MembersPanel";
import { AddMemberModal } from "@/components/channels/AddMemberModal";
import { useLiterals } from "@/lib";
import { literals as u } from "./ChannelDetailPage.literals";
import { apiFetch } from "@/lib/api";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  Legend,
} from "recharts";
import { MessageSquare, BarChart, Route, User, Bot, AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  channelId: string;
  onNavigate: (path: string) => void;
}

interface ChannelAnalytics {
  turnsPerAgent: { agentId: string; agentName: string; count: number }[];
  vetoRate: number;
  vetoCount: number;
  arbitrationRounds: number;
  divergenceCount: number;
  avgResponseTimeMs: number;
  totalSessions: number;
}

const COLORS = ["#4ade80", "#3b82f6", "#a855f7", "#fbbf24", "#f43f5e", "#06b6d4"];

export function ChannelDetailPage({ channelId, onNavigate }: Props) {
  const l = useLiterals(u);
  const { pathname } = useLocation();

  const {
    channel,
    messages,
    streamingAgents,
    loading,
    error,
    sendMessage,
    addMember,
    updateMember,
    removeMember,
  } = useChannel(channelId);

  const { agents: registeredAgents } = useAgents();

  const [activeSubTab, setActiveSubTab] = useState<"chat" | "analytics" | "swimlanes">("chat");
  const [showMembersSidebar, setShowMembersSidebar] = useState(true);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);

  // Sync tab with route path
  useEffect(() => {
    if (pathname.endsWith("/analytics")) {
      setActiveSubTab("analytics");
    } else if (pathname.endsWith("/swimlanes")) {
      setActiveSubTab("swimlanes");
    } else {
      setActiveSubTab("chat");
    }
  }, [pathname]);

  // Analytics states
  const [analytics, setAnalytics] = useState<ChannelAnalytics | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  const fetchAnalytics = useCallback(async () => {
    setLoadingAnalytics(true);
    try {
      const res = await apiFetch(`/api/channels/${channelId}/analytics`);
      if (res.ok) {
        const d = await res.json();
        setAnalytics(d);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAnalytics(false);
    }
  }, [channelId]);

  useEffect(() => {
    if (activeSubTab === "analytics") {
      fetchAnalytics();
    }
  }, [activeSubTab, fetchAnalytics]);

  const agentAvatarMap = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const a of registeredAgents) {
      map[a.id] = a.avatarUrl;
    }
    return map;
  }, [registeredAgents]);

  // Swimlanes dimensions and coordinates calculation
  const swimlanesContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (activeSubTab === "swimlanes" && swimlanesContainerRef.current) {
      const updateWidth = () => {
        setContainerWidth(swimlanesContainerRef.current?.getBoundingClientRect().width || 0);
      };
      updateWidth();
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }
  }, [activeSubTab, messages.length]);

  // Map lanes: Lane 0 = User, Lanes 1+ = Agents
  const lanes = useMemo(() => {
    if (!channel) return [];
    const list = [{ id: "user", name: "User", isUser: true }];
    channel.members.forEach((m) => {
      const agentObj = registeredAgents.find((a) => a.id === m.agentId);
      list.push({ id: m.agentId, name: agentObj?.name || m.agentId, isUser: false });
    });
    return list;
  }, [channel, registeredAgents]);

  const swimlanePoints = useMemo(() => {
    if (messages.length === 0 || lanes.length === 0 || containerWidth === 0) return [];

    const startX = 140; // width of agent label column
    const availableWidth = containerWidth - startX - 40; // leaving margin on right
    const step = availableWidth / (messages.length - 1 || 1);

    const laneIndexMap = new Map<string, number>();
    lanes.forEach((l, idx) => laneIndexMap.set(l.id, idx));

    return messages.map((m, idx) => {
      const isUser = m.role === "user";
      const id = isUser ? "user" : m.agentId || "unknown";
      const laneIdx = laneIndexMap.get(id) ?? 0;

      const x = startX + idx * step;
      const y = 40 + laneIdx * 80 + 20; // 40px top padding + 80px row height * index + 20px center

      return {
        x,
        y,
        role: m.role,
        agentName: m.agentName || "Agent",
        agentId: m.agentId,
        content: m.content || "",
        timestamp: m.createdAt,
        index: idx,
        isVeto: m.role === "agent" && m.content?.includes("VETO:"),
      };
    });
  }, [messages, lanes, containerWidth]);

  // Generate SVG path connecting points chronologically
  const svgPath = useMemo(() => {
    if (swimlanePoints.length < 2) return "";
    let d = `M ${swimlanePoints[0].x} ${swimlanePoints[0].y}`;
    for (let i = 1; i < swimlanePoints.length; i++) {
      d += ` L ${swimlanePoints[i].x} ${swimlanePoints[i].y}`;
    }
    return d;
  }, [swimlanePoints]);

  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const selectedPoint = useMemo(() => {
    if (selectedPointIndex === null) return null;
    return swimlanePoints[selectedPointIndex];
  }, [selectedPointIndex, swimlanePoints]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !channel) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-background text-destructive gap-3">
        <p className="text-sm font-medium">{error || l.channelNotFound}</p>
        <button
          onClick={() => onNavigate("/channels")}
          className="px-4 py-2 text-xs bg-card border border-input text-foreground rounded-lg hover:bg-card-hover transition-colors"
        >
          {l.backToChannels}
        </button>
      </div>
    );
  }

  const tabClass = (tab: typeof activeSubTab) =>
    `px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
      activeSubTab === tab
        ? "bg-accent/15 text-accent border border-accent/20"
        : "text-muted-foreground hover:text-foreground border border-transparent"
    }`;

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden relative">
      {/* Header */}
      <div className="h-12 px-4 border-b border-border flex items-center justify-between flex-shrink-0 bg-card/50 backdrop-blur-sm z-10">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => onNavigate("/channels")}
              className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
              title={l.backToChannels}
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-primary font-bold text-base select-none">#</span>
              <h2 className="text-sm font-semibold text-foreground truncate">{channel.name}</h2>
            </div>
          </div>

          {/* Sub-tab Selection */}
          <div className="hidden sm:flex items-center bg-card/85 p-0.5 border border-input rounded-xl gap-0.5 shadow-xs">
            <button onClick={() => onNavigate(`/channels/${channelId}`)} className={tabClass("chat")}>
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{l.tabChat}</span>
            </button>
            <button onClick={() => onNavigate(`/channels/${channelId}/analytics`)} className={tabClass("analytics")}>
              <BarChart className="w-3.5 h-3.5" />
              <span>{l.tabAnalytics}</span>
            </button>
            <button onClick={() => onNavigate(`/channels/${channelId}/swimlanes`)} className={tabClass("swimlanes")}>
              <Route className="w-3.5 h-3.5" />
              <span>{l.tabSwimlanes}</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeSubTab === "chat" && (
            <button
              onClick={() => setShowMembersSidebar((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                showMembersSidebar
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-card border-input text-muted-foreground hover:text-foreground"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
              </svg>
              <span className="hidden sm:inline">Agents ({channel.members.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Internal Sub-Tabs for Mobile */}
      <div className="flex sm:hidden items-center justify-around bg-card border-b border-border p-1 gap-1">
        <button
          onClick={() => onNavigate(`/channels/${channelId}`)}
          className={`flex-1 py-1.5 text-center text-xs font-bold rounded-lg ${
            activeSubTab === "chat" ? "bg-accent/10 text-accent font-bold" : "text-muted-foreground"
          }`}
        >
          {l.tabChat}
        </button>
        <button
          onClick={() => onNavigate(`/channels/${channelId}/analytics`)}
          className={`flex-1 py-1.5 text-center text-xs font-bold rounded-lg ${
            activeSubTab === "analytics" ? "bg-accent/10 text-accent font-bold" : "text-muted-foreground"
          }`}
        >
          {l.tabAnalytics}
        </button>
        <button
          onClick={() => onNavigate(`/channels/${channelId}/swimlanes`)}
          className={`flex-1 py-1.5 text-center text-xs font-bold rounded-lg ${
            activeSubTab === "swimlanes" ? "bg-accent/10 text-accent font-bold" : "text-muted-foreground"
          }`}
        >
          {l.tabSwimlanes}
        </button>
      </div>

      {/* Main Body Area */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Tab 1: Chat View */}
        {activeSubTab === "chat" && (
          <div className="flex-1 flex min-h-0 relative overflow-hidden w-full">
            <div className="flex-1 flex flex-col min-w-0 h-full">
              <ChannelMessages
                messages={messages}
                streamingAgents={streamingAgents}
                agentAvatarMap={agentAvatarMap}
                streamingRenderMode={channel.streamingRenderMode ?? "live"}
              />
              <ChannelInput onSend={sendMessage} />
            </div>

            {showMembersSidebar && (
              <MembersPanel
                members={channel.members}
                registeredAgents={registeredAgents}
                onAddClick={() => setShowAddMemberModal(true)}
                onUpdateMember={(agentId, replyMode) => updateMember(agentId, { replyMode })}
                onRemoveMember={removeMember}
              />
            )}
          </div>
        )}

        {/* Tab 2: Analytics View */}
        {activeSubTab === "analytics" && (
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-background">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Channel Performance Metrics</h3>
              <button
                onClick={fetchAnalytics}
                disabled={loadingAnalytics}
                className="p-1.5 hover:bg-card-hover border border-input rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-50 transition-all cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingAnalytics ? "animate-spin" : ""}`} />
              </button>
            </div>

            {loadingAnalytics ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-muted-foreground">{l.loadingAnalytics}</span>
              </div>
            ) : !analytics ? (
              <div className="text-center py-12 border border-dashed border-input rounded-2xl text-muted-foreground text-xs font-semibold">
                {l.noAnalytics}
              </div>
            ) : (
              <div className="space-y-6">
                {/* KPI Cards Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="border border-input/60 rounded-xl p-4 bg-card/20 shadow-xs">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-1">
                      {l.kpiTotalSessions}
                    </span>
                    <span className="text-xl font-bold text-foreground">{analytics.totalSessions}</span>
                  </div>
                  <div className="border border-input/60 rounded-xl p-4 bg-card/20 shadow-xs">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-1">
                      {l.kpiVetoRate}
                    </span>
                    <span className="text-xl font-bold text-foreground flex items-baseline gap-1.5">
                      {Math.round(analytics.vetoRate * 100)}%
                      <span className="text-[10px] text-muted-foreground font-normal">
                        ({analytics.vetoCount} vetos)
                      </span>
                    </span>
                  </div>
                  <div className="border border-input/60 rounded-xl p-4 bg-card/20 shadow-xs">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-1">
                      {l.kpiArbitrations}
                    </span>
                    <span className="text-xl font-bold text-foreground flex items-baseline gap-1.5">
                      {analytics.arbitrationRounds}
                      <span className="text-[10px] text-muted-foreground font-normal">
                        ({analytics.divergenceCount} divergences)
                      </span>
                    </span>
                  </div>
                  <div className="border border-input/60 rounded-xl p-4 bg-card/20 shadow-xs">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-1">
                      {l.kpiAvgResponse}
                    </span>
                    <span className="text-xl font-bold text-foreground">
                      {analytics.avgResponseTimeMs > 0
                        ? `${(analytics.avgResponseTimeMs / 1000).toFixed(1)}s`
                        : "0s"}
                    </span>
                  </div>
                </div>

                {/* Agent turns distribution */}
                <div className="bg-card border border-input rounded-2xl p-4 md:p-6 shadow-xs max-w-xl">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground mb-4">
                    {l.chartTurnsTitle}
                  </h4>
                  <div className="h-64 flex items-center justify-center">
                    {analytics.turnsPerAgent.length === 0 ? (
                      <span className="text-xs text-muted-foreground">No turns logged yet</span>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={analytics.turnsPerAgent}
                            dataKey="count"
                            nameKey="agentName"
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={75}
                            paddingAngle={3}
                          >
                            {analytics.turnsPerAgent.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <ChartTooltip
                            contentStyle={{
                              backgroundColor: "#171717",
                              borderColor: "#262626",
                              borderRadius: "8px",
                              fontSize: "11px",
                            }}
                          />
                          <Legend verticalAlign="bottom" height={36} iconSize={8} wrapperStyle={{ fontSize: "10px" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Swimlanes Timeline View */}
        {activeSubTab === "swimlanes" && (
          <div className="flex-1 flex flex-col h-full bg-background overflow-hidden p-4 md:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3 flex-shrink-0">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Agent Arbitration Swimlanes</h3>
                <p className="text-[10px] text-muted-foreground">Deliberation turns charted in sequential parallel rows</p>
              </div>
            </div>

            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-input rounded-2xl p-12 text-center text-muted-foreground space-y-2">
                <Route className="w-8 h-8 text-muted-foreground/45" />
                <p className="text-xs font-medium max-w-sm">{l.noMessagesForSwimlane}</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 gap-6 overflow-hidden">
                {/* Swimlanes Board */}
                <div
                  ref={swimlanesContainerRef}
                  className="flex-1 border border-input rounded-2xl bg-card/10 overflow-y-auto overflow-x-hidden p-4 relative min-h-0"
                >
                  {/* SVG connecting paths */}
                  {containerWidth > 0 && swimlanePoints.length >= 2 && (
                    <svg className="absolute inset-0 pointer-events-none w-full h-full z-0 opacity-40">
                      <path d={svgPath} stroke="#4ade80" strokeWidth="1.5" strokeDasharray="3 3" fill="none" />
                    </svg>
                  )}

                  {/* Lanes rendering */}
                  <div className="relative space-y-0 w-full" style={{ minHeight: `${lanes.length * 80 + 40}px` }}>
                    {lanes.map((lane) => (
                      <div
                        key={lane.id}
                        className="h-20 border-b border-border/30 flex items-center relative z-1 flex-row"
                      >
                        {/* Agent Info card */}
                        <div className="w-32 flex items-center gap-2 pr-3 border-r border-border/45 shrink-0 bg-background/50 backdrop-blur-xs h-full z-10 py-2 select-none">
                          <div className="w-6 h-6 rounded-full bg-card hover:bg-card-hover border border-input flex items-center justify-center overflow-hidden shrink-0">
                            {lane.isUser ? (
                              <User className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Bot className="w-3.5 h-3.5 text-blue-400" />
                            )}
                          </div>
                          <span className="text-[10px] font-bold text-foreground truncate" title={lane.name}>
                            {lane.name}
                          </span>
                        </div>

                        {/* Timeline line */}
                        <div className="flex-1 relative h-full flex items-center">
                          <div className="absolute left-0 right-0 h-px bg-border/40" />
                        </div>
                      </div>
                    ))}

                    {/* Nodes positioned absolutely over the lanes grid */}
                    {swimlanePoints.map((point) => (
                      <button
                        key={point.index}
                        onClick={() => setSelectedPointIndex(point.index)}
                        style={{
                          left: `${point.x}px`,
                          top: `${point.y}px`,
                        }}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full border flex items-center justify-center transition-all z-20 shadow-md hover:scale-115 cursor-pointer ${
                          selectedPointIndex === point.index
                            ? "bg-primary border-primary text-background scale-110"
                            : point.role === "user"
                            ? "bg-emerald-950/80 border-emerald-500/40 text-emerald-400"
                            : point.isVeto
                            ? "bg-rose-950/85 border-rose-500/50 text-rose-400"
                            : "bg-blue-950/80 border-blue-500/40 text-blue-400"
                        }`}
                        title={`${point.agentName} (Turn ${point.index + 1})`}
                      >
                        <span className="text-[9px] font-bold font-mono">{point.index + 1}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Node Detail Inspector panel */}
                <div className="h-44 border border-input/60 rounded-2xl bg-card p-4 flex flex-col overflow-hidden shrink-0">
                  {selectedPoint === null ? (
                    <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground italic select-none">
                      Select a numbered turn node above to inspect message detail
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col min-h-0 gap-2">
                      <div className="flex items-center justify-between border-b border-border/40 pb-1.5 shrink-0 flex-wrap gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground">
                            Turn {selectedPoint.index + 1}: {selectedPoint.agentName}
                          </span>
                          {selectedPoint.isVeto && (
                            <span className="text-[8px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/20 px-1.5 py-0.2 rounded-md uppercase flex items-center gap-0.5">
                              <AlertTriangle size={9} />
                              Veto Event
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {new Date(selectedPoint.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="flex-1 overflow-y-auto text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed font-sans pr-1">
                        {selectedPoint.content}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showAddMemberModal && (
        <AddMemberModal
          availableAgents={registeredAgents}
          currentMemberAgentIds={channel.members.map((m) => m.agentId)}
          onClose={() => setShowAddMemberModal(false)}
          onAdd={addMember}
          hasLeader={channel.members.some((m) => m.role === "lead")}
        />
      )}
    </div>
  );
}
