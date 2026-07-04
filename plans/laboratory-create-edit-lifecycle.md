# Laboratory — Separacion Creacion / Ejecucion + Edicion + Stop

**Fecha:** 2026-07-02
**Depende de:** Phase 49 (laboratory already implemented), `laboratory-ui-improvements.md` (phases 1-4)

## Problema

Actualmente la creacion y ejecucion de un experimento estan acopladas. El wizard siempre termina en `handleSaveAndRun` que crea el experimento Y lo ejecuta inmediatamente. No hay forma de:

- Crear un experimento y guardarlo para ejecutarlo mas tarde
- Editar un experimento existente (cambiar nombre, prompt, agentes, modelos, criterios)
- Detener un experimento en ejecucion
- El boton "Ejecutar" existe en el dashboard pero siempre crea-&-lanza en vez de solo ejecutar

Ademas, no hay protecciones:
- Se puede eliminar un experimento mientras esta corriendo
- Se podria (en teoria) editar un experimento mientras corre (si existiera el endpoint)

## Solucion

### Ciclo de vida del experimento

```
designing  →  running  →  completed  (o failed)
    ↑                        │
    │   editar / re-ejecutar  │
    └────────────────────────┘
```

- **designing**: El experimento se creo (wizard) pero no se ha ejecutado. Se puede: editar, eliminar, ejecutar.
- **running**: El experimento esta corriendo. Se puede: detener. NO se puede: editar, eliminar, ejecutar de nuevo.
- **completed**: El experimento termino. Se puede: re-ejecutar, editar, eliminar.
- **failed**: El experimento fallo. Se puede: re-ejecutar, editar, eliminar.

### Acciones disponibles por estado

| Accion | designing | running | completed | failed |
|--------|-----------|---------|-----------|--------|
| Ejecutar | Si | No | Si | Si |
| Detener | No | Si | No | No |
| Editar | Si | No | Si | Si |
| Eliminar | Si | No | Si | Si |

## Cambios necesarios

### Server

| Archivo | Cambio |
|---------|--------|
| `apps/server/src/routes/experiments.ts` | Nuevo `PATCH /:id` para editar; nuevo `POST /:id/stop` para abortar; validar `status !== "running"` en PATCH y DELETE |
| `apps/server/src/laboratory/experiment-runner.ts` | Agregar `AbortController` por experimento; metodo `stopExperiment()` que aborte el controller + limpie canales/agentes activos; verificar `isRunning()` en `runExperiment()`; verificar abort signal entre variantes |
| `apps/server/src/laboratory/experiment-store.ts` | `updateExperiment()` que sobreescribe solo los campos editables (no resultados, no status, no timestamps) |

### Client

| Archivo | Cambio |
|---------|--------|
| `apps/client/src/pages/LaboratoryPage.tsx` | Modo "create" vs "edit" en el wizard; separar "Guardar" de "Guardar y Lanzar"; boton Detener en dashboard; deshabilitar editar/eliminar cuando `status === "running"`; resetear wizard entre usos |
| `apps/client/src/hooks/useExperimentStream.ts` | Sin cambios |

## Detalle de implementacion

### 1. Server — PATCH /api/experiments/:id

```typescript
experimentsRouter.patch("/:id", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  
  const exp = await ExperimentStore.getExperiment(username, id);
  if (!exp) return c.json({ error: "Experiment not found" }, 404);
  if (exp.status === "running") return c.json({ error: "Cannot edit a running experiment" }, 409);

  const body = await c.req.json();
  const updatableFields = ["name", "taskPrompt", "criteria", "positions", "variants", "judge"];
  for (const field of updatableFields) {
    if (body[field] !== undefined) {
      (exp as any)[field] = body[field];
    }
  }

  exp.status = "designing"; // reset status on edit
  await ExperimentStore.saveExperiment(username, exp);
  return c.json({ experiment: exp });
});
```

### 2. Server — POST /api/experiments/:id/stop

```typescript
experimentsRouter.post("/:id/stop", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  
  if (!ExperimentRunner.isRunning(id)) {
    return c.json({ error: "Experiment is not running" }, 400);
  }
  
  await ExperimentRunner.stopExperiment(username, id);
  return c.json({ success: true });
});
```

### 3. Server — ExperimentRunner.stopExperiment()

Agregar al runner:
- `private static abortControllers = new Map<string, AbortController>()`
- En `runExperiment()`: crear `AbortController`, guardarlo en el map
- En `executeAllVariants()`: verificar `signal.aborted` antes de cada variante y antes del judge
- `stopExperiment(username, experimentId)`: abortar el controller, abortar canales activos via `channelOrchestrator.abortDispatch()`, limpiar agentes temporales, marcar experimento como `failed`, borrar controller del map

```typescript
static async stopExperiment(username: string, experimentId: string): Promise<void> {
  const controller = this.abortControllers.get(experimentId);
  if (controller) {
    controller.abort();
    this.abortControllers.delete(experimentId);
  }
  
  // Abort active channel dispatches
  const channelIds = [
    `lab_${experimentId}_single`,
    `lab_${experimentId}_multiNoLeader`, 
    `lab_${experimentId}_multiWithLeader`
  ];
  for (const channelId of channelIds) {
    try {
      await channelOrchestrator.abortDispatch(channelId);
    } catch {}
  }

  const exp = await ExperimentStore.getExperiment(username, experimentId);
  if (exp) {
    exp.status = "failed";
    await ExperimentStore.saveExperiment(username, exp);
    broadcastToUser(username, {
      type: "experiment_status",
      experimentId,
      status: "failed",
      error: "Stopped by user"
    });
  }
}
```

