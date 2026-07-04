import jwt from "jsonwebtoken";
import { existsSync, readFileSync } from "node:fs";
import { piSessionManager } from "../pi/session-manager";
import type { AuthPayload } from "../middleware/auth";
import type { WSContext, WSMessageReceive } from "hono/ws";
import { setBuilding, setReady, setError, ensureWatcher } from "../pi/preview-watcher";
import { channelOrchestrator, setChannelBroadcastHandler } from "../channels";

function getRepoNameForSession(username: string, sessionId: string): string | undefined {
  const p = `/tmp/crewfactory/${username}/sessions/${sessionId}/metadata.json`;
  if (existsSync(p)) {
    try {
      return JSON.parse(readFileSync(p, "utf-8")).repoName;
    } catch {}
  }
}

interface PiWebSocket extends WSContext {
  wsId: string;
  user: AuthPayload;
}

interface WsSocketMeta {
  sessionId?: string;
  channelId?: string;
}

let wsCounter = 0;
const userMap = new Map<string, AuthPayload>();
const wsSubscriptions = new Map<string, () => void>();
const wsSocketMeta = new Map<string, WsSocketMeta>();
export const sessionSockets = new Map<string, Set<WSContext>>();
export const userSockets = new Map<string, Set<WSContext>>();
export const channelSockets = new Map<string, Set<WSContext>>();

export function broadcastToChannel(channelId: string, data: any) {
  const sockets = channelSockets.get(channelId);
  if (sockets) {
    const payload = JSON.stringify(data);
    for (const ws of sockets) {
      try {
        ws.send(payload);
      } catch {}
    }
  }
}

setChannelBroadcastHandler(broadcastToChannel);

export function broadcastToUser(username: string, data: any) {
  const sockets = userSockets.get(username);
  if (sockets) {
    const payload = JSON.stringify(data);
    for (const ws of sockets) {
      try {
        ws.send(payload);
      } catch {}
    }
  }
}

export function broadcastToSession(sessionId: string, data: any) {
  const sockets = sessionSockets.get(sessionId);
  if (sockets) {
    const payload = JSON.stringify(data);
    for (const ws of sockets) {
      try {
        ws.send(payload);
      } catch {}
    }
  }
}

function safeSend(ws: { send: (data: string) => void }, data: string) {
  try {
    ws.send(data);
  } catch {}
}

async function subscribeWsToSession(
  ws: PiWebSocket,
  user: AuthPayload,
  sessionId: string
): Promise<void> {
  if (sessionId.startsWith("exec_") || sessionId.startsWith("lab_")) {
    return;
  }

  const meta = wsSocketMeta.get(ws.wsId) ?? {};
  if (meta.sessionId && meta.sessionId !== sessionId) {
    const oldSet = sessionSockets.get(meta.sessionId);
    if (oldSet) {
      oldSet.delete(ws);
      if (oldSet.size === 0) sessionSockets.delete(meta.sessionId);
    }
  }

  let wsSet = sessionSockets.get(sessionId);
  if (!wsSet) {
    wsSet = new Set();
    sessionSockets.set(sessionId, wsSet);
  }
  wsSet.add(ws);
  wsSocketMeta.set(ws.wsId, { ...meta, sessionId });

  const existingUnsub = wsSubscriptions.get(ws.wsId);
  if (existingUnsub) existingUnsub();

  const session = await piSessionManager.getOrCreateSession(user.username, sessionId);

  const BUILD_REGEX = /\b(build|vite build|next build|nuxt build|astro build|bun run build|npm run build|pnpm run build|yarn build|tsc|webpack|parcel build|rollup -c)\b/;
  const sessionRepoName = getRepoNameForSession(user.username, sessionId);
  let hadBuildInSession = false;

  const unsub = session.subscribe((agentEvent) => {
    safeSend(ws, JSON.stringify(agentEvent));

    if (agentEvent.type === "tool_execution_start") {
      const ev = agentEvent as any;
      const cmd = ev.args?.command as string | undefined;
      if (ev.toolName === "bash" && cmd && BUILD_REGEX.test(cmd) && sessionRepoName) {
        hadBuildInSession = true;
        setBuilding(user.username, sessionRepoName);
      }
    }

    if (agentEvent.type === "tool_execution_end") {
      const ev = agentEvent as any;
      if (ev.toolName === "bash" && sessionRepoName) {
        const cmd = ev.args?.command as string | undefined;
        if (ev.isError) {
          const resultStr = typeof ev.result === "string" ? ev.result : JSON.stringify(ev.result).slice(0, 500);
          setError(user.username, sessionRepoName, resultStr || "Build failed");
          hadBuildInSession = false;
        } else if (cmd && BUILD_REGEX.test(cmd)) {
          hadBuildInSession = false;
          setReady(user.username, sessionRepoName);
        }
      }
    }

    if (agentEvent.type === "agent_end" && sessionRepoName && hadBuildInSession) {
      ensureWatcher(user.username, sessionRepoName);
      hadBuildInSession = false;
    }

    const sendContextUsage = () => {
      try {
        const contextUsage = session.getContextUsage();
        const sessionStats = session.getSessionStats();
        if (contextUsage || sessionStats) {
          safeSend(ws, JSON.stringify({
            type: "context_usage",
            sessionId,
            contextUsage,
            sessionStats,
          }));
        }
      } catch {}
    };

    if (agentEvent.type === "agent_start") {
      broadcastToUser(user.username, { type: "session_status", sessionId, status: "streaming" });
      sendContextUsage();
    }
    if (agentEvent.type === "agent_end") {
      broadcastToUser(user.username, { type: "session_status", sessionId, status: "active" });
      sendContextUsage();
    }
    if (agentEvent.type === "message_end") {
      sendContextUsage();
    }
  });

  wsSubscriptions.set(ws.wsId, unsub);
}

