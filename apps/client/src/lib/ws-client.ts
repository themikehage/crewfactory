type EventHandler = (data: unknown) => void;
type ConnectionState = "disconnected" | "connecting" | "connected";
type StateHandler = (state: ConnectionState) => void;

class WsClient {
  private ws: WebSocket | null = null;
  private messageHandlers = new Map<string, Set<EventHandler>>();
  private stateHandlers = new Set<StateHandler>();
  private state: ConnectionState = "disconnected";
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private intentionalClose = false;
  private offlineQueue: Array<Record<string, unknown>> = [];

  getState(): ConnectionState {
    return this.state;
  }

  connect(): void {
    if (this.state !== "disconnected") return;
    this.intentionalClose = false;
    this.doConnect();
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.ws?.close();
    this.ws = null;
    this.offlineQueue = [];
    this.setState("disconnected");
  }

  send(data: Record<string, unknown>): boolean {
    if (this.ws?.readyState === WebSocket.OPEN && this.state === "connected") {
      this.ws.send(JSON.stringify(data));
      return true;
    }
    this.offlineQueue.push(data);
    return false;
  }

  private flushOfflineQueue(): void {
    while (this.offlineQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN && this.state === "connected") {
      const data = this.offlineQueue.shift();
      if (data) {
        this.ws.send(JSON.stringify(data));
      }
    }
  }

  subscribe(type: string, handler: EventHandler): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    const handlers = this.messageHandlers.get(type)!;
    handlers.add(handler);
    console.log(`[wsClient] Subscribed to "${type}". Active handlers for "${type}": ${handlers.size}`);
    if (this.state === "disconnected") this.connect();
    return () => {
      const exists = handlers.delete(handler);
      console.log(`[wsClient] Unsubscribed from "${type}". Existed: ${exists}. Active handlers for "${type}": ${handlers.size}`);
    };
  }

  onStateChange(handler: StateHandler): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  private setState(state: ConnectionState) {
    this.state = state;
    this.stateHandlers.forEach((h) => h(state));
  }

  private doConnect(): void {
    if (this.state !== "disconnected") return;
    this.doConnectAsync().catch((err) => {
      console.error("[wsClient] Connection error:", err);
      this.setState("disconnected");
      this.ws = null;
      if (!this.intentionalClose) {
        const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
        this.reconnectAttempts++;
        this.reconnectTimeout = setTimeout(() => {
          this.reconnectTimeout = null;
          this.doConnect();
        }, delay);
      }
    });
  }

  private async doConnectAsync(): Promise<void> {
    let token: string | null = null;
    try {
      const res = await fetch("/api/auth/get-session", { credentials: "include" });
      if (res.ok) {
        const data = await res.json() as { session?: { token?: string } };
        token = data?.session?.token ?? null;
      }
    } catch {}

    if (!token) {
      console.warn("[wsClient] No active session token found, skipping connection");
      this.setState("disconnected");
      return;
    }

    this.setState("connecting");

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      ws.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);

        if (data.type === "ping") {
          this.send({ type: "pong" });
          return;
        }

        if (data.type === "auth_success") {
          this.setState("connected");
          this.flushOfflineQueue();
          return;
        }

        if (data.type === "auth_error") {
          this.intentionalClose = true;
          ws.close();
          return;
        }

        if (data.type === "entity-updated") {
          window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: data.entityType } }));
          return;
        }

        this.messageHandlers.get(data.type)?.forEach((h) => h(data));
        this.messageHandlers.get("*")?.forEach((h) => h(data));
      } catch {}
    };

    ws.onclose = () => {
      this.ws = null;
      if (this.intentionalClose) return;
      this.setState("disconnected");
      const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
      this.reconnectAttempts++;
      this.reconnectTimeout = setTimeout(() => {
        this.reconnectTimeout = null;
        this.doConnect();
      }, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }
}

export const wsClient = new WsClient();