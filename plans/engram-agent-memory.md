# Engram — Memoria Persistente para Agentes

**Fecha:** 2026-07-01
**Propósito:** Integrar `@engram-ai-memory/core` como sistema de memoria persistente por defecto para todos los agentes de CrewFactory.

## ¿Qué es Engram?

Engram es una librería de memoria para agentes de IA con:

- **3 tipos de memoria**: semántica (hechos), episódica (eventos), procedural (patrones)
- **Embeddings locales**: `Xenova/all-MiniLM-L6-v2` vía ONNX/WASM — 0 costo en API, 384-dim, FP16
- **Decay Ebbinghaus**: las memorias se debilitan naturalmente si no se refuerzan
- **Knowledge graph**: conexiones entre memorias (soporta, contradice, elabora, reemplaza)
- **Contradiction detection**: detecta y resuelve memorias conflictivas automáticamente
- **Namespace isolation**: memorias aisladas por agente/proyecto
- **SQLite + full-text search**: sin dependencias cloud, portátil
- **Plugin system**: hooks en store/recall/forget/decay

## Stack

- **Librería**: `@engram-ai-memory/core` v0.1.3 (npm, MIT)
- **Dependencias**: `better-sqlite3`, `drizzle-orm`, `@xenova/transformers` (ONNX)
- **Base de datos**: SQLite por agente, en su directorio workspace

## Arquitectura

```
createAgentServer()
  │
  ├─ NeuralBrain (por agente)
  │    └─ /tmp/crewfactory/{user}/agents/{id}/engram/
  │         └─ engram.db  ← SQLite + embeddings
  │
  ├─ DefaultResourceLoader
  │    └─ auto-inyecta memorias relevantes en system prompt
  │
  ├─ AgentSession
  │    └─ tools: [engram_store, engram_recall, engram_forget]
  │
  └─ channel-orchestrator
       └─ memoria compartida del canal (NeuralBrain por canal)
```

### Inicialización

En `create-agent-server.ts`, después de crear el workspace del agente:

```typescript
import { NeuralBrain } from '@engram-ai-memory/core';

const brain = new NeuralBrain({
  dbPath: join(agentDir, 'engram', 'engram.db'),
  defaultSource: `agent:${definition.id}`,
  // Namespace aísla memorias por agente
  namespace: definition.id,
});

await brain.initialize();

const agentServer: AgentServer = {
  definition,
  session,
  brain,    // ← NeuralBrain disponible
  app,
  start() { ... },
  async stop() {
    await brain.shutdown();
    // ...
  },
};
```

### Inyección Automática en System Prompt

Antes de cada `session.prompt()`, el `DefaultResourceLoader` (o un wrapper) debería:

```typescript
async function buildPromptWithMemory(
  brain: NeuralBrain,
  userMessage: string,
  basePrompt: string
): Promise<string> {
  const memories = await brain.recall(userMessage, {
    limit: 10,
    minImportance: 0.3,
    types: ['semantic', 'episodic'],
  });

  if (memories.context) {
    return `${basePrompt}

--- Relevant Memories ---
${memories.context}

--- User Message ---
${userMessage}`;
  }

  return `${basePrompt}

--- User Message ---
${userMessage}`;
}
```

### Tools del Agente

Se registran 3 tools adicionales en `customTools`:

| Tool | Descripción | Parámetros |
|---|---|---|
| `engram_store` | Guarda un hecho/memoria | `content: string, type: "semantic"\|"episodic"\|"procedural", importance?: 0-1` |
| `engram_recall` | Busca memorias relevantes | `query: string, limit?: number` |
| `engram_forget` | Elimina una memoria específica | `id: string` |

### Almacenamiento Automático Post-Respuesta

Después de cada `session.prompt()`, el orchestrator puede extraer decisiones/hechos clave:

```typescript
// channel-orchestrator.ts o agent wrapper
async function afterPrompt(brain: NeuralBrain, response: string): Promise<void> {
  // Almacenar automáticamente la interacción como memoria episódica
  await brain.store({
    content: response.slice(0, 500),  // preview
    type: 'episodic',
    importance: 0.5,
    tags: ['interaction', `agent:${agentId}`],
  });
}
```

### Memoria Compartida por Canal

Los channels pueden tener su propio `NeuralBrain` para memoria compartida entre agentes:

```typescript
// channel-orchestrator.ts
const channelBrain = new NeuralBrain({
  dbPath: `/tmp/crewfactory/${username}/channels/${channelId}/engram/engram.db`,
  defaultSource: `channel:${channelId}`,
  namespace: channelId,
});
```

