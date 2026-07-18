# Fix: Channel Message Bursting & Scroll Locking

Diagnostico y correccion de dos bugs criticos en la experiencia de canales multi-agente.

## Diagnostico

### Bug 1: Mensajes llegan en rafagas (percibido como "trabados")

**No es un problema de buffering en el servidor.** Cada token se envia individualmente via WebSocket sin colas ni throttling (`agent-prompt-runner.ts:238` → `broadcastFn` → `ws.send()`). El problema es de percepcion: el usuario no ve los tokens porque:

| Causa | Mecanismo | Codigo |
|-------|-----------|--------|
| `streamingRenderMode: "complete"` oculta todos los tokens | `ChannelMessageList.tsx:96-98` hace early return sin renderizar streaming agents | Cada `channel_agent_token` actualiza React state pero no pinta nada |
| `showThinking: false` (default) suprime thinking | `agent-prompt-runner.ts:243` no emite `thinking_delta` | Fase de thinking silenciosa -> pausa -> burst de texto |
| `showTools: false` (default) suprime tool calls | `agent-prompt-runner.ts:261` no emite `tool_execution_*` | Tools corren en silencio -> pausa larga -> burst |
| Agentes secuenciales (default) | `channel-orchestrator.ts:270` espera a que termine uno antes de empezar el siguiente | Stop-start entre agentes |

### Bug 2: Scroll se queda trabado abajo

**Causa raiz:** `scrollIntoView` se dispara en cada token sin awareness de posicion del usuario.

| Problema | Codigo |
|----------|--------|
| `scrollIntoView` en cada token | `ChannelMessageList.tsx:189-191`: `useEffect([messages, streamingAgents])` → `scrollIntoView()` |
| Sin `onScroll` handler | No hay tracking de `isAtBottom` |
| Sin `ResizeObserver` | No hay scroll condicional cuando el usuario scrolleo hacia arriba |
| Sin boton "scroll to bottom" | El usuario no puede elegir cuando bajar |
| Doble scroll al finalizar agente | `channel_agent_end` + `channel_message` disparan el efecto dos veces |
| Mismo bug en componente legacy | `ChannelMessages.tsx:22-24` |

---

## Plan de Correccion

### Fase 1: Fix Scroll Locking (P0 — afecta a todos los canales siempre)

**Objetivo:** El usuario puede scrollear hacia arriba libremente mientras los agentes escriben.

1. **Crear `useChannelScroll` hook en `apps/client/src/hooks/useChannelScroll.ts`:**
   - Basado en `useChatScroll.ts` pero adaptado a canales.
   - `isAtBottomRef` + `isAtBottom` state.
   - `handleScroll` callback que recalcula `isAtBottom`.
   - `ResizeObserver` que solo hace scroll cuando `isAtBottomRef.current === true`.
   - `"instant"` durante streaming, `"smooth"` solo al finalizar.
   - `showScrollButton` state + boton flotante "nuevos mensajes".
   - Exponer: `{ scrollContainerRef, showScrollButton, scrollToBottom, handleScroll }`.

2. **Reemplazar `useEffect` + `scrollIntoView` en `ChannelMessageList.tsx`:**
   - Quitar `useEffect` con `scrollIntoView` (lineas 189-191).
   - Agregar `ref={scrollContainerRef}` al contenedor de scroll.
   - Agregar `onScroll={handleScroll}`.
   - Agregar boton "scroll to bottom" condicional (como en `ChatArea.tsx`).

3. **Reemplazar `useEffect` + `scrollIntoView` en `ChannelMessages.tsx`:**
   - Mismos cambios que en `ChannelMessageList`.
   - Asegurar que el `ref` del contenedor de scroll esta en el elemento correcto.

4. **Verificar comportamiento:**
   - Abrir canal, scrollear hacia arriba mientras un agente escribe → no baja solo.
   - Hacer scroll hasta el fondo manualmente → sigue bajando solo con nuevos tokens.
   - Click en boton "scroll to bottom" → baja instantaneamente.

### Fase 2: Mejorar Percepcion de Streaming en Modo "Complete" (P1)

