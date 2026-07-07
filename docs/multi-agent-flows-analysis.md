# Reporte: Flujos Multi-Agente en CrewFactory

## Los 7 flujos distintos

Hay **siete mecanismos diferentes** para ejecutar tareas con múltiples agentes, agrupados en tres categorías.

---

## GRUPO A: Canales (colaboración multi-agente persistente)

Usado desde `ChannelsPage.tsx` (chatrooms persistentes con miembros configurables).

### Flujo 1 — Modo Paralelo (default)

- **Dispatcher:** `ChannelOrchestrator.dispatchUserMessage()` → `runDispatchRound()`
- **Archivo:** `channels/channel-orchestrator.ts:208-240`
- **Comportamiento:** Todos los agentes elegibles se despachan **al mismo tiempo** (fire-and-forget). Cada uno responde a su ritmo, y cuando termina su respuesta se postea al canal. Los demás agentes ven esa respuesta y pueden reaccionar.
- **Resolución de destinatarios:** `resolveRecipients()` en `channel-orchestrator.ts:889` evalúa `replyMode`:
  - `user-only`: Solo recibe mensajes del usuario
  - `broadcast`: Recibe todo
  - `targeted`: Solo recibe de `targetAgentIds` específicos
  - `mention-only`: Solo si es explícitamente @mencionado
  - Los `@mentions` siempre incluyen al agente mencionado sin importar el modo.
- **Chain depth:** Configurable por canal (default 5, máximo 50).
- **Negociación:** Opcional, con regex de agreement/counter/rejection y árbitro configurable.
- **Delegación explícita:** Solo agentes con rol `lead` pueden parsear `DELEGATE: @agent -- task` en sus outputs para crear tareas en el `TaskLedger`.
- **Streaming:** Sí, live tokens vía WebSocket a todos los clientes suscritos al canal.
- **Persistencia:** Mensajes guardados como `.jsonl` en disco. Estado de negociación y task ledger también persistidos.

### Flujo 2 — Modo Secuencial Broadcast

- **Dispatcher:** `ChannelOrchestrator.runSequentialBroadcastLoop()`
- **Archivo:** `channels/channel-orchestrator.ts:1002-1134`
- **Se activa cuando** al menos un miembro del canal tiene `replyMode: "broadcast"` (`channel-orchestrator.ts:187`).
- **Comportamiento:** Itera por **todos** los miembros del canal en orden. Cada agente recibe el mensaje del agente anterior como entrada. Es **síncrono** — espera a que un agente termine antes de pasar al siguiente. Cada ronda recorre la lista completa de miembros.
- **Terminación:** Cuando toda una ronda produce solo `(silent)` (equilibrio alcanzado) o se alcanza `maxChainDepth`.
- **Negociación:** Corre `NegotiationStateMachine` después de cada respuesta. Si detecta acuerdo (`agreed`), detiene la secuencia y emite `channel_negotiation_agreement`.
- **Task Ledger:** Marca tareas pendientes como `done` antes de que cada agente responda.
- **Streaming:** Sí, igual que el paralelo.

---

## GRUPO B: Laboratorio (experimentos temporales, sin persistencia)

Usado desde `LaboratoryPage.tsx`. Reutiliza el `ChannelOrchestrator` pero con infraestructura descartable (agentes y canales con prefijo `lab_`, que se filtran del UI y se destruyen al terminar). Corre 3 variantes en secuencia y luego un LLM Judge que las evalúa.

### Flujo 3 — Single-Agent Baseline

- **Runner:** `ExperimentRunner.runSingleVariant()`
- **Archivo:** `laboratory/experiment-runner.ts:231-379`
- **Agentes:** 1 solo, temporal (`lab_{expId}_single_{agentId}`)
- **Modo de respuesta:** `user-only` (solo responde al usuario)
- **Chain depth:** 3
- **Sin negociación ni delegación**
- **Sin streaming al UI**
- Termina cuando el agente responde, luego se limpia todo (agente stopped, canal y sesión eliminados opcionalmente).

