# Fix: Channel Workspace, Tool Execution Persistence & Stuck Session Recovery

Diagnostico y correccion de tres bugs que afectan la experiencia de canales: workspace invisible, tool calls que desaparecen, y sesiones trabadas sin registro.

---

## Diagnostico

### Bug 1: El Workspace del Canal Esta Vacio (Files Tab)

**Causa raiz: Desacople de directorios.** Los agentes escriben en su propio workspace, la pestana Files lee el workspace del canal.

| Quien | Donde escribe/lee | Path real |
|-------|-------------------|-----------|
| Agente (tools: write, edit, bash) | `cwd` del agent session | `{data}/users/{user}/agents/{agentId}/workspace/` |
| Pestana Files del canal | `?channelId=X` → `getChannelWorkspaceDir()` | `{data}/users/{user}/channels/{channelId}/workspace/` |

**Codigo relevante:**
- `create-agent-server.ts:41` — hardcodea `workspaceDir = join(agentDir, "workspace")` 
- `agent-prompt-runner.ts:178` — usa `agentEntry.server.session.cwd` (que es el agent workspace)
- `files.ts:28` — `validateWorkspacePath()` resuelve a `getChannelWorkspaceDir(username, channelId)`
- `getChannelWorkspaceDir()` en `paths.ts:80` — apunta a `channels/{id}/workspace/`

El directorio `channels/{id}/workspace/` nunca recibe archivos porque ningun agente escribe alli.

### Bug 2: Tool Executions Desaparecen del Chat

**Causa raiz: Rotacion de logs + limite de lectura + estado volatil.**

| Causa | Mecanismo | Codigo |
|-------|-----------|--------|
| Rotacion a 10MB | `appendMessage()` rota `messages.jsonl` a `messages.{ts}.jsonl` y crea archivo nuevo | `channel-store.ts:197-208` |
| Archivos rotados NUNCA se leen | `getMessages()` solo lee el `messages.jsonl` activo | `channel-store.ts:210-270` |
| Limite de 100 mensajes | Solo se leen los ultimos 100 al cargar el canal | `useChannel.ts:60`: `limit=100` |
| Sincronizacion de historia del agente | `syncChannelHistory()` reemplaza la historia del agente con solo 20 mensajes | `agent-prompt-runner.ts:174` → `session-persistence.ts:627` |
| Estado de streaming volatil | `streamingAgents` con tool calls en progreso se pierde al refrescar | `useChannel.ts:226-239` |

**El dato SI se persiste en `ChannelMessage.toolCalls`**, pero se vuelve inaccesible cuando:
1. El archivo rota (>10MB)
2. El mensaje esta fuera de los ultimos 100
3. El limite de 20 mensajes en syncChannelHistory descarta mensajes viejos

### Bug 3: Sesiones de Canal Trabadas sin Registro

**Causa raiz: La sesion de UI del canal nunca recibe mensajes; el agente usa su propia sesion.**

| Problema | Detalle |
|----------|---------|
| `POST /api/sessions` con `channelId` crea metadata vacia | La sesion existe en disco (`sessions/{id}/metadata.json`) pero sin mensajes |
| El agente usa `agentEntry.server.session` | Esa sesion pertenece al agente, no al canal |
| `stalled` recovery solo actualiza `ChannelExecutionStore` | Los eventos van a `channels/{id}/executions/runs/{execId}/events.jsonl` |
| La sesion del canal no recibe notificacion de stall | `session-lister.ts` la lista con 0 mensajes |
| `GET /api/sessions/:id/messages` no tiene datos | El JSONL de la sesion esta vacio |
| No hay UI banner para stalled | `execution_stalled` solo limpia estado, no muestra nada |

**Datos recuperables (existen pero son invisibles):**
- `GET /api/channels/:id/executions/:execId/events` — eventos del execution store
- `GET /api/channels/:id/messages` — mensajes en `messages.jsonl` (si no roto)
- `GET /api/channels/:id/executions` — lista de ejecuciones con su estado

