COMPLETED
# Scoping de Agentes y Tools por Canal/Proyecto

**Tipo:** Arquitectura / Feature
**Fecha:** 2026-07-14
**Estado:** Completado

---

## Resumen Ejecutivo

Actualmente en CrewFactory todos los agentes son **globales** (un solo registry plano por usuario) y todas las tools (incluyendo custom tools) estan disponibles para **todos los agentes** sin distincion. Esto limita la capacidad de crear ecosistemas multi-proyecto aislados donde cada canal/proyecto tenga sus propios agentes especializados con herramientas exclusivas.

Este plan propone dos mecanismos complementarios:

1. **Agentes de ambito (`scopedAgents`)** -- Agentes que pertenecen a un canal o proyecto en lugar de ser globales. Se almacenan bajo el directorio del padre, se listan solo en su contexto, y se eliminan en cascada con su padre.

2. **Tools de ambito (`scopedTools`)** -- Tools personalizadas cuyo alcance se restringe a agentes, canales o proyectos especificos. Se almacenan con metadatos de scope y se filtran en tiempo de ensamblaje de sesion.

---

## 1. Motivacion y Casos de Uso

### 1.1 Agentes de Canal/Proyecto

**Problema:** Hoy, si creas 3 canales (ej: "ecommerce-web", "mobile-app", "data-pipeline"), todos los agentes aparecen mezclados en el listado global. No hay forma de decir "este agente solo pertenece al canal ecommerce-web".

**Casos de uso:**
- Un canal `autoconsulting` necesita 6 agentes especializados que solo existen dentro de ese canal
- Un proyecto `saas-habitos` tiene sus propios agentes de backend/frontend que no deben aparecer en otros proyectos
- Al duplicar un canal, sus agentes de ambito se duplican con el
- Al eliminar un canal, sus agentes de ambito se limpian automaticamente

### 1.2 Tools de Agente Especifico

**Problema:** Hoy las custom tools son globales por usuario. Si creas una tool `deploy_to_production`, cualquier agente puede invocarla. No hay forma de restringir "solo el Tech Lead puede hacer deploy".

**Casos de uso:**
- Solo el agente `ceo-business` puede ejecutar `approve_budget`
- Solo el agente `qa-engineer` puede ejecutar `run_e2e_suite` y `capture_screenshots`
- Solo el agente `marketing-specialist` puede ejecutar `post_to_twitter` y `generate_social_card`
- Un proyecto tiene tools de base de datos que solo sus agentes de backend pueden usar

---

## 2. Arquitectura Propuesta

### 2.1 Modelo de Datos: Agentes de Ambito

Se extiende el schema `AgentDefinition` con un campo opcional `scope`:

```typescript
// En AgentDefinitionSchema (schemas.ts)
scope: z.object({
  type: z.enum(["channel", "project"]),
  id: z.string(),
}).optional(),
```

**Almacenamiento en disco:**

```
# Global (como hoy)
/app/data/users/{username}/agents/{agentId}/
  definition.json
  workspace/
  sessions/

# Scoped a un canal
/app/data/users/{username}/channels/{channelId}/agents/{agentId}/
  definition.json
  workspace/
  sessions/

# Scoped a un proyecto
/app/data/users/{username}/projects/{projectId}/agents/{agentId}/
  definition.json
  workspace/
  sessions/
```

**Path helpers nuevos** (en `packages/shared/src/paths.ts`):

```typescript
function getScopedAgentDir(
  username: string,
  parentType: "channels" | "projects",
  parentId: string,
  agentId: string
): string {
  return join(
    getUserDir(username),
    parentType,
    parentId,
    "agents",
    agentId
  );
}
```

### 2.2 Registro de Agentes de Ambito

**`AgentRegistry`** (en `agent-registry.ts`) se extiende para:

- Aceptar `scope` opcional en `register()`
- Almacenar agentes scoped en mapas separados o con key compuesta `{parentType}:{parentId}:{agentId}`
- `list(username)` filtra agentes globales (sin scope) por defecto
- Nuevo metodo `listScoped(username, parentType, parentId)` para listar agentes de un ambito
- `get(username, agentId)` busca primero global, luego scoped (con ambiguedad resuelta por contexto)
- Nuevo metodo `getScoped(username, parentType, parentId, agentId)` para acceso directo

**Boot-time init**: El `agentRegistry.init()` escanea tambien `*/channels/*/agents/*/definition.json` y `*/projects/*/agents/*/definition.json` para recargar agentes scoped.

