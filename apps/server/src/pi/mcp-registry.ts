import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { McpClient } from "./mcp-client.js";
import type { McpServerConfig, McpConfig, McpCatalogItem } from "shared";

export const MCP_CATALOG: McpCatalogItem[] = [
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Acceso completo al filesystem: leer, escribir y editar archivos de forma segura dentro del workspace",
    category: "Developer Tools",
    icon: "📁",
    command: "bunx",
    args: ["@modelcontextprotocol/server-filesystem", "$WORKSPACE_DIR"],
    homepage: "https://github.com/modelcontextprotocol/servers",
    isHttp: false,
  },
  {
    id: "github",
    name: "GitHub",
    description: "Gestión de repositorios, issues, pull requests y búsqueda de código en GitHub",
    category: "Version Control",
    icon: "🐙",
    command: "bunx",
    args: ["@modelcontextprotocol/server-github"],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: "",
    },
    homepage: "https://github.com/modelcontextprotocol/servers",
    isHttp: false,
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "Consultas, lectura de esquemas e inspección de bases de datos PostgreSQL",
    category: "Databases",
    icon: "🐘",
    command: "bunx",
    args: ["@anthropic/server-postgres", "--connection-string", "$DATABASE_URL"],
    homepage: "https://github.com/anthropics/anthropic-quickstarts",
    isHttp: false,
  },
  {
    id: "sqlite",
    name: "SQLite",
    description: "Consultas, lectura de esquemas y manipulación de bases de datos SQLite locales (.sqlite)",
    category: "Databases",
    icon: "💾",
    command: "bunx",
    args: ["@modelcontextprotocol/server-sqlite", "--db-path", "$WORKSPACE_DIR/database.sqlite"],
    homepage: "https://github.com/modelcontextprotocol/servers",
    isHttp: false,
  },

  {
    id: "memory",
    name: "Memory Graph",
    description: "Base de conocimientos y grafo de memoria semántica de larga duración para el agente",
    category: "Memory & Storage",
    icon: "🧠",
    command: "bunx",
    args: ["@modelcontextprotocol/server-memory"],
    homepage: "https://github.com/modelcontextprotocol/servers",
    isHttp: false,
  },
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Búsqueda web general en vivo para obtener información externa actualizada",
    category: "Web & Browser",
    icon: "🔍",
    command: "bunx",
    args: ["@modelcontextprotocol/server-brave-search"],
    env: {
      BRAVE_API_KEY: "",
    },
    homepage: "https://github.com/modelcontextprotocol/servers",
    isHttp: false,
  },
  {
    id: "tavily",
    name: "Tavily Search",
    description: "Búsqueda web optimizada para LLMs con respuestas y fuentes estructuradas",
    category: "Web & Browser",
    icon: "⚡",
    command: "bunx",
    args: ["@modelcontextprotocol/server-tavily"],
    env: {
      TAVILY_API_KEY: "",
    },
    homepage: "https://github.com/modelcontextprotocol/servers",
    isHttp: false,
  },
  {
    id: "fetch",
    name: "Web Fetch",
    description: "Descarga contenido web de URLs, convirtiendo HTML a Markdown simplificado para el agente",
    category: "Web & Browser",
    icon: "📥",
    command: "bunx",
    args: ["@modelcontextprotocol/server-fetch"],
    homepage: "https://github.com/modelcontextprotocol/servers",
    isHttp: false,
  },
  {
    id: "linear",
    name: "Linear",
    description: "Gestión de tickets, búsquedas, actualizaciones e issues en Linear",
    category: "Productivity",
    icon: "📐",
    command: "bunx",
    args: ["@modelcontextprotocol/server-linear"],
    env: {
      LINEAR_API_KEY: "",
    },
    homepage: "https://github.com/modelcontextprotocol/servers",
    isHttp: false,
  },
  {
    id: "jira",
    name: "Jira",
    description: "Búsqueda, creación y actualización de issues y proyectos en Jira",
    category: "Productivity",
    icon: "🎫",
    command: "bunx",
    args: ["@modelcontextprotocol/server-jira"],
    env: {
      JIRA_API_TOKEN: "",
      JIRA_EMAIL: "",
      JIRA_HOST: "",
    },
    homepage: "https://github.com/modelcontextprotocol/servers",
    isHttp: false,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Enviar mensajes, unirse a canales y buscar conversaciones en Slack",
    category: "Productivity",
    icon: "💬",
    command: "bunx",
    args: ["@modelcontextprotocol/server-slack"],
    env: {
      SLACK_BOT_TOKEN: "",
    },
    homepage: "https://github.com/modelcontextprotocol/servers",
    isHttp: false,
  },
  {
    id: "gdrive",
    name: "Google Drive",
    description: "Búsqueda, lectura y descarga de archivos y carpetas en Google Drive",
    category: "Productivity",
    icon: "▲",
    command: "bunx",
    args: ["@modelcontextprotocol/server-gdrive"],
    homepage: "https://github.com/modelcontextprotocol/servers",
    isHttp: false,
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Buscar, leer, redactar y enviar correos electrónicos de Gmail",
    category: "Productivity",
    icon: "✉️",
    command: "bunx",
    args: ["@modelcontextprotocol/server-gmail"],
    homepage: "https://github.com/modelcontextprotocol/servers",
    isHttp: false,
  },

];