---

## Plan de Correccion

### Fase 1: Unificar Workspace de Canal (P0)

**Objetivo:** Los agentes del canal escriben en `channels/{id}/workspace/` y la pestana Files muestra esos archivos.

1. **Modificar `agent-prompt-runner.ts` para usar channel workspace como CWD:**
   - En `runAgentPrompt()`, antes de ejecutar el prompt del agente, reasignar `cwd` al channel workspace.
   - Usar `getChannelWorkspaceDir(username, channelId)`.
   - Pasar `workspaceDir = channelWorkspaceDir` al `agentEntry.server.session.prompt()` o modificar el `cwd` del agent session temporalmente.

2. **Alternativa mas limpia: modificar `createAgentServer.ts`:**
   - Agregar parametro opcional `overrideWorkspaceDir` en `createAgentServer()`.
   - El `ChannelOrchestrator` pasa `channelWorkspaceDir` al crear/iniciar el agente.
   - El agente usa ese workspace durante la ejecucion del canal.

3. **Asegurar que `ensureWorkspaceSubdirs()` se ejecuta en el channel workspace:**
   - Llamar `ensureWorkspaceSubdirs(channelWorkspaceDir)` al iniciar la ejecucion del canal.
   - Crear `assets/uploads/` y `assets/generated/` en el workspace del canal.

4. **Verificar que `validateWorkspacePath` en `files.ts` resuelve correctamente:**
   - Ya lo hace via `channelId` → `getChannelWorkspaceDir()`.
   - Confirmar que los archivos escritos por agentes aparecen en `GET /api/workspace/*?channelId=X`.

### Fase 2: Persistir Tool Executions y Evitar Perdida (P1)

**Objetivo:** Los tool calls de canales nunca desaparecen, independientemente de rotacion de logs o refrescos.

1. **Leer archivos rotados en `getMessages()`:**
   - Modificar `channel-store.ts:getMessages()` para aceptar `includeRotated: boolean`.
   - Si `includeRotated === true`, listar `messages.*.jsonl` en el directorio del canal y mergearlos en orden cronologico inverso.
   - Aplicar el filtro `sessionId` y el `limit` sobre el merge completo.

2. **Aumentar el limite de lectura por defecto y agregar paginacion:**
   - `GET /api/channels/:id/messages?before=&limit=` — cursor-based pagination.
   - El cliente carga 100 mensajes iniciales, luego "Load more" carga el siguiente bloque.
   - Si `before` no se especifica, carga los ultimos N (default 200 en vez de 100).

3. **Persistir tool calls incrementales en `ChannelMessage`:**
   - En `agent-prompt-runner.ts`, al recibir `tool_execution_start`, crear un `pendingToolCalls` map en el `ChannelMessage` builder.
   - Al recibir `tool_execution_end`, actualizar el tool call con resultado final.
   - Al recibir `channel_agent_end`, persistir el `ChannelMessage` con `toolCalls` completo.

4. **Almacenar tool calls en archivo separado para mensajes grandes:**
   - Si `toolCalls` de un mensaje excede 10KB, guardarlos en `channels/{id}/tool-results/{messageId}.json`.
   - `getMessages()` carga los tool calls desde este archivo si existen.
   - Evita que los tool calls inflen `messages.jsonl` y aceleren la rotacion.

5. **Recuperar estado de streaming al reconectar:**
   - Si hay un `activeExecutionId` con estado `running`, el frontend pide `GET /api/channels/:id/executions/:execId/events`.
   - Reconstruye `streamingAgents` desde los eventos del execution store.
   - Muestra los tool calls parciales que estaban en progreso.

### Fase 3: Sesiones de Canal Recuperables (P2)

**Objetivo:** Toda ejecucion de canal tiene un registro de sesion completo que persiste aunque se trabe.

