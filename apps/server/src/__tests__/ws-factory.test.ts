import { describe, it, expect, beforeEach } from "bun:test";
import { createWsContext } from "../ws/factory";
import { wsRegistry } from "../ws/registry";

describe("ws/factory", () => {
  beforeEach(() => {
    // Clean registry between tests
    for (const [id] of wsRegistry.allMeta()) {
      wsRegistry.deleteMeta(id);
    }
    wsRegistry.userSockets.clear();
    wsRegistry.sessionSockets.clear();
    wsRegistry.channelSockets.clear();
  });

  it("should create context with unique id", () => {
    const ctx1 = createWsContext();
    const ctx2 = createWsContext();
    expect(ctx1.id).not.toBe(ctx2.id);
    expect(ctx1.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("should retain id via closure across open/close lifecycle", async () => {
    const ctx = createWsContext();
    const capturedId = ctx.id;

    const mockWs = {
      send: () => {},
      close: () => {},
    } as any;

    const headers = new Headers();
    await ctx.onOpen(new Event("open"), mockWs, headers);

    const meta = wsRegistry.getMeta(capturedId);
    expect(meta).toBeDefined();
    expect(meta?.wsId).toBe(capturedId);
    expect(meta?.ws).toBe(mockWs);

    ctx.onClose({ code: 1000, reason: "test" }, mockWs);

    const afterClose = wsRegistry.getMeta(capturedId);
    expect(afterClose).toBeUndefined();
  });

  it("should not mutate ws object with wsId property", async () => {
    const ctx = createWsContext();
    const mockWs: any = {
      send: () => {},
      close: () => {},
    };

    const headers = new Headers();
    await ctx.onOpen(new Event("open"), mockWs, headers);

    expect(mockWs.wsId).toBeUndefined();
    expect(mockWs.raw?.wsId).toBeUndefined();

    ctx.onClose({ code: 1000 }, mockWs);
  });

  it("should handle pong and reset missedPings", async () => {
    const ctx = createWsContext();
    const mockWs: any = {
      send: () => {},
      close: () => {},
    };

    await ctx.onOpen(new Event("open"), mockWs, new Headers());
    const meta = wsRegistry.getMeta(ctx.id);
    if (meta) meta.missedPings = 2;

    const pongEvent = {
      data: JSON.stringify({ type: "pong" }),
    } as MessageEvent;

    await ctx.onMessage(pongEvent as any, mockWs);

    const afterPong = wsRegistry.getMeta(ctx.id);
    expect(afterPong?.missedPings).toBe(0);

    ctx.onClose({}, mockWs);
  });

  it("should create separate contexts without shared state", () => {
    const ctx1 = createWsContext();
    const ctx2 = createWsContext();

    expect(ctx1.getId()).toBe(ctx1.id);
    expect(ctx2.getId()).toBe(ctx2.id);
    expect(ctx1.getId()).not.toBe(ctx2.getId());
  });
});
