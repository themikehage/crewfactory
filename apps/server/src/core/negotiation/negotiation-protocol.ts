import type { NegotiationProtocol as NegotiationProtocolConfig } from "shared";
import type { NegotiationState, NegotiationPairState } from "../../channels/channel-store.js";
import { NegotiationStateMachine, type IngestResult } from "../../channels/negotiation-state.js";

export type NegotiationTopology = "parallel" | "sequential" | "star" | "mesh";

export class NegotiationProtocol {
  private stateMachine: NegotiationStateMachine;
  private agreementHandlers: ((pairKey: string) => void)[] = [];
  private escalationHandlers: ((context: { senderId: string; receiverId: string; rounds: number }) => void)[] = [];
  private rejectionHandlers: ((pairKey: string) => void)[] = [];

  constructor(config: NegotiationProtocolConfig, initialState: NegotiationState = {}) {
    this.stateMachine = new NegotiationStateMachine(config, initialState);
  }

  getState(): NegotiationState {
    return this.stateMachine.getState();
  }

  ingest(senderId: string, receiverId: string, text: string): IngestResult {
    const result = this.stateMachine.ingest(senderId, receiverId, text);
    
    if (result.matched === "agreed") {
      for (const handler of this.agreementHandlers) {
        try { handler(result.pairKey); } catch (e) { console.error(e); }
      }
    } else if (result.matched === "rejected") {
      for (const handler of this.rejectionHandlers) {
        try { handler(result.pairKey); } catch (e) { console.error(e); }
      }
    }

    if (result.shouldEscalate) {
      for (const handler of this.escalationHandlers) {
        try {
          handler({
            senderId,
            receiverId,
            rounds: result.rounds,
          });
        } catch (e) {
          console.error(e);
        }
      }
    }

    return result;
  }

  onAgreement(handler: (pairKey: string) => void): void {
    this.agreementHandlers.push(handler);
  }

  onEscalation(handler: (context: { senderId: string; receiverId: string; rounds: number }) => void): void {
    this.escalationHandlers.push(handler);
  }

  onRejection(handler: (pairKey: string) => void): void {
    this.rejectionHandlers.push(handler);
  }

  resetPair(senderId: string, receiverId: string): void {
    this.stateMachine.resetPair(senderId, receiverId);
  }

  resetAll(): void {
    this.stateMachine.resetAll();
  }
}
