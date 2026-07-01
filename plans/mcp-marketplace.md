# MCP Marketplace & Gallery para CrewFactory

## Motivacion

Los MCP (Model Context Protocol) servers son la forma moderna de darle herramientas
a agentes de IA. Windsurf, OpenCode, y Cursor ya tienen marketplaces integrados.
CrewFactory necesita:

1. Una galeria de MCPs populares para instalar con 1 click
2. Poder agregar MCPs custom (comando local o URL HTTP)
3. Que las tools de los MCPs se expongan al agente de IA del usuario

## Estado Actual

CrewFactory NO tiene ningun soporte MCP. El pi SDK (v0.79.9) no incluye MCP
(y declara explicitamente "No MCP" como decision de diseno). El unico MCP
existente es el tool interno del agente `pi` (`mcp` gateway), que NO esta
expuesto via la SDK publica.

Esto significa que hay que construir todo desde cero.

## Arquitectura

```
┌─────────────────────────────────────────────────────┐
│  Cliente React                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │  MCPMarketplacePage.tsx  ← Galeria + Custom     │ │
│  │  MCPSettings.tsx         ← Config por sesion    │ │
│  │  MCPCard.tsx             ← Card de MCP server   │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
         │ GET/POST /api/mcp/*
         ▼
┌─────────────────────────────────────────────────────┐
│  Servidor Hono                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │  routes/mcp.ts           ← REST endpoints       │ │
│  │  pi/mcp-manager.ts       ← MCP connection pool  │ │
│  │  pi/mcp-registry.ts      ← Catalogo de MCPs     │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
         │ @modelcontextprotocol/sdk
         ▼
┌─────────────────────────────────────────────────────┐
│  MCP Servers                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │
│  │ filesys  │ │  github  │ │ custom (stdio/http)  │ │
│  └──────────┘ └──────────┘ └──────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Stack

- **SDK**: `@modelcontextprotocol/sdk` (npm)
- **Transport**: `StdioClientTransport` (local) + `StreamableHTTPClientTransport` (remoto)
- **Persistencia**: JSON por usuario en `/tmp/crewfactory/{username}/mcp-servers.json`
- **Backend**: Bun + Hono (como el resto del server)
- **Frontend**: React + Tailwind CSS v4 + Framer Motion

## Componentes

### Backend

#### `apps/server/src/pi/mcp-types.ts` (NUEVO)
Tipos compartidos:

```typescript
type MCPTransportType = "stdio" | "http";

interface MCPServerConfig {
  id: string;
  name: string;
  description?: string;
  transport: MCPTransportType;
  // Para stdio (npx, uvx, node)
  command: string;       // "npx", "uvx", "node", etc
  args: string[];        // args del comando
  env?: Record<string, string>;  // env vars opcionales
  // Para HTTP
  url?: string;          // URL del servidor HTTP MCP
  // Metadata
  installed: boolean;
  enabled: boolean;
  isBuiltin: boolean;    // del catalogo oficial
  category?: string;
  icon?: string;
  tools?: string[];      // tools descubiertas
  status: "disconnected" | "connecting" | "connected" | "error";
  error?: string;
  lastConnected?: string;
}

interface MCPServerCatalog {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  url?: string;
  homepage?: string;
  source?: string;
  isHttp: boolean;
}
```

#### `apps/server/src/pi/mcp-manager.ts` (NUEVO)

Singleton que maneja el ciclo de vida de conexiones MCP:

```typescript
class MCPSessionManager {
  private connections = new Map<string, MCPConnection>();
  
  // Conectar un servidor MCP (stdio o HTTP)
  async connect(username: string, config: MCPServerConfig): Promise<void>;
  
  // Desconectar
  async disconnect(username: string, serverId: string): Promise<void>;
  
  // Listar tools disponibles de un servidor conectado
  async listTools(username: string, serverId: string): Promise<MCPToolDefinition[]>;
  
  // Ejecutar un tool
  async callTool(username: string, serverId: string, toolName: string, args: any): Promise<any>;
  
  // Obtener todos los servers configurados para un usuario
  getServers(username: string): MCPServerConfig[];
  
  // Guardar configuracion de servers
  saveServers(username: string, servers: MCPServerConfig[]): void;
  
  // Conectar todos los servers enabled al iniciar sesion
  async connectAllEnabled(username: string): Promise<void>;
  
