import { spawn, type Subprocess } from "bun";

export interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export class McpClient {
  private name: string;
  private config: McpServerConfig;
  private proc: Subprocess | null = null;
  private nextId = 1;
  private pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private buffer = "";

  constructor(name: string, config: McpServerConfig) {
    this.name = name;
    this.config = config;
  }

  async start(): Promise<void> {
    if (!this.config.enabled) return;

    try {
      this.proc = spawn([this.config.command, ...this.config.args], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          ...(this.config.env || {}),
        },
      });

      // Handle stdout line by line
      this.readStdout();
      this.readStderr();

      // Initialize
      await this.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "crewfactory-mcp-client", version: "1.0.0" },
      });

      this.notify("notifications/initialized");
      console.log(`[MCP] Started server: ${this.name}`);
    } catch (e) {
      console.error(`[MCP] Failed to start server ${this.name}:`, e);
      this.proc = null;
    }
  }

  private async readStdout() {
    if (!this.proc || !this.proc.stdout || typeof this.proc.stdout === "number") return;
    const reader = this.proc.stdout.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        this.buffer += decoder.decode(value, { stream: true });
        
        let lineEndIdx;
        while ((lineEndIdx = this.buffer.indexOf("\n")) !== -1) {
          const line = this.buffer.slice(0, lineEndIdx).trim();
          this.buffer = this.buffer.slice(lineEndIdx + 1);
          if (line) {
            this.handleMessage(line);
          }
        }
      }
    } catch (e) {
      console.error(`[MCP] Error reading stdout for ${this.name}:`, e);
    }
  }

  private async readStderr() {
    if (!this.proc || !this.proc.stderr || typeof this.proc.stderr === "number") return;
    const reader = this.proc.stderr.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const errText = decoder.decode(value).trim();
        if (errText) {
          console.warn(`[MCP Server ${this.name} stderr] ${errText}`);
        }
      }
    } catch {}
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

  async request(method: string, params: any = {}): Promise<any> {
    const stdin = this.proc?.stdin;
    if (!stdin || typeof stdin === "number") throw new Error("Server not running");
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      try {
        stdin.write(payload);
        stdin.flush();
      } catch (e) {
        this.pendingRequests.delete(id);
        reject(e);
      }
    });
  }

  notify(method: string, params: any = {}): void {
    const stdin = this.proc?.stdin;
    if (!stdin || typeof stdin === "number") return;
    const payload = JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n";
    try {
      stdin.write(payload);
      stdin.flush();
    } catch {}
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
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }
}
