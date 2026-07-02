import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { McpClient, type McpServerConfig } from "./mcp-client.js";

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

export class McpRegistry {
  private activeClients = new Map<string, McpClient[]>(); // key = `${username}:${sessionId}`

  private getConfigFile(username: string): string {
    return join("/tmp/crewfactory", username, "mcp-config.json");
  }

  getDefaultConfig(username: string): McpConfig {
    const userWorkspace = join("/tmp/crewfactory", username, "workspace");
    return {
      mcpServers: {
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", userWorkspace],
          enabled: true,
        },
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: {
            GITHUB_PERSONAL_ACCESS_TOKEN: "",
          },
          enabled: false,
        },
      },
    };
  }

  loadConfig(username: string): McpConfig {
    const path = this.getConfigFile(username);
    if (!existsSync(path)) {
      const def = this.getDefaultConfig(username);
      this.saveConfig(username, def);
      return def;
    }
    try {
      const data = JSON.parse(readFileSync(path, "utf-8")) as McpConfig;
      // Ensure default keys exist
      const def = this.getDefaultConfig(username);
      for (const [key, val] of Object.entries(def.mcpServers)) {
        if (!data.mcpServers[key]) {
          data.mcpServers[key] = val;
        }
      }
      return data;
    } catch {
      return this.getDefaultConfig(username);
    }
  }

  saveConfig(username: string, config: McpConfig): void {
    const path = this.getConfigFile(username);
    const dir = join("/tmp/crewfactory", username);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(path, JSON.stringify(config, null, 2), "utf-8");
  }

  async getSessionMcpTools(username: string, sessionId: string): Promise<any[]> {
    const config = this.loadConfig(username);
    const clients: McpClient[] = [];
    const tools: any[] = [];

    for (const [name, srv] of Object.entries(config.mcpServers)) {
      if (srv.enabled) {
        const client = new McpClient(name, srv);
        await client.start();
        clients.push(client);

        const mcpTools = await client.listTools();
        for (const t of mcpTools) {
          tools.push({
            name: `mcp_${name}_${t.name}`,
            description: `${t.description} (MCP tool from ${name})`,
            inputSchema: t.inputSchema,
            execute: async (args: any) => {
              const res = await client.callTool(t.name, args);
              if (res.isError) {
                throw new Error(res.content?.[0]?.text || "MCP tool execution failed");
              }
              const text = res.content?.[0]?.text;
              if (text !== undefined) return text;
              return JSON.stringify(res);
            },
          });
        }
      }
    }

    if (clients.length > 0) {
      this.activeClients.set(`${username}:${sessionId}`, clients);
    }

    return tools;
  }

  stopSessionMcpTools(username: string, sessionId: string): void {
    const key = `${username}:${sessionId}`;
    const clients = this.activeClients.get(key);
    if (clients) {
      for (const client of clients) {
        client.stop();
      }
      this.activeClients.delete(key);
      console.log(`[MCP] Stopped all MCP servers for session: ${key}`);
    }
  }
}

export const mcpRegistry = new McpRegistry();