### 4. Server — DELETE y PATCH con guarda de running

Agregar validacion al inicio de DELETE:

```typescript
const exp = await ExperimentStore.getExperiment(username, id);
if (!exp) return c.json({ error: "Experiment not found" }, 404);
if (exp.status === "running") return c.json({ error: "Cannot delete a running experiment" }, 409);
```

### 5. Client — Wizard con modo "create" vs "edit"

Nuevo state: `wizardMode: "create" | "edit"`

- **create**: Comportamiento actual (wizard vacio, POST al guardar)
- **edit**: Cargar datos del experimento seleccionado en el wizard, permitir navegar libremente entre steps, PATCH al guardar

Funcion `openWizard(mode, experiment?)`:
```typescript
const openWizard = (mode: "create" | "edit", exp?: Experiment) => {
  setIsWizard(true);
  setWizardStep(1);
  setWizardMode(mode);
  
  if (mode === "edit" && exp) {
    setWizardName(exp.name);
    setWizardPrompt(exp.taskPrompt);
    setCriteria(exp.judge.criteria);
    setStances(exp.positions);
    // Map variants back to customAgents
    const allAgents = [
      ...exp.variants.multiWithLeader.agents,
    ];
    // Remove duplicates by id
    const uniqueAgents = allAgents.filter((a, i, arr) => 
      arr.findIndex(x => x.id === a.id) === i
    );
    setCustomAgents(uniqueAgents);
    setSelectedDichotomies(exp.positions.map(s => s.template).filter(Boolean));
  } else {
    // Reset wizard for create mode
    resetWizard();
  }
};
```

### 6. Client — Botones separados en el wizard Step 4

Reemplazar el unico boton "Guardar y Lanzar Experimento" por dos:

```tsx
<div className="flex justify-end gap-2 pt-4 border-t border-surface-hover">
  <button onClick={() => setWizardStep(3)} ...>Atras</button>
  <button onClick={handleSave} ...>Guardar</button>
  <button onClick={handleSaveAndRun} ...>Guardar y Ejecutar</button>
</div>
```

- `handleSave`: POST o PATCH (segun modo), vuelve al listado de experimentos
- `handleSaveAndRun`: POST o PATCH + `POST /:id/run`, vuelve al dashboard del experimento ejecutandose

### 7. Client — Botones en el dashboard

```tsx
{/* Acciones del experimento */}
<div className="flex items-center gap-2 flex-shrink-0">
  {activeExp.status !== "running" && (
    <>
      <button onClick={handleEdit} className="...">Editar</button>
      <button onClick={handleDelete} className="...">Eliminar</button>
      <button onClick={handleRun} className="...">Ejecutar</button>
    </>
  )}
  {activeExp.status === "running" && (
    <button onClick={handleStop} className="...bg-error...">Detener</button>
  )}
</div>
```

- `handleEdit`: `openWizard("edit", activeExp)`
- `handleRun`: `POST /api/experiments/:id/run` + `fetchExperiments()`
- `handleStop`: `POST /api/experiments/:id/stop` + `fetchExperiments()`

### 8. Client — No correr automaticamente al crear

`handleSaveAndRun` actualmente crea y ejecuta. Debe soportar ambos modos:
- create + run: POST → obtener id → POST /:id/run
- create solo: POST → volver al listado
- edit + run: PATCH → POST /:id/run
- edit solo: PATCH → volver al listado

## Archivos modificados

| Archivo | Lineas estimadas | Cambio |
|---------|-----------------|--------|
| `apps/server/src/routes/experiments.ts` | +40 | PATCH /:id, POST /:id/stop, validacion en DELETE |
| `apps/server/src/laboratory/experiment-runner.ts` | +50 | AbortController, stopExperiment(), signal checks |
| `apps/client/src/pages/LaboratoryPage.tsx` | +100/-30 | Wizard mode, botones separados, editar, detener |

## Riesgos

1. **AbortController en ejecucion secuencial**: Las 3 variantes corren secuencialmente. El abort debe funcionar entre variantes (si la variante actual esta idle esperando, el abort es instantaneo; si esta ejecutando, se cancela el canal activo). **Mitigacion**: verificar `signal.aborted` al inicio de cada `runXxxVariant()` y despues de `waitChannelIdle()`.

2. **Limpieza de agentes temporales al abortar**: `runSingleVariant` y `runMultiVariant` crean agentes temporales y canales. Al abortar hay que limpiarlos. **Mitigacion**: `stopExperiment` llama a `channelOrchestrator.abortDispatch()` para cada channelId conocido y luego intenta `agentRegistry.stop()` para agentes con prefijo `lab_`.

3. **Estado inconsistente si el abort falla parcialmente**: Si el abort del channel funciona pero el agentRegistry falla, el experimento queda en estado raro. **Mitigacion**: try/catch por cada paso de limpieza; el estado del experimento se marca como `failed` solo despues de intentar toda la limpieza.
