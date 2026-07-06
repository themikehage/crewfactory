COMPLETED ✅
# Plan de Implementación: Consola de Subagentes en Tiempo Real

Este plan detalla cómo agregar telemetría y visualización en tiempo real para la herramienta `spawn_subagent`, permitiendo abrir una consola interactiva (estilo terminal premium) que muestre qué está haciendo el subagente paso a paso.

---

## 1. Arquitectura de Streaming (Backend)

Para evitar requerir que el cliente abra múltiples WebSockets independientes, usaremos el WebSocket de la sesión padre para canalizar los eventos internos del subagente.

### Modificaciones en `spawn-subagent-tool.ts`

Al instanciar el loop del subagente, nos suscribiremos a sus eventos y los transmitiremos al cliente de la sesión padre a través de un nuevo tipo de evento `subagent_event`.

```typescript
// Dentro del método execute de spawn_subagent en spawn-subagent-tool.ts
const subagentUnsub = subSession.subscribe((evt: any) => {
  const { broadcastToSession } = require("../ws/handler");
  broadcastToSession(parentSessionId, {
    type: "subagent_event",
    sessionId: parentSessionId,
    subagentSessionId,
    toolCallId,
    event: evt // El evento nativo de la sesión del subagente
  });
});
```

---

## 2. API de Historial (Backend)

Para poder visualizar el log histórico de un subagente una vez completado el prompt (por ejemplo, al recargar la página o ver un chat histórico):

### Rutas en `routes/sessions.ts`

Montaremos endpoints dedicados para consultar metadatos y logs de subagentes:

- `GET /api/sessions/:parentId/subagents/:subagentId/messages`
  Retorna la lista de mensajes en formato JSON/JSONL de la sesión del subagente.
- `POST /api/sessions/:parentId/subagents/:subagentId/abort`
  Permite cancelar individualmente la ejecución del subagente.

---

## 3. Componentes de la Interfaz (Frontend)

De acuerdo con las directrices de diseño de CrewFactory, **todos los componentes del frontend deben utilizar estrictamente las clases y tokens del sistema de diseño de Tailwind CSS v4** (`bg-bg`, `bg-card`, `bg-surface`, `text-accent`, `text-text-primary`, etc.). Queda estrictamente prohibido usar valores hex o inline de color, así como archivos CSS personalizados.

### Nuevo Componente: `SubagentConsole.tsx`

Un panel lateral colapsable (slide-over) o una modal flotante que contiene:
- **Header:** Nombre y rol del subagente, indicador LED parpadeante (`bg-warning animate-pulse` o `bg-accent animate-pulse`), tiempo de ejecución transcurrido y botón **"Abortar Subagente"** con estilos del sistema (`bg-destructive`, `hover:bg-destructive/80`).
- **Objective/Task Section:** Bloque de código con el prompt inicial colapsado por defecto, usando clases de superficie y bordes (`bg-card border-border`).
- **Step Ledger (Historial de pasos):** Timeline vertical simplificado con checks de estado (`text-accent` para completados).
- **Live Terminal (Terminal en vivo):** Caja de texto con tipografía mono (`font-mono text-xs bg-bg border border-border rounded-lg text-primary-foreground`) con scroll automático, mostrando:
  - Los pensamientos del subagente (`thinking` blocks) con estilo atenuado (`text-muted-foreground italic`).
  - La respuesta incremental.
  - Los comandos ejecutados.

### Modificación en `ToolCallRow.tsx`

Cuando `toolName === "spawn_subagent"`, renderizamos una UI optimizada utilizando los tokens existentes:
- Muestra el estado del subagente (`running`, `success`, `blocked`, `error`) con los badges y colores de estado semánticos (`text-warning` para running, `text-primary` para completado).
- Muestra el resumen del envelope Gentle AI si ya terminó.
- Añade un botón destacado **"Ver Consola de Ejecución"** con icono de terminal.
- Si el subagente está en ejecución, el botón muestra una pulsación estática usando una animación de anillo pulsante de Tailwind (`ring-2 ring-accent animate-pulse`).

---

## 4. Gestión de Estado en `ChatArea.tsx`

- Agregaremos un mapa de logs de subagentes al estado del componente: `subagentStreams: Record<string, Message[]>`.
- Al escuchar el mensaje de WebSocket del tipo `"subagent_event"`, actualizaremos el stream del subagente correspondiente.
- Esto permite abrir la consola del subagente y ver las letras escribirse en tiempo real sin interferir en el stream del chat principal.

---

## Plan de Trabajo (Hitos)

- [ ] **Hito 1: Backend Streaming & APIs**
  - Implementar suscripción y retransmisión `subagent_event` en `spawn-subagent-tool.ts`.
  - Crear endpoints GET `/api/sessions/:parentId/subagents/:subagentId/messages` y POST `/abort` en `sessions.ts`.
- [ ] **Hito 2: ToolCallRow Integration**
  - Actualizar `ToolCallRow.tsx` para interceptar la tool `spawn_subagent` y añadir el botón de Consola de Ejecución.
- [ ] **Hito 3: Premium Live Terminal Component**
  - Crear `SubagentConsole.tsx` con Framer Motion, diseño oklch oscuro, terminal de logs y listado de pasos.
- [ ] **Hito 4: ChatArea State Wiring**
  - Conectar los eventos `subagent_event` en el listener WS de `ChatArea.tsx` para actualizar los logs en tiempo real.
  - Cargar los logs históricos vía REST si la consola se abre en una sesión ya terminada.
