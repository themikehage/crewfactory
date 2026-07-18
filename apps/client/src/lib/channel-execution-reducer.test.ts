import { expect, test } from "bun:test";
import type { ChannelExecutionEvent } from "shared";
import { applyChannelExecutionEvent, emptyChannelExecutionViewState } from "./channel-execution-reducer";

const event = (sequence: number, type: ChannelExecutionEvent["type"], payload: Record<string, unknown>) => ({
  id: `event-${sequence}`,
  executionId: "execution-1",
  channelId: "channel-1",
  agentId: "agent-1",
  sequence,
  type,
  createdAt: new Date().toISOString(),
  payload,
});

test("execution reducer keeps terminal tool state and ignores replayed events", () => {
  let state = applyChannelExecutionEvent(emptyChannelExecutionViewState, event(1, "tool_started", { toolCallId: "tool-1", toolName: "search", args: {} }));
  state = applyChannelExecutionEvent(state, event(2, "tool_updated", { toolCallId: "tool-1", partialResult: "partial" }));
  state = applyChannelExecutionEvent(state, event(3, "tool_completed", { toolCallId: "tool-1", result: "done" }));
  state = applyChannelExecutionEvent(state, event(3, "tool_updated", { toolCallId: "tool-1", partialResult: "stale" }));

  expect(state.agents["agent-1"].toolCalls?.["tool-1"]).toEqual({ toolName: "search", args: {}, result: "done", isError: false, isPartial: false });
  expect(state.lastSequenceByExecution["execution-1"]).toBe(3);
});

test("execution terminals clear streaming agents", () => {
  let state = applyChannelExecutionEvent(emptyChannelExecutionViewState, event(1, "text_delta", { delta: "working" }));
  state = applyChannelExecutionEvent(state, event(2, "turn_completed", {}));
  expect(state.agents).toEqual({});
  state = applyChannelExecutionEvent(state, event(3, "execution_stalled", {}));
  expect(state.agents).toEqual({});
});