**Objetivo:** El usuario entiende que esta pasando aunque no vea los tokens uno a uno.

1. **Mejorar el typing indicator en `ChannelChatArea.tsx`:**
   - Mostrar nombre del agente + fase actual (thinking / executing tool / writing).
   - Usar eventos `channel_agent_token`, `channel_agent_thinking`, `channel_agent_tool_start` para inferir la fase.
   - Ejemplo: `"reviewer is thinking..."` → `"reviewer is running grep..."` → `"reviewer is writing..."`.
   - Animacion de dots diferenciada por fase (pulse lento para thinking, rapido para writing).

2. **Emitir `channel_agent_phase` desde el servidor:**
   - `agent-prompt-runner.ts` emite evento `channel_agent_phase` con `{ agentId, phase: "thinking" | "tool" | "writing" }`.
   - Incluso cuando `showThinking: false` o `showTools: false`, el evento de fase se emite (solo metadata, no contenido).
   - El cliente actualiza `streamingAgents[agentId].phase`.

3. **Mostrar progreso incremental en modo "complete":**
   - En lugar de ocultar TODO el texto en `streamingRenderMode === "complete"`, mostrar un resumen en tiempo real:
     - Numero de tool calls completadas (ej: "3 tools run").
     - Numero de caracteres acumulados (ej: "1,247 chars so far").
   - Solo el mensaje FINAL se renderiza completo al recibir `channel_message`.

### Fase 3: Hacer ShowThinking y ShowTools True por Default (P2)

**Objetivo:** Los canales nuevos muestran el proceso completo por defecto.

1. **Cambiar defaults en `channel-store.ts`:**
   - `showThinking: data.showThinking ?? true` (antes `false`).
   - `showTools: data.showTools ?? true` (antes `false`).

2. **Actualizar `ChannelSettingsModal`:**
   - Los toggles de "Show Thinking" y "Show Tools" empiezan activados.

3. **Actualizar `ChannelSchema` en shared:**
   - Valores por defecto en Zod schema a `true`.

### Fase 4: Emitir Thinking y Tool Events Aunque Este Desactivado el Render (P3)

**Objetivo:** El typing indicator muestra la fase real aunque no se rendericen los detalles.

1. **Modificar `agent-prompt-runner.ts`:**
   - Emitir `channel_agent_thinking_start` / `channel_agent_thinking_end` siempre (metadata).
   - Emitir `channel_agent_tool_start` / `channel_agent_tool_end` con `{ agentId, toolName, toolCallId }` siempre (metadata, sin args ni result).
   - El contenido completo de thinking/tools solo se emite si `showThinking`/`showTools` es true.

2. **Actualizar `useChannel.ts`:**
   - Manejar `channel_agent_thinking_start/end` y `channel_agent_tool_start/end`.
   - Actualizar `streamingAgents[agentId].phase` correctamente.

3. **Actualizar typing indicator:**
   - Usar `streamingAgents[agentId].phase` para el texto del indicador.

---

## Entregables

| Fase | Archivos modificados | Prioridad |
|------|---------------------|-----------|
| 1 | `useChannelScroll.ts` (nuevo), `ChannelMessageList.tsx`, `ChannelMessages.tsx` | P0 |
| 2 | `agent-prompt-runner.ts`, `useChannel.ts`, `ChannelChatArea.tsx` | P1 |
| 3 | `channel-store.ts`, `ChannelSettingsModal.tsx`, shared schemas | P2 |
| 4 | `agent-prompt-runner.ts`, `useChannel.ts`, `ChannelChatArea.tsx` | P3 |

## Verificacion

- [ ] Scrollear hacia arriba durante streaming de canal → no baja solo
- [ ] Scrollear al fondo durante streaming → sigue bajando solo
- [ ] Boton "scroll to bottom" aparece al scrollear hacia arriba y funciona
- [ ] Typing indicator muestra fase (thinking / running tool / writing)
- [ ] En modo "complete", el typing indicator es informativo
- [ ] Canales nuevos tienen `showThinking: true` y `showTools: true`
- [ ] `channel_agent_phase` se emite incluso con `showThinking: false`