### Flujo 4 — Multi-Agent Sin Líder

- **Runner:** `ExperimentRunner.runMultiVariant()` con `multiNoLeader`
- **Archivo:** `laboratory/experiment-runner.ts:381-652`
- **Agentes:** 2+ (mínimo forzado por validación), todos temporales
- **Modo de respuesta:** Todos los miembros usan `broadcast` (todos se hablan entre sí en ronda)
- **Chain depth:** 8
- **Sin negociación ni delegación** (`negotiationProtocol: undefined`)
- El `ChannelOrchestrator` detecta el modo broadcast y ejecuta `runSequentialBroadcastLoop`.
- Sin streaming al UI.

### Flujo 5 — Multi-Agent Con Líder

- **Runner:** `ExperimentRunner.runMultiVariant()` con `multiWithLeader`
- **Archivo:** `laboratory/experiment-runner.ts:381-652`
- **Agentes:** 3+ (mínimo forzado por validación)
- **Modo de respuesta:** `targeted`
  - Líder (rol `lead`): apunta a `__user__` + todos los demás agentes
  - Agentes de marketing: apuntan solo al líder
  - Agentes de desarrollo: apuntan al tech lead/líder
- **Chain depth:** 15
- **Con negociación:** Agreement pattern + árbitro configurado desde el blueprint
- **Con delegación:** El líder (rol `lead`) puede descomponer tareas vía `DELEGATE: @agent -- task` en sus outputs
- Sin streaming al UI.

---

## GRUPO C: Herramientas del Agente (delegación/spawn bajo demanda)

Disponibles solo para el agente global y agentes de proyecto. **Nunca** disponibles para agentes de laboratorio (`lab_`).

### Flujo 6 — `delegate_task`

- **Tool:** `core/delegate-tool.ts:64-361`
- **Schema:** `packages/shared/src/schemas.ts` (DelegateTaskInput)
- **4 targets posibles:**
  - `agent`: Obtiene el agente del registry, crea sesión aislada (`del_{toolCallId}`), lo prompts, parsea el envelope estructurado de la respuesta. Eventos forwardeados al padre como `subagent_event` vía WebSocket.
  - `project`: Crea sesión scoped al proyecto, mismo patrón de envelope.
  - `channel`: Obtiene el canal del store, despacha vía `channelOrchestrator.dispatchUserMessage()`, espera a que termine la cadena, recolecta el último mensaje del agente.
  - `session`: Reutiliza una sesión existente, prompts, parsea envelope.
- **Características comunes:**
  - Soporta abort signal propagation
  - Retorna resultado estructurado: `status`, `executive_summary`, `artifacts`, `risks`
  - Opción `includeFullHistory` para logs completos de la conversación
  - Eventos forwardeados al padre: `broadcastToSession(parentSessionId, { type: "subagent_event", ... })`
- **Streaming:** Forwardea tokens/thinking/tool calls del subagente al padre vía WebSocket.

### Flujo 7 — `spawn_subagent`

- **Tool:** `core/spawn-subagent-tool.ts:75-312`
- **Schema:** `packages/shared/src/schemas.ts` (SpawnSubagentInput)
- **Agente completamente nuevo y aislado.** Sin vínculo a canales, proyectos, o agentes existentes.
- Usa el `SessionManager` **vendored** directamente (NO el de CrewFactory). Esto significa que no comparte estado ni configuración con el sistema principal.
- **Tools limitados:** Solo `read_file`, `write_file`, `edit_file`, `bash`, `grep`, `find`, `ls`, `render_tools`, `refresh_ui`. **Explícitamente NO tiene** `delegate_task` ni `spawn_subagent` (previene recursión infinita).
- Hereda el modelo del padre (`parentSessionId`).
- Sesión guardada en `sessions/{parentSessionId}/subagents/sub_{toolCallId}/`.
- Metadata del padre (`channelId`, `agentId`, `projectName`) extraída para contexto.
- Retorna envelope estructurado igual que `delegate_task`.

