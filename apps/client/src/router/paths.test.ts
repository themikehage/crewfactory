import { describe, expect, it } from "bun:test";
import { buildContextPath, buildDelegationsPath, buildSessionPath, buildWorkspacePath } from "./paths";

describe("router paths", () => {
  it("builds contextual routes", () => {
    expect(buildContextPath({ type: "project", id: "crew" })).toBe("/projects/crew/chat");
    expect(buildContextPath({ type: "team", id: "team" }, "org")).toBe("/teams/team/org");
    expect(buildWorkspacePath({ type: "agent", id: "writer" })).toBe("/agents/writer/workspace");
  });

  it("preserves session identifiers with slashes", () => {
    const context = { type: "team" as const, id: "research" };
    expect(buildSessionPath(context, "parent/child")).toBe("/teams/research/session/parent/child");
    expect(buildDelegationsPath(context, "parent/child")).toBe("/teams/research/session/parent/child/delegations");
  });

  it("builds global session and delegation routes", () => {
    expect(buildSessionPath(null, "parent/child")).toBe("/session/parent/child");
    expect(buildDelegationsPath(null, "parent/child")).toBe("/session/parent/child/delegations");
    expect(buildDelegationsPath(null, null)).toBe("/delegations");
  });
});
