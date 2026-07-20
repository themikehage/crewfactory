import { expect, test, describe, beforeAll, mock } from "bun:test";
import { createDelegateTaskTool } from "../core/tools/delegate-tool";
import { agentRegistry } from "../agents";
import { sessionManager } from "../core/session-manager";

describe("delegate_task Tool Team Integration Tests", () => {
  const username = "test_team_delegator";
  const parentSessionId = "team_owner_session";
  const specialistId = "specialist-agent";
  const unauthorizedId = "unauthorized-agent";
  const teamWorkspace = "/tmp/team-shared-workspace";

  beforeAll(() => {
    // Override agentRegistry.get to mock specialist and unauthorized agents
    agentRegistry.get = (id: string, user?: string) => {
      if (id === specialistId) {
        return {
          username,
          status: "idle",
          server: {
            definition: { id: specialistId, name: "Specialist", role: "Developer" },
            session: {
              id: `del_specialist`,
              cwd: teamWorkspace,
              setModel: async () => {},
              prompt: async () => {},
              messages: [{ role: "assistant", content: [{ type: "text", text: "---\nstatus: success\nexecutive_summary: Done\nartifacts: none\nrisks: None\n---" }] }],
              subscribe: () => () => {},
            }
          }
        } as any;
      }
      if (id === unauthorizedId) {
        return {
          username,
          status: "idle",
          server: {
            definition: { id: unauthorizedId, name: "Unauthorized", role: "Auditor" }
          }
        } as any;
      }
      return undefined;
    };
  });

  test("Should allow delegation to permitted agent and pass inherited workspace", async () => {
    // Spy on sessionManager.getOrCreateSession & getSession
    const originalGetOrCreate = sessionManager.getOrCreateSession;
    const originalGetSession = sessionManager.getSession;
    let passedOverrides: any = null;

    sessionManager.getOrCreateSession = async (
      user: string,
      sId: string,
      projectName?: string,
      agentId?: string,
      channelId?: string,
      overrides?: any
    ) => {
      passedOverrides = overrides;
      // return a mock session
      return {
        id: sId,
        messages: [{ role: "assistant", content: [{ type: "text", text: "---\nstatus: success\nexecutive_summary: Done\nartifacts: none\nrisks: None\n---" }] }],
        setModel: async () => {},
        prompt: async () => {},
        abort: async () => {},
        subscribe: () => () => {},
      } as any;
    };

    sessionManager.getSession = (user: string, sId: string) => {
      if (sId === parentSessionId) {
        return {
          id: parentSessionId,
          isStreaming: false,
          addDelegationResult: () => {},
          continue: async () => {},
        } as any;
      }
      return null;
    };

    const tool = createDelegateTaskTool({
      workspaceDir: "/tmp/dummy",
      username,
      parentSessionId,
      modelRegistry: {} as any,
      authStorage: {} as any,
      resourceLoader: {} as any,
      inheritedWorkspaceDir: teamWorkspace,
      permittedAgentIds: new Set([specialistId]),
    });

    const result = await tool.execute("call_1", {
      targetType: "agent",
      targetId: specialistId,
      task: "Analyze tests",
    });

    expect(result.details.status).toBe("delegated");
    expect(passedOverrides).toBeDefined();
    expect(passedOverrides.workspaceDir).toBe(teamWorkspace);

    // Restore
    sessionManager.getOrCreateSession = originalGetOrCreate;
    sessionManager.getSession = originalGetSession;
  });

  test("Should reject delegation to agent not in permittedAgentIds list", async () => {
    const tool = createDelegateTaskTool({
      workspaceDir: "/tmp/dummy",
      username,
      parentSessionId,
      modelRegistry: {} as any,
      authStorage: {} as any,
      resourceLoader: {} as any,
      inheritedWorkspaceDir: teamWorkspace,
      permittedAgentIds: new Set([specialistId]),
    });

    expect(
      tool.execute("call_2", {
        targetType: "agent",
        targetId: unauthorizedId,
        task: "Analyze logs",
      })
    ).rejects.toThrow(`Agent "${unauthorizedId}" is not a permitted delegate in this Team context`);
  });

  test("Should inherit parent model if parentModel option is provided", async () => {
    const originalGetOrCreate = sessionManager.getOrCreateSession;
    const originalGetSession = sessionManager.getSession;
    let setModelCalledWith: any = null;

    const mockModel = { id: "parent-custom-model", provider: "openai" };

    sessionManager.getOrCreateSession = async () => {
      return {
        id: "del_specialist",
        messages: [{ role: "assistant", content: [{ type: "text", text: "---\nstatus: success\nexecutive_summary: Done\nartifacts: none\nrisks: None\n---" }] }],
        setModel: async (m: any) => {
          setModelCalledWith = m;
        },
        prompt: async () => {},
        abort: async () => {},
        subscribe: () => () => {},
      } as any;
    };

    sessionManager.getSession = (user: string, sId: string) => {
      if (sId === parentSessionId) {
        return {
          id: parentSessionId,
          isStreaming: false,
          addDelegationResult: () => {},
          continue: async () => {},
        } as any;
      }
      return null;
    };

    const tool = createDelegateTaskTool({
      workspaceDir: "/tmp/dummy",
      username,
      parentSessionId,
      modelRegistry: {} as any,
      authStorage: {} as any,
      resourceLoader: {} as any,
      inheritedWorkspaceDir: teamWorkspace,
      permittedAgentIds: new Set([specialistId]),
      parentModel: mockModel,
    });

    await tool.execute("call_3", {
      targetType: "agent",
      targetId: specialistId,
      task: "Analyze tests",
    });

    expect(setModelCalledWith).toBe(mockModel);

    // Restore
    sessionManager.getOrCreateSession = originalGetOrCreate;
    sessionManager.getSession = originalGetSession;
  });

  test("Should inherit model from parent session retrieved via sessionManager if parentModel option is not provided", async () => {
    const originalGetOrCreate = sessionManager.getOrCreateSession;
    const originalGetSession = sessionManager.getSession;
    let setModelCalledWith: any = null;

    const mockModel = { id: "parent-session-model", provider: "openai" };

    sessionManager.getOrCreateSession = async () => {
      return {
        id: "del_specialist",
        messages: [{ role: "assistant", content: [{ type: "text", text: "---\nstatus: success\nexecutive_summary: Done\nartifacts: none\nrisks: None\n---" }] }],
        setModel: async (m: any) => {
          setModelCalledWith = m;
        },
        prompt: async () => {},
        abort: async () => {},
        subscribe: () => () => {},
      } as any;
    };

    sessionManager.getSession = (user: string, sId: string) => {
      if (sId === parentSessionId) {
        return {
          id: parentSessionId,
          model: mockModel,
          isStreaming: false,
          addDelegationResult: () => {},
          continue: async () => {},
        } as any;
      }
      return null;
    };

    const tool = createDelegateTaskTool({
      workspaceDir: "/tmp/dummy",
      username,
      parentSessionId,
      modelRegistry: {} as any,
      authStorage: {} as any,
      resourceLoader: {} as any,
      inheritedWorkspaceDir: teamWorkspace,
      permittedAgentIds: new Set([specialistId]),
    });

    await tool.execute("call_4", {
      targetType: "agent",
      targetId: specialistId,
      task: "Analyze tests under parent session",
    });

    expect(setModelCalledWith).toBe(mockModel);

    // Restore
    sessionManager.getOrCreateSession = originalGetOrCreate;
    sessionManager.getSession = originalGetSession;
  });
});
