import { expect, test, describe, beforeEach } from "bun:test";
import { delegationRegistry } from "../core/delegation-registry";
import { AbortToken } from "../core/abort-token";

describe("AbortToken System", () => {
  test("runs registered callbacks in LIFO order", () => {
    const parentController = new AbortController();
    const token = new AbortToken(parentController.signal, "test-root");

    const order: number[] = [];
    token.register(() => { order.push(1); }, "first");
    token.register(() => { order.push(2); }, "second");
    token.register(() => { order.push(3); }, "third");

    token.abortAll();

    expect(order).toEqual([3, 2, 1]);
    expect(token.aborted).toBe(true);
  });

  test("runs callback immediately if already aborted", () => {
    const token = new AbortToken(undefined, "test-root");
    token.abortAll();

    let run = false;
    token.register(() => { run = true; }, "immediate");

    expect(run).toBe(true);
  });

  test("abortAll is idempotent", () => {
    const token = new AbortToken(undefined, "test-root");
    let count = 0;
    token.register(() => { count++; }, "count");

    token.abortAll();
    token.abortAll();

    expect(count).toBe(1);
  });

  test("triggers on parent AbortSignal", () => {
    const parentController = new AbortController();
    const token = new AbortToken(parentController.signal, "test-root");

    let run = false;
    token.register(() => { run = true; }, "child");

    parentController.abort();

    expect(run).toBe(true);
    expect(token.aborted).toBe(true);
  });
});

describe("DelegationRegistry BFS Recursive Cancellation", () => {
  beforeEach(() => {
    // Limpiar activePromises antes de cada test
    const registryAny = delegationRegistry as any;
    registryAny.activePromises.clear();
  });

  test("cancels active delegations recursively (3 levels of depth)", () => {
    let aborted1 = false;
    let aborted2 = false;
    let aborted3 = false;

    // Nivel 1: A -> sub_1
    delegationRegistry.register(
      "test-user",
      "session-A",
      {
        toolCallId: "tc_1",
        parentSessionId: "session-A",
        targetType: "spawn",
        targetLabel: "Subagent 1",
        task: "Task 1",
        status: "running",
        startedAt: new Date().toISOString(),
        subagentSessionId: "session-sub1",
      },
      () => { aborted1 = true; }
    );

    // Nivel 2: sub_1 -> sub_1_1
    delegationRegistry.register(
      "test-user",
      "session-sub1",
      {
        toolCallId: "tc_2",
        parentSessionId: "session-sub1",
        targetType: "spawn",
        targetLabel: "Subagent 2",
        task: "Task 2",
        status: "running",
        startedAt: new Date().toISOString(),
        subagentSessionId: "session-sub1-1",
      },
      () => { aborted2 = true; }
    );

    // Nivel 3: sub_1_1 -> sub_1_1_1
    delegationRegistry.register(
      "test-user",
      "session-sub1-1",
      {
        toolCallId: "tc_3",
        parentSessionId: "session-sub1-1",
        targetType: "spawn",
        targetLabel: "Subagent 3",
        task: "Task 3",
        status: "running",
        startedAt: new Date().toISOString(),
        subagentSessionId: "session-sub1-1-1",
      },
      () => { aborted3 = true; }
    );

    // Abortar recursivamente desde la raíz "session-A"
    delegationRegistry.abortAllRecursive("session-A");

    expect(aborted1).toBe(true);
    expect(aborted2).toBe(true);
    expect(aborted3).toBe(true);
  });

  test("does not cancel parallel/unrelated branches", () => {
    let abortedA = false;
    let abortedB = false;

    // Rama A
    delegationRegistry.register(
      "test-user",
      "session-A",
      {
        toolCallId: "tc_a",
        parentSessionId: "session-A",
        targetType: "spawn",
        targetLabel: "Subagent A",
        task: "Task A",
        status: "running",
        startedAt: new Date().toISOString(),
        subagentSessionId: "session-subA",
      },
      () => { abortedA = true; }
    );

    // Rama B
    delegationRegistry.register(
      "test-user",
      "session-B",
      {
        toolCallId: "tc_b",
        parentSessionId: "session-B",
        targetType: "spawn",
        targetLabel: "Subagent B",
        task: "Task B",
        status: "running",
        startedAt: new Date().toISOString(),
        subagentSessionId: "session-subB",
      },
      () => { abortedB = true; }
    );

    // Cancelar rama A
    delegationRegistry.abortAllRecursive("session-A");

    expect(abortedA).toBe(true);
    expect(abortedB).toBe(false);
  });

  test("is idempotent and doesn't throw", () => {
    delegationRegistry.register(
      "test-user",
      "session-A",
      {
        toolCallId: "tc_1",
        parentSessionId: "session-A",
        targetType: "spawn",
        targetLabel: "Subagent 1",
        task: "Task 1",
        status: "running",
        startedAt: new Date().toISOString(),
        subagentSessionId: "session-sub1",
      },
      () => {}
    );

    expect(() => {
      delegationRegistry.abortAllRecursive("session-A");
      delegationRegistry.abortAllRecursive("session-A");
    }).not.toThrow();
  });
});
