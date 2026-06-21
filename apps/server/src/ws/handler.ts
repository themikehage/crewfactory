import jwt from "jsonwebtoken";
import { piSessionManager } from "../pi/session-manager";
import type { AuthPayload } from "../middleware/auth";

interface PiWebSocket {
  wsId: string;
  user: AuthPayload;
}

let wsCounter = 0;
const userMap = new Map<string, AuthPayload>();

function safeSend(ws: { send: (data: string) => void }, data: string) {
  try {
    ws.send(data);
  } catch {}
}

export function onOpen(_evt: Event, _ws: unknown) {
  const ws = _ws as unknown as PiWebSocket;
  ws.wsId = String(++wsCounter);
}

export function onClose(_evt: Event, _ws: unknown) {
  const ws = _ws as unknown as PiWebSocket;
  userMap.delete(ws.wsId);
}

export async function onMessage(evt: MessageEvent<string>, _ws: unknown) {
  const ws = _ws as unknown as PiWebSocket;
  let data: Record<string, unknown>;

  try {
    data = JSON.parse(evt.data);
  } catch {
    return;
  }

  const wsRaw = _ws as unknown as { send: (data: string) => void; close: () => void };

  if (data.type === "auth") {
    try {
      const user = jwt.verify(
        data.token as string,
        process.env.JWT_SECRET!
      ) as AuthPayload;
      userMap.set(ws.wsId, user);
      safeSend(wsRaw, JSON.stringify({ type: "auth_success", wsId: ws.wsId }));
    } catch {
      safeSend(wsRaw, JSON.stringify({ type: "auth_error", error: "Invalid token" }));
      try { wsRaw.close(); } catch {}
    }
    return;
  }

  const user = userMap.get(ws.wsId);
  if (!user) {
    safeSend(wsRaw, JSON.stringify({ type: "error", error: "Not authenticated" }));
    return;
  }

  if (data.type === "prompt") {
    const sessionId = data.sessionId as string;
    const message = data.message as string;

    const session = await piSessionManager.getOrCreateSession(
      user.username,
      sessionId
    );

    if (session.isStreaming) {
      try {
        await session.prompt(message, { streamingBehavior: "followUp" });
      } catch (error) {
        safeSend(
          wsRaw,
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
            wsRaw,
            JSON.stringify({ type: "agent_error", sessionId, error: String(error) })
          );
          return;
        }
      }
    }

    const unsubscribe = session.subscribe((agentEvent) => {
      safeSend(wsRaw, JSON.stringify(agentEvent));
    });

    try {
      await session.prompt(message);
    } catch (error) {
      safeSend(
        wsRaw,
        JSON.stringify({ type: "agent_error", sessionId, error: String(error) })
      );
    }

    unsubscribe();
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
      safeSend(wsRaw, JSON.stringify({ type: "aborted", sessionId }));
    }
  }
}
