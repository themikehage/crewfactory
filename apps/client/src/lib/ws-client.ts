type EventHandler = (data: unknown) => void;
export type ConnectionState = "disconnected" | "connecting" | "connected" | "permanently_disconnected";
type StateHandler = (state: ConnectionState) => void;

class WsClient {
  private static readonly MAX_QUEUE_SIZE = 50;
  private ws: WebSocket | null = null;
  private messageHandlers = new Map<string, Set<EventHandler>>();
  private stateHandlers = new Set<StateHandler>();
  private state: ConnectionState = "disconnected";
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private intentionalClose = false;
  private offlineQueue: Array<Record<string, unknown>> = [];
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private lastPong = Date.now();

  private startPingTimer(): void {
    this.stopPingTimer();
    this.lastPong = Date.now();
    this.pingInterval = setInterval(() => {
      if (Date.now() - this.lastPong > 45000) {
        console.warn("[wsClient] No ping received from server in 45s, reconnecting...");
        this.ws?.close();
      }
    }, 15000);
  }

  private stopPingTimer(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  getState(): ConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === "connected" && this.ws?.readyState === WebSocket.OPEN;
  }

  getQueueSize(): number {
    return this.offlineQueue.length;
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
    this.stopPingTimer();
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
    if (this.offlineQueue.length >= WsClient.MAX_QUEUE_SIZE) {
      const dropped = this.offlineQueue.shift();
      console.warn(
        `[wsClient] Offline queue full (${WsClient.MAX_QUEUE_SIZE}), dropping oldest message:`,
        dropped?.type ?? "unknown"
      );
    }
    this.offlineQueue.push(data);
    return false;
  }

  private flushOfflineQueue(): void {
    while (
      this.offlineQueue.length > 0 &&
      this.ws?.readyState === WebSocket.OPEN &&
      this.state === "connected"
    ) {
      const data = this.offlineQueue.shift();
      if (data) {
        try {
          this.ws.send(JSON.stringify(data));
        } catch (err) {
          console.error("[wsClient] Failed to flush queued message:", err);
          this.offlineQueue.unshift(data);
          break;
        }
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
    console.log("[wsClient] Initializing connection...");
    this.setState("connecting");

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${location.host}/ws`;
    console.log(`[wsClient] Connecting to: ${url}`);
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      console.log("[wsClient] WebSocket opened. Cookie auth will be attempted server-side.");
      this.reconnectAttempts = 0;
      this.startPingTimer();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);

        if (data.type === "ping") {
          this.lastPong = Date.now();
          this.send({ type: "pong" });
          return;
        }

        if (data.type === "auth_success") {
          console.log("[wsClient] Authentication successful!");
          this.setState("connected");
          this.flushOfflineQueue();
          return;
        }

        if (data.type === "auth_error") {
          console.error("[wsClient] Authentication failed! Error:", data.error);
          this.intentionalClose = true;
          this.setState("permanently_disconnected");
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

    ws.onclose = (event) => {
      console.warn(`[wsClient] WebSocket closed. intentionalClose: ${this.intentionalClose}, code: ${event.code}, reason: ${event.reason}`);
      this.ws = null;
      this.stopPingTimer();
      if (this.intentionalClose) return;
      this.setState("disconnected");
      const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
      console.log(`[wsClient] Scheduling reconnect in ${delay}ms (attempt: ${this.reconnectAttempts})`);
      this.reconnectAttempts++;
      this.reconnectTimeout = setTimeout(() => {
        this.reconnectTimeout = null;
        this.doConnect();
      }, delay);
    };

    ws.onerror = (err) => {
      console.error("[wsClient] WebSocket error occurred:", err);
      ws.close();
    };
  }
}

export const wsClient = new WsClient();