import { describe, expect, it } from "bun:test";
import { DivergenceDetector } from "../laboratory/divergence-detector";
import type { TeamMessage } from "shared";

describe("Divergence Detector Primitives", () => {
  it("should return null for empty messages", () => {
    const res = DivergenceDetector.detect([]);
    expect(res).toBeNull();
  });

  it("should return null if last message is not an agent", () => {
    const messages: TeamMessage[] = [
      {
        id: "1",
        teamId: "c1",
        role: "user",
        content: "VETO: This is not secure.",
        createdAt: new Date().toISOString()
      }
    ];
    const res = DivergenceDetector.detect(messages);
    expect(res).toBeNull();
  });

  it("should detect VETO keyword in last message", () => {
    const messages: TeamMessage[] = [
      {
        id: "1",
        teamId: "c1",
        role: "agent",
        agentId: "sec",
        agentName: "SecurityAgent",
        content: "VETO: Almacenar datos en Supabase viola cumplimiento PCI-DSS.",
        createdAt: new Date().toISOString()
      }
    ];
    const res = DivergenceDetector.detect(messages);
    expect(res).not.toBeNull();
    expect(res!.triggerType).toBe("veto");
    expect(res!.severity).toBe("high");
    expect(res!.agents[0]).toBe("SecurityAgent");
    expect(res!.reason).toContain("VETO por @SecurityAgent");
    expect(res!.reason).toContain("Almacenar datos en Supabase viola cumplimiento PCI-DSS.");
  });

  it("should detect DEADLOCK keyword in last message", () => {
    const messages: TeamMessage[] = [
      {
        id: "1",
        teamId: "c1",
        role: "agent",
        agentId: "dev",
        agentName: "DevAgent",
        content: "DEADLOCK: No podemos elegir entre Vercel y AWS.",
        createdAt: new Date().toISOString()
      }
    ];
    const res = DivergenceDetector.detect(messages);
    expect(res).not.toBeNull();
    expect(res!.triggerType).toBe("deadlock");
    expect(res!.severity).toBe("high");
    expect(res!.reason).toContain("DEADLOCK declarado por @DevAgent");
  });

  it("should detect OBJECTION keyword in last message", () => {
    const messages: TeamMessage[] = [
      {
        id: "1",
        teamId: "c1",
        role: "agent",
        agentId: "arch",
        agentName: "ArchitectAgent",
        content: "OBJECTION: El costo de esta infraestructura excede los $500/mes.",
        createdAt: new Date().toISOString()
      }
    ];
    const res = DivergenceDetector.detect(messages);
    expect(res).not.toBeNull();
    expect(res!.triggerType).toBe("explicit_objection");
    expect(res!.severity).toBe("medium");
    expect(res!.reason).toContain("OBJECTION por @ArchitectAgent");
  });

  it("should detect score delta divergence when diff >= threshold", () => {
    const messages: TeamMessage[] = [
      {
        id: "1",
        teamId: "c1",
        role: "agent",
        agentId: "arch",
        agentName: "ArchitectAgent",
        content: "SCORE: latency = 9/10\nMi propuesta técnica...",
        createdAt: new Date().toISOString()
      },
      {
        id: "2",
        teamId: "c1",
        role: "agent",
        agentId: "sec",
        agentName: "SecurityAgent",
        content: "SCORE: latency = 6/10\nConsidero que tiene riesgos...",
        createdAt: new Date().toISOString()
      }
    ];

    const res = DivergenceDetector.detect(messages, 2);
    expect(res).not.toBeNull();
    expect(res!.triggerType).toBe("score_delta");
    expect(res!.topic).toBe("LATENCY");
    expect(res!.delta).toBe(3);
    expect(res!.severity).toBe("medium");
  });

  it("should return null for score delta divergence when diff < threshold", () => {
    const messages: TeamMessage[] = [
      {
        id: "1",
        teamId: "c1",
        role: "agent",
        agentId: "arch",
        agentName: "ArchitectAgent",
        content: "SCORE: latency = 8/10",
        createdAt: new Date().toISOString()
      },
      {
        id: "2",
        teamId: "c1",
        role: "agent",
        agentId: "sec",
        agentName: "SecurityAgent",
        content: "SCORE: latency = 7/10",
        createdAt: new Date().toISOString()
      }
    ];

    const res = DivergenceDetector.detect(messages, 2);
    expect(res).toBeNull();
  });

  it("should match fuzzy scoring formats: SCORE X/10 para topic, topic: X/10, Puntúo topic con X/10", () => {
    const messages: TeamMessage[] = [
      {
        id: "1",
        teamId: "c1",
        role: "agent",
        agentId: "arch",
        agentName: "ArchitectAgent",
        content: "SCORE: 9/10 para costo. También, seguridad: 8/10.",
        createdAt: new Date().toISOString()
      },
      {
        id: "2",
        teamId: "c1",
        role: "agent",
        agentId: "sec",
        agentName: "SecurityAgent",
        content: "Puntúo costo con 6/10. Y para seguridad: 5/10.",
        createdAt: new Date().toISOString()
      }
    ];

    // Costo divergence check: 9 vs 6 (diff = 3 >= 2)
    const res = DivergenceDetector.detect(messages, 2);
    expect(res).not.toBeNull();
    expect(res!.triggerType).toBe("score_delta");
    expect(res!.topic).toBe("COSTO");
    expect(res!.delta).toBe(3);
  });
});
