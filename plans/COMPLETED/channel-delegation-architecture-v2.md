COMPLETED
# Plan: Channel Delegation Architecture — Analisis y Contrapropuesta

**Severidad:** High
**Prioridad:** High (diseno de delegacion/negociacion en canales)
**Esfuerzo estimado:** 4-5 dias (contrapropuesta) vs 10-13 dias (diseno original)
**Riesgo:** Medio (cambios en channel-orchestrator y nuevo drawer)
**Area:** Arquitectura / Canales

---

## 1. Lo que YA existe y funciona

El `AgentPromptRunner` (`apps/server/src/channels/agent-prompt-runner.ts`) ya emite al WebSocket del canal los eventos que el diseno original propone reinventar:

| Evento actual | Linea en `runner.ts` | Equivalente en diseno original |
|---|---|---|
| `channel_agent_start` | 163 | `channel_task_start` |
| `channel_agent_thinking` | 257 | `channel_task_progress` (thinking) |
| `channel_agent_tool_start` | 277 | `channel_task_progress` (step start) |
| `channel_agent_tool_end` | 292 | `channel_task_progress` (step end) |
| `channel_agent_end` | 365 | `channel_task_end` |

Y el `delegationRegistry` (`apps/server/src/core/delegation-registry.ts`) ya trackea el ciclo de vida de cada delegacion: `register()` → `status: "running"`, `complete()` → `status: "success"/"error"/"blocked"`, con persistencia en disco y broadcasts `delegation_started`/`delegation_completed` a todos los sockets del usuario.

---

## 2. Critica del diseno propuesto (Execution IDs + Task Registry + Pipeline)

### 2.1 Execution IDs reinventan Session IDs

Cuando un canal delega via `delegate_task` con `targetType: "channel"`, `channelOrchestrator.dispatchUserMessage()` procesa el mensaje dentro del canal. Los agentes del canal responden — son sesiones de agente programatico (`AgentServer`). Esas sesiones ya tienen ID, ya persisten mensajes, ya streamean eventos.

Cuando la delegacion es a un `targetType: "agent"` o `"project"`, se crea una sesion `del_xxx` via `getOrCreateSession()`. Esa sesion tambien tiene ID, persistencia, y streaming.

**El Execution ID es el Session ID.** No hay necesidad de un nuevo namespace de identificadores.

### 2.2 Task Registry duplica persistencia existente

```typescript
// Propuesto: ChannelTaskRegistry
createExecution(id, agentId, taskType)
updateStep(id, step)
completeExecution(id, status)

// Ya existe:
sessionManager.getOrCreateSession()        // crea sesion con .jsonl persistente
delegationRegistry.register()              // trackea estado running/success/error
delegationRegistry.complete()              // marca completado con resultado
session.messages                           // steps = tool calls + thinking + texto
```

Cada "step" del pipeline propuesto es un tool call que YA esta persistido en el `.jsonl` de la sesion del agente. Consultar los steps es consultar los mensajes de la sesion. Las APIs REST propuestas (`GET /api/channels/:id/executions/:id/messages`) son identicas a `GET /api/sessions/{id}/messages`.

### 2.3 Pipeline de steps es una metafora visual, no un modelo de datos

El diseno propone:

```
executionId: "exec_abc123"
├── Step 1: read auth.ts (completado)
├── Step 2: bash "grep -r deprecated" (completado)
├── Step 3: edit auth.ts (en progreso)
├── Step 4: write tests (pendiente)
└── Step 5: bash "bun test" (pendiente)
```

Esto ES la secuencia de tool calls del agente. `tool_execution_start` ya proporciona `toolName` + `args` + `toolCallId`. `tool_execution_end` ya da `result` + `isError`. El orden ya es secuencial (el agente ejecuta tools una por una). Modelar esto como entidad de datos separada con su propio almacenamiento es redundante.

### 2.4 DELEGATE vs NEGOTIATE es una directiva de prompt

El plan propone deteccion de intencion, keywords, formatos especiales, y modificaciones al orchestrator para diferenciar delegacion de negociacion. Esto es innecesario:

- El lider YA tiene `delegate_task` tool para delegar
- Las `@menciones` directas YA son negociacion (el agente responde en el hilo)
- Agregar reglas al system prompt del lider (`role-leader.ts`) es suficiente
- No requiere cambios de infraestructura en el orchestrator

### 2.5 Scope creep de UI

El plan propone `DelegationTaskCard` con barra de progreso custom, `DelegationDrawer` custom, indicadores visuales de negociacion, panel de arbitraje. Todo esto requiere componentes nuevos cuando ya existen:

- `ToolCallRow` → ya muestra tool calls con estado (pending/running/completed) y resultado
- `ChatArea` + `MessageList` → ya renderizan mensajes, thinking, y tool calls de cualquier sesion
- `AgentTurn` → ya agrupa y renderiza turnos de agente completos

