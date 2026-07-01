# Parallel Agent Dispatch en Channels

**Fecha:** 2026-07-01
**Contexto:** Los channels ejecutan agentes secuencialmente (`for...of` con `await session.prompt()`). Cada agente espera a que el anterior termine antes de empezar. Esto desperdicia capacidad cuando los agentes tienen trabajo independiente que hacer (tool calls, bash, etc.).

## Estado Actual

```
Agente A: ████████████████ prompt → tool calls → response ██████
Agente B: █████ esperando                     ████████████████ prompt → ...
Agente C: █████ esperando                                        ██████...
                                                              ↑ tiempo
```

Cada agente tiene su propio `AgentSession` (creado en `create-agent-server.ts`), pero por limitación del SDK no se puede llamar `session.prompt()` concurrentemente en la misma sesión. Además, el orchestrator llama `(session as any).agent?.reset()` antes de cada prompt para limpiar estado interno.

## Solución: Cola por Agente + Promise.all entre Agentes

### Concepto

Cada agente registrado tiene una `AgentWorkQueue` FIFO que procesa un dispatch request a la vez. El channel orchestrator encola todos los agentes objetivo simultáneamente y espera con `Promise.allSettled`.

```
Ronda 1:                    Ronda 2:
┌── Promise.all ────┐      ┌── Promise.all ────┐
│ Agente A ─→ queue │      │ Agente B ─→ queue │
│ Agente B ─→ queue │      │ Agente D ─→ queue │
│ Agente C ─→ queue │      └───────────────────┘
└───────────────────┘
     │ todos terminan            │
     ▼                           ▼
  persiste msgs              persiste msgs
  broadcast                  broadcast
  → Ronda 2                  → Ronda 3...
```

### Flujo Detallado

```
Usuario envía mensaje al canal
  ↓
ChannelOrchestrator.dispatchUserMessage()
  ↓ 1. Resuelve miembros objetivo según replyMode (broadcast/targeted/mention-only)
  ↓ 2. Crea DispatchRequest por cada miembro
  ↓ 3. Encola cada request en AgentWorkQueue del agente correspondiente
  ↓ 4. await Promise.allSettled(promises)
  ↓
Cada agente (procesando su cola secuencialmente):
  ├─ Dequeue next request
  ├─ buildAgentPrompt()
  ├─ subscribe(channel_agent_token)
  ├─ await session.prompt(promptText)  ← 1 sola a la vez por agente
  ├─ unsubscribe()
  ├─ extraer respuesta
  └─ resolver promesa con DispatchResult
  ↓
Orchestrator recolecta resultados:
  ├─ Filtra respuestas (silent)
  ├─ Asigna round number
  ├─ Persiste en channel-store (appendMessage)
  ├─ Broadcast channel_message por cada una
  └─ Para cada mensaje de agente: runDispatchRound(depth + 1)
```

### Componentes

#### 1. `AgentWorkQueue`

Nuevo módulo: `apps/server/src/channels/agent-work-queue.ts`

```typescript
interface DispatchRequest {
  id: string;
  channelId: string;
  sessionId: string;
  incomingMsg: ChannelMessage;
  depth: number;
  signal: AbortSignal;
  resolve: (result: DispatchResult) => void;
  reject: (err: Error) => void;
}

interface DispatchResult {
  content: string;
  isSilent: boolean;
  error?: string;
  messages: ChannelMessage[];
}

class AgentWorkQueue {
  private queue: DispatchRequest[] = [];
  private processing = false;
  private agentId: string;
  private agentEntry: AgentEntry;

  enqueue(req: DispatchRequest): Promise<DispatchResult>;
  clear(signal?: AbortSignal): void;        // descarta requests pendientes
  abortCurrent(): void;                       // aborta prompt in-flight
  get pendingCount(): number;
}
```

