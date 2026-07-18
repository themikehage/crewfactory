import { describe, expect, test } from "bun:test";
import { CHANNEL_TOPOLOGY_VERSION, channelPolicyPrompt, compileChannelPolicy, type Channel } from "shared";

const channel: Channel = {
  id: "channel",
  name: "Governed channel",
  members: [
    { agentId: "lead", role: "lead", replyMode: "broadcast" },
    { agentId: "specialist", role: "member", replyMode: "broadcast" },
  ],
  topology: { version: CHANNEL_TOPOLOGY_VERSION, kind: "leader_specialists", schedulerMode: "leader-gated", entryPointAgentId: "lead", terminalOwnerAgentId: "lead", assignments: [{ agentId: "lead", role: "leader", targets: [], order: 0 }, { agentId: "specialist", role: "specialist", targets: [], order: 1 }] },
  createdAt: "now",
  updatedAt: "now",
};

describe("channel policy", () => {
  test("derives final ownership and a deterministic checksum from topology", () => {
    const first = compileChannelPolicy(channel);
    const second = compileChannelPolicy(channel);
    expect(first.finalOwnerAgentId).toBe("lead");
    expect(first.checksum).toBe(second.checksum);
    expect(channelPolicyPrompt(first, channel.members[1])).toContain("Do not present a final team answer");
  });

  test("fails closed when the policy conflicts with topology ownership", () => {
    const compiled = compileChannelPolicy({ ...channel, policy: { version: "1", contributionBudget: { maxWords: 100 }, requireResponse: "eligible", handoff: "final-owner", finalOwnerAgentId: "specialist", negotiation: "none", outputContract: "concise-contribution" } });
    expect(compiled.diagnostics.map((diagnostic) => diagnostic.code)).toContain("final_owner_conflict");
  });
});