---

## 3. Contrapropuesta: Arquitectura minimalista

### Principio: reutilizar, no reinventar

Los canales ya tienen:

1. **Agentes con sesiones** (`AgentServer.session`) — cada agente de canal tiene una sesion de agente con persistencia y streaming
2. **Eventos de progreso** (`channel_agent_*`) — thinking, tool start/end ya se emiten al WebSocket del canal
3. **Registro de delegaciones** (`delegationRegistry`) — ya trackea ciclo de vida con persistencia
4. **Componentes de renderizado** (`ChatArea`, `MessageList`, `ToolCallRow`) — ya renderizan sesiones completas

Lo que falta es **conectar** estas piezas, no construir nuevas.

### Fase 1: Unificar creacion de sesiones de subagente

**Dependencia:** Plan `unify-subagent-session-creation.md`

Cuando `delegate_task` crea una sesion (para targets `agent`, `project`, `session`), esa sesion debe estar registrada en `SessionManager`. Cuando un canal delega internamente (agentes respondiendo), las sesiones de los `AgentServer` ya existen. Esto permite que cualquier drawer o Live Console reciba eventos en vivo.

### Fase 2: Forward de eventos del canal al padre

Cuando `delegate_task` con `targetType: "channel"` despacha un mensaje, el padre necesita recibir actualizaciones de progreso.

**Hoy**: `delegate-tool.ts:167` llama `dispatchUserMessage()` y luego lee `channelStore.getMessages()` sincronicamente — roto (B1).

**Propuesto**: El `delegate-tool` se suscribe a los eventos del canal relevantes para ese `executionId`/`sessionId` y forwardea al padre via `forwardSubagentEvents` o similar. Alternativa: usar el `delegationRegistry` existente + broadcasts `delegation_started`/`delegation_completed` que ya llegan al `DelegationsPanel`.

### Fase 3: Modo secuencial por defecto (fix B5)

**Archivo:** `apps/server/src/channels/channel-orchestrator.ts`

Cambiar el default de canales nuevos para que usen `replyMode: "broadcast"` en al menos el miembro lider. Esto activa `runSequentialBroadcastLoop` (linea 169) que procesa agentes secuencialmente, eliminando el streaming entremezclado.

El modo paralelo (no-broadcast) queda como opcion explicita.

### Lo que NO se implementa

| Elemento del diseno original | Razon |
|---|---|
| `ChannelTaskRegistry` | Duplica `delegationRegistry` + persistencia de sesion |
| `ExecutionId` como entidad separada | Es el `sessionId` |
| APIs REST `/executions/*` | Usar `GET /api/sessions/{id}/messages` existente |
| `channel_task_start/progress/end` | Ya existen `channel_agent_start/tool_start/tool_end/end` |
| `DelegationTaskCard` con barra de progreso | Reutilizar `ToolCallRow` |
| Pipeline de steps como modelo de datos | Es UI sobre tool calls existentes |
| Sistema DELEGATE vs NEGOTIATE en orchestrator | Es directiva de prompt del lider |
| Indicadores visuales de negociacion (Phase E) | Scope creep, no resuelve bugs |

---

## 4. Plan de implementacion

### Step 1: Fix B1 (race condition)

`channel-orchestrator.ts:176-178` — Remover `decrementChain` temprano en modo no-broadcast.

`delegate-tool.ts:167-172` — Esperar resolucion del chain correctamente.

### Step 2: Fix B5 (secuencial por defecto)

`channel-orchestrator.ts:166` — Hacer que `isBroadcastChannel` sea `true` por defecto para canales nuevos (al menos el lider).

### Step 3: Unificar sesiones de subagente

Ejecutar plan `unify-subagent-session-creation.md`. Esto asegura que sesiones delegadas esten registradas.

### Step 4: Forward de eventos canal → padre

`delegate-tool.ts` target `channel`: suscribirse a eventos del canal filtrados por `sessionId`/`executionId`. Forwardear al padre via `forwardSubagentEvents` (mismo patron que agent/project/session).

---

## 5. Metricas

| Metrica | Diseno original | Contrapropuesta |
|---|---|---|
| Archivos nuevos | ~8 (registry, drawer, task card, APIs, tipos) | ~1 (DelegationDrawer) |
| Lineas estimadas | ~1200 | ~300 |
| APIs REST nuevas | 3 endpoints | 0 (reusa sesiones) |
| Tipos de mensaje WS nuevos | 5 | 0 (reusa existentes) |

| Modelos de datos nuevos | 3 (Execution, Step, TaskRegistry) | 0 |
| Dias estimados | 10-13 | 4-5 |
