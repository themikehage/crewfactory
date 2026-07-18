# Session Observability Plan

Recuperar, persistir y analizar sesiones historicas de agentes y canales para diagnostico post-ejecucion, auditoria y mejora continua.

## Problema Actual

- Las sesiones se almacenan en `/tmp/crewfactory` y se pierden al reiniciar el servidor.
- No hay exportacion individual de sesion (solo backup full ZIP de usuario).
- No hay busqueda, filtrado ni paginacion server-side en el listado de sesiones.
- No hay metricas agregadas por sesion (tokens totales, tool calls, coste estimado, duracion).
- Las ejecuciones de canal (`ChannelExecution`) no estan integradas en el lister de sesiones.
- No hay dashboard de analitica para patrones de uso, errores o cuellos de botella.

## Fases

### Fase 1: Enriquecimiento de Metadata de Sesion

**Objetivo:** Capturar datos agregados en `metadata.json` sin cambiar la estructura de archivos actual.

1. **Persistir metricas agregadas al finalizar sesion:**
   - `totalTokensIn` / `totalTokensOut` — suma de todos los `usage` blocks del assistant.
   - `toolCallCount` — numero total de tool calls ejecutadas.
   - `toolCallsByTool` — `Record<string, number>` con frecuencia por tool.
   - `durationMs` — diferencia entre `createdAt` y `updatedAt`.
   - `modelId` — modelo LLM usado (provider + model name).
   - `messageCount` — total de mensajes (user + assistant + system).

2. **Persistir metricas de errores:**
   - `errorCount` — total de errores de agente.
   - `lastError` — ultimo mensaje de error (sanitizado, sin secrets).
   - `errorsByTool` — errores agrupados por tool.

3. **Extender `SessionListItem` en shared:**
   - Agregar campos opcionales: `totalTokens`, `toolCallCount`, `durationMs`, `modelId`, `errorCount`.
   - El `session-lister.ts` lee estos campos de `metadata.json` (sin escanear JSONL, O(1)).

4. **Actualizar `session-manager.ts`:**
   - Hook `onSessionEnd` que recorre los mensajes de la sesion y calcula metricas.
   - Escribir `metadata.json` con los campos nuevos.

### Fase 2: Busqueda, Filtrado y Paginacion Server-Side

**Objetivo:** Permitir encontrar sesiones rapidamente sin cargar todo en memoria del cliente.

1. **Query params en `GET /api/sessions`:**
   - `?search=` — busqueda por nombre (LIKE / includes).
   - `?agentId=` — filtrar por agente programatico.
   - `?channelId=` — filtrar por canal.
   - `?projectName=` — filtrar por proyecto.
   - `?status=` — filtrar por estado (sleeping / active / streaming / task-running / error).
   - `?from=` / `?to=` — rango de fechas ISO.
   - `?page=` / `?perPage=` — paginacion (default 50).
   - `?sortBy=` / `?sortDir=` — orden (updatedAt desc por defecto).

2. **Indice ligero de sesiones:**
   - Archivo `sessions/_index.json` con array de `SessionListItem` mantenido incrementalmente.
   - Se actualiza al crear, finalizar, o eliminar sesion (append/patch/delete).
   - Evita escanear el filesystem en cada request.

3. **Eliminar paginacion/filtrado client-side existente:**
   - Migrar `getSessionContextPredicate()` a query params.
   - El cliente pasa filtros al servidor, no filtra localmente.

### Fase 3: Exportacion Individual de Sesion

**Objetivo:** Descargar una sesion completa para analisis externo o respaldo.

1. **Endpoint `GET /api/sessions/:id/export?format=jsonl|markdown|json`:**
   - `jsonl` — archivo `.jsonl` original (streaming).
   - `markdown` — conversion a Markdown legible (rol, timestamps, tool calls formateados, thinking blocks colapsados). Util para compartir con humanos.
   - `json` — objeto JSON completo con mensajes + metadata + metricas.

2. **Formato Markdown exportado:**
   ```
   # Session: Debugging auth flow
   **Model:** anthropic/claude-sonnet-4-20250514
   **Duration:** 3m 42s | **Tokens:** 12,450 in / 3,210 out
   **Tool Calls:** 8 (read: 3, grep: 2, edit: 2, bash: 1)
   **Errors:** 1

   ---

   ## User (2026-07-18 14:32:01)
   Fix the authentication middleware...

   ## Assistant (2026-07-18 14:32:15)
   I'll analyze the auth flow first...
   [Tool: read — apps/server/src/auth/middleware.ts]
   [Tool: grep — "validateSession" — 3 matches]

   ## Assistant (2026-07-18 14:35:02)
   Found the issue. The session token...
   ```

