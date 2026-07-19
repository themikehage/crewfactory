import type { WSContext } from "hono/ws";
import type { AuthPayload } from "../middleware/auth";

export interface WsSocketMeta {
  wsId: string;
  ws: WSContext;
  user?: AuthPayload;
  sessionId?: string;
  channelId?: string;
  teamId?: string;
  missedPings: number;
}

export interface AppWebSocket extends WSContext {
  __wsId?: string;
}

type Unsubscribe = () => void;

class WsRegistry {
  private metaById = new Map<string, WsSocketMeta>();
  private unsubById = new Map<string, Unsubscribe>();

  userSockets = new Map<string, Set<WSContext>>();
  sessionSockets = new Map<string, Set<WSContext>>();
  channelSockets = new Map<string, Set<WSContext>>();
  teamSockets = new Map<string, Set<WSContext>>();
  private userById = new Map<string, AuthPayload>();

  createMeta(wsId: string, ws: WSContext): WsSocketMeta {
    const meta: WsSocketMeta = {
      wsId,
      ws,
      missedPings: 0,
    };
    this.metaById.set(wsId, meta);
    return meta;
  }

  getMeta(wsId: string): WsSocketMeta | undefined {
    return this.metaById.get(wsId);
  }

  updateMeta(wsId: string, patch: Partial<Omit<WsSocketMeta, "wsId">>): WsSocketMeta | undefined {
    const existing = this.metaById.get(wsId);
    if (!existing) return undefined;
    Object.assign(existing, patch);
    return existing;
  }

  deleteMeta(wsId: string): void {
    this.metaById.delete(wsId);
    this.userById.delete(wsId);
    const unsub = this.unsubById.get(wsId);
    if (unsub) {
      try {
        unsub();
      } catch {}
      this.unsubById.delete(wsId);
    }
  }

  setUser(wsId: string, user: AuthPayload): void {
    this.userById.set(wsId, user);
    const meta = this.metaById.get(wsId);
    if (meta) meta.user = user;
  }

  getUser(wsId: string): AuthPayload | undefined {
    return this.userById.get(wsId);
  }

  clearUser(wsId: string): void {
    this.userById.delete(wsId);
  }

  setUnsub(wsId: string, unsub: Unsubscribe): void {
    const old = this.unsubById.get(wsId);
    if (old) {
      try {
        old();
      } catch {}
    }
    this.unsubById.set(wsId, unsub);
  }

  clearUnsub(wsId: string): void {
    const unsub = this.unsubById.get(wsId);
    if (unsub) {
      try {
        unsub();
      } catch {}
      this.unsubById.delete(wsId);
    }
  }

  addSessionSocket(sessionId: string, ws: WSContext): void {
    let set = this.sessionSockets.get(sessionId);
    if (!set) {
      set = new Set();
      this.sessionSockets.set(sessionId, set);
    }
    set.add(ws);
  }

  removeSessionSocket(sessionId: string, ws: WSContext): void {
    const set = this.sessionSockets.get(sessionId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) this.sessionSockets.delete(sessionId);
    }
  }

  addUserSocket(username: string, ws: WSContext): void {
    let set = this.userSockets.get(username);
    if (!set) {
      set = new Set();
      this.userSockets.set(username, set);
    }
    set.add(ws);
  }

  removeUserSocket(username: string, ws: WSContext): void {
    const set = this.userSockets.get(username);
    if (set) {
      set.delete(ws);
      if (set.size === 0) this.userSockets.delete(username);
    }
  }

  addChannelSocket(channelId: string, ws: WSContext): void {
    let set = this.channelSockets.get(channelId);
    if (!set) {
      set = new Set();
      this.channelSockets.set(channelId, set);
    }
    set.add(ws);
  }

  removeChannelSocket(channelId: string, ws: WSContext): void {
    const set = this.channelSockets.get(channelId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) this.channelSockets.delete(channelId);
    }
  }

  addTeamSocket(teamId: string, ws: WSContext): void {
    let set = this.teamSockets.get(teamId);
    if (!set) {
      set = new Set();
      this.teamSockets.set(teamId, set);
    }
    set.add(ws);
  }

  removeTeamSocket(teamId: string, ws: WSContext): void {
    const set = this.teamSockets.get(teamId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) this.teamSockets.delete(teamId);
    }
  }

  *allMeta(): IterableIterator<[string, WsSocketMeta]> {
    yield* this.metaById.entries();
  }

  count(): number {
    return this.metaById.size;
  }
}

export const wsRegistry = new WsRegistry();

export function startHeartbeat(): void {
  setInterval(() => {
    for (const [wsId, meta] of wsRegistry.allMeta()) {
      if (!meta.ws) continue;
      if (meta.missedPings >= 3) {
        console.log(`[WS] Closing connection for wsId ${wsId} due to missed pings`);
        try {
          meta.ws.close();
        } catch (err) {
          console.error("[WS] ws.close failed:", err);
        }
        continue;
      }
      meta.missedPings++;
      try {
        meta.ws.send(JSON.stringify({ type: "ping" }));
      } catch (err) {
        console.error("[WS] ws.send ping failed:", err);
      }
    }
  }, 30000);
}