1. **Vincular la sesion de UI del canal con la ejecucion:**
   - Al iniciar `dispatchUserMessage()`, crear/actualizar un session real en `sessions/{sessionId}/`.
   - Escribir `metadata.json` con `channelId`, `executionId`, `status: "running"`.
   - Sincronizar mensajes del canal a la sesion: cada `channel_message` se escribe tambien en `sessions/{sessionId}/messages.jsonl`.

2. **Endpoint `GET /api/sessions/:id/messages` para sesiones de canal:**
   - Si `metadata.json` tiene `channelId`, redirigir a `channelStore.getMessages()` filtrando por `sessionId`.
   - Esto ya funciona para `exec_channel_*`, extenderlo a sesiones regulares con `channelId`.

3. **Al hacer stall, actualizar la sesion:**
   - `recoverInterruptedExecutions()` escribe `status: "stalled"` en `metadata.json` de la sesion.
   - Agrega un mensaje de sistema `[Session stalled: server restart]` al `messages.jsonl` de la sesion.
   - La sesion aparece en el Session Board con badge "Stalled" y es clickeable para revisar.

4. **UI de sesiones trabadas:**
   - Banner en `ChannelChatArea`: "This execution was interrupted. View session log" con link a la sesion.
   - Badge "Stalled" en Session Kanban para sesiones con `status: "stalled"`.
   - Al abrir la sesion, mostrar mensaje de sistema explicando el motivo del stall.
   - Boton "Retry" que re-dispara el mensaje original del usuario.

5. **Almacenar `lastUserMessage` en el execution store:**
   - `channel-execution-store.ts:startExecution()` recibe y guarda el prompt original del usuario.
   - Permite re-disparar la ejecucion exactamente como fue iniciada.

### Fase 4: Banner de Estado y UX de Recuperacion (P3)

**Objetivo:** El usuario siempre sabe que paso y puede actuar.

1. **Banner de estado en `ChannelChatArea`:**
   - Si `activeExecutionId` existe y `status === "stalled"`: banner rojo "Execution interrupted — View log | Retry".
   - Si `activeExecutionId` existe y `status === "running"` pero `streamingAgents` vacio por >30s: banner amarillo "Agents appear stuck — Abort | Wait".
   - `channel-execution-reducer.ts` debe preservar el `status` y `reason` del stall, no solo limpiar.

2. **Timer de watchdog en el frontend:**
   - Si `activeExecutionId` esta `running` y no hay `channel_agent_token` en 30s, mostrar warning.
   - Si 60s sin actividad, mostrar boton "Abort".

3. **Boton "View Session Log" en canal:**
   - Header del canal muestra el `activeExecutionId` con link a `/sessions?sessionId=X`.
   - La sesion muestra el historial completo de la ejecucion (mensajes + tool calls + eventos).

---

## Entregables

| Fase | Que cambia | Archivos clave |
|------|-----------|---------------|
| 1 | Workspace unificado | `agent-prompt-runner.ts`, `create-agent-server.ts` |
| 2 | Tool calls persistentes | `channel-store.ts`, `agent-prompt-runner.ts`, `useChannel.ts` |
| 3 | Sesiones de canal recuperables | `channel-orchestrator.ts`, `channel-execution-store.ts`, `sessions.ts`, `session-lister.ts` |
| 4 | Banner de estado + watchdog | `ChannelChatArea.tsx`, `channel-execution-reducer.ts`, `useChannel.ts` |

## Verificacion

- [ ] Un agente ejecuta `write` en un canal → el archivo aparece en Files tab del canal
- [ ] Despues de 200+ mensajes en un canal, los tool calls de los primeros mensajes siguen visibles
- [ ] Tras rotacion de `messages.jsonl` (>10MB), los mensajes antiguos se pueden cargar con "Load more"
- [ ] Un canal se traba (server restart) → la sesion aparece en Session Board como "Stalled"
- [ ] Click en sesion stalled → se ven los mensajes parciales + tool calls ejecutadas
- [ ] Banner en canal muestra "Execution interrupted — View log | Retry"
- [ ] Boton "Retry" re-dispara el mensaje original
- [ ] Watchdog muestra warning si no hay actividad en 30s
