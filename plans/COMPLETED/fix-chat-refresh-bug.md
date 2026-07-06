COMPLETED ✅
# Plan: Solución a la pérdida de historial en recarga de chat

## Contexto y Causa Raíz
Cuando el usuario envía un mensaje y el agente procesa una herramienta (como `request_approval` o `ask_question`), recargar el navegador provoca la pérdida del mensaje enviado y de la llamada a la herramienta del agente.

1. **Mensaje de Usuario:** Se añade en memoria con `appendMessage()`, pero el persistidor de disco (`_persist` en `session-persistence.ts`) pospone la escritura en disco si la sesión aún no tiene mensajes de rol `"assistant"` (`hasAssistant = false`) y no ha sido sincronizada. Esto hace que en sesiones nuevas el mensaje inicial quede flotando solo en memoria.
2. **Mensaje del Asistente y Tools:** `agent-session.ts` añade estos mensajes a `sessionManager` al final de todo el loop de ejecución (`agent_end`).
3. **Bloqueo por Tools Interactivas:** Cuando se ejecuta una herramienta interactiva, el loop del agente queda suspendido esperando la respuesta del usuario. Como no ha terminado, no se ha emitido `agent_end` y por ende los mensajes del asistente (con la llamada a la tool) y el mensaje de usuario (en sesiones nuevas) nunca se persisten en disco.

Al recargar la página, se cargan los datos desde el archivo en disco, lo que causa la pérdida de los mensajes no persistidos.

## Solución Propuesta

### 1. Persistencia Inmediata en el Servidor
Modificar `_persist` en `session-persistence.ts` para eliminar la validación retardada basada en `hasAssistant`. Cualquier mensaje agregado (incluyendo el mensaje de usuario inicial) se escribirá en disco de forma inmediata. Cambiaremos el flag de apertura de archivo de `"wx"` a `"w"` para prevenir fallos en caso de que el archivo de sesión ya exista al realizar el primer volcado.

### 2. Guardado Progresivo del Asistente
Modificar `agent-session.ts` para que persista los mensajes a medida que se completan, escuchando el evento `message_end` (para el asistente y los resultados de las herramientas de tipo `toolResult`), en lugar de acumularlos todos al final del loop en `agent_end`.

---

## Modificaciones a Realizar

### [MODIFY] [session-persistence.ts](file:///c:/Users/themi/AgentWorkspace/crewfactory/apps/server/src/ai/session-persistence.ts)
- Eliminar la lógica condicional basada en `hasAssistant`.
- Cambiar `openSync` en el primer flush a `"w"` para mayor tolerancia a fallos.

### [MODIFY] [agent-session.ts](file:///c:/Users/themi/AgentWorkspace/crewfactory/apps/server/src/ai/agent-session.ts)
- Guardar mensajes de rol `"assistant"` y `"toolResult"` en el evento `"message_end"`.
- Quitar la llamada a `this.sessionManager.appendMessage` del evento `"agent_end"`.
