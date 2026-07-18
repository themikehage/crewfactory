import { describe, expect, it } from "bun:test";
import { estimateContextTokens } from "../ai/vendor/ai/src/utils/estimate";
import type { Message } from "../ai/vendor/ai/src/types";

describe("context usage estimation", () => {
  it("estimates assistant channel history without provider usage", () => {
    const estimate = estimateContextTokens([
      {
        role: "assistant",
        content: [{ type: "text", text: "Previous channel response" }],
        stopReason: "stop",
      },
      {
        role: "user",
        content: [{ type: "text", text: "Continue the task" }],
      },
    ] as unknown as Message[]);

    expect(estimate.tokens).toBeGreaterThan(0);
    expect(estimate.usageTokens).toBe(0);
    expect(estimate.lastUsageIndex).toBeNull();
  });
});