3. **Boton "Export" en el UI del chat:**
   - Dropdown en el header de sesion: Export JSONL / Export Markdown / Export JSON.
   - Soporte para sesiones virtuales (executions de API/CLI).

### Fase 4: Dashboard de Analitica de Sesiones

**Objetivo:** Vista agregada de todas las sesiones con graficos y metricas.

1. **Nuevo endpoint `GET /api/sessions/analytics`:**
   - `?from=` / `?to=` — rango opcional.
   - `?agentId=` / `?channelId=` / `?projectName=` — filtros opcionales.
   - Respuesta:
     ```json
     {
       "totalSessions": 142,
       "totalTokens": 4500000,
       "totalToolCalls": 1203,
       "totalErrors": 15,
       "totalDurationMs": 8400000,
       "avgDurationMs": 59154,
       "avgTokensPerSession": 31690,
       "sessionsByDay": [{ "date": "2026-07-18", "count": 23, "tokens": 450000 }],
       "topTools": [{ "tool": "read", "count": 450 }, { "tool": "edit", "count": 300 }],
       "topModels": [{ "model": "claude-sonnet-4", "count": 80 }],
       "errorRate": 0.105,
       "topErrors": [{ "tool": "bash", "count": 8 }]
     }
     ```

2. **Nueva pagina `/analytics` en el frontend:**
   - Barra de filtros (rango de fechas, agente, canal, proyecto).
   - Tarjetas KPI: Total sesiones, tokens totales, tool calls, errores, duracion media.
   - Grafico de barras: sesiones por dia/semana.
   - Grafico de torta: distribucion de tools usadas.
   - Grafico de torta: modelos mas usados.
   - Tabla: top sesiones por tokens consumidos.
   - Tabla: sesiones con mas errores.
   - Tema oscuro con tokens de diseno Tailwind.

3. **Link en sidebar:** "Analytics" en seccion admin.

### Fase 5: Observabilidad de Canal (Channel-Specific)

**Objetivo:** Visibilidad profunda en ejecuciones de canal (turns, agentes, scheduling).

1. **Integrar `ChannelExecution` en el lister de sesiones:**
   - Las ejecuciones de canal ya crean sesiones con `channelId` en metadata.
   - Agregar campos `executionId`, `turnCount`, `schedulingMode` a `SessionListItem`.
   - Filtrar por `channelId` en `GET /api/sessions`.

2. **Endpoint `GET /api/channels/:id/analytics`:**
   - Metricas especificas de canal:
     ```json
     {
       "totalExecutions": 45,
       "totalTurns": 230,
       "avgTurnsPerExecution": 5.1,
       "agentsParticipation": [{ "agentId": "reviewer", "turns": 80 }],
       "schedulingModes": [{ "mode": "sequential", "count": 30 }],
       "avgTokensPerTurn": 4200,
       "stalledExecutions": 2,
       "negotiationRounds": 12,
       "vetoes": 3
     }
     ```

3. **Pestana "Analytics" en ChannelDetailPage:**
   - Tarjetas KPI del canal.
   - Grafico de participacion de agentes (barras: turns por agente).
   - Timeline de ejecuciones con estado (completed / stalled / aborted).
   - Tabla de ejecuciones recientes con detalle expandible.

4. **Integracion con el Session Kanban:**
   - Las ejecuciones de canal aparecen como sesiones con badge "Channel".
   - Click navega a la vista de canal con el turno especifico resaltado.

### Fase 6: Recuperacion y Archivo

**Objetivo:** No perder sesiones historicas y poder archivarlas para referencia futura.

1. **Migrar almacenamiento de `/tmp` a `$CREWFACTORY_DATA_PATH`:**
   - Ya existe `CREWFACTORY_DATA_PATH` (default `/app/data`).
   - Las sesiones YA se almacenan alli (`<data>/users/<username>/sessions/`).
   - Verificar que NO haya referencias a `/tmp/crewfactory` en paths de sesiones.
   - El problema real es si `CREWFACTORY_DATA_PATH` no esta montado como volumen en Docker y se pierde al reiniciar el contenedor. Documentar esto.

