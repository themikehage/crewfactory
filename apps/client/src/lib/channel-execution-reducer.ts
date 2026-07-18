import type { ChannelExecutionEvent } from "shared";

export interface ExecutionToolState {
  toolName: string;
  args: unknown;
  result: unknown | null;
  isError: boolean;
  isPartial?: boolean;
}

export interface ExecutionAgentState {
  agentId: string;
  text: string;
  thinking?: string;
  toolCalls?: Record<string, ExecutionToolState>;
}

export interface ChannelExecutionViewState {
  agents: Record<string, ExecutionAgentState>;
  lastSequenceByExecution: Record<string, number>;
}

export const emptyChannelExecutionViewState: ChannelExecutionViewState = { agents: {}, lastSequenceByExecution: {} };

function output(value: unknown): unknown {
  return typeof value === "string" ? value : JSON.stringify(value ?? "");
}

export function applyChannelExecutionEvent(state: ChannelExecutionViewState, event: ChannelExecutionEvent): ChannelExecutionViewState {
  const lastSequence = state.lastSequenceByExecution[event.executionId] ?? 0;
  if (event.sequence <= lastSequence) return state;
  const sequences = { ...state.lastSequenceByExecution, [event.executionId]: event.sequence };
  if (!event.agentId) return { ...state, lastSequenceByExecution: sequences };
  const payload = event.payload;
  const current = state.agents[event.agentId] ?? { agentId: event.agentId, text: "" };
  let next = current;
  if (event.type === "text_delta") next = { ...current, text: current.text + String(payload.delta ?? "") };
  if (event.type === "thinking_delta") next = { ...current, thinking: (current.thinking ?? "") + String(payload.delta ?? "") };
  const callId = typeof payload.toolCallId === "string" ? payload.toolCallId : "";
  if (event.type === "tool_started" && callId) next = { ...current, toolCalls: { ...current.toolCalls, [callId]: { toolName: String(payload.toolName ?? "tool"), args: payload.args ?? {}, result: null, isError: false } } };
  const existing = callId ? current.toolCalls?.[callId] : undefined;
  if ((event.type === "tool_updated" || event.type === "tool_completed" || event.type === "tool_failed") && existing) {
    const terminal = event.type === "tool_completed" || event.type === "tool_failed";
    next = { ...current, toolCalls: { ...current.toolCalls, [callId]: { ...existing, result: output(event.type === "tool_updated" ? payload.partialResult : payload.result), isError: event.type === "tool_failed", isPartial: !terminal } } };
  }
  return { agents: { ...state.agents, [event.agentId]: next }, lastSequenceByExecution: sequences };
}
