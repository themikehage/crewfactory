import { spawn, type Subprocess } from "bun";
import type { McpServerConfig } from "shared";

export class McpClient {
  public name: string;
  private config: McpServerConfig;
  private proc: Subprocess | null = null;
  private nextId = 1;
  private pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private stdioBuffer = "";
  private abortController: AbortController | null = null;
  private postUrl: string | null = null;
  private connected = false;

  constructor(name: string, config: McpServerConfig) {
    this.name = name;
    this.config = config;
  }

  async start(): Promise<void> {
    if (!this.config.enabled) return;

    if (this.config.transport === "http") {
      await this.connectHttp();
    } else {
      await this.connectStdio();
    }
  }

  private async connectStdio(): Promise<void> {
    if (!this.config.command) {
      throw new Error(`[MCP Stdio] No command specified for server: ${this.name}`);
    }
    try {
      this.proc = spawn([this.config.command, ...(this.config.args || [])], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          ...(this.config.env || {}),
        },
      });

      this.connected = true;

      // Handle stdout line by line
      this.readStdout();
      this.readStderr();

      // Initialize
      await this.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "crewfactory-mcp-client", version: "1.0.0" },
      }, 30000);

      this.notify("notifications/initialized");
      console.log(`[MCP Stdio] Started server: ${this.name}`);
    } catch (e) {
      console.error(`[MCP Stdio] Failed to start server ${this.name}:`, e);
      this.proc = null;
      this.connected = false;
      throw e;
    }
  }

  private async connectHttp(): Promise<void> {
    if (!this.config.url) {
      throw new Error(`[MCP HTTP] No URL specified for HTTP server: ${this.name}`);
    }

    try {
      this.abortController = new AbortController();
      const response = await fetch(this.config.url, {
        headers: { "Accept": "text/event-stream" },
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to connect to SSE: ${response.statusText}`);
      }

      this.connected = true;
      this.postUrl = null;

      // Start reading the stream asynchronously
      this.readSseStream(response.body);

      // Wait for the postUrl endpoint to be received
      await this.waitForPostUrl();

      // Send initialize request
      await this.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "crewfactory-mcp-client", version: "1.0.0" },
      }, 30000);

      this.notify("notifications/initialized");
      console.log(`[MCP HTTP] Connected to server: ${this.name}`);
    } catch (e: any) {
      console.error(`[MCP HTTP] Failed to connect to server ${this.name}:`, e);
      this.connected = false;
      this.postUrl = null;
      throw e;
    }
  }

  private async waitForPostUrl(timeoutMs = 10000): Promise<void> {
    const start = Date.now();
    while (!this.postUrl) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Timeout waiting for SSE endpoint URL for server: ${this.name}`);
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  private async readStdout() {
    if (!this.proc || !this.proc.stdout || typeof this.proc.stdout === "number") return;
    const reader = this.proc.stdout.getReader();
    const decoder = new TextDecoder();

    try {
      while (this.connected) {
        const { done, value } = await reader.read();
        if (done) break;
        this.stdioBuffer += decoder.decode(value, { stream: true });
        
        let lineEndIdx;
        while ((lineEndIdx = this.stdioBuffer.indexOf("\n")) !== -1) {
          const line = this.stdioBuffer.slice(0, lineEndIdx).trim();
          this.stdioBuffer = this.stdioBuffer.slice(lineEndIdx + 1);
          if (line) {
            this.handleMessage(line);
          }
        }
      }
    } catch (e) {
      console.error(`[MCP Stdio] Error reading stdout for ${this.name}:`, e);
    }
  }

  private async readStderr() {
    if (!this.proc || !this.proc.stderr || typeof this.proc.stderr === "number") return;
    const reader = this.proc.stderr.getReader();
    const decoder = new TextDecoder();
    try {
      while (this.connected) {
        const { done, value } = await reader.read();
        if (done) break;
        const errText = decoder.decode(value).trim();
        if (errText) {
          console.warn(`[MCP Server ${this.name} stderr] ${errText}`);
        }
      }
    } catch {}
  }

  private async readSseStream(body: ReadableStream<Uint8Array> | null): Promise<void> {
    if (!body) return;
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    let currentEvent = "";
    let currentData = "";

    try {
      while (this.connected) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let lineEndIdx;
        while ((lineEndIdx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, lineEndIdx).trim();
          buffer = buffer.slice(lineEndIdx + 1);

          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            currentData = line.slice(5).trim();
          } else if (line === "") {
            // Event block boundary
            if (currentEvent && currentData) {
              this.handleSseEvent(currentEvent, currentData);
            }
            currentEvent = "";
            currentData = "";
          }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error(`[MCP HTTP] Error reading SSE stream for ${this.name}:`, e);
      }
    } finally {
      this.connected = false;
    }
  }

  private handleSseEvent(event: string, data: string): void {
    if (event === "endpoint") {
      try {
        const postUrl = new URL(data, this.config.url!).toString();
        this.postUrl = postUrl;
        console.log(`[MCP HTTP] Resolved endpoint POST URL: ${postUrl}`);
      } catch (e) {
        console.error(`[MCP HTTP] Failed to resolve endpoint URL: ${data}`, e);
      }
    } else if (event === "message") {
      this.handleMessage(data);
    }
  }

  private handleMessage(line: string) {
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
        const { resolve, reject } = this.pendingRequests.get(msg.id)!;
        this.pendingRequests.delete(msg.id);
        if (msg.error) {
          reject(msg.error);
        } else {
          resolve(msg.result);
        }
      }
    } catch (e) {
      console.error(`[MCP] Failed to parse message for ${this.name}: ${line}`, e);
    }
  }

  async request(method: string, params: any = {}, timeoutMs = 15000): Promise<any> {
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });

    let timeoutId: any;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP request '${method}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    const requestPromise = (async () => {
      if (this.config.transport === "http") {
        if (!this.postUrl) {
          throw new Error(`[MCP HTTP] Server ${this.name} has no active POST endpoint`);
        }

        return new Promise(async (resolve, reject) => {
          this.pendingRequests.set(id, { resolve, reject });
          try {
            const res = await fetch(this.postUrl!, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: payload,
            });
            if (!res.ok) {
              this.pendingRequests.delete(id);
              reject(new Error(`HTTP request failed: ${res.statusText}`));
            }
          } catch (e) {
            this.pendingRequests.delete(id);
            reject(e);
          }
        });
      } else {
        const stdin = this.proc?.stdin;
        if (!stdin || typeof stdin === "number") throw new Error("Server not running");
        
        return new Promise((resolve, reject) => {
          this.pendingRequests.set(id, { resolve, reject });
          try {
            stdin.write(payload + "\n");
            stdin.flush();
          } catch (e) {
            this.pendingRequests.delete(id);
            reject(e);
          }
        });
      }
    })();

    try {
      return await Promise.race([requestPromise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  notify(method: string, params: any = {}): void {
    const payload = JSON.stringify({ jsonrpc: "2.0", method, params });

    if (this.config.transport === "http") {
      if (!this.postUrl) return;
      fetch(this.postUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      }).catch(() => {});
    } else {
      const stdin = this.proc?.stdin;
      if (!stdin || typeof stdin === "number") return;
      try {
        stdin.write(payload + "\n");
        stdin.flush();
      } catch {}
    }
  }

  async listTools(): Promise<any[]> {
    try {
      const res = await this.request("tools/list");
      return res.tools || [];
    } catch (e) {
      console.error(`[MCP] Failed to list tools for ${this.name}:`, e);
      return [];
    }
  }

  async callTool(name: string, args: any): Promise<any> {
    try {
      const res = await this.request("tools/call", { name, arguments: args });
      return res;
    } catch (e) {
      console.error(`[MCP] Failed to call tool ${name} on ${this.name}:`, e);
      throw e;
    }
  }

  stop() {
    this.connected = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }
}
