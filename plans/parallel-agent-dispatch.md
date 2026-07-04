COMPLETED ✓
# Parallel Agent Dispatch — Actor Model

**Fecha:** 2026-07-01
**Revisión:** v2 — Actor Model (fire-and-forget por agente)

## Problema

El orchestrator actual ejecuta agentes en serie. Cada agente espera al anterior. Con tareas largas (bash, tool calls, generación de archivos), esto bloquea el canal minutos enteros.

## Modelo: Actores Independientes

Cada agente es un actor independiente. El orchestrator encola la tarea y retorna inmediatamente. Cada agente postea al canal cuando termina.

```
Jefe: "Hacé el informe, la pres y el excel"
  ↓
Orchestrator → enqueue(PDF) → enqueue(PPT) → enqueue(Excel) → retorna

t+0s:   PDF   → trabajando...
t+0s:   PPT   → trabajando...
t+0s:   Excel → trabajando...

t+30s:  Excel → "Aquí el excel" → channel_message
t+1m:   PDF   → "Aquí el PDF"   → channel_message
t+2m:   PPT   → "Lista la pres" → channel_message
```

El canal nunca bloquea. El usuario puede escribir mientras los agentes trabajan.

## Diferencias clave vs plan original

| | Secuencial (actual) | allSettled (plan v1) | Actor Model (v2) |
|---|---|---|---|
| Canal bloqueado | Sí | Sí (espera al más lento) | No |
| Usuario puede escribir mientras | No | No | Sí |
| Orden de respuestas | FIFO | FIFO | Por finalización |
| Complejidad orchestrator | Alta | Alta | Baja |

## Componentes

### 1. `AgentWorkQueue` (nuevo)

`apps/server/src/channels/agent-work-queue.ts`

- FIFO estricto por agente
- Máximo 1 prompt in-flight por agente
- Si el agente está ocupado (en otro canal), el request se encola
- `clear()` descarta pendientes (abort)
- `abortCurrent()` aborta el prompt en curso

```typescript
interface DispatchRequest {
  id: string;
  channelId: string;
  incomingMsg: ChannelMessage;
  depth: number;
  signal: AbortSignal;
  execute: () => Promise<DispatchResult>;
}

interface DispatchResult {
  agentMsg: ChannelMessage | null; // null = silent
}

class AgentWorkQueue {
  enqueue(req: DispatchRequest): Promise<DispatchResult>;
  clear(): void;
  abortCurrent(): void;
  get size(): number;
}
```

### 2. `ChannelOrchestrator` refactorizado

`runDispatchRound` cambia de bloqueante a fire-and-forget:

```typescript
private runDispatchRound(username, channelId, incomingMsg, depth): void {
  // No async, no await — retorna inmediatamente
  const targetMembers = this.resolveRecipients(channel, incomingMsg);
  
  for (const member of targetMembers) {
    this.dispatchToAgentAsync(username, channelId, member, incomingMsg, depth)
      .catch(err => console.error(...));
    // No await — cada agente es independiente
  }
}

private async dispatchToAgentAsync(username, channelId, member, incomingMsg, depth) {
  const queue = this.getOrCreateQueue(member.agentId);
  const result = await queue.enqueue({ execute: () => this.runAgentPrompt(...) });
  
  if (result.agentMsg) {
    channelStore.appendMessage(username, channelId, result.agentMsg);
    broadcast(channelId, { type: "channel_message", message: result.agentMsg });
    
    // Encadena siguiente ronda — también fire-and-forget
    this.runDispatchRound(username, channelId, result.agentMsg, depth + 1);
  }
}
```

### 3. Fix de bug preexistente: `abortDispatch` sin username

`ws/handler.ts` llama `channelOrchestrator.abortDispatch(channelId, sessionId)` sin username. La firma requiere username. El abort no funciona hoy.

**Fix**: pasar `user.username` desde el handler.

### 4. Lifecycle de queues

Cuando un agente se detiene (`agentRegistry.stop()`), su queue se limpia y elimina. Sin esto hay memory leak y requests que nunca resuelven.

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `apps/server/src/channels/agent-work-queue.ts` | **NUEVO** |
| `apps/server/src/channels/channel-orchestrator.ts` | Refactor a actor model |
| `apps/server/src/channels/index.ts` | Exportar queue map para lifecycle |
| `apps/server/src/agents/agent-registry.ts` | Hook stop() → clear queue |
| `apps/server/src/ws/handler.ts` | Fix abortDispatch sin username |

## No cambia

- `create-agent-server.ts` — cada agente sigue con 1 session
- Frontend — los eventos WS existentes ya soportan streams entrelazados
- `channel-store.ts` — persiste igual
- Auth, routing, autorización

## Riesgos resueltos

1. **agent.reset() en la cola** — el reset ocurre dentro de `AgentWorkQueue.processNext()`, no en el orchestrator
2. **Bug abortDispatch sin username** — corregido como precondición
3. **Ordering** — el cliente usa `createdAt` para ordenar, no rounds
4. **N² en broadcast** — el `maxChainDepth` limita la recursión; cada actor la frena por su cuenta
