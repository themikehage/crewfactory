import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { sessionMetadataStore } from "../core/session/metadata-store";
import { getSubagentDepth } from "../core/session/session-depth";
import { getAppConfig } from "../config/app-config";

describe("Subagent Depth Limit System", () => {
  let originalGetSessionMetadata: any;
  const mockMetadata: Record<string, any> = {};

  beforeEach(() => {
    originalGetSessionMetadata = sessionMetadataStore.getSessionMetadata;
    sessionMetadataStore.getSessionMetadata = (username: string, sessionId: string) => {
      return mockMetadata[sessionId] || null;
    };
  });

  afterEach(() => {
    sessionMetadataStore.getSessionMetadata = originalGetSessionMetadata;
    for (const key of Object.keys(mockMetadata)) {
      delete mockMetadata[key];
    }
  });

  test("calculates depth correctly for session tree", () => {
    mockMetadata["root"] = {};
    expect(getSubagentDepth("user", "root")).toBe(0);

    mockMetadata["sub-1"] = { parentSessionId: "root" };
    expect(getSubagentDepth("user", "sub-1")).toBe(1);

    mockMetadata["sub-1-1"] = { parentSessionId: "sub-1" };
    expect(getSubagentDepth("user", "sub-1-1")).toBe(2);
  });

  test("resolves app-config defaults and overrides", () => {
    const config = getAppConfig();
    expect(config.subagent.maxDepth).toBe(1);

    process.env.CREWFACTORY_SUBAGENT_MAX_DEPTH = "3";
    const overridden = getAppConfig();
    expect(overridden.subagent.maxDepth).toBe(3);

    delete process.env.CREWFACTORY_SUBAGENT_MAX_DEPTH;
  });
});