export class McpRegistry {
  private activeClients = new Map<string, McpClient[]>(); // key = `${username}:${sessionId}`
  private globalClients = new Map<string, McpClient>(); // key = `${username}:${serverId}` for test/manual connections

  private getConfigFile(username: string): string {
    return join("/tmp/crewfactory", username, "mcp-servers.json");
  }

  getDefaultConfig(username: string): McpConfig {
    const userWorkspace = join("/tmp/crewfactory", username, "workspace");
    return {
      mcpServers: {
        filesystem: {
          id: "filesystem",
          name: "Filesystem",
          description: "Acceso completo al filesystem: leer, escribir y editar archivos de forma segura dentro del workspace",
          transport: "stdio",
          command: "bunx",
          args: ["@modelcontextprotocol/server-filesystem", userWorkspace],
          installed: true,
          enabled: true,
          isBuiltin: true,
          category: "Developer Tools",
          icon: "📁",
          status: "disconnected",
          tools: [],
        },
        github: {
          id: "github",
          name: "GitHub",
          description: "Gestión de repositorios, issues, pull requests y búsqueda de código en GitHub",
          transport: "stdio",
          command: "bunx",
          args: ["@modelcontextprotocol/server-github"],
          env: {
            GITHUB_PERSONAL_ACCESS_TOKEN: "",
          },
          installed: true,
          enabled: false,
          isBuiltin: true,
          category: "Version Control",
          icon: "🐙",
          status: "disconnected",
          tools: [],
        },
      },
    };
  }