**Factory contract**: Se extiende `FACTORY_CONTRACTS["agents"]` con un parametro opcional `scope` en `upsert`.

### 2.3 API Routes

**Nuevos endpoints** (en `routes/agents.ts` o `routes/channels.ts`):

```
# Crear agente scoped a un canal
POST /api/channels/:channelId/agents
  Body: AgentDefinition (sin id obligatorio, se genera auto)
  Response: { agent: AgentInfo }

# Listar agentes de un canal
GET /api/channels/:channelId/agents
  Response: { agents: AgentInfo[] }

# CRUD de agente scoped
GET /api/channels/:channelId/agents/:agentId
PATCH /api/channels/:channelId/agents/:agentId
DELETE /api/channels/:channelId/agents/:agentId

# Analogos para proyectos
POST /api/projects/:projectId/agents
GET /api/projects/:projectId/agents
GET /api/projects/:projectId/agents/:agentId
PATCH /api/projects/:projectId/agents/:agentId
DELETE /api/projects/:projectId/agents/:agentId
```

### 2.4 Modelo de Datos: Tools de Ambito

Se extiende el schema `CustomToolDefinition` con un campo opcional `scope`:

```typescript
// En CustomToolDefinition (custom-tools/schemas.ts)
scope: z.object({
  type: z.enum(["agent", "channel", "project"]),
  id: z.string(),
}).optional(),
```

**Almacenamiento en disco:** Se mantiene la estructura actual (`<userDir>/custom-tools/`) pero cada tool puede tener opcionalmente `scope`. Tambien se podria almacenar en el directorio del ambito:

```
# Tool scoped a un agente (opcion A: en custom-tools global con scope)
/app/data/users/{username}/custom-tools/
  _index.json
  deploy_to_prod.json      # scope: { type: "agent", id: "tech-lead" }
  run_e2e.json             # scope: { type: "agent", id: "qa-engineer" }
  global_tool.json         # sin scope (global)

# Tool scoped a un agente (opcion B: en el directorio del agente)
/app/data/users/{username}/agents/{agentId}/tools/
  my_secret_tool.json

# Tool scoped a un canal
/app/data/users/{username}/channels/{channelId}/tools/
  channel_tool.json
```

**Recomendacion:** Usar **Opcion A** (mismo storage, campo `scope` en la definicion) por simplicidad, y migrar a Opcion B en el futuro si se necesita aislamiento fisico.

### 2.5 Filtrado de Tools en SessionToolFactory

En `SessionToolFactory.createSessionTools()` se modifican 2 puntos:

1. **Carga de custom tools** (lines 102-110 actuales): Al cargar tools desde `CustomToolStorage.loadAll()`, filtrar:
   - Tools sin scope: se cargan siempre (como hoy)
   - Tools con scope: solo se cargan si el `agentId` actual (o `channelId`/`projectId`) coincide con el scope

2. **Inyeccion en la sesion**: Al crear la sesion, propagar el `agentId` (y `channelId`/`projectId`) para que el filtro pueda evaluarse.

**Firma modificada** de `createSessionTools()`:

```typescript
createSessionTools(opts: {
  username: string;
  workspaceDir: string;
  userEnv?: Record<string, string>;
  isSubagent?: boolean;
  resolvedAgentId?: string;
  // Nuevos: contexto de scope
  contextAgentId?: string;    // El ID del agente que ejecuta (para scoped tools)
  channelId?: string;         // Canal actual (para scoped tools de canal)
  projectName?: string;       // Proyecto actual (para scoped tools de proyecto)
}): Promise<AgentTool[]>
```

### 2.6 Interfaz de Usuario (Frontend)

**Para agentes scoped:**

- En `ChannelDetailPage` o `AgentsPage` dentro de un canal: nueva pestana o seccion "Agentes del Canal"
- Los agentes scoped NO aparecen en el `SessionSidebar` global ni en `AgentsPage` global
- En el `OrgChart` del canal, los agentes scoped aparecen con un indicador visual (badge "local")
- El `RegisterModal` permite seleccionar ambito: "Global" | "Canal: {name}" | "Proyecto: {name}"

**Para tools scoped:**

- En la interfaz de custom tools (si existe): mostrar columna "Scope" con el ambito asignado
- En la configuracion del agente: pestana "Tools" que muestra que tools tiene disponibles y permite asignar/desasignar
- Tooltip en el selector de tools del chat indicando "Tool exclusiva de {agentName}"

---

## 3. Cambios Detallados por Archivo

### 3.1 Backend - Path Helpers

