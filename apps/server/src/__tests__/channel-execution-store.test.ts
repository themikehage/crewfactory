import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ChannelExecutionStore } from "../channels/channel-execution-store";

const dataPath = join("C:", "tmp", `crewfactory-channel-execution-${crypto.randomUUID()}`);
const username = "execution-test";
const channelId = "channel-test";

beforeAll(() => {
  process.env.CREWFACTORY_DATA_PATH = dataPath;
});

afterAll(() => {
  if (existsSync(dataPath)) rmSync(dataPath, { recursive: true, force: true });
  delete process.env.CREWFACTORY_DATA_PATH;
});

describe("ChannelExecutionStore", () => {
  test("persists sequenced idempotent events and terminal turns", () => {
    const store = new ChannelExecutionStore();
    const execution = store.createExecution(username, channelId, { sessionId: "session-1" });
    const started = store.appendEvent(username, channelId, execution.id, { id: "start", type: "execution_started" });
    const duplicate = store.appendEvent(username, channelId, execution.id, { id: "start", type: "execution_started" });
    const turn = store.createTurn(username, channelId, execution.id, "agent-1", 0);
    store.updateTurn(username, channelId, execution.id, turn.id, "completed", { messageId: "message-1" });
    const completed = store.appendEvent(username, channelId, execution.id, { type: "execution_completed" });

    expect(started.sequence).toBe(1);
    expect(duplicate.sequence).toBe(1);
    expect(completed.sequence).toBe(2);
    expect(store.getEvents(username, channelId, execution.id)).toHaveLength(2);
    const persisted = store.getExecution(username, channelId, execution.id);
    expect(persisted?.status).toBe("completed");
    expect(persisted?.turns[0]).toMatchObject({ id: turn.id, status: "completed", messageId: "message-1" });
  });

  test("marks unfinished turns aborted and records warning completion", () => {
    const store = new ChannelExecutionStore();
    const execution = store.createExecution(username, channelId, { sessionId: "session-2" });
    store.appendEvent(username, channelId, execution.id, { type: "execution_started" });
    const active = store.createTurn(username, channelId, execution.id, "agent-2", 0);
    store.finishOpenTurns(username, channelId, execution.id, "aborted", "aborted");
    store.appendEvent(username, channelId, execution.id, { type: "execution_aborted" });

    expect(store.getExecution(username, channelId, execution.id)).toMatchObject({ status: "aborted", turns: [{ id: active.id, status: "aborted", skipReason: "aborted" }] });

    const warningExecution = store.createExecution(username, channelId, { sessionId: "session-3" });
    store.appendEvent(username, channelId, warningExecution.id, { type: "execution_started" });
    store.appendEvent(username, channelId, warningExecution.id, { type: "execution_completed", payload: { withWarnings: true, reason: "chain_limit" } });
    expect(store.getExecution(username, channelId, warningExecution.id)).toMatchObject({ status: "completed_with_warnings", terminalReason: "chain_limit" });
  });

  test("marks open executions stalled after a server restart", () => {
    const store = new ChannelExecutionStore();
    const execution = store.createExecution(username, channelId, { sessionId: "session-4" });
    store.appendEvent(username, channelId, execution.id, { type: "execution_started" });
    const turn = store.createTurn(username, channelId, execution.id, "agent-3", 0);

    expect(store.recoverInterruptedExecutions(username, channelId)).toBe(1);
    expect(store.getExecution(username, channelId, execution.id)).toMatchObject({ status: "stalled", terminalReason: "server_restart", turns: [{ id: turn.id, status: "aborted", skipReason: "aborted" }] });
    expect(store.getEvents(username, channelId, execution.id).at(-1)?.type).toBe("execution_stalled");
  });
});
