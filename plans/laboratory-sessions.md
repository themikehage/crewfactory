# Laboratory Sessions

Mostrar las sesiones de ejecucion del laboratorio en una vista dedicada y evitar que se filtren en la lista de sesiones del agente principal.

## Problema

### 1. Fuga de sesiones `lab_run_*`

El laboratorio crea sesiones con IDs como `lab_run_<uuid>` para cada variante (Baseline, Multi No Leader, Multi With Leader). Estas sesiones son reales (con directorio en disco en `/tmp/crewfactory/{username}/sessions/`), pero actualmente:

- **Session lister** (`session-lister.ts`) no filtra el prefijo `lab_`. Filtra `plan_`, `del_`, `sub_`, pero no `lab_run_*`, causando que aparezcan en la lista principal de sesiones.
- **SessionPopover** (frontend) las oculta parcialmente porque tienen `channelId` (las sesiones con `channelId` se filtran en el contexto global), pero en el contexto de canal o proyecto pueden aparecer.
- **LogsConsolePage** las muestra sin ningun filtro.

### 2. Sin interfaz dedicada

No hay forma de ver las sesiones de un experimento desde la interfaz del laboratorio. Cuando un usuario ejecuta un experimento y quiere revisar los mensajes de una variante especifica, no puede hacerlo facilmente.

## Solucion Propuesta

### Fase 1: Filtrar `lab_run_*` de la lista principal

En `session-lister.ts`, anadir el filtro para excluir directorios que empiecen con `lab_` (usando `SessionPrefix.LAB`):

```typescript
.filter((entry) =>
  entry.isDirectory() &&
  !entry.name.startsWith("plan_") &&
  !entry.name.startsWith(SessionPrefix.DELEGATE) &&
  !entry.name.startsWith(SessionPrefix.SUBAGENT) &&
  !entry.name.startsWith(SessionPrefix.LAB)  // <-- nuevo filtro
)
```

Ademas, propagar el campo `isExecution` desde el metadata de la sesion en el `SessionListItem` para que el frontend pueda identificar correctamente sesiones de ejecucion.

### Fase 2: Vista de sesiones del experimento

En la pagina de detalle del experimento (`ExperimentDetailPage`), anadir un tab "Sesiones" que muestre las 3 sesiones asociadas (una por variante):

1. **Backend**: Endpoint `GET /api/experiments/:id/sessions` que devuelva las sesiones `lab_run_*` asociadas al experimento.
2. **Frontend**: Tab "Sesiones" en `ExperimentDetailPage` con lista de las 3 variantes, mostrando:
   - Nombre de la variante (Baseline, Multi No Leader, Multi With Leader)
   - Cantidad de mensajes
   - Fecha de creacion
   - Boton para abrir la sesion en el chat (como solo lectura)
3. **Acceso**: Al abrir una sesion de laboratorio, debe ser en modo solo lectura (sin poder enviar prompts).

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `apps/server/src/core/session/session-lister.ts` | Anadir filtro `SessionPrefix.LAB` y propagar `isExecution` |
| `apps/server/src/laboratory/experiment-runner.ts` | Guardar `experimentId` en metadata de sesiones `lab_run_*` (ya se hace parcialmente) |
| `apps/server/src/routes/experiments.ts` | Nuevo endpoint `GET /:id/sessions` |
| `apps/server/src/laboratory/experiment-store.ts` | Metodo `getExperimentSessions(username, expId)` |
| `apps/client/src/pages/experiments/ExperimentDetailPage.tsx` | Anadir tab "Sesiones" |
| `apps/client/src/components/chat/ChatArea.tsx` | Soporte para modo solo lectura en sesiones de laboratorio |

### Consideraciones

- No romper la suscripcion WebSocket: `ws/handler.ts` ya bloquea `lab_*` sessions en `subscribeWsToSession`, pero la vista de solo lectura deberia permitir ver mensajes historicos sin streaming.
- El filtro en el lister debe ser consistente con los otros filtros (`DELETAGE`, `SUBAGENT`) para mantener el codigo limpio.
- Las sesiones de laboratorio no deben aparecer en el popover de sesiones del chat principal bajo ninguna circunstancia.