---

## Matriz comparativa

| Característica | Ch. Paralelo | Ch. Secuencial | Lab Single | Lab No Líder | Lab Con Líder | delegate_task | spawn_subagent |
|---|---|---|---|---|---|---|---|
| **Persistencia** | Sí (JSONL) | Sí (JSONL) | No (temp) | No (temp) | No (temp) | Según target | No |
| **Cantidad agentes** | N cualquiera | N cualquiera | 1 | 2+ | 3+ | 1 target | 1 fresh |
| **Dispatch** | Paralelo async | Secuencial sync | Directo | Secuencial broadcast | Targeted tree | Directo | Directo |
| **Reply mode** | Configurable | broadcast | user-only | broadcast | targeted | N/A | N/A |
| **Negociación** | Opcional | Opcional | No | No | Sí (agreement) | No | No |
| **Delegación** | Lead-only | Lead-only | No | No | Sí (lead) | N/A | No |
| **Chain depth** | Config (5-50) | Config (5-50) | 3 | 8 | 15 | N/A | N/A |
| **Streaming UI** | Sí (tokens live) | Sí (tokens live) | No | No | No | Vía padre WS | Vía padre WS |
| **Tiene delegate/spawn** | Según agente | Según agente | No | No | No | N/A | No |
| **Usa ChannelOrchestrator** | Sí | Sí | Sí | Sí | Sí | Sí (si target=channel) | No |
| **Prefijo session** | N/A | N/A | `lab_` | `lab_` | `lab_` | `del_` | `sub_` |

---

## Arquitectura de canales

### Componentes clave del ChannelOrchestrator

| Componente | Archivo | Rol |
|---|---|---|
| `ChannelOrchestrator` | `channels/channel-orchestrator.ts` | Core: dispatch, negociación, task decomposition, streaming |
| `ChannelStore` | `channels/channel-store.ts` | Persistencia de mensajes (JSONL), estado de negociación, task ledger |
| `AgentWorkQueue` | `channels/agent-work-queue.ts` | Cola de ejecución por agente con abort support |
| `NegotiationStateMachine` | `channels/negotiation-state.ts` | State machine de agreement/counter/rejection |
| `TaskLedger` | `channels/task-ledger.ts` | Registro de tareas delegadas vía `DELEGATE: @agent` |
| `parseMentions` | `channels/mention-parser.ts` | Parseo de `@agentName` o `@agentId` en mensajes |

### Ciclo de vida de un dispatch (modo paralelo)

```
dispatchUserMessage()
  ├── parseMentions() — extrae @menciones del mensaje
  ├── appendMessage() — guarda mensaje del usuario
  ├── broadcast() — notifica a clientes WebSocket
  ├── resetNegotiationState() — limpia estado previo
  ├── reset TaskLedger — limpia tareas previas
  ├── si hay broadcast members → runSequentialBroadcastLoop()
  └── si no → runDispatchRound()
       └── para cada agente elegible:
            └── dispatchToAgentAsync()
                 ├── AgentWorkQueue.enqueue()
                 ├── runAgentPrompt()
                 │    ├── buildAgentPrompt() — construye mensaje con roster, reglas, historial
                 │    ├── sessionManager.prompt() — ejecuta el modelo
                 │    ├── broadcast() — streaming de tokens/thinking/tools
                 │    └── detecta (silent) para respuestas vacías
                 ├── negotiation protocol checks (si configurado)
                 ├── DELEGATE parsing (si rol=lead)
                 ├── appendMessage() — guarda respuesta
                 └── runDispatchRound() — siguiente ronda recursiva
```

---

## Inconsistencias y puntos de fricción

### 1. `waitChannelIdle` es polling en vez de Promise

**Archivo:** `benchmark/harness.ts:21`

