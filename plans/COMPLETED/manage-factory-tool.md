COMPLETED
# manage_factory — Tool unificada de operaciones de fabrica

**Status:** plan
**Created:** 2026-07-10
**Architecture:** Meta-tool con contrato auto-documentado

## Problema

El agente principal interactua con las entidades del sistema (agentes, proyectos, canales, sesiones, env vars, providers, skills, experimentos) mediante skills markdown que contienen comandos curl. Cada operacion requiere que el agente: lea la skill, parse el comando, ejecute bash, parse JSON, maneje errores. Son 7+ pasos por operacion con multiples puntos de falla.

El backend ya expone todas estas operaciones como endpoints REST y metodos JS internos, pero el agente no tiene acceso directo a ellos. MCP es sobre-ingenieria para este caso: fue diseniado para servidores externos, no para operaciones en el mismo proceso.

## Solucion

Una unica tool `manage_factory` con interfaz tipo `delegate_task`:

```
manage_factory(entity, action, id?, params?)
```

Donde:
- **entity**: agents | projects | channels | sessions | env | providers | skills | experiments
- **action**: get | upsert | delete
- **id**: identificador de la entidad (opcional para get/list, requerido para delete)
- **params**: objeto JSON con los campos especificos de la entidad (requerido para upsert)

Acompaniada de un endpoint `GET /api/factory/contract/:entity` que devuelve el schema de cada entidad, permitiendo al agente y al frontend descubrir los parametros requeridos sin hardcodearlos.

## Contratos de Entidades

### GET /api/factory/contract/:entity

Response shape:
```json
{
  "entity": "agents",
  "description": "Autonomous programmatic agents",
  "actions": {
    "get": {
      "description": "List all entities or get one by id",
      "params": {
        "id": { "type": "string", "required": false, "description": "Entity ID. Omit to list all." }
      }
    },
    "upsert": {
      "description": "Create a new entity or update an existing one by id",
      "params": {
        "id": { "type": "string", "required": true },
        "...entitySpecificFields": {}
      }
    },
    "delete": {
      "description": "Permanently remove an entity",
      "params": {
        "id": { "type": "string", "required": true }
      }
    }
  }
}
```

### Entidades y sus campos upsert

| Entity | Upsert params (ademas de `id`) |
|--------|-------------------------------|
| **agents** | `name` (string, required), `role` (string, required), `systemPrompt` (string), `model` (string), `skills` (string[]), `blueprintId` (string) |
| **projects** | `name` (string, required), `cloneUrl` (string) — solo create, update no soporta cloneUrl |
| **channels** | `name` (string, required), `description` (string), `members` (array of {agentId, replyMode}), `negotiationProtocol` (boolean) |
| **sessions** | Solo get/delete. No upsert (las sesiones se crean implicitamente). `id` es el sessionId. |
| **env** | `key` (string, required), `value` (string, required). Upsert opera sobre pares key-value. Delete requiere `key` en lugar de `id`. |
| **providers** | `provider` (string, required = provider id), `apiKey` (string, required). Delete revoca la key. |
| **skills** | `name` (string, required), `description` (string, required), `content` (string, required = markdown body). Upsert escribe SKILL.md. Delete elimina el directorio. |
| **experiments** | `name` (string), `taskPrompt` (string), `judge` (object), `variants` (object) — schema completo del experimento |

### Accion get: comportamiento

- Sin `id`: devuelve array de todas las entidades (lista resumida)
- Con `id`: devuelve la entidad completa con todos sus campos

### Accion delete: confirmacion

La tool ejecuta el delete directamente. Para operaciones destructivas (eliminar sesiones con datos, proyectos con archivos), la tool incluye en su respuesta un resumen de lo eliminado para que el agente pueda informar al usuario.

## Tool Definition

```typescript
{
  name: "manage_factory",
  description: `Manage CrewFactory entities directly. Operations on agents, projects, channels, sessions, environment variables, LLM providers, custom skills, and laboratory experiments.

Entities and their available actions:
- agents: get, upsert, delete
- projects: get, upsert, delete
- channels: get, upsert, delete
- sessions: get, delete (sessions are created implicitly, not via this tool)
- env: get, upsert, delete (operates on key-value pairs; use 'key' instead of 'id' for upsert/delete params)
- providers: get, upsert, delete (upsert sets API key, delete revokes it)
- skills: get, upsert, delete (upsert writes SKILL.md file, delete removes the skill directory)
- experiments: get, upsert, delete

For exact parameter schemas per entity, use GET /api/factory/contract/:entity.
After mutating entities, call refresh_ui to update the frontend.`,
  parameters: {
    type: "object",
    properties: {
      entity: {
        type: "string",
        enum: ["agents", "projects", "channels", "sessions", "env", "providers", "skills", "experiments"],
        description: "The factory entity type to operate on."
      },
      action: {
        type: "string",
        enum: ["get", "upsert", "delete"],
        description: "get: retrieve entity data. upsert: create or update. delete: permanently remove."
      },
      id: {
        type: "string",
        description: "Entity identifier. Required for delete. Optional for get (omit to list all). Required for upsert."
      },
      params: {
        type: "object",
        description: "Entity-specific parameters as a flat JSON object. For upsert, must include all required fields. See /api/factory/contract/:entity for schemas."
      }
    },
    required: ["entity", "action"]
  }
}
```

## API Endpoints

### GET /api/factory/contract/:entity

Devuelve el contrato completo de una entidad.

Implementacion: `apps/server/src/routes/factory.ts`

### GET /api/factory/contracts

Lista todas las entidades disponibles con sus descripciones (resumen).

### POST /api/factory/execute (interno)

