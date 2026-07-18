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
});
