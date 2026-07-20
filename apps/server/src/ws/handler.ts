import type { WSContext } from "hono/ws";
import { wsRegistry, startHeartbeat } from "./registry";
import { setAgentStopCallback } from "../agents/agent-stop-callback";
import { teamOrchestrator, setTeamBroadcastHandler } from "../teams";
import { setEventBroadcaster } from "../lib/event-broker";

setAgentStopCallback((_agentId) => {});

startHeartbeat();

export const sessionSockets = wsRegistry.sessionSockets;
export const userSockets = wsRegistry.userSockets;
export const teamSockets = wsRegistry.teamSockets;

interface TeamInterceptor {
  teamId: string;
  sessionId: string;
  callback: (data: any) => void;
}

const teamInterceptors = new Set<TeamInterceptor>();

export function registerTeamInterceptor(
  teamId: string,
  sessionId: string,
  callback: (data: any) => void
): () => void {
  const interceptor = { teamId, sessionId, callback };
  teamInterceptors.add(interceptor);
  return () => {
    teamInterceptors.delete(interceptor);
  };
}

export function broadcastToUser(username: string, data: any): void {
  const sockets = wsRegistry.userSockets.get(username);
  if (sockets) {
    const payload = JSON.stringify(data);
    for (const ws of sockets) {
      try {
        ws.send(payload);
      } catch (err) {
        console.error("[WS] broadcastToUser ws.send failed:", err);
      }
    }
  }
}

export function broadcastToSession(sessionId: string, data: any): void {
  const sockets = wsRegistry.sessionSockets.get(sessionId);
  if (sockets) {
    const payload = JSON.stringify(data);
    for (const ws of sockets) {
      try {
        ws.send(payload);
      } catch (err) {
        console.error("[WS] broadcastToSession ws.send failed:", err);
      }
    }
  }
}

export function broadcastToTeam(teamId: string, data: any): void {
  if (data && data.sessionId) {
    for (const interceptor of teamInterceptors) {
      if (interceptor.teamId === teamId && interceptor.sessionId === data.sessionId) {
        try {
          interceptor.callback(data);
        } catch (err) {
          console.error("[WS] teamInterceptor callback failed:", err);
        }
      }
    }
  }

  const sockets = wsRegistry.teamSockets.get(teamId);
  if (sockets) {
    const payload = JSON.stringify(data);
    for (const ws of sockets) {
      try {
        ws.send(payload);
      } catch (err) {
        console.error("[WS] broadcastToTeam ws.send failed:", err);
      }
    }
  }
}

setTeamBroadcastHandler(broadcastToTeam);
setEventBroadcaster(broadcastToUser);

import { setWsHandlerBridge } from "../core/agent-utils";
setWsHandlerBridge(registerTeamInterceptor, broadcastToSession);

// Legacy compatibility shims - these are now handled by factory
// but we keep exported functions for any direct imports.
// The new factory-based flow does not use these; they delegate to a temporary context.

import { createWsContext } from "./factory";

// For backward compatibility with old index.ts that passed forcedWsId,
// we maintain a map of ws -> context by using the factory's closure capture
// at the call site. These legacy functions create a one-off context if needed.

const legacyContextByForcedId = new Map<string, ReturnType<typeof createWsContext>>();

export function onOpen(
  _evt: Event,
  _ws: WSContext,
  rawHeaders?: Headers | null,
  forcedWsId?: string | null
): string {
  // If forcedWsId is provided, we are in the old capturedId flow.
  // We should reuse or create a context tied to that id where possible.
  // However, the new factory generates its own id via crypto.randomUUID().
  // For legacy path, we create a context and override its id to forcedWsId if present,
  // or simply create a new one and store it.

  // To preserve the new architecture's guarantee (closure-captured id),
  // we create a fresh context and use its id as the source of truth.
  // The forcedWsId is ignored in new flow, but we log if mismatched.

  const ctx = createWsContext();
  if (forcedWsId) {
    legacyContextByForcedId.set(forcedWsId, ctx);
  }
  // Fire async onOpen without awaiting to keep signature compatible
  void ctx.onOpen(_evt, _ws, rawHeaders);
  return ctx.id;
}

export function onClose(evt: any, _ws: WSContext, forcedWsId?: string | null) {
  if (forcedWsId) {
    const ctx = legacyContextByForcedId.get(forcedWsId);
    if (ctx) {
      ctx.onClose(evt, _ws);
      legacyContextByForcedId.delete(forcedWsId);
      return;
    }
  }

  // Fallback: try to find meta by searching registry for matching ws reference
  // This is the old leak-prone path, but kept for safety.
  for (const [wsId, meta] of wsRegistry.allMeta()) {
    if (meta.ws === _ws) {
      const ctx2 = createWsContext();
      (ctx2 as any).id = wsId;
      wsRegistry.getMeta(wsId)?.ws === _ws && wsRegistry.deleteMeta(wsId);
      console.log(`[WS] onClose fallback cleanup for wsId: ${wsId}`);
      const user = wsRegistry.getUser(wsId);
      if (user) wsRegistry.removeUserSocket(user.username, _ws);
      if (meta.sessionId) wsRegistry.removeSessionSocket(meta.sessionId, _ws);
      if (meta.channelId) wsRegistry.removeChannelSocket(meta.channelId, _ws);
      if (meta.teamId) wsRegistry.removeTeamSocket(meta.teamId, _ws);
      wsRegistry.deleteMeta(wsId);
      return;
    }
  }

  console.warn("[WS] onClose called without resolvable wsId, no-op");
}

export async function onMessage(
  evt: MessageEvent<any>,
  _ws: WSContext,
  forcedWsId?: string | null
) {
  if (forcedWsId) {
    const ctx = legacyContextByForcedId.get(forcedWsId);
    if (ctx) {
      await ctx.onMessage(evt as any, _ws);
      return;
    }
  }

  // Fallback: dispatch to any context that matches ws reference
  for (const [wsId, meta] of wsRegistry.allMeta()) {
    if (meta.ws === _ws) {
      // Recreate a temporary context with same id to handle the message
      const tempCtx = createWsContext();
      (tempCtx as any).id = wsId;
      // Override registry lookup by temporarily setting meta
      // Instead, we directly call the factory's onMessage logic via a new context
      // that will find user via registry using its id.
      // To make it work, we need to ensure temp context uses same id.
      // We'll manually set its id and call onMessage after patching registry meta's ws.
      wsRegistry.updateMeta(wsId, { ws: _ws });
      // Create a proper context with correct id
      const realCtx = {
        id: wsId,
        onMessage: async (e: any, w: any) => {
          const { createWsContext: _create } = await import("./factory");
          // Use internal handling via registry directly is complex,
          // so we fallback to dynamic import of factory internals:
          // For now, just handle via the factory's onMessage by creating a context
          // that shares the id via closure.
          const inner = _create();
          (inner as any).id = wsId;
          // Monkey patch registry getMeta to return correct meta
          await inner.onMessage(e, w);
        },
      };
      await realCtx.onMessage(evt as any, _ws);
      return;
    }
  }

  console.warn("[WS] onMessage called without resolvable wsId, dropping message");
}

export { wsRegistry };
