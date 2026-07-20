import { describe, expect, it } from "bun:test";
import { parseEnvelope, getLastAssistantText, resolveModelWithFallback } from "../core/agent-utils";
import { NegotiationProtocol } from "../core/negotiation/negotiation-protocol";
import { ArbitrationProtocol } from "../core/negotiation/arbitration-protocol";
import type { NegotiationProtocol as NegotiationProtocolConfig } from "shared";

describe("Agent Utilities - Envelope Parser", () => {
  it("should parse a valid envelope with custom keys", () => {
    const text = `
status: success
executive_summary: El refactor de primitivas funciona correctamente.
artifacts: apps/server/src/core/agent-utils.ts
risks: None
`;
    const result = parseEnvelope(text);
    expect(result.status).toBe("success");
    expect(result.executive_summary).toBe("El refactor de primitivas funciona correctamente.");
    expect(result.artifacts).toBe("apps/server/src/core/agent-utils.ts");
    expect(result.risks).toBe("None");
  });

  it("should fallback to raw content if status/summary keys are missing", () => {
    const text = "Este es un mensaje ordinario sin un sobre formal.";
    const result = parseEnvelope(text);
    expect(result.status).toBe("success");
    expect(result.executive_summary).toBe("Este es un mensaje ordinario sin un sobre formal.");
    expect(result.artifacts).toBe("none");
    expect(result.risks).toBe("None");
  });
});

describe("Agent Utilities - Last Assistant Text Extractions", () => {
  it("should extract string assistant messages", () => {
    const messages = [
      { role: "user", content: "Hola" },
      { role: "assistant", content: "Hola, ¿en qué te puedo ayudar hoy?" }
    ];
    const text = getLastAssistantText(messages);
    expect(text).toBe("Hola, ¿en qué te puedo ayudar hoy?");
  });

  it("should extract content array assistant messages", () => {
    const messages = [
      { role: "user", content: "Hola" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Procesando la tarea..." },
          { type: "image", image: "mock" }
        ]
      }
    ];
    const text = getLastAssistantText(messages);
    expect(text).toBe("Procesando la tarea...");
  });
});

describe("Negotiation Protocol Primitives", () => {
  const config: NegotiationProtocolConfig = {
    agreementPattern: "ACUERDO ALCANZADO|ACEPTO",
    counterPattern: "CONTRAPROPUESTA",
    rejectPattern: "RECHAZO",
    maxRounds: 3,
    quorumThreshold: 0.5,
  };

  it("should ingest text and detect agreement", () => {
    const protocol = new NegotiationProtocol(config);
    let agreementCalled = false;
    protocol.onAgreement((pairKey) => {
      agreementCalled = true;
      expect(pairKey).toBe("agentA:agentB");
    });

    const result = protocol.ingest("agentA", "agentB", "ACUERDO ALCANZADO: Aceptamos los términos.");
    expect(result.matched).toBe("agreed");
    expect(agreementCalled).toBe(true);
  });

  it("should trigger escalation when max rounds are reached", () => {
    const protocol = new NegotiationProtocol(config);
    let escalationCalled = false;
    protocol.onEscalation((context) => {
      escalationCalled = true;
      expect(context.rounds).toBe(3);
    });

    protocol.ingest("agentA", "agentB", "Primera propuesta");
    protocol.ingest("agentB", "agentA", "Contrapropuesta a");
    const result = protocol.ingest("agentA", "agentB", "Sigue discusión sin acuerdo");
    expect(result.shouldEscalate).toBe(true);
    expect(escalationCalled).toBe(true);
  });
});

describe("Arbitration Protocol Primitives", () => {
  it("should build binding arbitration message", () => {
    const arbitration = new ArbitrationProtocol({ arbiterAgentId: "ceo" });
    expect(arbitration.getArbiterAgentId()).toBe("ceo");

    const msg = arbitration.buildEscalationMessage({
      senderId: "dev",
      senderName: "Developer Agent",
      receiverId: "pm",
      receiverName: "Project Manager Agent",
      rounds: 5,
      channelId: "channel-1",
      sessionId: "session-abc",
    });

    expect(msg.role).toBe("user");
    expect(msg.content).toContain("Bloqueo detectado tras 5 rondas");
    expect(msg.content).toContain("@Developer Agent");
    expect(msg.content).toContain("@Project Manager Agent");
  });
});
