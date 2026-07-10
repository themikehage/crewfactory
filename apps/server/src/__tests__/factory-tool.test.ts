import { mock, describe, it, expect, beforeEach } from "bun:test";
import { createFactoryTool, validateParams } from "../core/tools/factory-tool";
import { agentRegistry } from "../agents";
import { sessionManager } from "../core/session-manager";

const mockBroadcast = mock((username: string, data: any) => {});

// Mock the ws/handler module so we can verify notifications are broadcasted
mock.module("../ws/handler", () => ({
  broadcastToUser: mockBroadcast,
  broadcastToSession: mock(() => {}),
}));

describe("Factory Tool Validation & Broadcast Tests", () => {
  beforeEach(() => {
    mockBroadcast.mockClear();
  });

  describe("validateParams helper", () => {
    it("should pass validation with valid parameters for agent upsert", () => {
      const error = validateParams(
        "agents",
        "upsert",
        "my-agent",
        { name: "My Agent", role: "developer" }
      );
      expect(error).toBeNull();
    });

    it("should fail validation if required fields are missing on agent upsert", () => {
      const error = validateParams(
        "agents",
        "upsert",
        undefined,
        { role: "developer" } // missing id/name
      );
      expect(error).toContain("required");
    });

    it("should fail validation if parameter type is incorrect", () => {
      const error = validateParams(
        "agents",
        "upsert",
        "my-agent",
        { name: "My Agent", role: "developer", skills: "not-an-array" }
      );
      expect(error).toContain("must be an array");
    });

    it("should pass validation for env delete with either key in params or key as id", () => {
      const error1 = validateParams("env", "delete", "MY_KEY", {});
      expect(error1).toBeNull();

      const error2 = validateParams("env", "delete", undefined, { key: "MY_KEY" });
      expect(error2).toBeNull();
    });

    it("should fail validation for env delete if key is missing completely", () => {
      const error = validateParams("env", "delete", undefined, {});
      expect(error).toContain("required");
    });
  });

  describe("execute integration and websocket updates", () => {
    it("should return a validation error directly if validation fails", async () => {
      const tool = createFactoryTool({
        username: "testuser",
        parentSessionId: "session-1",
      });

      const res = await tool.execute("call-1", {
        entity: "agents",
        action: "upsert",
        // missing id, name, role
      });

      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain("required");
      expect(mockBroadcast).not.toHaveBeenCalled();
    });

    it("should trigger broadcastToUser when a mutation is successful", async () => {
      // Mock agentRegistry register method to succeed
      const originalRegister = agentRegistry.register;
      agentRegistry.register = async () => ({} as any);

      try {
        const tool = createFactoryTool({
          username: "testuser",
          parentSessionId: "session-1",
        });

        const res = await tool.execute("call-2", {
          entity: "agents",
          action: "upsert",
          id: "test-agent",
          params: {
            name: "Test Agent",
            role: "tester",
          },
        });

        expect(res.isError).toBeUndefined();
        expect(mockBroadcast).toHaveBeenCalledTimes(1);
        expect(mockBroadcast).toHaveBeenLastCalledWith("testuser", {
          type: "entity-updated",
          entityType: "agent",
        });
      } finally {
        agentRegistry.register = originalRegister;
      }
    });

    it("should not trigger broadcastToUser when action is 'get'", async () => {
      const originalList = agentRegistry.list;
      agentRegistry.list = () => [];

      try {
        const tool = createFactoryTool({
          username: "testuser",
          parentSessionId: "session-1",
        });

        await tool.execute("call-3", {
          entity: "agents",
          action: "get",
        });

        expect(mockBroadcast).not.toHaveBeenCalled();
      } finally {
        agentRegistry.list = originalList;
      }
    });
  });
});
