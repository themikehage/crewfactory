import jwt from "jsonwebtoken";
import { existsSync, readFileSync } from "node:fs";
import { sessionManager } from "../core/session-manager";
import type { AuthPayload } from "../middleware/auth";
import type { WSContext, WSMessageReceive } from "hono/ws";
import { setBuilding, setReady, setError, ensureWatcher } from "../core/preview-watcher";
import { channelOrchestrator, setChannelBroadcastHandler } from "../channels";
import { setEventBroadcaster } from "../lib/event-broker";
import { uiApprovalRegistry } from "../core/ui-approval-registry";
import { SessionPrefix, getSessionMetadataPath } from "shared";

function getProjectNameForSession(username: string, sessionId: string): string | undefined {
  const p = getSessionMetadataPath(username, sessionId);
  if (existsSync(p)) {
    try {
      return JSON.parse(readFileSync(p, "utf-8")).projectName;
    } catch {}
  }
}

interface AppWebSocket extends WSContext {
  wsId: string;
  user: AuthPayload;
}

interface WsSocketMeta {
  sessionId?: string;
  channelId?: string;
  missedPings?: number;
  ws?: AppWebSocket;
}

let wsCounter = 0;
const userMap = new Map<string, AuthPayload>();
const wsSubscriptions = new Map<string, () => void>();
const wsSocketMeta = new Map<string, WsSocketMeta>();
export const sessionSockets = new Map<string, Set<WSContext>>();
export const userSockets = new Map<string, Set<WSContext>>();
export const channelSockets = new Map<string, Set<WSContext>>();

// Server-side heartbeat ping-pong
setInterval(() => {
  for (const [wsId, meta] of wsSocketMeta.entries()) {
    const ws = meta.ws;
    if (!ws) continue;

    const missed = meta.missedPings ?? 0;
    if (missed >= 3) {
      console.log(`[WS Server] Closing connection for wsId ${wsId} due to missed pings`);
      try {
        ws.close();
      } catch {}
      continue;
    }

    meta.missedPings = missed + 1;
    try {
      ws.send(JSON.stringify({ type: "ping" }));
    } catch {}
  }
}, 30000);

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

setChannelBroadcastHandler(broadcastToChannel);
setEventBroadcaster(broadcastToUser);

function safeSend(ws: { send: (data: string) => void }, data: string) {
  try {
    ws.send(data);
  } catch {}
}

