import type { NegotiationProtocol } from "shared";
import type { NegotiationState, NegotiationPairState } from "./channel-store.js";

export type IngestResult = {
  matched: "agreed" | "counter" | "rejected" | null;
  rounds: number;
  shouldEscalate: boolean;
  pairKey: string;
};

export class NegotiationStateMachine {
  private config: NegotiationProtocol;
  private state: NegotiationState;
  private agreementRe: RegExp;
  private counterRe: RegExp | null;
  private rejectRe: RegExp | null;

  constructor(config: NegotiationProtocol, initialState: NegotiationState = {}) {
    this.config = config;
    this.state = { ...initialState };
    this.agreementRe = new RegExp(config.agreementPattern, "i");
    this.counterRe = config.counterPattern ? new RegExp(config.counterPattern, "i") : null;
    this.rejectRe = config.rejectPattern ? new RegExp(config.rejectPattern, "i") : null;
  }

  getState(): NegotiationState {
    return this.state;
  }

  private getPairKey(senderId: string, receiverId: string): string {
    return [senderId, receiverId].sort().join(":");
  }

  private getPair(pairKey: string): NegotiationPairState {
    if (!this.state[pairKey]) {
      this.state[pairKey] = { rounds: 0, lastOffer: null, status: "open" };
    }
    return this.state[pairKey];
  }

  ingest(senderId: string, receiverId: string, text: string): IngestResult {
    const pairKey = this.getPairKey(senderId, receiverId);
    const pair = this.getPair(pairKey);

    if (pair.status !== "open") {
      return { matched: null, rounds: pair.rounds, shouldEscalate: false, pairKey };
    }

    pair.rounds += 1;
    pair.lastOffer = text.slice(0, 500);

    let matched: IngestResult["matched"] = null;

    if (this.agreementRe.test(text)) {
      matched = "agreed";
      pair.status = "agreed";
    } else if (this.rejectRe?.test(text)) {
      matched = "rejected";
      pair.status = "rejected";
    } else if (this.counterRe?.test(text)) {
      matched = "counter";
    }

    const shouldEscalate =
      pair.status === "open" &&
      pair.rounds >= this.config.maxRounds &&
      matched === null;

    if (shouldEscalate) {
      pair.status = "escalated";
    }

    this.state[pairKey] = pair;

    return { matched, rounds: pair.rounds, shouldEscalate, pairKey };
  }

  resetPair(senderId: string, receiverId: string): void {
    const pairKey = this.getPairKey(senderId, receiverId);
    this.state[pairKey] = { rounds: 0, lastOffer: null, status: "open" };
  }

  resetAll(): void {
    this.state = {};
  }
}