2. **Soft-delete y archivo de sesiones:**
   - Agregar campo `archived: boolean` a `metadata.json`.
   - `POST /api/sessions/:id/archive` — marca como archivada.
   - `POST /api/sessions/:id/unarchive` — recupera de archivo.
   - `GET /api/sessions?archived=true` — filtrar archivadas.
   - Las sesiones archivadas no aparecen en el sidebar ni kanban por defecto.
   - Toggle "Show archived" en el Session Board.

3. **Batch operations:**
   - `POST /api/sessions/batch` con body `{ action: "archive" | "delete", ids: [...] }`.
   - UI: checkboxes en Session Board para seleccion multiple + botones Archive/Delete.

4. **Auto-cleanup policy (opcional, via env var):**
   - `CREWFACTORY_SESSION_RETENTION_DAYS` — auto-archivar sesiones inactivas > N dias.
   - `CREWFACTORY_SESSION_MAX_COUNT` — eliminar las mas antiguas si se excede el limite.
   - Ambas desactivadas por defecto (0 = sin limite).

### Fase 7: UI de Timeline de Sesion

**Objetivo:** Visualizar una sesion como timeline interactivo de eventos.

1. **Nueva vista de timeline en el chat (toggle Chat / Timeline):**
   - Eje vertical con eventos: user message, assistant message, tool calls, thinking blocks, errores.
   - Cada tool call muestra: icono, nombre, duracion, resultado (success/error).
   - Thinking blocks colapsados con preview.
   - Hover sobre evento muestra timestamp preciso.
   - Click en tool call expande el resultado completo.

2. **Timeline especifico de canal:**
   - Muestra turns de cada agente en paralelo (lineas horizontales por agente).
   - Indicadores de scheduling: esperando turno, ejecutando, completado, fallido.
   - Negociaciones resaltadas con badge "Negotiation".
   - Permite hacer zoom a un rango de tiempo especifico.

### Fase 8: Auditoria y Compliance

**Objetivo:** Registro de auditoria para operaciones sensibles.

1. **Audit log centralizado:**
   - Archivo `_audit/{username}/audit.log` (ya existe parcialmente para `env-access.log`).
   - Eventos: session.create, session.delete, session.export, session.archive, tool.call (con parametro `audit: true`).

2. **Endpoint `GET /api/audit`:**
   - Filtros: `?action=` `?from=` `?to=` `?sessionId=`.
   - Solo accesible por el propio usuario.

3. **Tool `audit_log` para agentes (opcional):**
   - Permite al Global Factory Director consultar el historial de auditoria.
   - Util para diagnosticar quien/cuando modifico algo.

## Entregables

| Fase | Entregable | Dependencias |
|------|-----------|-------------|
| 1 | Metadata enriquecida + metricas agregadas en `metadata.json` | Ninguna |
| 2 | Busqueda, filtrado y paginacion server-side | Fase 1 |
| 3 | Exportacion individual de sesion (JSONL/Markdown/JSON) | Fase 1 |
| 4 | Dashboard de analitica (`/analytics` + `/api/sessions/analytics`) | Fase 1, 2 |
| 5 | Observabilidad de canal (`/api/channels/:id/analytics`, pestana Analytics) | Fase 1, 4 |
| 6 | Archivo, soft-delete, batch ops, auto-cleanup | Fase 1, 2 |
| 7 | Timeline de sesion visual (vista interactiva) | Fase 1 |
| 8 | Auditoria centralizada (`/api/audit`) | Fase 1 |

## Metrica de Exito

- Toda sesion finalizada tiene `metadata.json` con `totalTokensIn`, `totalTokensOut`, `toolCallCount`, `durationMs`, `modelId`, `errorCount`.
- `GET /api/sessions` soporta `?search=`, `?agentId=`, `?channelId=`, `?from=`, `?to=`, `?page=`, `?perPage=`.
- `GET /api/sessions/:id/export?format=markdown` produce un Markdown legible en <200ms para sesiones <10MB.
- `GET /api/sessions/analytics` devuelve metricas agregadas en <500ms.
- Las sesiones sobreviven a reinicios del servidor (almacenadas en volumen Docker, no en `/tmp`).
- El dashboard `/analytics` renderiza graficos con datos reales del usuario.