export function onOpen(_evt: Event, _ws: WSContext) {
  const ws = _ws as unknown as PiWebSocket;
  ws.wsId = String(++wsCounter);
  wsSocketMeta.set(ws.wsId, {});
}

export function onClose(_evt: any, _ws: WSContext) {
  const ws = _ws as unknown as PiWebSocket;
  const wsId = ws.wsId;

  const user = userMap.get(wsId);
  userMap.delete(wsId);

  if (user) {
    const uSockets = userSockets.get(user.username);
    if (uSockets) {
      uSockets.delete(ws);
      if (uSockets.size === 0) userSockets.delete(user.username);
    }
  }

  const meta = wsSocketMeta.get(wsId);
  wsSocketMeta.delete(wsId);

  if (meta?.sessionId) {
    const wsSet = sessionSockets.get(meta.sessionId);
    if (wsSet) {
      wsSet.delete(ws);
      if (wsSet.size === 0) sessionSockets.delete(meta.sessionId);
    }
  }

  if (meta?.channelId) {
    const wsSet = channelSockets.get(meta.channelId);
    if (wsSet) {
      wsSet.delete(ws);
      if (wsSet.size === 0) channelSockets.delete(meta.channelId);
    }
  }

  const unsub = wsSubscriptions.get(wsId);
  if (unsub) {
    unsub();
    wsSubscriptions.delete(wsId);
  }
}

