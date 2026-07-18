import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ChannelBusyError, ChannelOrchestrator } from "../channels/channel-orchestrator";
import { channelStore } from "../channels/channel-store";

const dataPath = join("C:", "tmp", `crewfactory-channel-orchestrator-${crypto.randomUUID()}`);

beforeAll(() => {
  process.env.CREWFACTORY_DATA_PATH = dataPath;
});

afterAll(() => {
  if (existsSync(dataPath)) rmSync(dataPath, { recursive: true, force: true });
  delete process.env.CREWFACTORY_DATA_PATH;
});

function createChannel(username: string) {
  return channelStore.createChannel(username, {
    name: "Channel test",
    executionProtocolEnabled: false,
  });
}

describe("ChannelOrchestrator execution guard", () => {
  test("rejects a concurrent submission even when durable execution is disabled", async () => {
    const username = `user-${crypto.randomUUID()}`;
    const channel = createChannel(username);
    const orchestrator = new ChannelOrchestrator();

    const first = orchestrator.dispatchUserMessage(username, channel.id, "first message");
    await expect(orchestrator.dispatchUserMessage(username, channel.id, "second message")).rejects.toBeInstanceOf(ChannelBusyError);
    await first;

    channelStore.deleteChannel(username, channel.id);
  });

  test("only aborts the active execution when its identifier matches", async () => {
    const username = `user-${crypto.randomUUID()}`;
    const channel = createChannel(username);
    const orchestrator = new ChannelOrchestrator();

    const dispatch = orchestrator.dispatchUserMessage(username, channel.id, "message");
    const executionId = orchestrator.getActiveExecutionId(username, channel.id);

    expect(executionId).toBeUndefined();
    expect(orchestrator.abortDispatch(username, channel.id, undefined, "other-execution")).toBe(false);
    expect(orchestrator.abortDispatch(username, channel.id)).toBe(true);
    await dispatch;

    channelStore.deleteChannel(username, channel.id);
  });

  test("does not abort a channel outside the caller scope", async () => {
    const owner = `owner-${crypto.randomUUID()}`;
    const otherUser = `other-${crypto.randomUUID()}`;
    const channel = createChannel(owner);
    const orchestrator = new ChannelOrchestrator();

    const dispatch = orchestrator.dispatchUserMessage(owner, channel.id, "message");
    expect(orchestrator.abortDispatch(otherUser, channel.id)).toBe(false);
    expect(orchestrator.abortDispatch(owner, channel.id)).toBe(true);
    await dispatch;

    channelStore.deleteChannel(owner, channel.id);
  });
});
