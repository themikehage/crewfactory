import { useState, useEffect, useRef, useMemo } from "react";
import type { ChannelMember, ChannelRole, AgentInfo } from "shared";
import { OrgChartLevel } from "./OrgChartLevel";
import { OrgChartLines } from "./OrgChartLines";
import { OrgChartEmpty } from "./OrgChartEmpty";
import { OrgChartCard } from "./OrgChartCard";

interface Props {
  members: ChannelMember[];
  registeredAgents: AgentInfo[];
}

const LEVEL_ORDER: ChannelRole[] = ["lead", "senior", "member", "observer"];

const NODE_WIDTH = 180;
const NODE_HEIGHT = 82;
const LEVEL_HEIGHT = 160;
const MIN_CANVAS_WIDTH = 800;
const LEVEL_PADDING = 48;

const MOBILE_LEVEL_LABELS: Record<string, string> = {
  lead: "Leads",
  senior: "Seniors",
  member: "Members",
  observer: "Observers",
};

export function ChannelOrgChart({ members, registeredAgents }: Props) {
  const [isMobile, setIsMobile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (isMobile || !containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isMobile]);

  const levels = useMemo(() => {
    const grouped: { role: string; list: ChannelMember[] }[] = [];
    for (const role of LEVEL_ORDER) {
      const list = members.filter((m) => {
        if (role === "member") return !m.role || m.role === "member";
        return m.role === role;
      });
      if (list.length > 0) {
        grouped.push({ role, list });
      }
    }
    return grouped;
  }, [members]);

  if (members.length === 0) {
    return <OrgChartEmpty isMobile={isMobile} />;
  }

  const totalWidth = Math.max(MIN_CANVAS_WIDTH, containerWidth - LEVEL_PADDING);
  const totalHeight = levels.length * LEVEL_HEIGHT + 40;

  if (isMobile) {
    return (
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {levels.map((lvl) => (
          <div key={lvl.role} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                {MOBILE_LEVEL_LABELS[lvl.role] ?? lvl.role}
              </h4>
              <span className="text-[9px] text-muted-foreground/50 bg-card-hover/50 px-1.5 py-0.5 rounded-full">
                {lvl.list.length}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {lvl.list.map((m) => {
                const info = registeredAgents.find((a) => a.id === m.agentId);
                const name = info?.name || m.agentId;
                const agentRole = info?.role || "agent";
                const skillCount = info?.skills?.length ?? 0;
                const skills = info?.skills ?? [];
                return (
                  <div key={m.agentId} style={{ height: `${NODE_HEIGHT}px` }}>
                    <OrgChartCard
                      member={m}
                      name={name}
                      role={agentRole}
                      skillCount={skillCount}
                      skills={skills}
                      animationDelay={0}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-auto p-6 bg-background/25 flex justify-center items-start min-h-0">
      <div className="relative" style={{ width: `${totalWidth}px`, height: `${totalHeight}px` }}>
        <OrgChartLines
          levels={levels}
          nodeHeight={NODE_HEIGHT}
          levelHeight={LEVEL_HEIGHT}
          totalWidth={totalWidth}
          totalHeight={totalHeight}
        />

        <div className="relative z-10 space-y-0">
          {levels.map((lvl, i) => {
            const y = 40 + i * LEVEL_HEIGHT;
            return (
              <div key={lvl.role} className="absolute" style={{ left: 0, top: `${y}px`, width: "100%" }}>
                <OrgChartLevel
                  role={lvl.role}
                  members={lvl.list}
                  registeredAgents={registeredAgents}
                  nodeWidth={NODE_WIDTH}
                  nodeHeight={NODE_HEIGHT}
                  startIndex={i * lvl.list.length}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
