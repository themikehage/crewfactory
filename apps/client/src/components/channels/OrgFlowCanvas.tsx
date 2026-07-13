import { useEffect, useState, useRef, useCallback } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type Edge,
  type OnInit,
  type ReactFlowInstance,
} from "@xyflow/react";
import type { ChannelMember, AgentInfo } from "shared";
import { AgentFlowNode, type AgentNode } from "./AgentFlowNode";
import type { StreamingAgentState } from "@/hooks/useChannel";

interface Props {
  members: ChannelMember[];
  registeredAgents: AgentInfo[];
  streamingAgents: Record<string, StreamingAgentState>;
  onEditAgent: (member: ChannelMember) => void;
  sessionStatuses?: Record<string, "idle" | "working" | "unknown">;
}

const LEVEL_ORDER = ["lead", "senior", "member", "observer"] as const;
const NODE_WIDTH = 220;
const NODE_GAP = 30;
const LEVEL_HEIGHT = 160;

const nodeTypes = {
  agentNode: AgentFlowNode,
};

export function OrgFlowCanvas({ members, registeredAgents, streamingAgents, onEditAgent, sessionStatuses }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<AgentNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const reactFlowInstanceRef = useRef<ReactFlowInstance<AgentNode, Edge> | null>(null);

  const onInit: OnInit<AgentNode, Edge> = useCallback((instance) => {
    reactFlowInstanceRef.current = instance;
  }, []);

  // Re-fit viewport when container gets its real width
  useEffect(() => {
    if (containerWidth > 0) {
      reactFlowInstanceRef.current?.fitView({ padding: 0.3 });
    }
  }, [containerWidth]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Compute layout
  useEffect(() => {
    const computedNodes: AgentNode[] = [];
    const computedEdges: Edge[] = [];

    // Group members by role
    const grouped = LEVEL_ORDER.map((role) => {
      const list = members.filter((m) => {
        if (role === "member") return !m.role || m.role === "member";
        return m.role === role;
      });
      return { role, list };
    }).filter((g) => g.list.length > 0);

    const canvasWidth = Math.max(800, containerWidth);

    grouped.forEach((group, groupIdx) => {
      const y = 40 + groupIdx * LEVEL_HEIGHT;
      const rowWidth = group.list.length * NODE_WIDTH + (group.list.length - 1) * NODE_GAP;
      const startX = (canvasWidth - rowWidth) / 2;

      group.list.forEach((m, idx) => {
        const x = startX + idx * (NODE_WIDTH + NODE_GAP);
        const info = registeredAgents.find((a) => a.id === m.agentId);
        const streaming = streamingAgents[m.agentId];

        computedNodes.push({
          id: m.agentId,
          type: "agentNode",
          position: { x, y },
          data: {
            member: m,
            agentInfo: info,
            streamingState: streaming,
            sessionStatus: sessionStatuses?.[m.agentId] || "unknown",
            onEdit: () => onEditAgent(m),
          },
        });
      });
    });

    // Create edges hierarchically
    const leads = members.filter((m) => m.role === "lead");
    const seniors = members.filter((m) => m.role === "senior");
    const regulars = members.filter((m) => !m.role || m.role === "member");
    const observers = members.filter((m) => m.role === "observer");

    // Lead -> Senior
    leads.forEach((l) => {
      seniors.forEach((s) => {
        computedEdges.push({
          id: `edge-${l.agentId}-${s.agentId}`,
          source: l.agentId,
          target: s.agentId,
          animated: true,
          style: { stroke: "#4ade80", strokeWidth: 1.5 },
        });
      });

      // If no seniors, Lead -> Members directly
      if (seniors.length === 0) {
        regulars.forEach((r) => {
          computedEdges.push({
            id: `edge-${l.agentId}-${r.agentId}`,
            source: l.agentId,
            target: r.agentId,
            animated: true,
            style: { stroke: "#4ade80", strokeWidth: 1.5 },
          });
        });
      }
    });

    // Senior -> Member
    seniors.forEach((s) => {
      regulars.forEach((r) => {
        computedEdges.push({
          id: `edge-${s.agentId}-${r.agentId}`,
          source: s.agentId,
          target: r.agentId,
          animated: true,
          style: { stroke: "#9333ea", strokeWidth: 1.5 },
        });
      });
    });

    // Members -> Observers (dashed)
    regulars.forEach((r) => {
      observers.forEach((o) => {
        computedEdges.push({
          id: `edge-${r.agentId}-${o.agentId}`,
          source: r.agentId,
          target: o.agentId,
          animated: false,
          style: { stroke: "#a2a2a2", strokeDasharray: "5,5", strokeWidth: 1 },
        });
      });
    });

    setNodes(computedNodes);
    setEdges(computedEdges);
  }, [members, registeredAgents, streamingAgents, containerWidth, onEditAgent]);

  return (
    <div ref={containerRef} className="flex-1 h-full min-h-0 bg-background/30 rounded-xl overflow-hidden relative border border-border/40">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        onInit={onInit}
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Controls showInteractive={false} className="!bg-card !border-border !text-foreground [&_button]:!bg-card [&_button]:!border-border [&_button]:!text-foreground hover:[&_button]:!bg-card-hover" />
        <MiniMap
          nodeColor={(n) => {
            const role = (n.data as any)?.member?.role || "member";
            if (role === "lead") return "#4ade80";
            if (role === "senior") return "#c084fc";
            return "#313131";
          }}
          maskColor="rgba(18, 18, 18, 0.7)"
          className="!bg-card !border-border"
        />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#313131" />
      </ReactFlow>
    </div>
  );
}