Espera 800ms entre chequeos de `activeStreams` y `agentQueues`. El `ChannelOrchestrator` ya tiene `activeChains` — un `Map<string, { count: number; resolve: () => void }>` — que mantiene un `Promise<void>` resuelto cuando todos los agentes terminan. Pero `waitChannelIdle` no lo usa, en su lugar hace polling manual.

El `dispatchUserMessage` retorna `chainPromise`, pero casi nadie lo espera:
- WS handler (`ws/handler.ts:450`): `.catch()` sin await
- REST route (`routes/channels.ts:213`): `.catch()` sin await
- `delegate-tool.ts:248`: **Sí** lo espera
- `experiment-runner.ts:305,556`: No lo espera, usa `waitChannelIdle` en su lugar

### 2. `parseEnvelope` duplicado

**Archivos:** `delegate-tool.ts:18-62` y `spawn-subagent-tool.ts:26-73`

60 líneas idénticas. Extraer a un shared utility.

### 3. Dos mecanismos de delegación que se solapan

Dentro de un canal, un agente puede recibir un mensaje por dos vías distintas simultáneamente:
- **Implícita:** `resolveRecipients()` según reply mode (broadcast/targeted/mention-only)
- **Explícita:** `DELEGATE: @agent -- task` parseado del output de un agente lead

El `AgentWorkQueue` serializa la ejecución así que no hay race condition, pero un agente podría recibir el mismo contexto dos veces con intención diferente.

### 4. Prefijos mágicos de session ID sin centralizar

| Prefijo | Significado | Dónde se define |
|---|---|---|
| `exec_` | Read-only execution logs (bloqueado de prompts) | `session-manager.ts` |
| `del_` | Delegated task (recibe instrucciones de envelope estructurado) | `session-manager.ts:408-419` |
| `sub_` | Spawned subagent (guardado en parent/subagents/) | `spawn-subagent-tool.ts:123` |
| `lab_` | Laboratory agents/channels (filtrados del UI) | `agent-registry.ts:105`, `channel-store.ts:88` |
| `generate_` | AI experiment generation (temporal) | `routes/experiments.ts` |
| `bench_` | Benchmark sessions (temporal) | `benchmark/harness.ts` |

No hay un enum o constante central que los defina. El comportamiento especial de cada prefijo está disperso en condicionales por todo el código.

### 5. Exclusión de herramientas en labs en dos lugares distintos

Los agentes de laboratorio (`lab_`) no reciben `delegate_task` ni `spawn_subagent`. Esto se aplica en:
- `create-agent-server.ts:141-149`: Pasa `undefined` para `subagentOptions` cuando `isLaboratory === true`
- `agent-registry.ts:105`: Filtra agentes `lab_` de las listas del UI

Si se agrega una nueva herramienta que deba excluirse en labs, hay que recordar tocar ambos lugares.

### 6. ChannelStore no distingue canales persistentes de temporales

Los canales de laboratorio (`lab_*`) escriben mensajes `.jsonl` igual que los canales persistentes. Aunque se filtran del UI (`channel-store.ts:88`), los archivos quedan en disco. No hay un mecanismo de cleanup automático para canales temporales.

### 7. Límites de chain depth arbitrariamente distintos

| Contexto | Chain depth |
|---|---|
| Canal (default) | 5 |
| Canal (máximo configurable) | 50 |
| Lab Single | 3 |
| Lab Multi No Leader | 8 |
| Lab Multi Con Líder | 15 |

No hay una justificación documentada para estos valores. Son defaults hardcodeados en cada entry point.

---

## Conclusión

Hay **tres "sabores" de multi-agente** que conceptualmente hacen lo mismo (varios agentes colaborando en una tarea) pero con implementaciones que difieren en:

- **Persistencia:** Canales: sí (JSONL completo). Lab: no (temporal, se descarta). Tools: híbrido (depende del target).
- **Topología de comunicación:** Broadcast plano (todos contra todos), líder-seguidores (árbol con root), 1-a-1 directo (delegate/spawn).
- **Visibilidad en UI:** Canales: streaming live de tokens/thinking/tools. Lab: resultados post-hoc (solo output final). Tools: forward vía WebSocket del padre.
- **Límites de profundidad:** Arbitrariamente distintos sin criterio documentado.
- **Features:** Negociación, task decomposition, y delegation solo en algunos flujos.