  loadConfig(username: string): McpConfig {
    const path = this.getConfigFile(username);
    const oldPath = join("/tmp/crewfactory", username, "mcp-config.json");
    let config: McpConfig | null = null;

    if (existsSync(path)) {
      try {
        config = JSON.parse(readFileSync(path, "utf-8")) as McpConfig;
      } catch {}
    } else if (existsSync(oldPath)) {
      try {
        const oldConfig = JSON.parse(readFileSync(oldPath, "utf-8"));
        if (oldConfig && oldConfig.mcpServers) {
          config = oldConfig as McpConfig;
          this.saveConfig(username, config);
        }
      } catch {}
    }

    if (!config) {
      config = this.getDefaultConfig(username);
      this.saveConfig(username, config);
      return config;
    }

    // Ensure default servers are present
    const def = this.getDefaultConfig(username);
    let changed = false;
    for (const [key, val] of Object.entries(def.mcpServers)) {
      if (!config.mcpServers[key]) {
        config.mcpServers[key] = val;
        changed = true;
      }
    }

    // Auto-migrate old configurations from npx to bunx
    for (const [key, srv] of Object.entries(config.mcpServers)) {
      const catalogItem = MCP_CATALOG.find(c => c.id === key);
      if (srv.isBuiltin && srv.command === "npx" && catalogItem) {
        srv.command = "bunx";
        const userWorkspace = join("/tmp/crewfactory", username, "workspace");
        srv.args = catalogItem.args?.map(arg => 
          arg.replace("$WORKSPACE_DIR", userWorkspace)
        ) || [];
        changed = true;
        console.log(`[MCP Migration] Migrated server ${key} config to bunx.`);
      }
    }

    if (changed) {
      this.saveConfig(username, config);
    }

    return config;
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
    const tools: any[] = [];
    let configChanged = false;

    const enabledServers = Object.entries(config.mcpServers).filter(([_, srv]) => srv.enabled);

    const results = await Promise.all(
      enabledServers.map(async ([name, srv]) => {
        const serverTools: any[] = [];
        const key = `${username}:${name}`;
        let client = this.globalClients.get(key);

        // Lazily connect the global server if it isn't running already
        if (!client) {
          const userWorkspace = join("/tmp/crewfactory", username, "workspace");
          const processedArgs = srv.args?.map(arg => 
            arg.replace("$WORKSPACE_DIR", userWorkspace)
          ) || [];

          client = new McpClient(srv.id, { ...srv, args: processedArgs, enabled: true });
          try {
            await client.start();
            this.globalClients.set(key, client);

            const mcpTools = await client.listTools();
            srv.status = "connected";
            srv.tools = mcpTools.map(t => t.name);
            srv.error = undefined;
            configChanged = true;
          } catch (e: any) {
            console.error(`[MCP Lazy Connect] Failed to connect global client ${name}:`, e);
            srv.status = "error";
            srv.error = e.message || String(e);
            configChanged = true;
            return [];
          }
        }

        // Fetch tools from the active global client and map them to session tools
        try {
          const mcpTools = await client.listTools();
          for (const t of mcpTools) {
            serverTools.push({
              name: `mcp_${name}_${t.name}`,
              label: `MCP ${name} - ${t.name}`,
              description: `${t.description || ""} (MCP tool from ${name})`,
              parameters: t.inputSchema,
              execute: async (toolCallId: string, params: any) => {
                const activeClient = this.globalClients.get(key);
                if (!activeClient) throw new Error(`MCP Server ${name} is not connected`);
                
                const res = await activeClient.callTool(t.name, params);
                if (res.isError) {
                  const errText = res.content?.[0]?.text || JSON.stringify(res);
                  throw new Error(errText);
                }
                const content: any[] = [];
                if (Array.isArray(res.content)) {
                  for (const c of res.content) {
                    if (c.type === "text") {
                      content.push({ type: "text", text: c.text });
                    } else if (c.type === "image") {
                      content.push({
                        type: "image",
                        data: c.data,
                        mimeType: c.mimeType || "image/png",
                      });
                    } else {
                      content.push({ type: "text", text: JSON.stringify(c) });
                    }
                  }
                } else {
                  content.push({ type: "text", text: JSON.stringify(res) });
                }
                if (content.length === 0) {
                  content.push({ type: "text", text: "Success" });
                }
                return {
                  content,
                  details: res,
                };
              },
            });
          }
        } catch (e) {
          console.error(`[MCP] Failed to list tools from global client ${name}:`, e);
        }

        return serverTools;
      })
    );

    for (const serverTools of results) {
      tools.push(...serverTools);
    }

    if (configChanged) {
      this.saveConfig(username, config);
    }

    return tools;
  }

  stopSessionMcpTools(username: string, sessionId: string): void {
    // Session-level clients are now shared globally per user to optimize resources.
    // Process cleanup is handled globally at application exit or server disconnect.
  }