  // Limpiar conexiones al cerrar sesion
  disconnectAll(username: string): void;
}
```

Cada `MCPConnection` internamente:

```typescript
interface MCPConnection {
  config: MCPServerConfig;
  client: Client;  // @modelcontextprotocol/sdk Client
  transport: StdioClientTransport | StreamableHTTPClientTransport;
  tools: MCPToolDefinition[];
  connected: boolean;
  error?: string;
}
```

#### `apps/server/src/pi/mcp-registry.ts` (NUEVO)

Catalogo oficial de MCPs populares:

```typescript
const MCP_CATALOG: MCPServerCatalog[] = [
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Acceso completo al filesystem: leer, escribir, editar archivos",
    category: "Developer Tools",
    icon: "📁",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
    env: {},
    homepage: "https://github.com/modelcontextprotocol/servers",
  },
  {
    id: "github",
    name: "GitHub",
    description: "Gestion de repos, issues, PRs, y codigo en GitHub",
    category: "Version Control",
    icon: "🐙",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_TOKEN: "$GITHUB_TOKEN" },
    homepage: "https://github.com/modelcontextprotocol/servers",
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "Consultas, esquemas, y administracion de bases de datos PostgreSQL",
    category: "Databases",
    icon: "🐘",
    command: "npx",
    args: ["-y", "@anthropic/server-postgres", "--connection-string", "$DATABASE_URL"],
    homepage: "https://github.com/anthropics/anthropic-quickstarts",
  },
  {
    id: "puppeteer",
    name: "Puppeteer",
    description: "Navegacion web, screenshots, y extraccion de contenido",
    category: "Web & Browser",
    icon: "🌐",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-puppeteer"],
    homepage: "https://github.com/modelcontextprotocol/servers",
  },
  {
    id: "memory",
    name: "Memory (Knowledge Graph)",
    description: "Memoria persistente con grafo de conocimiento para el agente",
    category: "Memory & Storage",
    icon: "🧠",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    homepage: "https://github.com/modelcontextprotocol/servers",
  },
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Busqueda web via Brave Search API",
    category: "Web & Browser",
    icon: "🔍",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    env: { BRAVE_API_KEY: "$BRAVE_API_KEY" },
    homepage: "https://github.com/modelcontextprotocol/servers",
  },
  {
    id: "mcp-find",
    name: "MCP Find",
    description: "Descubrimiento y busqueda de MCP servers en el catalogo global",
    category: "Discovery",
    icon: "🔎",
    command: "npx",
    args: ["-y", "@anthropic/server-mcpfind"],
    homepage: "https://mcpfind.org",
  },
  // ... mas servidores
];
```

Mas servidores candidatos:
- `sequelize` / `supabase` — DBs
- `slack` — Mensajeria
- `jira` — Project management
- `docker` — Containers
- `k8s` — Kubernetes
- `sentry` — Error tracking
- `cloudflare` — CDN/Workers
- `notion` — Docs
- `linear` — Issues
- `figma` — Design files
- `exa` / `tavily` — Web search APIs

#### `apps/server/src/routes/mcp.ts` (NUEVO)

REST API:

```
GET    /api/mcp/servers          → Listar servers configurados para el usuario
POST   /api/mcp/servers          → Agregar server custom
PUT    /api/mcp/servers/:id      → Actualizar config
DELETE /api/mcp/servers/:id      → Eliminar server
POST   /api/mcp/servers/:id/connect   → Conectar manualmente
POST   /api/mcp/servers/:id/disconnect → Desconectar
GET    /api/mcp/servers/:id/tools     → Listar tools del server
GET    /api/mcp/catalog          → Catalogo oficial de MCPs
POST   /api/mcp/catalog/:id/install  → Instalar desde catalogo
GET    /api/mcp/status           → Estado de todas las conexiones
```

#### `apps/server/src/pi/session-manager.ts` (MODIFICACION)

Al crear una sesion (`getOrCreateSession`), despues de crear el `AgentSession`:

```typescript
// Conectar todos los MCPs enabled del usuario
const mcpManager = getMCPSessionManager();
await mcpManager.connectAllEnabled(username);

