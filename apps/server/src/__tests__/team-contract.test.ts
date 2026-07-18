import { describe, expect, test } from "bun:test";
import { validateTeamConfiguration } from "shared";

describe("Teams contract", () => {
  test("requires one leader and specialists for leader topology", () => {
    expect(validateTeamConfiguration({ topology: "leader_specialists", members: [{ agentId: "lead", role: "leader" }, { agentId: "specialist", role: "specialist" }] })).toBeNull();
    expect(validateTeamConfiguration({ topology: "leader_specialists", members: [{ agentId: "one", role: "specialist" }] })).toContain("exactly one leader");
  });

  test("requires one facilitator and participants for roundtable topology", () => {
    expect(validateTeamConfiguration({ topology: "roundtable", members: [{ agentId: "facilitator", role: "facilitator" }, { agentId: "peer", role: "participant" }] })).toBeNull();
    expect(validateTeamConfiguration({ topology: "roundtable", members: [{ agentId: "leader", role: "leader" }, { agentId: "peer", role: "participant" }] })).toContain("exactly one facilitator");
  });
});