  async testConnection(username: string, serverConfig: McpServerConfig): Promise<{ success: boolean; tools: string[]; error?: string }> {
    const userWorkspace = join("/tmp/crewfactory", username, "workspace");
    const processedArgs = serverConfig.args?.map(arg => 
      arg.replace("$WORKSPACE_DIR", userWorkspace)
    ) || [];

    const processedConfig = {
      ...serverConfig,
      args: processedArgs,
      enabled: true,
    };

    const client = new McpClient(serverConfig.id, processedConfig);
    try {
      await client.start();
      const mcpTools = await client.listTools();
      const tools = mcpTools.map(t => t.name);
      client.stop();

      // Persist fresh tools to user's saved config if this server is registered
      const config = this.loadConfig(username);
      if (config.mcpServers[serverConfig.id]) {
        config.mcpServers[serverConfig.id].tools = tools;
        config.mcpServers[serverConfig.id].error = undefined;
        this.saveConfig(username, config);
      }

      return { success: true, tools };
    } catch (e: any) {
      const errorMsg = e.message || String(e);
      // Persist connection failure detail to user's saved config
      const config = this.loadConfig(username);
      if (config.mcpServers[serverConfig.id]) {
        config.mcpServers[serverConfig.id].error = errorMsg;
        this.saveConfig(username, config);
      }
      return { success: false, tools: [], error: errorMsg };
    }
  }

  async connectGlobalServer(username: string, serverId: string): Promise<void> {
    const config = this.loadConfig(username);
    const srv = config.mcpServers[serverId];
    if (!srv) throw new Error("Server not found in user config");

    const key = `${username}:${serverId}`;
    const existing = this.globalClients.get(key);
    if (existing) {
      existing.stop();
      this.globalClients.delete(key);
    }

    const userWorkspace = join("/tmp/crewfactory", username, "workspace");
    const processedArgs = srv.args?.map(arg => 
      arg.replace("$WORKSPACE_DIR", userWorkspace)
    ) || [];

    try {
      const client = new McpClient(srv.id, { ...srv, args: processedArgs, enabled: true });
      await client.start();

      const mcpTools = await client.listTools();
      srv.status = "connected";
      srv.tools = mcpTools.map(t => t.name);
      srv.error = undefined;

      this.globalClients.set(key, client);
      this.saveConfig(username, config);
    } catch (e: any) {
      const errorMsg = e.message || String(e);
      console.error(`[MCP Global Connect] Connection failed for ${serverId}:`, errorMsg);
      srv.status = "error";
      srv.error = errorMsg;
      this.saveConfig(username, config);
      throw e;
    }
  }

  disconnectGlobalServer(username: string, serverId: string): void {
    const key = `${username}:${serverId}`;
    const client = this.globalClients.get(key);
    if (client) {
      client.stop();
      this.globalClients.delete(key);
    }

    const config = this.loadConfig(username);
    const srv = config.mcpServers[serverId];
    if (srv) {
      srv.status = "disconnected";
      this.saveConfig(username, config);
    }
  }

  disconnectAllGlobal(username: string): void {
    for (const [key, client] of this.globalClients.entries()) {
      if (key.startsWith(`${username}:`)) {
        client.stop();
        this.globalClients.delete(key);
      }
    }
  }

  stopAll(): void {
    console.log("[MCP] Stopping all active MCP clients and connections...");
    for (const client of this.globalClients.values()) {
      client.stop();
    }
    this.globalClients.clear();

    for (const clients of this.activeClients.values()) {
      for (const client of clients) {
        client.stop();
      }
    }
    this.activeClients.clear();
    console.log("[MCP] All MCP client subprocesses stopped.");
  }
}

export const mcpRegistry = new McpRegistry();

// Process exit handlers to prevent zombie subprocesses
process.on("SIGINT", () => {
  mcpRegistry.stopAll();
  process.exit(0);
});

process.on("SIGTERM", () => {
  mcpRegistry.stopAll();
  process.exit(0);
});

