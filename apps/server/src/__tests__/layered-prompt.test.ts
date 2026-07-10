import { expect, test, describe } from "bun:test";
import { promptFragmentRegistry } from "../core/prompts/registry";
import { promptComposer, type DeploymentContext } from "../core/prompts/composer";

describe("Layered Prompt System Tests", () => {
  test("PromptFragmentRegistry - default fragments registered", () => {
    const coreIdentity = promptFragmentRegistry.get("identity.agent_core");
    expect(coreIdentity).toBeDefined();
    expect(coreIdentity?.category).toBe("identity");

    const soloInstance = promptFragmentRegistry.get("instance.solo");
    expect(soloInstance).toBeDefined();
    expect(soloInstance?.category).toBe("instance");

    const memberRole = promptFragmentRegistry.get("role.member.communication");
    expect(memberRole).toBeDefined();
    expect(memberRole?.category).toBe("role");
  });

  test("PromptComposer - Solo Deployment Context", () => {
    const agentDef = {
      name: "CEO",
      role: "Chief Executive Officer",
      systemPrompt: "Define startup strategies."
    };
    const deployment: DeploymentContext = {
      mode: "solo"
    };

    const result = promptComposer.compose(agentDef, deployment);
    expect(result.applied).toContain("identity.agent_core");
    expect(result.applied).toContain("instance.solo");
    expect(result.applied).not.toContain("role.leader.delegation");
    expect(result.applied).not.toContain("role.member.communication");

    expect(result.composed).toContain("Eres CEO, con el rol de Chief Executive Officer.");
    expect(result.composed).toContain("Define startup strategies.");
    expect(result.composed).toContain("CONTEXTO DE EJECUCIÓN: Individual (Solo).");
  });

  test("PromptComposer - Broadcast / Member Context", () => {
    const agentDef = {
      name: "Dev",
      role: "Frontend Developer",
      systemPrompt: "Build UI components."
    };
    const deployment: DeploymentContext = {
      mode: "broadcast",
      agentRole: "member",
      members: [
        { agentId: "ceo", agentName: "CEO", role: "lead" },
        { agentId: "dev", agentName: "Dev", role: "member" }
      ]
    };

    const result = promptComposer.compose(agentDef, deployment);
    expect(result.applied).toContain("identity.agent_core");
    expect(result.applied).toContain("role.member.communication");
    expect(result.applied).toContain("instance.channel.roster");
    expect(result.applied).toContain("instance.channel.broadcast");
    expect(result.applied).not.toContain("role.leader.delegation");

    expect(result.composed).toContain("Eres Dev, con el rol de Frontend Developer.");
    expect(result.composed).toContain("Build UI components.");
    expect(result.composed).toContain("PROTOCOLO DE COLABORACIÓN ENTRE PARES:");
    expect(result.composed).toContain("MODO DE CANAL: Colaboración Horizontal (Leaderless).");
    expect(result.composed).toContain("- @Dev (id: dev, role: member)");
  });

  test("PromptComposer - Targeted / Leader / Negotiation & Arbitration Context", () => {
    const agentDef = {
      name: "CEO",
      role: "CEO Leader",
      systemPrompt: "Coordinate startup team."
    };
    const deployment: DeploymentContext = {
      mode: "targeted",
      agentRole: "lead",
      members: [
        { agentId: "ceo", agentName: "CEO", role: "lead" },
        { agentId: "dev", agentName: "Dev", role: "member" }
      ],
      negotiationProtocol: true,
      isArbiter: true
    };

    const result = promptComposer.compose(agentDef, deployment);
    expect(result.applied).toContain("identity.agent_core");
    expect(result.applied).toContain("role.leader.delegation");
    expect(result.applied).toContain("role.leader.communication");
    expect(result.applied).toContain("instance.channel.roster");
    expect(result.applied).toContain("instance.channel.targeted");
    expect(result.applied).toContain("protocol.arbitration");
    expect(result.applied).not.toContain("protocol.negotiation");
    expect(result.applied).not.toContain("role.member.communication");

    expect(result.composed).toContain("Coordinate startup team.");
    expect(result.composed).toContain("PROTOCOLO DE COORDINACIÓN (LÍDER):");
    expect(result.composed).toContain("MODO DE CANAL: Jerárquico (With Leader).");
    expect(result.composed).toContain("PROTOCOLO DE ARBITRAJE:");
  });
});
