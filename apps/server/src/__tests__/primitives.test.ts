import { describe, expect, it } from "bun:test";
import { parseEnvelope, getLastAssistantText, resolveModelWithFallback } from "../core/agent-utils";
import { ArbitrationProtocol } from "../core/negotiation/arbitration-protocol";

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
      teamId: "team-1",
      sessionId: "session-abc",
    });

    expect(msg.role).toBe("user");
    expect(msg.content).toContain("Bloqueo detectado tras 5 rondas");
    expect(msg.content).toContain("@Developer Agent");
    expect(msg.content).toContain("@Project Manager Agent");
  });
});
