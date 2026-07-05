# Judge Management UI — Plan de Implementación

## Contexto

El LabJudge ya existe y funciona en el servidor: evalúa las tres variantes con un LLM en modo doble ciego y devuelve scores por criterio + global. El runner lo ejecuta automáticamente si `judge.autoEvaluate === true`. Sin embargo:

- Los scores per-criterio del judge se calculan pero **no se persisten** (`judge.ts` solo devolvía `globalScore` y `reasoning`; los criterios individuales se descartaban antes de `scoring.ts`).
- La UI solo mostraba `globalScore`, `taskQuality` y `efficiencyScore` — sin desglose por criterio, sin reasoning del judge, ni comparativa entre variantes.
- No había forma de correr el judge **manualmente (on-demand)** una vez completado el experimento.
- El panel derecho mostraba la rúbrica como tags pero sin conexión con los resultados reales del judge.

## Cambios Implementados

### 1. Persistir scores por criterio (shared + server)
- **`packages/shared/src/schemas.ts`** — `VariantRunResultSchema.scores` extendido con `judgeReasoning?: string` y `criteriaScores?: Record<string, number>`.
- **`apps/server/src/laboratory/scoring.ts`** — `calculateVariantScores` acepta `judgeDetail?: { reasoning; criteriaScores }` opcional y lo incluye en el retorno cuando se provee.
- **`apps/server/src/laboratory/experiment-runner.ts`** — al evaluar con `LabJudge`, pasa `reasoning` y `criteriaScores` del judge a `calculateVariantScores` para las tres variantes.

### 2. Endpoint de judge on-demand
- **`apps/server/src/routes/experiments.ts`** — `POST /api/experiments/:id/judge`.
  - Solo opera si `exp.status === "completed"` y las tres variantes tienen `finalOutput`.
  - Corre `LabJudge.evaluateRuns()`, recalcula scores y guarda el experimento.
  - Responde con `{ experiment }` actualizado.
  - Hace `broadcastToUser` con `experiment_status` (`running -> activeVariant: "judging"` y `completed -> experiment`) para que la UI se actualice.

### 3. UI — Panel de resultados del judge (LaboratoryPage)
- Desglose por criterio: tabla con fila por criterio y columna por variante, destacando el top score por criterio en color `primary`.
- Reasoning del judge: cards colapsables por variante con el razonamiento textual en estilo itálico.
- Rubric section: tags con score cuando hay resultado (`Creatividad 87/100`).

### 4. UI — Vista comparativa "Judge Report"
- Nuevo tab **"Comparativa"** en el header (al lado de Baseline / H. Horizontal / H. Jerárquico), visible solo cuando `exp.status === "completed"`.
- Cards side-by-side con las 3 variantes mostrando `globalScore`, desglose por criterio en columnas y badge "Ganadora" (corona `🏆` para la variante con mayor global).
- Botón **"Re-evaluar con Judge"** dentro de la vista comparativa (con spinner mientras corre) y también en el popover de opciones del header (entre Ejecutar y Editar, solo cuando `completed`).
- Tanto AppRouter.tsx como MainLayout.tsx actualizados: tipo `activeVariantTab` ahora acepta `"compare"` y `onJudgeExperiment` se propaga a `MainLayout` y `LaboratoryPage`.

### 5. Feedback visual del estado del judge
- Estado `isJudging` en `LaboratoryPage` manejado por el botón on-demand (spinner + "Evaluando...").
- Cuando `hasScores` es false y no hay judge, mensaje de empty state.

## Decisiones de diseño
1. La vista comparativa va como **tab nuevo "Comparativa"** en el header (decisión del usuario), no como sección colapsable.
2. El botón "Re-evaluar" va en **ambos**: popover de opciones del header + dentro de la vista comparativa.

## Cambio no previsto por el plan original
- **`apps/client/src/types/laboratory.ts`**: el cliente NO infiere el tipo desde el Zod schema de `packages/shared`; importa su propio tipo espejo `VariantRunResult`. Hubo que agregar `judgeReasoning?` y `criteriaScores?` también acá. Fue el único bloqueante del cliente (4 errores TS).

## Gap conocido (no bloqueante)
El server emite `experiment_status` con `activeVariant: "judging"` vía `broadcastToUser` (líneas 145 y 397 en `experiment-runner.ts`/`experiments.ts`), pero el cliente **no tiene handler** para `experiment_status` — el polling HTTP cada 2 s es el que actualiza el estado. El broadcast del judge durante la evaluación no se consume en tiempo real; la UI se actualiza al terminar (vía el `isJudging` local del botón, que se setea en el click y limpia en el await). Mejora opcional: agregar un handler `experiment_status` en `useChannel` o un `useEffect` global para reflejar el estado `judging` recibido por WS.

## Verificación
- `bun x tsc --noEmit` en server y client — ambos limpios (0 errores).
- Correr un experimento completo y verificar que `scores.criteriaScores` y `scores.judgeReasoning` se persisten.
- Verificar endpoint on-demand con experimento ya completado.
- Verificar que la vista comparativa muestra la variante ganadora correctamente.

## Orden de implementación seguido
1. `schemas.ts` — extender tipo (no rompe nada, campos opcionales)
2. `scoring.ts` — aceptar y retornar `judgeDetail`
3. `experiment-runner.ts` — pasar `criteriaScores` y `reasoning` al resultado
4. `experiments.ts` — endpoint `POST /:id/judge` on-demand
5. `apps/client/src/types/laboratory.ts` — espejo del tipo (gap descubierto)
6. `LaboratoryPage.tsx` + `AppRouter.tsx` + `MainLayout.tsx` — desglose por criterio, reasoning, tab comparativa, feedbackEstado, botón re-evaluar en popover y comparativa