- FIFO estricto
- Máximo 1 prompt in-flight por agente
- Si el agente está ocupado, el request se encola
- `clear()` descarta los requests pendientes sin ejecutar (rechazando sus promesas)
- `abortCurrent()` llama `session.abort()` + reinicia el flag de processing

#### 2. `ChannelOrchestrator` modificado

`runDispatchRound()` cambia de secuencial a paralelo:

```typescript
async runDispatchRound(username, channelId, incomingMsg, depth): Promise<ChannelMessage[]> {
  const key = `${channelId}:${sessionId}`;
  if (this.abortedDispatches.has(key)) return [];

  const channel = channelStore.getChannel(username, channelId);
  if (!channel) return [];

  const targetMembers = this.resolveRecipients(channel, incomingMsg);
  if (depth >= (channel.maxChainDepth ?? 5)) {
    broadcast(channelId, { type: "channel_chain_limit", ... });
    return [];
  }

  const round = this.nextRound(channelId);
  const controller = new AbortController();

  // Encolar todos los agentes simultáneamente
  const promises = targetMembers.map(member =>
    this.enqueueAgentDispatch(username, channelId, member, incomingMsg, depth, round, controller.signal)
  );

  // Esperar a que TODOS terminen (éxito o error)
  const settled = await Promise.allSettled(promises);

  // Recolectar resultados no-silent
  const agentMessages: ChannelMessage[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled" && !result.value.isSilent) {
      agentMessages.push(result.value);
    }
  }

  // Persistir y broadcast
  for (const msg of agentMessages) {
    channelStore.appendMessage(username, channelId, msg);
    broadcast(channelId, { type: "channel_message", message: msg });
  }

  // Propagar siguiente ronda (secuencial entre rondas)
  for (const msg of agentMessages) {
    const nextMsg: ChannelMessage = { ... };
    if (!this.abortedDispatches.has(key)) {
      await this.runDispatchRound(username, channelId, nextMsg, depth + 1);
    }
  }

  return agentMessages;
}
```

#### 3. Abort

El abort actual usa un `Set<string>` de claves `channelId:sessionId`. Cambia a:

```typescript
private dispatchControllers = new Map<string, AbortController>();

abortDispatch(username, channelId, sessionId?): void {
  const key = `${channelId}:${sessionId || "default"}`;
  this.abortedDispatches.add(key);

  // Señalizar todos los dispatches in-flight de este canal
  const controller = this.dispatchControllers.get(key);
  controller?.abort();

  // Abortar prompts activos de cada agente
  const channel = channelStore.getChannel(username, channelId);
  if (channel) {
    for (const member of channel.members) {
      const entry = agentRegistry.get(member.agentId);
      if (entry) {
        this.agentQueues.get(member.agentId)?.clear();
        if (entry.server.session.isStreaming) {
          entry.server.session.abort().catch(() => {});
        }
      }
    }
  }

  broadcast(channelId, { type: "channel_dispatch_aborted", ... });
}
```

### Consideraciones de Diseño

#### Race conditions en la cola
- Se usa un flag `processing` atómico dentro de `AgentWorkQueue`
- No se necesita lock porque JavaScript es single-threaded
- La cola se procesa secuencialmente con `processNext()` recursivo

#### Mensajes silenciosos
- Agentes que responden `(silent)` no generan `ChannelMessage`
- No persisten, no hacen broadcast, no propagan ronda

#### Orden de mensajes
- Cada `ChannelMessage` lleva `round?: number`
- El cliente ordena por `createdAt` dentro del mismo round
- Los mensajes se persisten después de que TODOS los agentes terminan el round, no durante

#### Límite de recursos
- No hay límite explícito de dispatches concurrentes
- El límite natural es la cantidad de agentes en el canal
- Si hay 20 agentes, habrá 20 prompts concurrentes (1 por agente)
- Los agentes que ya están procesando su cola (por otro canal) encolan sin problema

