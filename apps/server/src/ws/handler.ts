import jwt from "jsonwebtoken";
import { existsSync, readFileSync } from "node:fs";
import { piSessionManager } from "../pi/session-manager";
import type { AuthPayload } from "../middleware/auth";
import type { WSContext, WSMessageReceive } from "hono/ws";
import { setBuilding, setReady, setError, ensureWatcher } from "../pi/preview-watcher";

function getRepoNameForSession(username: string, sessionId: string): string | undefined {
  const p = `/tmp/pi-web-users/${username}/sessions/${sessionId}/metadata.json`;
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

let wsCounter = 0;
const userMap = new Map<string, AuthPayload>();
const wsSubscriptions = new Map<string, () => void>();
export const sessionSockets = new Map<string, Set<WSContext>>();
export const userSockets = new Map<string, Set<WSContext>>();

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

export function onOpen(_evt: Event, _ws: WSContext) {
  const ws = _ws as unknown as PiWebSocket;
  ws.wsId = String(++wsCounter);
}

export function onClose(_evt: any, _ws: WSContext) {
  const ws = _ws as unknown as PiWebSocket;
  const user = userMap.get(ws.wsId);
  userMap.delete(ws.wsId);
  // Clean from userSockets
  if (user) {
    const uSockets = userSockets.get(user.username);
    if (uSockets) {
      uSockets.delete(ws);
      if (uSockets.size === 0) {
        userSockets.delete(user.username);
      }
    }
  }
  // Clean from sessionSockets
  for (const [sessionId, wsSet] of sessionSockets.entries()) {
    if (wsSet.has(ws)) {
      wsSet.delete(ws);
      if (wsSet.size === 0) {
        sessionSockets.delete(sessionId);
      }
    }
  }
  const unsub = wsSubscriptions.get(ws.wsId);
  if (unsub) {
    unsub();
    wsSubscriptions.delete(ws.wsId);
  }
}

export async function onMessage(evt: MessageEvent<WSMessageReceive>, _ws: WSContext) {
  const ws = _ws as unknown as PiWebSocket;
  let data: Record<string, unknown>;

  if (typeof evt.data !== "string") {
    return;
  }

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
        // Clean up from other sessions first
        for (const [sid, wsSet] of sessionSockets.entries()) {
          wsSet.delete(ws);
          if (wsSet.size === 0) {
            sessionSockets.delete(sid);
          }
        }
        // Add to sessionSockets
        let wsSet = sessionSockets.get(sessionId);
        if (!wsSet) {
          wsSet = new Set();
          sessionSockets.set(sessionId, wsSet);
        }
        wsSet.add(ws);

        const existingUnsub = wsSubscriptions.get(ws.wsId);
        if (existingUnsub) {
          existingUnsub();
        }

          const session = await piSessionManager.getOrCreateSession(
            user.username,
            sessionId
          );

          const BUILD_REGEX = /\b(build|vite build|next build|bun run build|npm run build|pnpm run build|yarn build)\b/;
          const sessionRepoName = getRepoNameForSession(user.username, sessionId);

          const unsub = session.subscribe((agentEvent) => {
            safeSend(ws, JSON.stringify(agentEvent));

            if (agentEvent.type === "tool_execution_start") {
              const ev = agentEvent as any;
              const cmd = ev.args?.command as string | undefined;
              if (ev.toolName === "bash" && cmd && BUILD_REGEX.test(cmd) && sessionRepoName) {
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
                } else if (cmd && BUILD_REGEX.test(cmd)) {
                  setReady(user.username, sessionRepoName);
                }
              }
            }

            if (agentEvent.type === "agent_end" && sessionRepoName) {
              ensureWatcher(user.username, sessionRepoName);
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

  if (data.type === "prompt") {
    const sessionId = data.sessionId as string;
    const message = data.message as string;
    const tools = data.tools as string[] | undefined;

    const session = await piSessionManager.getOrCreateSession(
      user.username,
      sessionId
    );

    if (tools && Array.isArray(tools)) {
      session.setActiveToolsByName(tools);
    }

    if (session.isStreaming) {
      try {
        await session.prompt(message, { streamingBehavior: "followUp" });
      } catch (error) {
        safeSend(
          ws,
          JSON.stringify({ type: "agent_error", sessionId, error: String(error) })
        );
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
          safeSend(
            ws,
            JSON.stringify({ type: "agent_error", sessionId, error: String(error) })
          );
          return;
        }
      } else {
        safeSend(
          ws,
          JSON.stringify({
            type: "agent_error",
            sessionId,
            error: "No providers configured. Go to Settings to add an API key.",
          })
        );
        return;
      }
    }

    try {
      await session.prompt(message);
    } catch (error) {
      safeSend(
        ws,
        JSON.stringify({ type: "agent_error", sessionId, error: String(error) })
      );
    }
  }

  if (data.type === "steer") {
    const sessionId = data.sessionId as string;
    const message = data.message as string;
    const session = piSessionManager.getSession(user.username, sessionId);
    if (session) {
      session.steer(message);
    }
  }

  if (data.type === "follow_up") {
    const sessionId = data.sessionId as string;
    const message = data.message as string;
    const session = piSessionManager.getSession(user.username, sessionId);
    if (session) {
      session.followUp(message);
    }
  }

  if (data.type === "abort") {
    const sessionId = data.sessionId as string;
    const session = piSessionManager.getSession(user.username, sessionId);
    if (session) {
      await session.abort();
      safeSend(ws, JSON.stringify({ type: "aborted", sessionId }));
    }
  }

  if (data.type === "compact") {
    const sessionId = data.sessionId as string;
    const session = piSessionManager.getSession(user.username, sessionId);
    if (session) {
      await session.compact();
    }
  }

  if (data.type === "get_context_usage") {
    const sessionId = data.sessionId as string;
    const session = piSessionManager.getSession(user.username, sessionId);
    if (session) {
      const contextUsage = session.getContextUsage();
      const sessionStats = session.getSessionStats();
      safeSend(ws, JSON.stringify({ type: "context_usage", sessionId, contextUsage, sessionStats }));
    }
  }
}
