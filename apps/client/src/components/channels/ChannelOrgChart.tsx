import { useState, useEffect } from "react";
import type { ChannelMember, AgentInfo } from "shared";

interface Props {
  members: ChannelMember[];
  registeredAgents: AgentInfo[];
}

export function ChannelOrgChart({ members, registeredAgents }: Props) {
  const [isMobile, setIsMobile] = useState(false);
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const getAgentInfo = (agentId: string) => {
    return registeredAgents.find((a) => a.id === agentId);
  };

  const leads = members.filter((m) => m.role === "lead");
  const seniors = members.filter((m) => m.role === "senior");
  const regulars = members.filter((m) => m.role === "member" || !m.role);
  const observers = members.filter((m) => m.role === "observer");

  if (members.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-text-secondary text-center">
        <div className="w-16 h-16 rounded-2xl bg-surface border border-surface-hover flex items-center justify-center mb-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="opacity-40">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198.058-.02zM10.5 18a3 3 0 00-3-3h-3a3 3 0 00-3 3M10.5 18v-3a3 3 0 00-3-3h-3a3 3 0 00-3 3M19.5 9h-3M16.5 6a3 3 0 100 6 3 3 0 000-6zM9 6a3 3 0 100 6 3 3 0 000-6z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-text-primary">Empty Channel Hierarchy</p>
        <p className="text-xs mt-1 max-w-xs leading-normal">
          Add agents to this channel to visualize the organizational chart.
        </p>
      </div>
    );
  }

  const renderCardContent = (m: ChannelMember, info: AgentInfo | undefined, name: string, role: string) => {
    let cardClass = "w-full h-full bg-surface border border-surface-hover rounded-xl p-3 flex flex-col justify-between hover:border-accent/40 transition-all select-none relative overflow-hidden group";
    let badgeClass = "bg-surface-hover text-text-secondary border border-surface-hover";
    let sideLine = "";

    if (m.role === "lead") {
      cardClass = "w-full h-full bg-surface border border-accent/30 rounded-xl p-3 flex flex-col justify-between hover:border-accent/60 transition-all select-none relative overflow-hidden group shadow-lg shadow-accent/5";
      badgeClass = "bg-accent/10 text-accent border border-accent/20";
      sideLine = "absolute left-0 top-0 bottom-0 w-1 bg-accent";
    } else if (m.role === "senior") {
      cardClass = "w-full h-full bg-surface border border-purple-400/30 rounded-xl p-3 flex flex-col justify-between hover:border-purple-400/60 transition-all select-none relative overflow-hidden group shadow-lg shadow-purple-400/5";
      badgeClass = "bg-purple-400/10 text-purple-400 border border-purple-400/20";
      sideLine = "absolute left-0 top-0 bottom-0 w-1 bg-purple-400";
    } else if (m.role === "observer") {
      cardClass = "w-full h-full bg-surface/50 border border-dashed border-surface-hover rounded-xl p-3 flex flex-col justify-between hover:border-surface-hover/85 opacity-70 hover:opacity-100 transition-all select-none relative overflow-hidden group";
      badgeClass = "bg-bg text-text-secondary/60 border border-surface-hover/50";
    }

    return (
      <div 
        className={cardClass}
        onMouseEnter={() => setHoveredAgentId(m.agentId)}
        onMouseLeave={() => setHoveredAgentId(null)}
      >
        {sideLine}
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-1.5">
            <span className="font-semibold text-text-primary text-xs truncate pr-1">
              {name}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider ${badgeClass}`}>
              {m.role || "member"}
            </span>
          </div>
          <span className="text-[10px] text-text-secondary font-mono truncate block mt-0.5">
            {role}
          </span>
        </div>

        <div className="flex items-center justify-between text-[9px] text-text-secondary/80 mt-1 border-t border-surface-hover/40 pt-1.5">
          <span>Mode: {m.replyMode}</span>
          {info?.skills && info.skills.length > 0 && (
            <span className="text-[8px] bg-bg/50 px-1 py-0.5 rounded border border-surface-hover max-w-[60px] truncate">
              {info.skills.length} skills
            </span>
          )}
        </div>

        {hoveredAgentId === m.agentId && (
          <div className="absolute inset-0 bg-surface/98 flex flex-col p-2 text-[10px] justify-between z-10 transition-opacity">
            <div className="min-w-0 overflow-y-auto max-h-[48px] space-y-1">
              <p className="font-semibold text-text-primary truncate">{name}</p>
              {info?.skills && info.skills.length > 0 && (
                <p className="text-text-secondary leading-tight">
                  <span className="text-text-primary font-medium">Skills:</span> {info.skills.join(", ")}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-surface-hover/40 pt-1 text-[9px] text-text-secondary/70">
              <span>Mode: {m.replyMode}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (isMobile) {
    const mobileGroups = [
      { role: "lead", title: "Leads", list: leads },
      { role: "senior", title: "Seniors", list: seniors },
      { role: "member", title: "Members", list: regulars },
      { role: "observer", title: "Observers", list: observers },
    ].filter((g) => g.list.length > 0);

    return (
      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-bg/20">
        {mobileGroups.map((g) => (
          <div key={g.role} className="space-y-2">
            <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-widest px-1">
              {g.title} ({g.list.length})
            </h4>
            <div className="grid grid-cols-1 gap-2.5">
              {g.list.map((m) => {
                const info = getAgentInfo(m.agentId);
                const name = info?.name || m.agentId;
                const role = info?.role || "agent";
                return (
                  <div key={m.agentId} className="h-[76px]">
                    {renderCardContent(m, info, name, role)}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const levels = [
    { role: "lead", list: leads },
    { role: "senior", list: seniors },
    { role: "member", list: regulars },
    { role: "observer", list: observers },
  ].filter((l) => l.list.length > 0);

  const width = 800;
  const nodeWidth = 180;
  const nodeHeight = 72;
  const levelHeight = 140;
  const totalHeight = levels.length * levelHeight + 40;

  return (
    <div className="flex-1 overflow-auto p-6 bg-bg/25 flex justify-center items-start min-h-0">
      <div className="relative" style={{ width: `${width}px`, height: `${totalHeight}px` }}>
        <svg 
          width={width} 
          height={totalHeight} 
          viewBox={`0 0 ${width} ${totalHeight}`} 
          className="absolute inset-0 z-0 pointer-events-none"
        >
          {levels.map((lvl, i) => {
            if (i === levels.length - 1) return null;
            const nextLvl = levels[i + 1];

            const parentYBottom = 40 + i * levelHeight + nodeHeight;
            const childYTop = 40 + (i + 1) * levelHeight;
            const midY = parentYBottom + (childYTop - parentYBottom) / 2;

            const parentCount = lvl.list.length;
            const childCount = nextLvl.list.length;

            const parentLines = lvl.list.map((_, idx) => {
              const xCenter = (idx + 0.5) * (width / parentCount);
              return `M ${xCenter} ${parentYBottom} L ${xCenter} ${midY}`;
            }).join(" ");

            const minChildX = 0.5 * (width / childCount);
            const maxChildX = (childCount - 0.5) * (width / childCount);
            const horizontalLine = childCount > 1 
              ? `M ${minChildX} ${midY} L ${maxChildX} ${midY}`
              : "";

            const childLines = nextLvl.list.map((_, idx) => {
              const xCenter = (idx + 0.5) * (width / childCount);
              return `M ${xCenter} ${midY} L ${xCenter} ${childYTop}`;
            }).join(" ");

            return (
              <path 
                key={i} 
                d={`${parentLines} ${horizontalLine} ${childLines}`} 
                stroke="#2a2a2a" 
                strokeWidth={1.5} 
                fill="none" 
              />
            );
          })}
        </svg>

        <div className="absolute inset-0 z-10 pointer-events-auto">
          {levels.map((lvl, i) => {
            const y = 40 + i * levelHeight;
            const count = lvl.list.length;

            return lvl.list.map((m, idx) => {
              const x = (idx + 0.5) * (width / count) - nodeWidth / 2;
              const info = getAgentInfo(m.agentId);
              const name = info?.name || m.agentId;
              const role = info?.role || "agent";

              return (
                <div
                  key={m.agentId}
                  className="absolute"
                  style={{
                    left: `${x}px`,
                    top: `${y}px`,
                    width: `${nodeWidth}px`,
                    height: `${nodeHeight}px`,
                  }}
                >
                  {renderCardContent(m, info, name, role)}
                </div>
              );
            });
          })}
        </div>
      </div>
    </div>
  );
}