#### Sesiones persistentes vs efímeras
- Las sesiones de agente NO se resetean entre dispatches (se mantiene `session.messages`)
- Solo se resetea el runtime interno vía `agent.reset()` antes de cada prompt
- Con la cola, el reset se hace justo antes del `session.prompt()` en el worker de la cola

### Cambios en Schemas

```typescript
// packages/shared/src/schemas.ts
export const ChannelMessageSchema = z.object({
  ...existing,
  round: z.number().int().optional(),
});
```

### Eventos WS

Los eventos existentes ya funcionan para paralelo porque llevan `agentId`:
- `channel_agent_start { agentId, agentName }`
- `channel_agent_token { agentId, token }`
- `channel_agent_end { agentId }`
- `channel_agent_error { agentId, error }`

Se añade `round` opcional a los eventos para que el cliente agrupe visualmente:

```typescript
channel_agent_start { agentId, agentName, round: 1 }
channel_agent_token { agentId, token, round: 1 }
channel_agent_end { agentId, round: 1 }
```

### Archivos a Modificar

| Archivo | Cambio |
|---|---|
| `apps/server/src/channels/agent-work-queue.ts` | **NUEVO** — implementación de `AgentWorkQueue` |
| `apps/server/src/channels/channel-orchestrator.ts` | Refactor `runDispatchRound` a paralelo, integrar queues |
| `apps/server/src/channels/index.ts` | Exportar `agentWorkQueues` |
| `apps/server/src/ws/handler.ts` | Añadir `round` a eventos de stream (optativo) |
| `apps/server/src/routes/channels.ts` | Validar que `abort` limpia queues |
| `packages/shared/src/schemas.ts` | Añadir `round` a `ChannelMessageSchema` |

### No Cambia

- `create-agent-server.ts` — cada agente sigue teniendo 1 session
- `agent-registry.ts` — el ciclo de vida del agente no cambia
- `channel-store.ts` — persiste igual, solo cambia el orden de escritura
- Modelo de autenticación, routing, autorización
- Frontend — los eventos WS existentes ya soportan streams entrelazados

## Diagrama de Secuencia

```
Usuario               ChannelOrch           AgentQueue A         Agent A Session
  │                       │                      │                     │
  │── send(msg) ─────────→│                      │                     │
  │                       │── enqueue(reqA) ────→│                     │
  │                       │── enqueue(reqB) ────→│(otra queue)         │
  │                       │── enqueue(reqC) ────→│(otra queue)         │
  │                       │                      │                     │
  │                       │── Promise.allSettled()                     │
  │                       │                      │                     │
  │                       │                      │── dequeue ─────────→│
  │                       │                      │── session.prompt() →│
  │←── channel_agent_token│←──── token ──────────│←──── stream ───────│
  │←── channel_agent_token│←──── token ──────────│←──── stream ───────│
  │                       │                      │←── prompt done ────│
  │                       │                      │── resolve ─────────│
  │                       │                      │                     │
  │                       │  (B y C también terminan)                  │
  │                       │                      │                     │
  │←── channel_message ───│── persist + broadcast│                     │
  │←── channel_message ───│── persist + broadcast│                     │
  │                       │                      │                     │
  │                       │── runDispatchRound(depth+1)                │
  │                       │  ...propagación...   │                     │
```

## Contras y Riesgos

1. **Agentes lentos bloquean el round** — Si un agente tarda mucho, los demás esperan en `Promise.allSettled` antes de persistir. Mitigación: timeout configurable por dispatch.
2. **Estado compartido en buildAgentPrompt** — Es puro (solo lee), seguro para paralelo. No hay riesgo.
3. **Streaming entrelazado** — El cliente recibe tokens de varios agentes mezclados. El UI actual ya los separa por `agentId`, funciona sin cambios.
4. **Recursión de rondas** — Si todos los agentes responden y todos propagan, la siguiente ronda puede tener N^2 complexity. El `maxChainDepth` limita esto, igual que ahora.
