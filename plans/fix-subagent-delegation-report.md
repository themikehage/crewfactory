# Fix Subagent Delegation: Silent Failures, Missing Reports & Broken UI

## Status: Draft

## Problem Statement

Los subagentes (spawn_subagent y delegate_task) tienen tres fallos criticos que rompen la experiencia de delegacion. Los subagentes fallan silenciosamente al intentar escribir archivos, no emiten un reporte final visible en el chat, y el mensaje de finalizacion al padre nunca se muestra sin refrescar la pagina.

## Diagnostico

### P1: Subagentes no pueden escribir y fallan silenciosamente

**Raiz**: El sistema de permisos en cascada bloquea las operaciones de escritura sin feedback visible.

- **Subagentes `"builder"`**: `write`, `edit`, `bash` tienen accion `"ask"` — requieren aprobacion del usuario via `tool_approval_request` enviado por WebSocket a la sesion padre
- **Subagentes `"explorer"`**: `write`, `edit`, `bash` tienen accion `"deny"` — totalmente bloqueados

El `beforeToolCall` hook (`before-tool-call-hook.ts:12-83`) emite un `tool_approval_request` a la sesion padre pero:
- No hay timeout: si el usuario ignora o no ve la approval card, el subagente se queda bloqueado para siempre
- No hay fallback automatico: el subagente no recibe un "denied" despues de N segundos
- El error no se notifica de forma visible al usuario en el chat

**Archivos clave**:
- `apps/server/src/core/sandbox/subagent-permissions.ts:23-55` — `write/edit/bash` como `"ask"` para builder, `"deny"` para explorer
- `apps/server/src/core/sandbox/permission-engine.ts:98-123` — `SUBAGENT_DENY_RULES` adicionales (bloqueo de `.env`, `rm -rf` en dirs criticos)
- `apps/server/src/core/session/before-tool-call-hook.ts:12-83` — emision de `tool_approval_request` sin timeout

### P2: Subagentes no emiten reporte final visible al terminar

**Raiz**: El mensaje de resultado se genera correctamente pero se pierde en el filtro del frontend.

El flujo completo:
1. Subagente termina → `formatDelegationResultMessage()` (`agent-utils.ts:137-180`) crea mensaje con `role: "user"` y `details.type = "delegation_notification"` con status, summary, artifacts, risks
2. `addDelegationResult()` → `followUp()` → encolado en `followUpQueue`
3. `continue()` reinicia el agent loop → el mensaje se emite como `message_start` / `message_end`
4. ✅ Persistido en disco via `sessionManager.appendMessage()`
5. ✅ Enviado por WebSocket al frontend
6. ❌ **`ChatArea.tsx:320`** filtra `msg.role === "user"` → el mensaje nunca llega al estado `messages`
7. ❌ **`ChatArea.tsx:374`** mismo filtro en `message_end` → doble barrera

El componente `DelegationNotification` (`MessageList.tsx:365-436`) busca `details.type === "delegation_notification"` en mensajes `role: "user"` (linea 647), pero esos mensajes nunca entran en el estado `messages` del frontend via WebSocket.

### P3: Mensaje de finalizacion intermitente, nunca visible sin refrescar

**Raiz**: Combinacion del filtro del frontend (P2) + condiciones de carrera y fallos silenciosos en el backend.

| Escenario | Resultado |
|-----------|-----------|
| WS conectado, sesion padre viva, `continue()` OK | Asistente responde (visible), pero tarjeta `DelegationNotification` NO aparece (filtrada en frontend) |
| WS desconectado durante finalizacion | Eventos WS perdidos. Reconexion re-fetcha mensajes a los 500ms (`ChatArea.tsx:481`), pero puede haber race |
| `sessionManager.getSession()` devuelve null (sesion padre destruida) | Resultado descartado permanentemente con `console.warn` (`spawn-subagent-tool.ts:273`) |
| Multiples subagentes terminan a la vez | `isStreaming` protege (solo uno llama `continue()`), otros quedan en `followUpQueue`. Si el primer `continue()` tira error, los demas quedan huerfanos |
| `followUpQueue` vacio al llamar `continue()` | `agent.ts:371` tira "Cannot continue from message role: assistant", capturado por `.catch()` → abandono silencioso |

**Por que un refresh lo arregla**: `loadMessages()` (`ChatArea.tsx:220`) hace `GET /api/sessions/{id}/messages` que devuelve TODOS los mensajes del archivo de sesion. El API no filtra por rol, asi que el mensaje de delegacion entra en `setMessages()` y `DelegationNotification` se renderiza.

## Plan de Implementacion

### Phase 1: Fix Frontend Filter — Permitir mensajes de delegacion (prioridad CRITICA)

#### 1.1 Modificar filtros en ChatArea.tsx
- **Archivo**: `apps/client/src/components/chat/ChatArea.tsx`
- Modificar el filtro de `message_start` (linea 320) para permitir mensajes `role: "user"` que tengan `details` con tipo de delegacion
- Modificar el filtro de `message_end` (linea 374) con la misma logica
- Importar `DELEGATION_NOTIFICATION_TYPE` desde shared si no esta ya disponible