export async function onMessage(evt: MessageEvent<WSMessageReceive>, _ws: WSContext) {
  const ws = _ws as unknown as PiWebSocket;
  let data: Record<string, unknown>;

  if (typeof evt.data !== "string") return;

  try {
    data = JSON.parse(evt.data);
  } catch {
    return;
  }

  if (data.type === "auth") {
    try {
      const user = jwt.verify(
        data.token as string,
        process.env.JWT_SECRET!
      ) as AuthPayload;
      userMap.set(ws.wsId, user);

      let userSockSet = userSockets.get(user.username);
      if (!userSockSet) {
        userSockSet = new Set();
        userSockets.set(user.username, userSockSet);
      }
      userSockSet.add(ws);

      const sessionId = data.sessionId as string;
      if (sessionId) {
        await subscribeWsToSession(ws, user, sessionId);
      }

      safeSend(ws, JSON.stringify({ type: "auth_success", wsId: ws.wsId }));
    } catch {
      safeSend(ws, JSON.stringify({ type: "auth_error", error: "Invalid token" }));
      try { ws.close(); } catch {}
    }
    return;
  }

  const user = userMap.get(ws.wsId);
  if (!user) {
    safeSend(ws, JSON.stringify({ type: "error", error: "Not authenticated" }));
    return;
  }

  if (data.type === "session_subscribe") {
    const sessionId = data.sessionId as string;
    if (!sessionId) return;
    await subscribeWsToSession(ws, user, sessionId);
    safeSend(ws, JSON.stringify({ type: "session_subscribed", sessionId }));
    return;
  }

  if (data.type === "prompt") {
    const sessionId = data.sessionId as string;
    const message = data.message as string;
    const tools = data.tools as string[] | undefined;
    const images = data.images as any[] | undefined;

    if (sessionId && sessionId.startsWith("exec_")) {
      safeSend(ws, JSON.stringify({ type: "agent_error", sessionId, error: "Esta sesion de ejecucion es de solo lectura y no acepta prompts." }));
      return;
    }

    const session = await piSessionManager.getOrCreateSession(user.username, sessionId);

    if (tools && Array.isArray(tools)) {
      session.setActiveToolsByName(tools);
    }

    if (session.isStreaming) {
      try {
        await session.prompt(message, { streamingBehavior: "followUp", images });
      } catch (error) {
        safeSend(ws, JSON.stringify({ type: "agent_error", sessionId, error: String(error) }));
      }
      return;
    }

    const { modelRegistry } = piSessionManager.getUserContext(user.username);
    if (!session.model || !modelRegistry.hasConfiguredAuth(session.model)) {
      const available = modelRegistry.getAvailable();
      if (available.length > 0) {
        try {
          await session.setModel(available[0]);
        } catch (error) {
          safeSend(ws, JSON.stringify({ type: "agent_error", sessionId, error: String(error) }));
          return;
        }
      } else {
        safeSend(ws, JSON.stringify({
          type: "agent_error",
          sessionId,
          error: "No providers configured. Go to Settings to add an API key.",
        }));
        return;
      }
    }

    try {
      await session.prompt(message, { images });
    } catch (error) {
      safeSend(ws, JSON.stringify({ type: "agent_error", sessionId, error: String(error) }));
    }
    return;
  }

  if (data.type === "steer") {
    const sessionId = data.sessionId as string;
    const message = data.message as string;
    const session = piSessionManager.getSession(user.username, sessionId);
    if (session) session.steer(message);
    return;
  }

  if (data.type === "follow_up") {
    const sessionId = data.sessionId as string;
    const message = data.message as string;
    const session = piSessionManager.getSession(user.username, sessionId);
    if (session) session.followUp(message);
    return;
  }

  if (data.type === "abort") {
    const sessionId = data.sessionId as string;
    const session = piSessionManager.getSession(user.username, sessionId);
    if (session) {
      await session.abort();
      safeSend(ws, JSON.stringify({ type: "aborted", sessionId }));
    }
    return;
  }

  if (data.type === "compact") {
    const sessionId = data.sessionId as string;
    const session = piSessionManager.getSession(user.username, sessionId);
    if (session) await session.compact();
    return;
  }

  if (data.type === "get_context_usage") {
    const sessionId = data.sessionId as string;
    const session = piSessionManager.getSession(user.username, sessionId);
    if (session) {
      const contextUsage = session.getContextUsage();
      const sessionStats = session.getSessionStats();
      safeSend(ws, JSON.stringify({ type: "context_usage", sessionId, contextUsage, sessionStats }));
    }
    return;
  }

  if (data.type === "channel_join") {
    const channelId = data.channelId as string;
    if (!channelId) return;
    const meta = wsSocketMeta.get(ws.wsId) ?? {};
    if (meta.channelId && meta.channelId !== channelId) {
      const oldSet = channelSockets.get(meta.channelId);
      if (oldSet) {
        oldSet.delete(ws);
        if (oldSet.size === 0) channelSockets.delete(meta.channelId);
      }
    }
    wsSocketMeta.set(ws.wsId, { ...meta, channelId });
    let wsSet = channelSockets.get(channelId);
    if (!wsSet) {
      wsSet = new Set();
      channelSockets.set(channelId, wsSet);
    }
    wsSet.add(ws);
    safeSend(ws, JSON.stringify({ type: "channel_joined", channelId }));
    return;
  }

  if (data.type === "channel_send") {
    const channelId = data.channelId as string;
    const message = data.message as string;
    const sessionId = data.sessionId as string | undefined;
    if (channelId && message) {
      channelOrchestrator.dispatchUserMessage(user.username, channelId, message, sessionId).catch((err) => {
        console.error(`[WS] Error dispatching channel message:`, err);
      });
    }
    return;
  }

  if (data.type === "channel_abort") {
    const channelId = data.channelId as string;
    const sessionId = data.sessionId as string | undefined;
    if (channelId) {
      channelOrchestrator.abortDispatch(user.username, channelId, sessionId);
    }
    return;
  }
}