La arquitectura subyacente es sólida — el `ChannelOrchestrator` (1138 líneas) es el corazón que todos comparten — pero la configuración de cada flujo está dispersa en múltiples entry points con defaults hardcodeados. Un refactor candidato sería unificar esto en un `ExecutionProfile` o `RunConfig` central que cada flujo instancie con sus overrides, en vez de que cada uno hardcodee sus propios valores.

---

## Índice de archivos relevantes

| Archivo | Líneas | Rol |
|---|---|---|
| `apps/server/src/channels/channel-orchestrator.ts` | 1-1138 | Core multi-agent orchestration: dispatch, negotiation, task decomposition, streaming |
| `apps/server/src/channels/channel-store.ts` | 1-266 | Message/state persistence (JSONL files on disk) |
| `apps/server/src/channels/agent-work-queue.ts` | 1-106 | Per-agent serial execution queue with abort support |
| `apps/server/src/channels/negotiation-state.ts` | 1-86 | Agreement/counter/rejection pattern matching state machine |
| `apps/server/src/channels/task-ledger.ts` | 1-76 | Task assignment ledger for lead-role DELEGATE parsing |
| `apps/server/src/laboratory/experiment-runner.ts` | 1-653 | Lab experiment execution: single/multi variants, judge |
| `apps/server/src/laboratory/experiment-store.ts` | — | CRUD for experiments on filesystem |
| `apps/server/src/laboratory/judge.ts` | — | LLM judge evaluation of all variants |
| `apps/server/src/core/delegate-tool.ts` | 1-361 | `delegate_task` tool: agent/project/channel/session targets |
| `apps/server/src/core/spawn-subagent-tool.ts` | 1-312 | `spawn_subagent` tool: isolated fresh-context execution |
| `apps/server/src/core/session-manager.ts` | 1-1070 | Session lifecycle, workspace CWD resolution, system prompts |
| `apps/server/src/core/ui-tools.ts` | 1-268 | UI tools including refresh_ui, conditional delegate/spawn injection |
| `apps/server/src/core/default-factory-skills.ts` | 1-484 | System prompts teaching agents about delegation tools |
| `apps/server/src/ws/handler.ts` | 1-480 | WebSocket handler: channel messages, session streaming, auth |
| `apps/server/src/routes/sessions.ts` | 1-772 | REST: session CRUD, tools config, subagent message retrieval |
| `apps/server/src/routes/channels.ts` | 1-481 | REST: channel CRUD, dispatch, benchmark, optimize |
| `apps/server/src/routes/experiments.ts` | 1-478 | REST: experiment CRUD, run, stop, judge, generate, instantiate |
| `apps/server/src/agents/agent-registry.ts` | 1-223 | Agent lifecycle: register, start, stop, list (filters `lab_` agents) |
| `apps/server/src/agents/create-agent-server.ts` | 1-447 | Agent server creation: session setup, tools, model, lab-detection |
| `apps/server/src/benchmark/harness.ts` | 1-307 | Benchmark harness + `waitChannelIdle` polling utility |
| `packages/shared/src/schemas.ts` | 1-573 | All Zod schemas: Channel, Agent, Experiment, ReplyMode, etc. |
| `apps/client/src/hooks/useChannel.ts` | 1-293 | Client-side channel hook: WS events, streaming state |
| `apps/client/src/pages/ChannelsPage.tsx` | 1-334 | Client: channel list, create, manage members/context |
| `apps/client/src/pages/LaboratoryPage.tsx` | 1-282 | Client: experiment viewer with single/multi/compare tabs |
| `apps/client/src/components/laboratory/IaGenerator.tsx` | 1-800 | Client: AI team generation, instantiation, experiment creation |