// Registrar tools MCP como customTools en la sesion
const servers = mcpManager.getServers(username).filter(s => s.enabled);
for (const server of servers) {
  const tools = await mcpManager.listTools(username, server.id);
  for (const tool of tools) {
    session.registerCustomTool({...});
  }
}
```

### Frontend

#### `apps/client/src/pages/MCPMarketplacePage.tsx` (NUEVO)

Pagina principal con dos tabs:

1. **Marketplace**: Grid de cards con MCPs del catalogo oficial
   - Cada card: icono, nombre, descripcion, categoria, boton "Install" / "Configure"
   - Busqueda y filtro por categoria
   - Estado visual: not installed / installed + connected / error

2. **Custom MCPs**: Formulario para agregar MCPs arbitrarios
   - Selector de tipo: `stdio` vs `http`
   - Campos: nombre, comando + args (stdio) o URL (http)
   - Variables de entorno (pares key/value)
   - Boton "Test Connection" que prueba y descubre tools

#### `apps/client/src/components/mcp/MCPCard.tsx` (NUEVO)

```tsx
interface MCPCardProps {
  mcp: MCPServerConfig | MCPServerCatalog;
  installed?: boolean;
  connected?: boolean;
  onInstall?: () => void;
  onConfigure?: () => void;
  onToggle?: (enabled: boolean) => void;
}
```

Card con:
- Icono + nombre + categoria (badge)
- Descripcion breve
- Estado: pill verde "Connected" / rojo "Error" / gris "Not connected"
- Botones: Install / Configure / Toggle on/off
- Expandible para ver tools y configuracion

#### `apps/client/src/components/mcp/MCPCustomForm.tsx` (NUEVO)

Formulario para agregar MCP custom:

```tsx
interface MCPCustomFormProps {
  onSubmit: (config: MCPServerConfig) => void;
  onTest: (config: MCPServerConfig) => Promise<{ success: boolean; tools: string[]; error?: string }>;
}
```

#### `apps/client/src/components/sidebar/SessionSidebar.tsx` (MODIFICACION)

Agregar link a la pagina de MCPs en la navegacion (bajo "Settings" o como icono propio).

#### `apps/client/src/components/layout/AppRouter.tsx` (MODIFICACION)

Agregar ruta `/mcps` → `MCPMarketplacePage`.

### Integracion con el flujo de chat

Cuando un MCP esta conectado y habilitado:
1. El `MCPSessionManager` descubre sus tools via `client.listTools()`
2. Convierte cada tool MCP a un `ToolDefinition` del pi SDK
3. Las registra en la sesion del agente via `createAgentSession({ customTools: [...] })`
4. Cuando el LLM llama a un tool MCP, se enruta via MCP client al server

### Persistencia

```json
// /tmp/crewfactory/{username}/mcp-servers.json
{
  "servers": [
    {
      "id": "filesystem",
      "name": "Filesystem",
      "description": "Full filesystem access",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
      "installed": true,
      "enabled": true,
      "isBuiltin": true,
      "category": "Developer Tools",
      "tools": ["read_file", "write_file", "edit_file", "search_files", "list_directory"],
      "status": "connected"
    },
    {
      "id": "custom-mcp-1",
      "name": "Mi API MCP",
      "transport": "http",
      "url": "https://mi-api.com/mcp",
      "env": { "API_KEY": "sk-..." },
      "installed": true,
      "enabled": false,
      "isBuiltin": false,
      "status": "disconnected"
    }
  ]
}
```

## Plan de Implementacion

### Fase 1: Foundation
1. Instalar `@modelcontextprotocol/sdk`
2. Crear `mcp-types.ts` con todos los tipos compartidos
3. Crear `mcp-registry.ts` con catalogo de ~15 MCPs populares
4. Crear `mcp-manager.ts` con `MCPSessionManager` (connect, disconnect, listTools, callTool)

### Fase 2: API REST
5. Crear `routes/mcp.ts` con todos los endpoints REST
6. Registrar `mcpRouter` en `index.ts`
7. Persistencia a JSON por usuario

### Fase 3: Frontend
8. Crear `MCPMarketplacePage.tsx` (tabs Marketplace + Custom)
9. Crear `MCPCard.tsx`
10. Crear `MCPCustomForm.tsx`
11. Agregar ruta `/mcps` en AppRouter
12. Agregar link en SessionSidebar

### Fase 4: Integracion con Sesiones
13. Modificar `session-manager.ts` para conectar MCPs y registrar tools
14. Verificar que tools MCP aparecen en el chat y funcionan

### Fase 5: Polish
15. Estados de conexion en vivo (conectar/desconectar via WS o pooling)
16. Testing de tools MCP reales (filesystem, github, etc.)
17. Manejo de errores y reconexion
18. Confirmar que funciona en Docker (npx debe estar disponible)

## Dependencias

- `@modelcontextprotocol/sdk` — MCP client SDK
- Tipos ya existentes en el proyecto (shared schemas)
- Componentes existentes: `SettingsPage` como referencia de layout

## Riesgos

- **npx en Docker**: los MCPs stdio usan `npx`, que requiere Node.js y acceso a npm registry en el contenedor. Verificar que el Dockerfile tenga Node.js y npm.
- **Seguridad**: un MCP con filesystem access podria leakear archivos entre usuarios. Asegurarse de scoping por usuario (chroot?).
- **Puertos**: MCPs HTTP necesitan URLs accesibles desde el servidor. Podria haber problemas de red en Docker.
- **Dependencia de runtime**: algunos MCPs necesitan Python (`uvx`), otros Node.js. Limitar los del catalogo a los que usan `npx` inicialmente.
- **Reconexion**: si un proceso MCP muere (OOM, crash), hay que detectarlo y reconectarlo.
- **Tools duplicadas**: si dos MCPs registran tools con el mismo nombre, hay namespacing.
- **Costo de inicio**: cada MCP stdio spawns un proceso. Muchos MCPs = muchos procesos hijo.

## Referencias

- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/TypeScript-sdk)
- [MCP Client Tutorial](https://modelcontextprotocol.io/tutorials/building-a-client-node)
- [MCP Servers (oficial)](https://github.com/modelcontextprotocol/servers)
- [MCPFind - Catalogo global](https://mcpfind.org)
- [Windsurf MCP Integration](https://docs.windsurf.com/plugins/cascade/mcp)
- [Pi SDK Extensions (para referencia de custom tools)](../../node_modules/@earendil-works/pi-coding-agent/docs/extensions.md)
- Ejemplo de custom tool en pi SDK: `examples/extensions/provider-payload.ts`
