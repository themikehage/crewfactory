import { describe, it, expect } from "bun:test";
import {
  buildCreateSessionBody,
  getSessionContextPredicate,
  getSessionPath,
  getSessionName,
  getSessionMeta,
} from "./session-utils";

describe("session-utils", () => {
  describe("buildCreateSessionBody", () => {
    it("handles global context", () => {
      const body = buildCreateSessionBody("My Session", {});
      expect(body).toEqual({
        name: "My Session",
        projectName: undefined,
        agentId: undefined,
        channelId: undefined,
      });
    });

    it("handles project context", () => {
      const body = buildCreateSessionBody("My Session", {
        activeProjectName: "my-project",
      });
      expect(body).toEqual({
        name: "My Session",
        projectName: "my-project",
        agentId: undefined,
        channelId: undefined,
      });
    });

    it("handles agent context", () => {
      const body = buildCreateSessionBody("My Session", {
        activeAgent: { id: "my-agent", name: "Agent" },
        activeProjectName: "my-project",
      });
      expect(body).toEqual({
        name: "My Session",
        projectName: undefined,
        agentId: "my-agent",
        channelId: undefined,
      });
    });

    it("handles channel context", () => {
      const body = buildCreateSessionBody("My Session", {
        activeChannel: { id: "my-channel", name: "Channel" },
        activeAgent: { id: "my-agent", name: "Agent" },
        activeProjectName: "my-project",
      });
      expect(body).toEqual({
        name: "My Session",
        projectName: undefined,
        agentId: undefined,
        channelId: "my-channel",
      });
    });
  });

  describe("getSessionContextPredicate", () => {
    it("filters for global context", () => {
      const predicate = getSessionContextPredicate({});
      expect(predicate({ projectName: undefined, agentId: undefined, channelId: undefined })).toBe(true);
      expect(predicate({ projectName: "proj", agentId: undefined, channelId: undefined })).toBe(false);
    });

    it("filters for project context", () => {
      const predicate = getSessionContextPredicate({ activeProjectName: "proj" });
      expect(predicate({ projectName: "proj", agentId: undefined, channelId: undefined })).toBe(true);
      expect(predicate({ projectName: "other", agentId: undefined, channelId: undefined })).toBe(false);
      expect(predicate({ projectName: "proj", agentId: "agent", channelId: undefined })).toBe(false);
    });

    it("filters for agent context", () => {
      const predicate = getSessionContextPredicate({
        activeAgent: { id: "agent", name: "Agent" },
      });
      expect(predicate({ projectName: "proj", agentId: "agent", channelId: undefined })).toBe(true);
      expect(predicate({ projectName: "proj", agentId: "other", channelId: undefined })).toBe(false);
      expect(predicate({ projectName: "proj", agentId: "agent", channelId: "channel" })).toBe(false);
    });

    it("filters for channel context", () => {
      const predicate = getSessionContextPredicate({
        activeChannel: { id: "channel", name: "Channel" },
      });
      expect(predicate({ projectName: "proj", agentId: "agent", channelId: "channel" })).toBe(true);
      expect(predicate({ projectName: "proj", agentId: "agent", channelId: "other" })).toBe(false);
    });
  });

  describe("getSessionPath", () => {
    it("returns correct paths", () => {
      expect(getSessionPath("123", {})).toBe("/session/123");
      expect(getSessionPath("123", { activeProjectName: "p" })).toBe("/projects/p/session/123");
      expect(getSessionPath("123", { activeAgent: { id: "a", name: "" } })).toBe("/agents/a/session/123");
      expect(getSessionPath("123", { activeChannel: { id: "c", name: "" } })).toBe("/channels/c/session/123");
    });
  });

  describe("getSessionName", () => {
    it("returns correct names without count", () => {
      expect(getSessionName({})).toBe("Global Session");
      expect(getSessionName({ activeProjectName: "proj" })).toBe("proj - Session");
      expect(getSessionName({ activeProjectFriendlyName: "Project Friendly", activeProjectName: "proj" })).toBe("Project Friendly - Session");
      expect(getSessionName({ activeAgent: { id: "a", name: "Agent" } })).toBe("Agent - Session");
      expect(getSessionName({ activeChannel: { id: "c", name: "Channel" } })).toBe("#Channel - Session");
    });

    it("returns correct names with count", () => {
      expect(getSessionName({}, 2)).toBe("Global Session 3");
      expect(getSessionName({ activeProjectName: "proj" }, 0)).toBe("proj - Session 1");
      expect(getSessionName({ activeProjectFriendlyName: "Project Friendly", activeProjectName: "proj" }, 1)).toBe("Project Friendly - Session 2");
      expect(getSessionName({ activeAgent: { id: "a", name: "Agent" } }, 4)).toBe("Agent - Session 5");
      expect(getSessionName({ activeChannel: { id: "c", name: "Channel" } }, 9)).toBe("#Channel - Session 10");
    });
  });

  describe("getSessionMeta", () => {
    it("handles null", () => {
      expect(getSessionMeta(null)).toEqual({
        isReadOnly: false,
        isExecution: false,
        isSubagent: false,
        isDelegation: false,
        isLab: false,
        isChannelExecution: false,
        isTeamExecution: false,
      });
    });

    it("handles exec sessions", () => {
      const meta = getSessionMeta("exec_123");
      expect(meta.isReadOnly).toBe(true);
      expect(meta.isExecution).toBe(true);
      expect(meta.isChannelExecution).toBe(false);
      expect(meta.isTeamExecution).toBe(false);
    });

    it("handles channel exec sessions", () => {
      const meta = getSessionMeta("exec_123_channel_456");
      expect(meta.isReadOnly).toBe(true);
      expect(meta.isExecution).toBe(true);
      expect(meta.isChannelExecution).toBe(true);
      expect(meta.isTeamExecution).toBe(false);
    });

    it("handles team exec sessions", () => {
      const meta = getSessionMeta("exec_123_team_456");
      expect(meta.isReadOnly).toBe(true);
      expect(meta.isExecution).toBe(true);
      expect(meta.isChannelExecution).toBe(false);
      expect(meta.isTeamExecution).toBe(true);
    });

    it("handles subagent sessions", () => {
      const meta = getSessionMeta("sub_123");
      expect(meta.isSubagent).toBe(true);
      expect(meta.isReadOnly).toBe(false);
    });

    it("handles delegation sessions", () => {
      const meta = getSessionMeta("del_123");
      expect(meta.isDelegation).toBe(true);
      expect(meta.isReadOnly).toBe(false);
    });

    it("handles lab sessions", () => {
      const meta = getSessionMeta("lab_123");
      expect(meta.isLab).toBe(true);
      expect(meta.isReadOnly).toBe(false);
    });
  });
});
