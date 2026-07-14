# Fix Experiment Flickering & Sequential Variant Execution

## Problem

Cuando se ejecuta un experimento, el contenido de las variantes aparece y desaparece (flickering). Los mensajes se pierden porque el canal temporal se destruye al finalizar cada variante. No hay feedback en tiempo real del estado del experimento porque el cliente no maneja eventos `experiment_status`.

## Root Cause Analysis

### Causa A (PRIMARIA): `useChannel` limpia mensajes en cada inicializacion
**File:** `apps/client/src/hooks/useChannel.ts`, lines 83-96

Cada vez que las dependencias del `useEffect` cambian (`channelId`, `sessionId`, fetch callbacks), se ejecuta `setMessages([])` sincronicamente ANTES del fetch async. Esto crea un ciclo visible: contenido desaparece → loading → contenido reaparece. El efecto se re-dispara cuando:
- `channelId` cambia (nueva pestana de variante)
- `sessionId` cambia (entre mount inicial y session asignada por el servidor)
- Los callbacks de fetch cambian de referencia

### Causa B: El canal (y su historial de mensajes) se destruye permanentemente
**File:** `apps/server/src/laboratory/experiment-runner.ts`, lines 453-465

Despues de cada variante, el bloque `finally` llama a `channelStore.deleteChannel()`. Esto ejecuta `rmSync(dir, { recursive: true, force: true })` que **destruye todo el directorio del canal incluyendo messages.jsonl**. Cuando `useChannel` intenta fetchear mensajes via `GET /:id/messages`, recibe 404. Los mensajes se pierden irreversiblemente.

### Causa C: Sin handler de `experiment_status` en el cliente
El servidor emite `experiment_status` en 6 puntos clave (start, variant start, judging, completed, failed, stop). **El cliente tiene CERO subscribers** para este tipo de evento. Sin actualizaciones en tiempo real, la UI muestra datos stale durante la ejecucion.

### Causa D: Ejecucion fire-and-forget
`executeAllVariants()` se llama sin `await`. El HTTP responde `{ success: true }` antes de que ninguna variante haya empezado. El cliente fetchea el experimento en ese instante: `status: "running"` pero las 3 variantes con `result: undefined` y canales que aun no existen.

## Solution

Hacer que cada variante sea simplemente "enviar un mensaje a un canal persistente" en lugar de crear/destruir canales temporales. Ejecucion secuencial predecible con feedback en tiempo real via WebSocket.

## Implementation Plan

### Phase 1: Fix Immediate Flickering (Low Effort, High Impact)

**Step 1 — `useChannel.ts` — Evitar clear prematuro de mensajes** (`apps/client/src/hooks/useChannel.ts`)
- Linea 91: Solo ejecutar `setMessages([])` cuando `channelId` realmente cambia (indicando un canal diferente), no cuando `sessionId` o los callbacks cambian
- Usar `useRef` para trackear el `channelId` previo y hacer clear condicional
- Agregar manejo de error 404 en `fetchMessages` (lineas 41-52): cuando el canal ya no existe, fallar silenciosamente y mantener los mensajes existentes

**Step 2 — `AppRouter.tsx` — Handler de `experiment_status` via WebSocket**
- Suscribirse a eventos `experiment_status` via `wsClient.subscribe("experiment_status", ...)`
- Cuando llega un evento, actualizar el experimento especifico en el estado (merge parcial en lugar de refetch completo)
- Auto-cambiar la pestana a la variante activa cuando `variantStarted` llega
- Esto elimina la necesidad de polling o refetches constantes

**Step 3 — `experiment-runner.ts` — Broadcast al completar cada variante**
- Linea 135-137: Despues de que cada variante termina, emitir `experiment_status` con los datos actualizados del experimento
- Actualmente solo se emite al empezar cada variante (lineas 128-133). El cliente necesita saber cuando termina para actualizar status de "running" a "completed"

### Phase 2: Preservar Historial de Mensajes (Medium Effort)

**Step 4 — `experiment-runner.ts` — No destruir el canal, preservar mensajes**
- Linea 453-465: En lugar de `channelStore.deleteChannel()`, implementar un "soft-complete":
  1. Extraer los mensajes del canal (`result.messages` ya esta disponible desde `runToCompletion` linea 624)
  2. Guardar los mensajes en el directorio del experimento junto al run snapshot
  3. Solo limpiar el registro de agentes temporales y runtime state, NO el canal completo
- Alternativa: `experiment-store.ts` — Agregar un metodo `saveVariantMessages` que persista mensajes junto al run snapshot

**Step 5 — `experiment-store.ts` — Almacenar mensajes de variante**
- Agregar campo `messages` al `VariantRunResult` o al run snapshot
- Al cargar un experimento con runs historicos, los mensajes se recuperan del snapshot

### Phase 3: "Send Message to Channel" Simplification (Higher Effort)

**Step 6 — Canales persistentes para experimentos**
- En lugar de crear/destruir canales por variante en cada ejecucion, crear canales persistentes cuando el experimento se disena (o en la primera ejecucion)
- Los canales se nombran `lab_{experimentId}_{variantKey}` (mismo formato actual) pero NO se destruyen
- Cada ejecucion de variante envia su task prompt como mensaje de usuario al canal persistente
- `ChannelChatArea` en `VariantViewer` funciona como visualizador read-only del historial

**Step 7 — Manejo de re-runs**
- Si el experimento se re-ejecuta:
  - Crear una nueva sesion dentro del canal persistente (los mensajes de runs anteriores siguen visibles)
  - O: Append con un delimiter de sesion/run
  - El `VariantRunResult` se guarda como datos estructurados junto al raw message list

**Step 8 — Limpiar agentes temporales sin destruir el canal**
- Los agentes temporales (`lab_{exp.id}_{variantKey}_{ag.id}`) se siguen registrando/parando por ejecucion
- Pero el canal y sus mensajes persisten
- Agregar un flag `temporary: true` a los agentes de laboratorio para filtrarlos en la UI principal

**Step 9 — `ExperimentDetailPage.tsx` — Auto-switch de pestanas mejorado**
- Linea 91-95: Extender el auto-switch para todas las transiciones de variante, no solo "judging"
- Cuando `experiment_status` indica que la variante N+1 empezo, cambiar la pestana activa

## Files to Modify

| File | Change |
|------|--------|
| `apps/client/src/hooks/useChannel.ts` | Remove premature `setMessages([])`, add 404 handling |
| `apps/client/src/components/layout/AppRouter.tsx` | Add `experiment_status` WS subscription handler |
| `apps/client/src/pages/ExperimentDetailPage.tsx` | Extend auto-switch tabs for all variant transitions |
| `apps/server/src/laboratory/experiment-runner.ts` | Broadcast after variant complete; don't delete channel |
| `apps/server/src/laboratory/experiment-store.ts` | Add `saveVariantMessages` method |
| `apps/server/src/channels/channel-store.ts` | Add soft-delete or preserve-messages option |
| `apps/client/src/lib/ws-client.ts` | Ensure `experiment_status` is routed (verify existing routing) |

## Key Observations

- `runToCompletion()` ya hace "send message to channel" (linea 603). La arquitectura ya soporta este approach
- `ChannelChatArea` en `VariantViewer` ya tiene `variantMode={true}` que oculta el input de chat (linea 175)
- El `experiment_status` se emite 6 veces pero el cliente ignora completamente estos eventos
- Los canales temporales y los agentes temporales son el unico obstaculo para hacerlos persistentes
- El `VariantRunResult` ya incluye `messages` del `RunToCompletionResult` -- solo falta persistirlos
