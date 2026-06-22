import jwt from "jsonwebtoken";
import { piSessionManager } from "../pi/session-manager";
import { taskRunner } from "../pi/task-runner";
import type { AuthPayload } from "../middleware/auth";
import type { WSContext, WSMessageReceive } from "hono/ws";

interface PiWebSocket extends WSContext {
  wsId: string;
  user: AuthPayload;
}

let wsCounter = 0;
const userMap = new Map<string, AuthPayload>();
const wsSubscriptions = new Map<string, () => void>();
const userWsMap = new Map<string, { send: (data: string) => void }>();

export function wsUserSend(username: string): (event: Record<string, unknown>) => void {
  return (event) => {
    const ws = userWsMap.get(username);
    if (ws) safeSend(ws, JSON.stringify(event));
  };
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

export function onClose(_evt: unknown, _ws: WSContext) {
  const ws = _ws as unknown as PiWebSocket;
  userMap.delete(ws.wsId);
  const unsub = wsSubscriptions.get(ws.wsId);
  if (unsub) {
    unsub();
    wsSubscriptions.delete(ws.wsId);
  }
  if (ws.user) {
    userWsMap.delete(ws.user.username);
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
      ws.user = user;
      userWsMap.set(user.username, ws);

      const sessionId = data.sessionId as string;
      if (sessionId) {
        const existingUnsub = wsSubscriptions.get(ws.wsId);
        if (existingUnsub) {
          existingUnsub();
        }

        const session = await piSessionManager.getOrCreateSession(
          user.username,
          sessionId
        );

        const unsub = session.subscribe((agentEvent) => {
          safeSend(ws, JSON.stringify(agentEvent));
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

  if (data.type === "task_pause") {
    const sessionId = data.sessionId as string;
    taskRunner.pause(user.username, sessionId);
  }

  if (data.type === "task_resume") {
    const sessionId = data.sessionId as string;
    const session = piSessionManager.getSession(user.username, sessionId);
    if (session) {
      await taskRunner.resume(user.username, sessionId, session, wsUserSend(user.username));
    }
  }
}
