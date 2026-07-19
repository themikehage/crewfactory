import { expect, test, describe, beforeEach, afterEach, mock } from "bun:test";
import { channelOrchestrator } from "../channels/channel-orchestrator";
import { channelStore } from "../channels/channel-store";
import { agentRegistry } from "../agents";
import type { Channel, ChannelMessage } from "shared";
import { existsSync, unlinkSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const TMP_TEST_DIR = join(import.meta.dirname, "../../tmp-channel-tests");

// Mock streamSimple to return synthetic events
mock.module("../ai/vendor/ai/src/compat.ts", () => {
  return {
    streamSimple: (model: any, context: any, options: any) => {
      const responseText = `[TestResponse from ${model.id}] ACUERDO ALCANZADO: Acepto los términos.`;
      const stream = {
        result: async () => ({
          role: "assistant",
          content: [{ type: "text", text: responseText }],
          usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 30, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: "stop",
          timestamp: Date.now(),
        }),
        async *[Symbol.asyncIterator]() {
          yield { type: "start", partial: {} };
          yield { type: "text_delta", delta: responseText, partial: {} };
          yield { type: "done", message: {} };
        }
      };
      return stream;
    }
  };
});

describe("Stateless Debate Channel Tests", () => {
  const username = "test_user";

  beforeEach(() => {
    if (!existsSync(TMP_TEST_DIR)) {
      mkdirSync(TMP_TEST_DIR, { recursive: true });
    }

    // Mock agent registry
    const mockAgent1 = {
      username,
      status: "idle",
      server: {
        definition: { id: "agent1", name: "Agent 1" },
        session: {
          model: { id: "m1", api: "openai-responses", provider: "openai" },
          cwd: TMP_TEST_DIR,
          resourceLoader: {
            getSystemPrompt: () => "You are Agent 1",
          }
        },
        memory: {
          store: async () => {},
          buildContext: async () => "Agent 1 memory context"
        }
      }
    };

    const mockAgent2 = {
      username,
      status: "idle",
      server: {
        definition: { id: "agent2", name: "Agent 2" },
        session: {
          model: { id: "m2", api: "openai-responses", provider: "openai" },
          cwd: TMP_TEST_DIR,
          resourceLoader: {
            getSystemPrompt: () => "You are Agent 2",
          }
        },
        memory: {
          store: async () => {},
          buildContext: async () => "Agent 2 memory context"
        }
      }
    };

    agentRegistry.register = async (u: string, def: any) => {
      return (def.id === "agent1" ? mockAgent1 : mockAgent2) as any;
    };

    const originalGet = agentRegistry.get;
    agentRegistry.get = (id: string) => {
      if (id === "agent1") return mockAgent1 as any;
      if (id === "agent2") return mockAgent2 as any;
      return originalGet.call(agentRegistry, id);
    };
  });

  afterEach(() => {
    rmSync(TMP_TEST_DIR, { recursive: true, force: true });
  });

  test("Stateless debate runs parallel rounds & evaluates consensus successfully", async () => {
    const channelId = "test-debate-channel";
    
    // 1. Create channel in store
    try {
      channelStore.deleteChannel(username, channelId);
    } catch {}

    const channel = channelStore.createChannel(username, {
      id: channelId,
      name: "Test Debate",
      description: "Testing stateless debate loop",
      channelType: "debate",
      context: [],
      maxChainDepth: 2,
      showThinking: false,
      showTools: false,
      negotiationProtocol: {
        agreementPattern: "ACUERDO ALCANZADO",
        maxRounds: 2,
      }
    } as any);

    channelStore.updateMembers(username, channelId, [
      { agentId: "agent1", replyMode: "broadcast", role: "member" },
      { agentId: "agent2", replyMode: "broadcast", role: "member" }
    ] as any);

    // 2. Dispatch a user message
    await channelOrchestrator.dispatchUserMessage(username, channelId, "Hagamos un debate sobre AWS vs GCP", "session1");

    // 3. Verify messages are persisted in channel store
    const messages = channelStore.getMessages(username, channelId, 50, "session1");
    expect(messages.length).toBeGreaterThan(1);
    
    const userMsg = messages.find(m => m.role === "user");
    expect(userMsg).toBeDefined();
    expect(userMsg?.content).toBe("Hagamos un debate sobre AWS vs GCP");

    const agentMsgs = messages.filter(m => m.role === "agent");
    expect(agentMsgs.length).toBeGreaterThan(0);
    
    // Validate consensus agreement text was processed
    const negState = channelStore.getNegotiationState(username, channelId);
    expect(negState).toBeDefined();
  });
});