```typescript
// Antes (linea 320):
if (msg.role === "user") return;

// Despues:
const isDelegationNotification = !!(msg as any).details?.type;
if (msg.role === "user" && !isDelegationNotification) return;
```

#### 1.2 Verificar rendering de DelegationNotification
- Confirmar que `MessageList.tsx:647` renderiza correctamente con los datos del mensaje
- Verificar que el mensaje de delegacion se agrupa correctamente en `buildGroups()`
- Probar con delegacion completada: la tarjeta debe aparecer en tiempo real sin refresh

### Phase 2: Fix Escritura de Subagentes — Timeout y Feedback (prioridad ALTA)

#### 2.1 Agregar timeout a tool_approval_request para subagentes
- **Archivo**: `apps/server/src/core/session/before-tool-call-hook.ts`
- Agregar un timeout de 30s para `tool_approval_request` de subagentes
- Al expirar, resolver automaticamente como `denied` en vez de bloquear indefinidamente
- Emitir un `ui_action_error` al frontend con mensaje descriptivo

#### 2.2 Mejorar mensajes de error en permisos denegados
- **Archivo**: `apps/server/src/core/sandbox/permission-engine.ts`
- Cuando un tool call es denegado por reglas de subagente, el mensaje de error debe indicar claramente que herramienta fue bloqueada y por que
- Formatear como `toolResult` con `isError: true` para que el subagente pueda reaccionar

#### 2.3 Agregar indicador visual de permisos en la UI
- **Archivo**: `apps/client/src/components/chat/tools/ToolCallRow.tsx`
- Cuando un tool call falla por permisos denegados, mostrar un badge visual "Permission Denied" en rojo
- El error debe ser visible en el log del subagente (cuando se abre desde DelegationDrawer o DelegationsPanel)

### Phase 3: Robustez en Entrega de Resultados (prioridad ALTA)

#### 3.1 Manejar sesion padre no encontrada
- **Archivos**: `apps/server/src/core/tools/spawn-subagent-tool.ts`, `apps/server/src/core/tools/delegate-tool.ts`
- Cuando `sessionManager.getSession()` devuelve null, en vez de `console.warn` silencioso:
  - Persistir el resultado en el archivo de sesion del padre directamente via `sessionManager.appendMessageToSession()`
  - Emitir `delegation_completed` con status `"orphaned"` para que el frontend pueda mostrarlo en el panel de delegaciones

#### 3.2 Proteger continue() contra fallos
- **Archivo**: `apps/server/src/core/tools/spawn-subagent-tool.ts` (linea 267-269), `apps/server/src/core/tools/delegate-tool.ts` (linea 245-249)
- Si `continue()` falla, reintentar una vez despues de 1s
- Si el reintento falla, persistir el resultado via `appendMessageToSession()` y emitir `delegation_completed`
- Loggear el error con contexto completo para debugging

#### 3.3 Manejar multiples subagentes concurrentes
- **Archivo**: `apps/server/src/core/tools/spawn-subagent-tool.ts`
- Si `parent.isStreaming` es true, verificar `followUpQueue` en vez de llamar `continue()`
- El agent loop ya procesa `followUpQueue` al terminar su ciclo actual (`agent-loop.ts:264-270`)
- Verificar que esto funciona correctamente con tests de concurrencia

### Phase 4: Verificacion y Tests

#### 4.1 Test manual de delegacion completa
- Crear subagente builder → debe poder escribir archivos (con aprobacion)
- Crear subagente explorer → debe mostrar error claro al intentar escribir
- Completar delegacion → DelegationNotification debe aparecer en chat sin refresh
- Cerrar y reabrir sesion → DelegationNotification debe persistir
- Delegar a canal → debe funcionar y mostrar resultado

#### 4.2 Verificar compilacion
- `bun run build` en apps/server
- `cd apps/client && bun run build`
- Sin errores de TypeScript

## Riesgos

1. **Compatibilidad hacia atras**: El cambio en el filtro de `ChatArea.tsx` podria permitir mensajes `role: "user"` no deseados. Mitigacion: filtrar solo por `details.type` conocido (DELEGATION_NOTIFICATION_TYPE).
2. **Timeout demasiado corto**: 30s puede no ser suficiente para que el usuario vea y responda una approval card. Mitigacion: hacer el timeout configurable (empezar en 60s) y mostrar countdown en la UI.
3. **Persistencia directa**: `appendMessageToSession()` debe ser atomico para no corromper el archivo de sesion. Mitigacion: usar el metodo existente del SessionManager que ya tiene locks.

## Entregables

1. Fix en `ChatArea.tsx` — filtros de `message_start`/`message_end` permiten mensajes de delegacion
2. Timeout de 60s para `tool_approval_request` de subagentes con auto-deny
3. Mensajes de error descriptivos para permisos denegados
4. Manejo de sesion padre no encontrada con persistencia directa
5. Reintento de `continue()` con fallback a persistencia
6. Test manual de flujo completo de delegacion
7. Compilacion limpia de server y client
