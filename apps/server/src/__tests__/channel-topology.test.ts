import { describe, expect, test } from "bun:test";
import { CHANNEL_TOPOLOGY_VERSION, inferChannelTopology, previewChannelTopology, validateChannelTopology } from "shared";

const members = [
  { agentId: "lead", replyMode: "user-only" as const, role: "lead" as const },
  { agentId: "writer", replyMode: "user-only" as const, role: "member" as const },
];

describe("channel topology", () => {
  test("accepts a complete leader-specialists graph", () => {
    const topology = { version: CHANNEL_TOPOLOGY_VERSION, kind: "leader_specialists" as const, schedulerMode: "leader-gated" as const, entryPointAgentId: "lead", terminalOwnerAgentId: "lead", assignments: [{ agentId: "lead", role: "leader" as const, targets: [], order: 0 }, { agentId: "writer", role: "specialist" as const, targets: [], order: 1 }] };
    expect(validateChannelTopology(topology, members).valid).toBe(true);
    expect(previewChannelTopology(topology).firstRecipients).toEqual(["lead"]);
  });

  test("rejects invalid graph edges and missing entry point", () => {
    const topology = { version: CHANNEL_TOPOLOGY_VERSION, kind: "leader_specialists" as const, schedulerMode: "parallel" as const, assignments: [{ agentId: "lead", role: "leader" as const, targets: ["lead", "missing"], order: 0 }, { agentId: "writer", role: "specialist" as const, targets: [], order: 1 }] };
    const codes = validateChannelTopology(topology, members).diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).toContain("self_target");
    expect(codes).toContain("unreachable_target");
    expect(codes).toContain("incompatible_scheduler");
    expect(codes).toContain("entry_required");
  });

  test("classifies ambiguous legacy configuration as expert custom", () => {
    const topology = inferChannelTopology([{ agentId: "a", replyMode: "targeted" as const, targetAgentIds: ["b"] }, { agentId: "b", replyMode: "targeted" as const, targetAgentIds: ["a"] }]);
    expect(topology.kind).toBe("legacy_custom");
    expect(validateChannelTopology(topology, [{ agentId: "a", replyMode: "targeted" as const }, { agentId: "b", replyMode: "targeted" as const }]).diagnostics.map((item) => item.code)).toContain("expert_ack_required");
  });
});
