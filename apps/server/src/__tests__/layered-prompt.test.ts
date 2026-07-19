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
        { agentId: "ceo", agentName: "CEO", role: "lead", replyMode: "broadcast" },
        { agentId: "dev", agentName: "Dev", role: "member", replyMode: "broadcast" }
      ],
      selfReplyMode: "broadcast"
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
    expect(result.composed).toContain("- @Dev (id: dev, role: member, replyMode: broadcast)");
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
        { agentId: "ceo", agentName: "CEO", role: "lead", replyMode: "broadcast" },
        { agentId: "dev", agentName: "Dev", role: "member", replyMode: "mention-only" }
      ],
      negotiationProtocol: true,
      isArbiter: true,
      selfReplyMode: "broadcast",
      leaderName: "CEO"
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
    expect(result.composed).toContain("- @Dev (id: dev, role: member, replyMode: mention-only)");
  });

  test("PromptComposer - Orchestration Team Context", () => {
    const agentDef = {
      name: "Coordinator",
      role: "Technical Lead",
      systemPrompt: "Coordinate the delivery."
    };
    const deployment: DeploymentContext = {
      mode: "orchestration",
      agentRole: "lead",
      members: [
        { agentId: "researcher", agentName: "Researcher", role: "member", replyMode: "none", capability: "Research technical options" },
        { agentId: "builder", agentName: "Builder", role: "member", replyMode: "none", capability: "Implement and verify changes" }
      ]
    };

    const result = promptComposer.compose(agentDef, deployment);
    expect(result.applied).toContain("identity.agent_core");
    expect(result.applied).toContain("instance.team.orchestration");
    expect(result.applied).toContain("instance.team.orchestration.leader-contract");
    expect(result.applied).not.toContain("role.leader.delegation");
    expect(result.applied).not.toContain("instance.channel.roster");
    expect(result.composed).toContain("delegate_task");
    expect(result.composed).toContain("Researcher (id: researcher, role: member, capability: Research technical options)");
    expect(result.composed).toContain("No uses menciones `@Nombre`");
    expect(result.composed).toContain("ambient broadcast channel");
  });

  test("PromptComposer - Negotiation Team Context", () => {
    const agentDef = {
      name: "Negotiator",
      role: "Member",
      systemPrompt: "Debate choices."
    };
    const deployment: DeploymentContext = {
      mode: "negotiation-team",
      agentRole: "member",
      members: [
        { agentId: "neg1", agentName: "Negotiator", role: "member", replyMode: "broadcast" },
        { agentId: "neg2", agentName: "Expert", role: "member", replyMode: "broadcast" }
      ]
    };

    const result = promptComposer.compose(agentDef, deployment);
    expect(result.applied).toContain("identity.agent_core");
    expect(result.applied).toContain("instance.team.negotiation.roster");
    expect(result.applied).not.toContain("instance.team.orchestration");
    expect(result.applied).not.toContain("instance.channel.roster");
    expect(result.composed).not.toContain("Mencionar a un participante");
    expect(result.composed).toContain("Debate de Equipo (Negotiation)");
  });

  test("PromptComposer - Senior Role Context", () => {
    const agentDef = {
      name: "SeniorDev",
      role: "Senior Developer",
      systemPrompt: "Architect solutions."
    };
    const deployment: DeploymentContext = {
      mode: "broadcast",
      agentRole: "senior",
      members: [
        { agentId: "ceo", agentName: "CEO", role: "lead", replyMode: "broadcast" },
        { agentId: "sdev", agentName: "SeniorDev", role: "senior", replyMode: "broadcast" }
      ],
      selfReplyMode: "broadcast"
    };

    const result = promptComposer.compose(agentDef, deployment);
    expect(result.applied).toContain("role.senior.communication");
    expect(result.applied).not.toContain("role.member.communication");
    expect(result.composed).toContain("PROTOCOLO DE COLABORACIÓN SENIOR:");
  });

  test("PromptComposer - Observer Role Context", () => {
    const agentDef = {
      name: "Auditor",
      role: "Observer Auditor",
      systemPrompt: "Audit logs."
    };
    const deployment: DeploymentContext = {
      mode: "broadcast",
      agentRole: "observer",
      members: [
        { agentId: "ceo", agentName: "CEO", role: "lead", replyMode: "broadcast" },
        { agentId: "auditor", agentName: "Auditor", role: "observer", replyMode: "mention-only" }
      ],
      selfReplyMode: "mention-only"
    };

    const result = promptComposer.compose(agentDef, deployment);
    expect(result.applied).toContain("role.observer.protocol");
    expect(result.applied).not.toContain("role.member.communication");
    expect(result.composed).toContain("PROTOCOLO DE OBSERVACIÓN SILENCIOSA:");
  });
});