async function subscribeWsToSession(
  ws: AppWebSocket,
  user: AuthPayload,
  sessionId: string
): Promise<void> {
  if (sessionId.startsWith(SessionPrefix.EXEC) || sessionId.startsWith(SessionPrefix.LAB)) {
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

  const session = await sessionManager.getOrCreateSession(user.username, sessionId);

  const BUILD_REGEX = /\b(build|vite build|next build|nuxt build|astro build|bun run build|npm run build|pnpm run build|yarn build|tsc|webpack|parcel build|rollup -c)\b/;
  const sessionProjectName = getProjectNameForSession(user.username, sessionId);
  let hadBuildInSession = false;

  const unsub = session.subscribe((agentEvent) => {
    safeSend(ws, JSON.stringify(agentEvent));

    if (agentEvent.type === "tool_execution_start") {
      const ev = agentEvent as any;
      const cmd = ev.args?.command as string | undefined;
      if (ev.toolName === "bash" && cmd && BUILD_REGEX.test(cmd) && sessionProjectName) {
        hadBuildInSession = true;
        setBuilding(user.username, sessionProjectName);
      }
    }

    if (agentEvent.type === "tool_execution_end") {
      const ev = agentEvent as any;
      if (ev.toolName === "bash" && sessionProjectName) {
        const cmd = ev.args?.command as string | undefined;
        if (ev.isError) {
          const resultStr = typeof ev.result === "string" ? ev.result : JSON.stringify(ev.result).slice(0, 500);
          setError(user.username, sessionProjectName, resultStr || "Build failed");
          hadBuildInSession = false;
        } else if (cmd && BUILD_REGEX.test(cmd)) {
          hadBuildInSession = false;
          setReady(user.username, sessionProjectName);
        }
      }
    }

    if (agentEvent.type === "agent_end" && sessionProjectName && hadBuildInSession) {
      ensureWatcher(user.username, sessionProjectName);
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

  if (session.isStreaming) {
    safeSend(ws, JSON.stringify({ type: "agent_start" }));
  }

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
}

export function onOpen(_evt: Event, _ws: WSContext) {
  const ws = _ws as unknown as AppWebSocket;
  ws.wsId = String(++wsCounter);
  wsSocketMeta.set(ws.wsId, { missedPings: 0, ws });
}

export function onClose(_evt: any, _ws: WSContext) {
  const ws = _ws as unknown as AppWebSocket;
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
  const ws = _ws as unknown as AppWebSocket;
  let data: Record<string, unknown>;

  if (typeof evt.data !== "string") return;

  try {
    data = JSON.parse(evt.data);
  } catch {
    return;
  }

  if (data.type === "pong") {
    const meta = wsSocketMeta.get(ws.wsId);
    if (meta) {
      meta.missedPings = 0;
    }
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

    if (sessionId && sessionId.startsWith(SessionPrefix.EXEC)) {
      safeSend(ws, JSON.stringify({ type: "agent_error", sessionId, error: "Esta sesion de ejecucion es de solo lectura y no acepta prompts." }));
      return;
    }

    const session = await sessionManager.getOrCreateSession(user.username, sessionId);

    if (tools && Array.isArray(tools)) {
      const currentActive = session.getActiveToolNames();
      const mcpActive = currentActive.filter((tName) => tName.startsWith("mcp_"));
      const memoryActive = currentActive.filter((tName) => tName.startsWith("memory_"));
      const exaActive = currentActive.filter((tName) => tName === "exa_search");
      session.setActiveToolsByName(
        Array.from(
          new Set([
            ...tools,
            ...mcpActive,
            ...memoryActive,
            ...exaActive,
            "request_approval",
            "ask_question",
            "render_images",
            "render_html",
            "render_chart",
            "share_file",
            "refresh_ui",
            "spawn_subagent",
            "delegate_task",
            "decompose_tasks",
            "update_task_status",
            "complete_task_list",
            "vision",
            "generate_image",
            "manage_factory",
          ])
        )
      );
    }

    if (session.isStreaming) {
      try {
        session.followUp(message);
      } catch (error) {
        safeSend(ws, JSON.stringify({ type: "agent_error", sessionId, error: String(error) }));
      }
      return;
    }

    const { modelRegistry } = sessionManager.getUserContext(user.username);
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
    const session = sessionManager.getSession(user.username, sessionId);
    if (session) session.steer(message);
    return;
  }

  if (data.type === "follow_up") {
    const sessionId = data.sessionId as string;
    const message = data.message as string;
    const session = sessionManager.getSession(user.username, sessionId);
    if (session) session.followUp(message);
    return;
  }

  if (data.type === "abort") {
    const sessionId = data.sessionId as string;
    const session = sessionManager.getSession(user.username, sessionId);
    if (session) {
      await session.abort();
      safeSend(ws, JSON.stringify({ type: "aborted", sessionId }));
    }
    return;
  }

  if (data.type === "compact") {
    const sessionId = data.sessionId as string;
    const session = sessionManager.getSession(user.username, sessionId);
    if (session) await session.compact();
    return;
  }

  if (data.type === "get_context_usage") {
    const sessionId = data.sessionId as string;
    const session = sessionManager.getSession(user.username, sessionId);
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

  if (data.type === "ui_action") {
    const componentId = data.componentId as string;
    const action = data.action as string;
    const payload = data.payload as Record<string, any> | undefined;
    if (componentId && action) {
      const resolved = uiApprovalRegistry.resolve(componentId, { action, payload });
      if (resolved) {
        safeSend(ws, JSON.stringify({ type: "ui_action_acknowledged", componentId }));
      } else {
        safeSend(ws, JSON.stringify({ type: "ui_action_error", componentId, error: "Approval request not found or already completed" }));
      }
    }
    return;
  }
}