| Archivo | Cambio |
|---------|--------|
| `packages/shared/src/paths.ts` | Anadir `getScopedAgentDir()`, `getScopedToolsDir()` |

### 3.2 Backend - Schemas y Tipos

| Archivo | Cambio |
|---------|--------|
| `packages/shared/src/schemas.ts` | Extender `AgentDefinitionSchema` con `scope` opcional |
| `apps/server/src/core/custom-tools/schemas.ts` | Extender `CustomToolDefinitionSchema` con `scope` opcional |
| `packages/shared/src/index.ts` | Re-exportar nuevos tipos |

### 3.3 Backend - Agent Registry

| Archivo | Cambio |
|---------|--------|
| `apps/server/src/agents/agent-registry.ts` | Soportar `scope` en `register()`, nuevos metodos `listScoped()`/`getScoped()`, init escanea subdirectorios |
| `apps/server/src/agents/types.ts` | Extender `AgentEntry` con `scope?` |

### 3.4 Backend - API Routes

| Archivo | Cambio |
|---------|--------|
| `apps/server/src/routes/channels.ts` | Anadir endpoints `/api/channels/:channelId/agents/*` |
| `apps/server/src/routes/projects.ts` | Anadir endpoints `/api/projects/:projectId/agents/*` |
| `apps/server/src/routes/agents.ts` | Modificar `GET /` para filtrar por ambito (query param `scope=global`) |

### 3.5 Backend - Custom Tools Storage

| Archivo | Cambio |
|---------|--------|
| `apps/server/src/core/custom-tools/storage.ts` | Anadir `loadScoped(username, scopeType, scopeId)`, modificar `loadAll()` para incluir scope |
| `apps/server/src/core/custom-tools/index.ts` | Re-exportar nuevos metodos |

### 3.6 Backend - Session Tool Factory

| Archivo | Cambio |
|---------|--------|
| `apps/server/src/core/session/tool-factory.ts` | Aceptar `contextAgentId`, `channelId`, `projectName`; filtrar custom tools por scope |
| `apps/server/src/core/session-manager.ts` | Propagar contexto de scope a `createSessionTools()` |
| `apps/server/src/agents/create-agent-server.ts` | Propagar `agentId` como `contextAgentId` |

### 3.7 Backend - Factory Tool

| Archivo | Cambio |
|---------|--------|
| `apps/server/src/core/tools/factory-contracts.ts` | Anadir `scope` param a contract de `agents` y extender contrato de custom tools |
| `apps/server/src/core/tools/factory-tool.ts` | Soportar `scope` en `handleAgents()`, nuevo handler o extension para scoped custom tools |

### 3.8 Frontend - Hooks y Componentes

| Archivo | Cambio |
|---------|--------|
| `apps/client/src/hooks/useAgents.ts` | Nuevo hook `useChannelAgents(channelId)` o extender con filtro |
| `apps/client/src/components/sidebar/SessionSidebar.tsx` | No mostrar agentes scoped (solo globales) |
| `apps/client/src/pages/AgentsPage.tsx` | Filtro "Global" / "Por Canal" / "Por Proyecto" |
| `apps/client/src/components/agents/RegisterModal.tsx` | Selector de ambito en el formulario |

### 3.9 Backend - Cascade Delete

| Archivo | Cambio |
|---------|--------|
| `apps/server/src/routes/channels.ts` (DELETE) | Antes de eliminar canal, eliminar todos sus agentes scoped |
| `apps/server/src/routes/projects.ts` (DELETE) | Antes de eliminar proyecto, eliminar todos sus agentes scoped |

---

## 4. Consideraciones de Diseno

### 4.1 Unicidad de IDs

- **Agentes globales**: ID unico en todo el usuario (como hoy)
- **Agentes scoped**: ID unico dentro del padre (canal/proyecto). La key compuesta es `{parentType}:{parentId}:{agentId}`
- En el frontend, el routing debe incluir el scope: `/channels/{channelId}/agents/{agentId}/...`

### 4.2 Migracion de Datos

No se requiere migracion porque es additive: los agentes existentes sin `scope` siguen siendo globales. Los nuevos agentes pueden crearse con o sin scope.

### 4.3 Canal Autoconsulting

Con esta arquitectura, el blueprint del canal `autoconsulting` podria crear automaticamente sus 6 agentes scoped al canal al instalarse. Esto hace que el canal sea **auto-contenido**: no contamina el listado global de agentes y se limpia solo al eliminar el canal.

### 4.4 Herencia de Tools de Ambito

