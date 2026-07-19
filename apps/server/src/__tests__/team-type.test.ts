// Mock ws/handler to avoid circular initialization errors at module load time
import { mock } from "bun:test";

mock.module("../ws/handler", () => {
  return {};
});

import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { teamStore } from "../teams/team-store";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TMP_TEST_DIR = join(import.meta.dirname, "../../tmp-team-type-tests");

describe("Team Type - Schema and Store Tests", () => {
  const username = "test_user_tt";

  // Override getTeamsDir/getTeamDir/getTeamMessagesPath by mocking shared module
  beforeEach(() => {
    if (!existsSync(TMP_TEST_DIR)) {
      mkdirSync(TMP_TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    rmSync(TMP_TEST_DIR, { recursive: true, force: true });
  });

  test("createTeam persists teamType: Negotiation", () => {
    const created = teamStore.createTeam(username, {
      name: "Negotiation Team",
      teamType: "Negotiation",
      members: [{ agentId: "agent1", role: "lead" }],
    });

    expect(created.teamType).toBe("Negotiation");

    const fetched = teamStore.getTeam(username, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.teamType).toBe("Negotiation");
  });

  test("createTeam persists teamType: Orchestration", () => {
    const created = teamStore.createTeam(username, {
      name: "Orchestration Team",
      teamType: "Orchestration",
      members: [{ agentId: "agent1", role: "lead" }],
    });

    expect(created.teamType).toBe("Orchestration");

    const fetched = teamStore.getTeam(username, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.teamType).toBe("Orchestration");
  });

  test("getTeam applies fallback to Negotiation for legacy teams without teamType", () => {
    const created = teamStore.createTeam(username, {
      name: "Legacy Team",
      members: [{ agentId: "agent1", role: "lead" }],
    });

    // Simulate a legacy JSON without teamType by reading/writing the file directly
    const legacyData = {
      id: created.id,
      name: "Legacy Team",
      mode: "debate",
      members: [{ agentId: "agent1", role: "lead" }],
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };

    // Write over the team.json without teamType
    const { getTeamDir } = require("shared");
    const teamJsonPath = join(getTeamDir(username, created.id), "team.json");
    writeFileSync(teamJsonPath, JSON.stringify(legacyData, null, 2));

    const fetched = teamStore.getTeam(username, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.teamType).toBe("Negotiation");
  });

  test("updateTeam persists teamType change", () => {
    const created = teamStore.createTeam(username, {
      name: "Swap Type Team",
      teamType: "Negotiation",
      members: [{ agentId: "agent1", role: "lead" }],
    });

    expect(created.teamType).toBe("Negotiation");

    const updated = teamStore.updateTeam(username, created.id, { teamType: "Orchestration" });
    expect(updated).not.toBeNull();
    expect(updated!.teamType).toBe("Orchestration");

    const fetched = teamStore.getTeam(username, created.id);
    expect(fetched!.teamType).toBe("Orchestration");
  });

  test("listTeams includes teamType in results", () => {
    const u = `test_user_list_${Date.now()}`;
    teamStore.createTeam(u, {
      name: "Neg Team",
      teamType: "Negotiation",
      members: [{ agentId: "agent1", role: "lead" }],
    });

    teamStore.createTeam(u, {
      name: "Orch Team",
      teamType: "Orchestration",
      members: [{ agentId: "agent2", role: "lead" }],
    });

    const teams = teamStore.listTeams(u);
    expect(teams.length).toBe(2);
    expect(teams.every((t) => t.teamType !== undefined)).toBe(true);

    const types = teams.map((t) => t.teamType).sort();
    expect(types).toContain("Negotiation");
    expect(types).toContain("Orchestration");
  });
});
