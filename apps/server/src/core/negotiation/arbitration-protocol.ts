import crypto from "node:crypto";

export interface EscalationContext {
  senderId: string;
  senderName: string;
  receiverId: string;
  receiverName: string;
  rounds: number;
  teamId: string;
  sessionId?: string;
}

export class ArbitrationProtocol {
  private arbiterAgentId: string;

  constructor(config: { arbiterAgentId: string }) {
    this.arbiterAgentId = config.arbiterAgentId;
  }

  getArbiterAgentId(): string {
    return this.arbiterAgentId;
  }

  buildEscalationMessage(context: EscalationContext) {
    return {
      id: crypto.randomUUID(),
      teamId: context.teamId,
      sessionId: context.sessionId,
      role: "user" as const,
      content: `Bloqueo detectado tras ${context.rounds} rondas entre @${context.senderName} y @${context.receiverName}. Emite veredicto vinculante.`,
      createdAt: new Date().toISOString(),
    };
  }
}
