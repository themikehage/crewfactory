COMPLETED
# Exportar Experimento a Entidades Permanentes

## Objetivo

Permitir al usuario "exportar" los agentes y canales definidos en un experimento de laboratorio (`LabExperiment`) como entidades persistentes en el workspace: agentes programáticos (`POST /api/agents`) y canales multi-agente (`POST /api/channels`).

## Reglas de Negocio

| Variant | Output |
|---------|--------|
| `single` | 1 agente programático permanente |
| `multiNoLeader` | 1 canal multi-agente + N agentes (si no existen) |
| `multiWithLeader` | 1 canal multi-agente + N agentes (si no existen) |

- Si un agente ya existe en el `agentRegistry`, **se omite** (no se duplica, no se actualiza).
- Si un agente no existe, se registra con `saveToDisk: true` (persistente).
- El canal se crea **siempre** con un UUID nuevo (no reutiliza IDs de laboratorio `lab_*`).
- El nombre del canal se deriva del experimento: `{experimentName} ({variantLabel})`.

## Endpoint Nuevo

### `POST /api/experiments/:id/export`

```json
// Request body
{
  "variantKey": "single" | "multiNoLeader" | "multiWithLeader",
  "channelName"?: string  // opcional, override del nombre del canal
}

// Response (single)
{
  "variantKey": "single",
  "agents": [{ "id": "qa-engineer", "name": "QA Engineer", "created": false }]
}

// Response (multi)
{
  "variantKey": "multiWithLeader",
  "channel": { "id": "uuid", "name": "Team Debate (Con Líder)" },
  "agents": [
    { "id": "ceo", "name": "CEO", "created": false },
    { "id": "tech-lead", "name": "Tech Lead", "created": true }
  ]
}
```

## Lógica Backend

### `apps/server/src/laboratory/experiment-store.ts`

- Agregar método `exportVariant(username, experimentId, variantKey, options?)`
  - Cargar el experimento.
  - Obtener los agentes de `experiment.variants[variantKey].agents`.
  - Para cada agente, verificar si existe en `agentRegistry.get(id, username)`.
  - Si NO existe, crear via `agentRegistry.register(username, definition, true)`.
  - Si es variante multi, crear canal via `channelStore.createChannel(username, data)`.
  - Agregar miembros al canal via `channelStore.updateMembers(username, channelId, members)`.
  - Retornar resumen.

### `apps/server/src/routes/experiments.ts`

- Agregar ruta `POST /:id/export`:
  - Validar que el experimento existe.
  - Validar que `variantKey` es válida.
  - Validar que la variante tenga al menos 1 agente.
  - Llamar `ExperimentStore.exportVariant(...)`.
  - Retornar resumen de lo creado/omitido.

### Reglas de mapeo de agentes (LabAgent → AgentDefinition)

```typescript
const definition = {
  id: labAgent.id,
  name: labAgent.name,
  role: labAgent.role,
  systemPrompt: labAgent.systemPrompt,
  model: labAgent.model || "anthropic/claude-3-5-sonnet",
  skills: [], // los experimentos no persisten skills
};
```

### Reglas de mapeo de miembros del canal

**Multi With Leader:**
- El agente con `leader: true` → `replyMode: "user-only"`, `role: "lead"`
- Los demás agentes → `replyMode: "targeted"`, targeteando al líder, `role: "member"é`
- Incluir `context` del experimento: `[{ key: "TASK_CONTEXT", value: exp.taskPrompt }]`

**Multi No Leader:**
- Todos los agentes → `replyMode: "broadcast"`, `role: "member"`
- Incluir `context` del experimento

### Consideraciones de nombres

| Variante | Channel Name | Channel ID |
|----------|-------------|------------|
| `single` | — | — |
| `multiNoLeader` | `{name} (Horizontal)` | `crypto.randomUUID()` |
| `multiWithLeader` | `{name} (Jerárquico)` | `crypto.randomUUID()` |

Si el usuario provee `channelName`, se usa ese en vez del generado.

## UI Frontend

### `apps/client/src/components/laboratory/ExportExperimentModal.tsx` (nuevo)

Modal flotante premium con:

1. **Selector de variante** (radio cards):
   - "Agente Individual" (single)
   - "Canal Horizontal" (multiNoLeader)
   - "Canal Jerárquico" (multiWithLeader)
   - Solo las variantes con `result.status === "completed"` son seleccionables.

2. **Resumen preview** de lo que se va a crear:
   - Lista de agentes (con indicador `Existente` vs `Nuevo`)
   - Nombre del canal (editable)

3. **Botón "Exportar"** principal.

4. **Estado de carga**: spinner durante la exportación.

5. **Resultado**: cards con links de navegación a los agentes y canal creados.

### `apps/client/src/pages/ExperimentDetailPage.tsx`

- Agregar botón "Exportar" en la top bar, a la derecha del selector de runs.
- Visible solo cuando `activeExp?.status === "completed"`.
- Abre `ExportExperimentModal`.

### `apps/client/src/components/laboratory/ExperimentConfigTab.tsx`

- Agregar botón de exportación inline en cada sección de variante (Single, Multi No Leader, Multi With Leader).
- Alternativa más rápida sin modal: botón "Exportar como..." que exporta directamente.

## Comportamiento Post-Export

- Disparar `broadcastToUser` con `entity-updated` para refrescar las listas de agentes y canales en la UI.
- El modal muestra resultado con links que navegan via `onNavigate`:
  - `/agents/{agentId}` para agentes
  - `/channels/{channelId}` para canales
- El `refresh_ui` type notification permite que la sidebar se actualice inmediatamente.

## Archivos a Modificar/Crear

### Server
| Archivo | Cambio |
|---------|--------|
| `apps/server/src/laboratory/experiment-store.ts` | Agregar método `exportVariant()` |
| `apps/server/src/routes/experiments.ts` | Agregar ruta `POST /:id/export` |

### Client
| Archivo | Cambio |
|---------|--------|
| `apps/client/src/components/laboratory/ExportExperimentModal.tsx` | **Nuevo** — modal de exportación |
| `apps/client/src/pages/ExperimentDetailPage.tsx` | Agregar botón "Exportar" + integración del modal |
| `apps/client/src/types/laboratory.ts` | (opcional) Agregar tipos `ExportResult`, `ExportPayload` |

## Flujo Completo

```
1. Usuario completa experimento (status === "completed")
2. Abre detalle del experimento
3. Ve botón "Exportar" en la top bar
4. Click → modal ExportExperimentModal
5. Selecciona variante a exportar
6. Ve preview de agentes (nuevos vs existentes)
7. Click "Exportar"
8. Backend:
   a. Para cada agente: check registry → create si no existe
   b. Para multi: create channel + add members
   c. Broadcast entity-updated
9. Modal muestra resultado con links de navegación
10. Sidebar se actualiza automáticamente con nuevos agentes/canales
```

## Validación

- `bun run build` en server (tsc --noEmit)
- `cd apps/client && bun run build` en client
- Verificar que agentes exportados aparecen en `GET /api/agents`
- Verificar que canales exportados aparecen en `GET /api/channels`
- Verificar que el modal no se abre si el experimento no está `completed`
