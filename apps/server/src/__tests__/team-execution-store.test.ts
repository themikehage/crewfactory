import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Team } from "shared";
import { TeamExecutionStore } from "../teams/team-execution-store";

const dataPath = join("C:", "tmp", `crewfactory-team-execution-${crypto.randomUUID()}`);
const username = "team-execution-test";
const team: Team = {
  id: "team-test",
  name: "Test team",
  topology: "leader_specialists",
  members: [{ agentId: "leader", role: "leader" }, { agentId: "specialist", role: "specialist" }],
  configurationVersion: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

beforeAll(() => { process.env.CREWFACTORY_DATA_PATH = dataPath; });
afterAll(() => { if (existsSync(dataPath)) rmSync(dataPath, { recursive: true, force: true }); delete process.env.CREWFACTORY_DATA_PATH; });

describe("TeamExecutionStore", () => {
  test("persists sequenced idempotent events and the final delivery", () => {
    const store = new TeamExecutionStore();
    const execution = store.create(username, team, "Deliver this task", "request-1");
    const started = store.appendEvent(username, team.id, execution.id, { id: "start", type: "execution_started" });
    const duplicate = store.appendEvent(username, team.id, execution.id, { id: "start", type: "execution_started" });
    const completed = store.appendEvent(username, team.id, execution.id, { type: "execution_completed", payload: { finalOutput: "Delivered" } });

    expect(started.sequence).toBe(1);
    expect(duplicate.sequence).toBe(1);
    expect(completed.sequence).toBe(2);
    expect(store.findByRequestId(username, team.id, "request-1")?.id).toBe(execution.id);
    expect(store.get(username, team.id, execution.id)).toMatchObject({ status: "completed", finalOutput: "Delivered" });
  });

  test("marks active executions interrupted after restart recovery", () => {
    const store = new TeamExecutionStore();
    const execution = store.create(username, team, "Recover this task", "request-2");
    store.appendEvent(username, team.id, execution.id, { type: "execution_started" });

    expect(store.recoverInterrupted(username, team.id)).toBe(1);
    expect(store.get(username, team.id, execution.id)).toMatchObject({ status: "interrupted", terminalReason: "server_restart" });
    expect(store.events(username, team.id, execution.id).at(-1)?.type).toBe("execution_interrupted");
  });
});