No es un endpoint HTTP publico — la tool `manage_factory` llama directamente a los metodos del backend. El endpoint `/api/factory/contract/:entity` es el unico endpoint publico nuevo.

## Implementacion

### Archivos nuevos

```
apps/server/src/core/tools/factory-tool.ts          # Tool definition + execute switch
apps/server/src/core/tools/factory-contracts.ts      # Contract schemas per entity
apps/server/src/routes/factory.ts                    # GET /api/factory/contract/:entity + /contracts
```

### Archivos modificados

```
apps/server/src/core/session/tool-factory.ts         # Registrar manage_factory en customTools
apps/server/src/index.ts                             # Montar rutas /api/factory/*
```

### factory-contracts.ts (~150 loc)

Define el schema de cada entidad como objetos TypeScript tipados. Cada entrada incluye:
- `entity`: nombre de la entidad
- `description`: que representa
- `actions`: get, upsert, delete con sus parametros y tipos

Usado por:
1. El endpoint `/api/factory/contract/:entity` para serializar a JSON
2. La tool `manage_factory` para validar params en ejecucion

### factory-tool.ts (~120 loc)

Funcion `createFactoryTool(opts)` que retorna una tool definition con:

```typescript
execute: async (toolCallId: string, args: { entity, action, id?, params? }) => {
  switch (args.entity) {
    case "agents":
      return handleAgents(args.action, args.id, args.params, username);
    case "projects":
      return handleProjects(args.action, args.id, args.params, username);
    // ... etc
  }
}
```

Cada handler llama directamente a los metodos existentes:
- `agentRegistry.list()`, `agentRegistry.register()`, `agentRegistry.stop()`
- `sessionManager.getOrCreateSession()` — la creacion de proyectos usa workspace API
- `userConfigManager.getUserEnv()`, `userConfigManager.setUserEnv()`
- `mcpRegistry.loadConfig()` — providers
- `channelStore.listChannels()`, `channelStore.createChannel()`
- `ExperimentStore.getExperiment()`, etc.

### factory.ts routes (~60 loc)

```typescript
// GET /api/factory/contracts
// GET /api/factory/contract/:entity

import { FACTORY_CONTRACTS } from "../core/tools/factory-contracts";

router.get("/api/factory/contracts", (c) => {
  return c.json(Object.entries(FACTORY_CONTRACTS).map(([entity, contract]) => ({
    entity,
    description: contract.description,
  })));
});

router.get("/api/factory/contract/:entity", (c) => {
  const entity = c.req.param("entity");
  const contract = FACTORY_CONTRACTS[entity];
  if (!contract) return c.json({ error: `Unknown entity: ${entity}` }, 404);
  return c.json({ entity, description: contract.description, actions: contract.actions });
});
```

## Flujo de ejecucion

```
Usuario: "crea un agente llamado reviewer"
  → Agente: manage_factory({ entity: "agents", action: "upsert", id: "reviewer", params: { name: "Reviewer", role: "reviewer", systemPrompt: "You review code" } })
  → factory-tool.ts: handleAgents("upsert", "reviewer", params, username)
  → agentRegistry.register(username, definition)
  → retorna { status: "created", entity: "agents", id: "reviewer", data: {...} }
  → Agente: refresh_ui({ entityType: "agent" })
  → Listo. 2 tool calls, cero bash, cero curl.
```

## Testing Strategy

### Tests unitarios

- `factory-contracts.test.ts`: validar que todos los contratos tienen los campos requeridos y los tipos son correctos
- `factory-tool.test.ts`: validar que cada handler responde correctamente para get/upsert/delete

### Tests de integracion

- Crear agente via manage_factory → verificar que aparece en agentRegistry
- Crear proyecto via manage_factory → verificar que el directorio existe
- Eliminar skill via manage_factory → verificar que el directorio desaparece
- Llamar a cada accion get sin id → verificar que devuelve array

### Smoke test manual

Ejecutar el agente y pedirle que liste agentes, cree un proyecto, configure un provider, liste skills. Verificar que usa manage_factory en lugar de curl/bash.

## Riesgos y Mitigaciones

| Riesgo | Mitigacion |
|--------|-----------|
| Agente no descubre la tool y sigue usando skills+curl | La tool se registra siempre. El system prompt incluye la tool en su descripcion. Las skills se marcan como `disableModelInvocation: true` progresivamente. |
| params mal formados por el agente | Validacion en el handler con mensajes descriptivos. El LLM recibe el error y corrige. |
| Upsert parcial (crea pero no setea todos los campos) | Los campos opcionales tienen defaults. Los required son validados y rechazados si faltan. |
| Sesiones huerfanas al eliminar agentes/proyectos | La tool incluye un warning en la respuesta si hay sesiones vinculadas. |
| Tool description muy larga | El description da el resumen. El contrato completo esta en el endpoint. El agente solo consulta si necesita detalle. |

## Rollout

### Fase 1: Core entities (dia 1)
- agents, projects, env, providers
- Contract endpoint
- Tool registrada en tool-factory

### Fase 2: Extended entities (dia 2)
- channels, sessions, skills, experiments
- Validacion de params en cada handler

### Fase 3: Hardening (dia 3)
- Tests unitarios y de integracion
- Marcado de skills factory-x como disableModelInvocation para entidades migradas
- Smoke test manual con el agente

## Metrica de exito

- El agente resuelve operaciones de fabrica en 1-2 tool calls en lugar de 5-7
- Cero ocurrencias de curl/wget para operaciones cubiertas por manage_factory
- Tiempo de ejecucion de operaciones CRUD: <500ms (actual: 2-5s con bash+curl)