Reglas de herencia:
- Un agente **global** solo ve tools globales (sin scope)
- Un agente **scoped a canal** ve: tools globales + tools scoped a ese canal + tools scoped a ese agente
- Un agente **scoped a proyecto** ve: tools globales + tools scoped a ese proyecto + tools scoped a ese agente
- Un canal como entidad (en `ChannelOrchestrator`) no tiene tools propias, solo las de sus miembros

### 4.5 Visualizacion en el Arbol de Archivos

Propuesta de estructura visual para la sidebar:
```
Agentes Globales
  ├── frontend-designer
  ├── sysadmin
  └── ...

Canales
  ├── autoconsulting
  │   ├── Chat
  │   ├── Organigrama
  │   └── Agentes
  │       ├── ceo-business (local)
  │       ├── tech-lead (local)
  │       ├── backend-dev (local)
  │       ├── frontend-dev (local)
  │       ├── qa-engineer (local)
  │       └── marketing-specialist (local)
  └── ...
```

---

## 5. Plan de Implementacion (Phases)

### Phase 1: Extender Schemas y Tipos
- [ ] 1.1 Anadir campo `scope` a `AgentDefinitionSchema`
- [ ] 1.2 Anadir campo `scope` a `CustomToolDefinitionSchema`
- [ ] 1.3 Anadir path helpers para scoped agents y tools
- [ ] 1.4 Re-exportar nuevos tipos

### Phase 2: Backend - Agentes Scoped
- [ ] 2.1 Modificar `AgentRegistry` para soportar scope
- [ ] 2.2 Implementar `listScoped()` y `getScoped()`
- [ ] 2.3 Anadir rutas `/api/channels/:id/agents/*`
- [ ] 2.4 Anadir rutas `/api/projects/:id/agents/*`
- [ ] 2.5 Implementar cascade delete al eliminar canal/proyecto
- [ ] 2.6 Extender factory contract de agents con scope

### Phase 3: Backend - Tools Scoped
- [ ] 3.1 Modificar `CustomToolStorage` para almacenar/cargar con scope
- [ ] 3.2 Modificar `SessionToolFactory.createSessionTools()` para filtrar por scope
- [ ] 3.3 Propagar contexto de scope desde session-manager y create-agent-server

### Phase 4: Frontend
- [ ] 4.1 Crear hooks `useChannelAgents()` y `useProjectAgents()`
- [ ] 4.2 Agregar seccion "Agentes del Canal" en `ChannelDetailPage`
- [ ] 4.3 Agregar seccion "Agentes del Proyecto" en vista de proyecto
- [ ] 4.4 Modificar `RegisterModal` con selector de ambito
- [ ] 4.5 Filtrar agentes scoped del listado global
- [ ] 4.6 Mostrar indicador de tools scoped en UI

### Phase 5: Validacion
- [ ] 5.1 Probar compilacion TypeScript estricta
- [ ] 5.2 Probar creacion de agente scoped a canal
- [ ] 5.3 Probar que tools scoped solo aparecen en el agente correcto
- [ ] 5.4 Probar cascade delete
- [ ] 5.5 Probar instalacion del blueprint `autoconsulting` con agentes scoped

---

## Apendice: Diagrama de Flujo

```
Usuario crea canal "autoconsulting"
  └─ Se instala blueprint con 6 agentes scoped
       ├─ ceo-business      (scope: { type: "channel", id: "autoconsulting" })
       ├─ tech-lead         (scope: { type: "channel", id: "autoconsulting" })
       ├─ backend-dev       (scope: { type: "channel", id: "autoconsulting" })
       ├─ frontend-dev      (scope: { type: "channel", id: "autoconsulting" })
       ├─ qa-engineer       (scope: { type: "channel", id: "autoconsulting" })
       └─ marketing-specialist (scope: { type: "channel", id: "autoconsulting" })

Se crean tools scoped para ciertos agentes:
  ├─ deploy_to_production  (scope: { type: "agent", id: "tech-lead" })
  ├─ run_e2e_tests         (scope: { type: "agent", id: "qa-engineer" })
  └─ post_social_update    (scope: { type: "agent", id: "marketing-specialist" })

Usuario envia mensaje al canal: "Crea un SAAS de habitos"
  ├─ CEO ve: tools globales + ninguna scoped a el
  ├─ Tech Lead ve: tools globales + deploy_to_production
  ├─ QA ve: tools globales + run_e2e_tests
  └─ Marketing ve: tools globales + post_social_update
```
