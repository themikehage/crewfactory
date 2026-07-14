import { describe, expect, it, afterEach } from "bun:test";
import { LocalMemoryProvider } from "../core/memory/local-provider";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

const TEST_DB = join(import.meta.dir, "test-memories.db");

describe("LocalMemoryProvider with Session Scoping", () => {
  afterEach(() => {
    if (existsSync(TEST_DB)) {
      try {
        unlinkSync(TEST_DB);
      } catch {}
    }
  });

  it("should initialize database and apply session_id column migration", async () => {
    const provider = new LocalMemoryProvider(TEST_DB);
    expect(existsSync(TEST_DB)).toBe(true);
    await provider.shutdown();
  });

  it("should store and recall global memories (sessionId IS NULL)", async () => {
    const provider = new LocalMemoryProvider(TEST_DB);
    await provider.store("Global memory item 1", "semantic", 0.8, ["tag1"]);
    await provider.store("Global memory item 2", "semantic", 0.5, ["tag2"]);

    const all = await provider.recall("Global");
    expect(all.length).toBe(2);
    expect(all[0].content).toContain("Global memory item");
    await provider.shutdown();
  });

  it("should store and filter memories by sessionId", async () => {
    const provider = new LocalMemoryProvider(TEST_DB);
    await provider.store("Session A memory", "semantic", 0.8, ["tag"], "session-A");
    await provider.store("Session B memory", "semantic", 0.8, ["tag"], "session-B");
    await provider.store("Global memory", "semantic", 0.8, ["tag"]);

    // Querying with sessionId: "session-A" should return Session A and Global memories, but not Session B
    const sessionA = await provider.recall("memory", { sessionId: "session-A" });
    expect(sessionA.length).toBe(2);
    const contentsA = sessionA.map(m => m.content);
    expect(contentsA).toContain("Session A memory");
    expect(contentsA).toContain("Global memory");
    expect(contentsA).not.toContain("Session B memory");

    // Querying with sessionId: "session-B" should return Session B and Global memories, but not Session A
    const sessionB = await provider.recall("memory", { sessionId: "session-B" });
    expect(sessionB.length).toBe(2);
    const contentsB = sessionB.map(m => m.content);
    expect(contentsB).toContain("Session B memory");
    expect(contentsB).toContain("Global memory");
    expect(contentsB).not.toContain("Session A memory");

    await provider.shutdown();
  });

  it("should clear memories using clear method", async () => {
    const provider = new LocalMemoryProvider(TEST_DB);
    await provider.store("Memory item", "semantic", 0.8);
    let all = await provider.recall("Memory");
    expect(all.length).toBe(1);

    await provider.clear();
    all = await provider.recall("Memory");
    expect(all.length).toBe(0);

    await provider.shutdown();
  });
});
