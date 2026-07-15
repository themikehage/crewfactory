import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { buildSubagentRules, evaluateSubagentRules, DEFAULT_SUBAGENT_PERMISSIONS } from "../core/sandbox/subagent-permissions";
import { userPermissionStore } from "../core/sandbox/user-permission-store";
import { permissionEngine } from "../core/sandbox/permission-engine";
import { sessionManager } from "../core/session-manager";
import { sessionMetadataStore } from "../core/session/metadata-store";
import { getUserDir } from "shared";

describe("Subagent Permission Inheritance", () => {
  const testUser = "test_user_perm";
  const parentSessionId = "exec_parent_session";
  const subagentSessionId = "sub_child_session";

  beforeAll(() => {
    // Ensure test user directory exists
    const userDir = getUserDir(testUser);
    if (!existsSync(userDir)) {
      mkdirSync(userDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up test decisions
    const decisionsPath = join(getUserDir(testUser), "permission-decisions.json");
    if (existsSync(decisionsPath)) {
      rmSync(decisionsPath, { force: true });
    }
  });

  it("should have correct base defaults", () => {
    const rules = buildSubagentRules(testUser, subagentSessionId);
    
    // Default read tools should be allow
    const readVerdict = evaluateSubagentRules("read", { path: "safe.txt" }, rules);
    expect(readVerdict).toBeDefined();
    expect(readVerdict!.allow).toBe(true);

    // Default write tools should be ask
    const writeVerdict = evaluateSubagentRules("write", { path: "safe.txt" }, rules);
    expect(writeVerdict).toBeDefined();
    expect(writeVerdict!.allow).toBe("ask");

    // Spawn subagent should be denied inside subagent to prevent nesting loops
    const spawnVerdict = evaluateSubagentRules("spawn_subagent", {}, rules);
    expect(spawnVerdict).toBeDefined();
    expect(spawnVerdict!.allow).toBe(false);
  });

  it("should inherit restrictions from parent active tools (Read-Only inheritance)", () => {
    // Mock parent session metadata with only read/grep tools active
    sessionMetadataStore.persistSessionTools(testUser, parentSessionId, ["read", "grep"]);

    const rules = buildSubagentRules(testUser, subagentSessionId, parentSessionId);

    // write tool not in parent active list -> should be denied
    const writeVerdict = evaluateSubagentRules("write", { path: "safe.txt" }, rules);
    expect(writeVerdict).toBeDefined();
    expect(writeVerdict!.allow).toBe(false);
    expect(writeVerdict!.reason).toContain("Denied by rule");

    // read tool is active in parent -> should still be allow
    const readVerdict = evaluateSubagentRules("read", { path: "safe.txt" }, rules);
    expect(readVerdict).toBeDefined();
    expect(readVerdict!.allow).toBe(true);
  });

  it("should deny modification tools for explorer subagents", () => {
    const rules = buildSubagentRules(testUser, subagentSessionId, undefined, "explorer");

    // explorer should have write/edit/bash denied by default
    const writeVerdict = evaluateSubagentRules("write", { path: "safe.txt" }, rules);
    expect(writeVerdict).toBeDefined();
    expect(writeVerdict!.allow).toBe(false);

    const bashVerdict = evaluateSubagentRules("bash", { command: "ls" }, rules);
    expect(bashVerdict).toBeDefined();
    expect(bashVerdict!.allow).toBe(false);

    // read should still be allowed
    const readVerdict = evaluateSubagentRules("read", { path: "safe.txt" }, rules);
    expect(readVerdict).toBeDefined();
    expect(readVerdict!.allow).toBe(true);
  });

  it("should respect user decisions (last-match-wins) and persist to disk", () => {
    // Initially, bash command ls is 'ask'
    let rules = buildSubagentRules(testUser, subagentSessionId);
    let bashVerdict = evaluateSubagentRules("bash", { command: "git status" }, rules);
    expect(bashVerdict).toBeDefined();
    expect(bashVerdict!.allow).toBe("ask");

    // Save decision to allow git commands
    userPermissionStore.saveDecision(testUser, "bash", "git *", "allow");

    // Check rules again
    rules = buildSubagentRules(testUser, subagentSessionId);
    
    // git command should be allowed
    const gitVerdict = evaluateSubagentRules("bash", { command: "git status" }, rules);
    expect(gitVerdict).toBeDefined();
    expect(gitVerdict!.allow).toBe(true);

    // non-git command should still be ask
    const otherVerdict = evaluateSubagentRules("bash", { command: "npm install" }, rules);
    expect(otherVerdict).toBeDefined();
    expect(otherVerdict!.allow).toBe("ask");
  });

  it("should not bypass critical static safety denies (fork bomb)", () => {
    // Even if user allowed bash *, fork bomb should be caught by PermissionEngine static rules
    userPermissionStore.saveDecision(testUser, "bash", "*", "allow");

    const verdict = permissionEngine.evaluate("bash", { command: ":(){ :|:& };:" }, {
      isSubagent: true,
      username: testUser,
      sessionId: subagentSessionId,
    });

    expect(verdict.allow).toBe(false);
    expect((verdict as any).reason).toContain("Fork bomb");
  });
});