Cuando un agente recibe un mensaje en un canal, su prompt incluye:
1. Memorias personales del agente (de su `NeuralBrain`)
2. Memorias compartidas del canal (del `channelBrain`)

### Integración con Session Manager

Para sesiones globales y de proyecto:

```typescript
// session-manager.ts
export class SessionManagerWithMemory {
  private brains = new Map<string, NeuralBrain>();

  getOrCreateBrain(username: string, scope: 'global' | 'repo', repoName?: string): NeuralBrain {
    const key = `${username}:${scope}:${repoName || ''}`;
    if (this.brains.has(key)) return this.brains.get(key)!;

    const dbPath = scope === 'global'
      ? `/tmp/crewfactory/${username}/workspace/engram/engram.db`
      : `/tmp/crewfactory/${username}/workspace/repos/${repoName}/engram/engram.db`;

    const brain = new NeuralBrain({ dbPath, namespace: key });
    await brain.initialize();
    this.brains.set(key, brain);
    return brain;
  }
}
```

## Cambios en Archivos

| Archivo | Cambio |
|---|---|
| `apps/server/package.json` | Añadir `@engram-ai-memory/core` como dependencia |
| `apps/server/src/agents/types.ts` | Añadir `brain: NeuralBrain` a `AgentServer` |
| `apps/server/src/agents/create-agent-server.ts` | Inicializar `NeuralBrain` por agente, integrar en resource loader, shutdown en stop() |
| `apps/server/src/agents/agent-registry.ts` | Pasar `brain` en el lifecycle |
| `apps/server/src/pi/session-manager.ts` | `SessionManagerWithMemory` para sesiones global/repo |
| `apps/server/src/channels/channel-orchestrator.ts` | `NeuralBrain` por canal, inyectar memorias en `buildAgentPrompt()` |
| `apps/server/src/channel-store.ts` | Directorio `engram/` por canal |

## Flujo de Memoria en un Prompt

```
Usuario: "Despliega la app en Coolify"
  │
  ▼
buildAgentPrompt():
  ├─ brain.recall("despliegue Coolify")  → memorias relevantes
  │    └─ "El deploy se hace via curl al API de Coolify"
  │    └─ "El JWT_SECRET está en los env vars"
  │
  ├─ channelBrain.recall("despliegue")  → memorias del canal
  │    └─ "El equipo decidió usar Dockerfile basado en Bun"
  │
  └─ Prompt final:
     """
     [system prompt base]
     
     --- Relevant Memories ---
     - El deploy se hace via curl al API de Coolify
     - El JWT_SECRET está en los env vars
     
     --- Channel Context ---
     - El equipo decidió usar Dockerfile basado en Bun
     
     --- New message from @user ---
     Despliega la app en Coolify
     """
  │
  ▼
  Agente responde usando el contexto
  │
  ▼
afterPrompt():
  └─ brain.store({ content: "Deploy realizado via API Coolify", type: "episodic" })
```

## Consideraciones

### Storage
- Cada agente: ~1-5 MB por DB (depende de cantidad de memorias)
- Embeddings: ~23 MB del modelo ONNX (compartido, cacheado una vez)
- Directorio: `~/.engram/models/` para el modelo de embeddings

### Performance
- `store()`: ~26.8s para 300 memorias (~89ms por memoria, incluye embedding)
- `recall()`: <100ms típico (vector search + graph expand + scoring)
- Inicialización: ~2-3s primera vez (descarga modelo ONNX), ~100ms siguientes (cache)

### Namespace Isolation
Cada agente y canal tiene su propio namespace/DB, asegurando que:
- El Agente A no ve memorias del Agente B
- El Canal X no ve memorias del Canal Y
- La sesión global no ve memorias de repos específicos

### Memory Decay
- Default: `strength *= 0.95 ^ daysSinceLastAccess`
- Memorias no accedidas en 30 días caen por debajo de `minImportance` y se excluyen de recall
- Consolidación automática: memorias redundantes se fusionan

## Próximos Pasos (Implementación)

1. `bun add @engram-ai-memory/core` en `apps/server`
2. Extender `AgentServer` type con `brain` opcional
3. Inicializar `NeuralBrain` en `createAgentServer()`
4. Integrar recall en `DefaultResourceLoader` (appendSystemPrompt)
5. Registrar `engram_store/recall/forget` como tools del agente
6. Añadir `NeuralBrain` por canal en `channel-orchestrator.ts`
7. Inyectar memorias en `buildAgentPrompt()`
8. Auto-store post-respuesta en channel-orchestrator
9. SessionManager con memoria global/repo
10. Validar builds y probar flujo completo
