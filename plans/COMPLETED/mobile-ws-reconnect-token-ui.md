COMPLETED
# Plan: Mobile WS Reconnect + Token Usage in UI

## Problema 1: Streaming perdido al reanudar de suspenso mobile

### Diagnostico

Cuando el movil entra en suspenso (screen off), el navegador cierra la conexion TCP del WebSocket. Actualmente:

1. `wsClient.ts` detecta `onclose` y reintenta con exponential backoff (1s, 2s, ..., max 30s)
2. Tras reconectar, `useWebSocket.ts` re-envia `session_subscribe`
3. El servidor re-engancha los eventos via `subscribeWsToSession()`

**Pero el cliente NO recarga los mensajes perdidos durante la desconexion.** El agente en el servidor sigue ejecutandose (no se aborta al desconectar el WS), emite eventos que el cliente pierde. Al reconectar, el estado local de `MessageList` queda desactualizado — la UI muestra el streaming como "muerto" y el usuario cree que necesita recargar.

Ademas, **no hay heartbeat/ping-pong** para detectar conexiones zombie rapidamente.

### Solucion propuesta

**A. Auto-refresh de mensajes al reconectar:**

En `ChatArea.tsx` (o en un hook compartido), cuando el WebSocket se reconecte y la sesion siga activa, llamar automaticamente a `loadMessages()` via REST para traer los mensajes perdidos.

Pasos:
1. Escuchar cambios de estado del WS en el mismo hook que maneja `session_subscribe`
2. Cuando el estado pase de `"disconnected"` a `"connected"` Y haya un `sessionId` activo:
   a. Esperar un breve delay (500ms) para que el servidor procese el `session_subscribe`
   b. Llamar a `fetchMessages(sessionId)` (misma logica que `loadMessages`)
   c. Reemplazar el estado local de mensajes con los datos frescos

**B. Heartbeat/Keepalive (opcional pero recomendado):**

Anadir un ping periodico desde el servidor para detectar conexiones caidas mas rapido:
- Servidor: enviar `{ type: "ping" }` cada 30s
- Cliente: responder con `{ type: "pong" }` 
- Si el servidor no recibe pong en 3 intentos, cerrar el socket (el cliente reintentara)

Alternativa: usar `WebSocket.ping()` nativo (Hono/Bun soporta ping/pong frames nativamente si el runtime lo permite).

**C. Manejo de envios fallidos:**

En `wsClient.send()`, si el estado no es `WebSocket.OPEN`, encolar el mensaje y reenviarlo cuando se reconecte. Esto evita perder prompts enviados justo antes del suspenso.

Archivos a modificar:
- `apps/client/src/lib/ws-client.ts` — cola de mensajes offline, ping/pong
- `apps/client/src/hooks/useWebSocket.ts` — refresh de mensajes al reconectar
- `apps/client/src/components/chat/ChatArea.tsx` — integrar refresh en el hook o en el efecto de sesion
- `apps/server/src/ws/handler.ts` — heartbeat ping server-side

---

## Problema 2: Mostrar tokens consumidos en la UI

### Diagnostico

El campo `usage` ya llega en los mensajes assistant desde el LLM (`Usage` interface con `input`, `output`, `totalTokens`, `cost`, etc.). Se persiste en JSONL y se sirve via REST `/api/sessions/:id/messages`. En el cliente, `MessageUsage` esta definido tanto en `ChatArea.tsx` como en `MessageList.tsx`.

Actualmente solo se muestra en `MessageList.tsx` lineas 289-301, y solo en el **ultimo** mensaje assistant (`isLast`). El ContextIndicator muestra tokens estimados (charCount/4), no los reales del LLM.

### Solucion propuesta

**A. Mostrar tokens en CADA mensaje assistant:**

Eliminar la condicion `isLast` en `MessageList.tsx` para que cualquier mensaje con `msg.usage` muestre sus tokens. El formato actual (`provider • model • tokens: X • cost: $Y`) funciona bien, solo moverlo fuera del bloque `isLast`.

**B. Extraer `MessageUsage` a tipo compartido:**

Mover la interface `MessageUsage` a un archivo compartido (ej. `apps/client/src/lib/types.ts` o similar) para eliminar la duplicacion entre `ChatArea.tsx` y `MessageList.tsx`.

**C. Mostrar resumen de tokens por sesion (opcional):**

Agregar un contador total de tokens (input + output) de toda la sesion en el header del chat o en el ContextMeter. Esto requiere calcular `tokensIn` y `tokensOut` acumulados del array de mensajes.

**D. Reemplazar tokens estimados del ContextMeter con tokens reales:**

El `ContextIndicator.tsx` actualmente usa valores de `context_usage` que vienen de `getContextUsage()` (charCount/4). Reemplazar con los valores reales de `usage.input + usage.output` del ultimo mensaje assistant. Esto da una medida real de lo que el LLM ha consumido.

Archivos a modificar:
- `apps/client/src/components/chat/MessageList.tsx` — mostrar tokens en todos los mensajes assistant
- `apps/client/src/components/chat/ChatArea.tsx` — eliminar `MessageUsage` local (usar tipo compartido)
- `apps/client/src/lib/types.ts` — agregar `MessageUsage` compartido
- `apps/client/src/components/chat/ContextIndicator.tsx` — usar tokens reales en vez de estimados

---

## Archivos a modificar (resumen)

| Archivo | Cambio |
|---------|--------|
| `apps/client/src/lib/ws-client.ts` | Cola de mensajes offline; responder ping |
| `apps/client/src/hooks/useWebSocket.ts` | Auto-refresh de mensajes al reconectar |
| `apps/client/src/components/chat/ChatArea.tsx` | Integrar refresh post-reconnect; shared MessageUsage |
| `apps/client/src/components/chat/MessageList.tsx` | Mostrar tokens en todos los mensajes assistant |
| `apps/client/src/components/chat/ContextIndicator.tsx` | Usar tokens reales del ultimo assistant message |
| `apps/client/src/lib/types.ts` | Agregar `MessageUsage` compartido |
| `apps/server/src/ws/handler.ts` | Heartbeat ping cada 30s |
