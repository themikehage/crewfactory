COMPLETED
# Plan: Laboratorio como Agente Conversacional con Tool `create_experiment`

**Estado:** Pendiente
**Objetivo:** Reemplazar el input de proposito unico del laboratorio por una sesion de chat con un agente que tiene la tool `create_experiment`, permitiendo iteracion en lenguaje natural sobre la configuracion de experimentos.

---

## Diagnostico

### Problemas del `IaGenerator` actual (800 lineas)

1. **Input de proposito unico** — Todo lo que escribis fuerza una generacion de equipo. No hay dialogo, no hay preguntas, no hay iteracion.
2. **Prompt hardcodeado** — `routes/experiments.ts:76-121` asume topologia jerarquica fija (lead + targeted). Cualquier variacion requiere tocar codigo del servidor.
3. **Formulario como unica via de edicion** — 400+ lineas de handlers de formulario (`handleUpdateAgentField`, `handleUpdateMemberRole`, `handleAddContextItem`, etc.) mutan estado local sin API de update parcial. Fragil y no escalable.
4. **Sin contexto conversacional** — Cada generacion es aislada. No podes decir "como antes pero con 2 agentes mas".
5. **No alineado con la arquitectura de tools** — `delegate_task` y `spawn_subagent` ya son tools del agente. El lab deberia seguir el mismo patron.

### Propuesta

El laboratorio se convierte en una sesion de chat con un agente que tiene acceso a la tool `create_experiment`. El `WelcomeChatInput` se mantiene (estado vacio, igual que en `ChatArea`). El formulario editable se transforma en un tab "Config" de visualizacion.

---

## Milestones

### H0: Tool `create_experiment` en el backend (1 sesion)

#### H0.1 — Definir el schema de la tool
- **Accion:** Crear `apps/server/src/laboratory/create-experiment-tool.ts`
- **Schema:**
  ```ts
  {
    name: "create_experiment",
    description: "...",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        taskPrompt: { type: "string" },
        criteria: { type: "array", items: { type: "string" } },
        agents: { type: "array", items: { agent definition } },
        channel: { type: "object", properties: { name, description, members, maxChainDepth, negotiationProtocol } }
      }
    }
  }
  ```
- **Comportamiento:** Upsert. Si el experimento no existe, lo crea. Si existe, lo actualiza (solo si `status !== "running"`).
- **Retorno:** `{ experimentId, name, agentsCount, criteria }` como texto estructurado para que el agente pueda confirmar al usuario.

#### H0.2 — Implementar la tool con logica de upsert
- Registra agentes via `agentRegistry.register()` (si no existen)
- Crea/actualiza canal via `channelStore`
- Crea/actualiza experimento via `ExperimentStore`
- Construye las 3 variantes automaticamente a partir de los agentes:
  - `single`: primer agente como baseline
  - `multiNoLeader`: todos los agentes sin leader, replyMode broadcast
  - `multiWithLeader`: topologia jerarquica con leader

#### H0.3 — Inyectar la tool en el agente del laboratorio
- Crear agente programatico `lab-architect` con la tool `create_experiment`
- System prompt que instruye al agente sobre como disenar experimentos multi-agente
- La tool `create_experiment` se registra como `alwaysOnTool` (igual que `decompose_tasks`, `delegate_task`)
- El agente `lab-architect` NO tiene `delegate_task` ni `spawn_subagent` (no necesita delegar, solo configurar experimentos)

#### H0.4 — Endpoint REST para consultar experimentos desde la tool
- `GET /api/experiments/:id/summary` — devuelve resumen del experimento actual para que el agente pueda leer el estado antes de modificarlo
- Este endpoint es llamado por el agente via `apiFetch` (no es una tool, es una consulta interna al construir el system prompt)

---

### H1: Integracion del chat en el frontend (1-2 sesiones)

#### H1.1 — Registrar ruta `/laboratory` como contexto de agente
- `AppRouter.tsx` reconoce `/laboratory` como contexto tipo `agent` con `agentId: "lab-architect"`
- `MainLayout.tsx` muestra breadcrumbs `Lab / Chat` y tabs internos
- `SessionSidebar.tsx` muestra el agente `lab-architect` activo

#### H1.2 — Adaptar `LaboratoryPage` para usar `ChatArea` como vista principal
- **Estado actual:** `LaboratoryPage.tsx` renderiza `IaGenerator` cuando no hay experimento seleccionado
- **Estado nuevo:** `LaboratoryPage.tsx` renderiza `ChatArea` con `agentId="lab-architect"` como vista principal
- El `WelcomeChatInput` se muestra cuando no hay sesion activa o no hay mensajes (exactamente igual que `ChatArea` hoy)
- Las suggestions del `WelcomeChatInput` se adaptan al contexto de laboratorio:
  - "Crea un equipo de 3 agentes para debatir sobre etica en IA"
  - "Disena un experimento para comparar velocidad vs calidad en desarrollo de software"
  - "Configura un equipo con lider, tech lead y QA para code review"

#### H1.3 — Tool call rendering para `create_experiment`
- `ToolCallRow.tsx` renderiza la tool `create_experiment` con un card dedicado que muestra:
  - Nombre del experimento creado/actualizado
  - Cantidad de agentes configurados
  - Criterios de evaluacion
  - Boton "Ver Configuracion" que abre el tab Config
- Al recibir un `create_experiment` tool result, el frontend refresca la lista de experimentos y actualiza el contexto

---

### H2: Tab "Config" como reemplazo del formulario editable (1 sesion)

#### H2.1 — Crear componente `ExperimentConfigTab`
- **Nuevo archivo:** `apps/client/src/components/laboratory/ExperimentConfigTab.tsx`
- Muestra en modo lectura los agentes, canal, criterios y parametros del experimento activo
- Layout de cards colapsables: "Agentes (N)", "Canal", "Criterios de Evaluacion", "Parametros"
- Campos editables minimos: nombre del experimento, taskPrompt, y criterios (inputs inline con confirmacion)
- La edicion de agentes y canal se hace via chat ("agrega un agente QA", "cambia el replyMode del tech lead a broadcast")

#### H2.2 — Integrar tabs en `LaboratoryPage`
- Tabs horizontales: **Chat** | **Config** | **Single** | **Horizontal** | **Jerarquico** | **Comparativa**
- **Chat:** `ChatArea` con `agentId="lab-architect"` (vista principal)
- **Config:** `ExperimentConfigTab` con la configuracion del experimento activo
- **Single/Horizontal/Jerarquico:** `VariantViewer` (sin cambios)
- **Comparativa:** `JudgeReport` (sin cambios)
- Los tabs Single/Horizontal/Jerarquico/Comparativa solo se muestran si hay un experimento seleccionado
- El tab Config se muestra si hay un experimento seleccionado Y tiene datos

#### H2.3 — Sincronizacion tool → UI
- Cuando el agente llama a `create_experiment`, el tool result incluye `experimentId`
- El frontend detecta el tool result de tipo `create_experiment` y:
  1. Refresca la lista de experimentos via `GET /api/experiments`
  2. Selecciona automaticamente el experimento creado (`setSelectedExpId`)
  3. El tab Config refleja inmediatamente la nueva configuracion
- El `refresh_ui` tool existente tambien refresca la lista de experimentos

---

### H3: Limpieza y eliminacion de codigo obsoleto (1 sesion)

#### H3.1 — Eliminar `IaGenerator.tsx`
- Todo el componente (800 lineas) se elimina
- `handleGenerateTeam`, `handleInstantiateTeam`, `handleSaveExperimentDirect` y los 15+ handlers de formulario desaparecen

#### H3.2 — Eliminar `POST /api/experiments/generate`
- El endpoint REST de generacion se elimina
- La tool `create_experiment` lo reemplaza completamente
- La sesion temporal `generate_*` deja de crearse

#### H3.3 — Eliminar `POST /api/experiments/instantiate`
- La tool `create_experiment` ya registra agentes y crea el canal internamente
- No hay necesidad de un paso separado de "instanciacion"

#### H3.4 — Simplificar `LaboratoryPage.tsx`
- Pasa de 282 lineas con estado de formulario (`editorName`, `editorPrompt`, `editorCriteria`, `editorVariants`) a ~150 lineas que solo manejan: seleccion de experimento, poll de estado, tabs, y modales de ejecucion/edicion
- El `ExperimentEditorModal` se mantiene para edicion manual rapida (scratch mode sin agente)

---

### H4: Alineacion con el plan de primitivas (solapado con `multi-agent-primitives-refactor.md`)

#### H4.1 — `create_experiment` tool usa `NegotiationProtocol` internamente
- Una vez refactorizado el plan de primitivas, la tool construye el experimento usando `NegotiationProtocol` config en vez de hardcodear reply modes

#### H4.2 — `ExperimentRunner` compone `Spawn` + `Negotiate`
- Ya documentado en el plan H3 de `multi-agent-primitives-refactor.md`
- La tool `create_experiment` produce datos que el runner consume

---

## Lo que NO cambia

| Componente | Estado |
|---|---|
| `WelcomeChatInput` | Se mantiene — estado inicial del chat sin mensajes |
| `VariantViewer` | Sin cambios |
| `JudgeReport` | Sin cambios |
| `RunExperimentModal` | Sin cambios |
| `ExperimentEditorModal` | Sin cambios (scratch mode manual) |
| `ExperimentRunner` + `ExperimentStore` | Sin cambios (consumidores de config) |
| `LabJudge` + `scoring.ts` | Sin cambios |
| Polling de estado durante ejecucion | Sin cambios |
| `ExperimentPopover` (historico) | Sin cambios |
| `POST /api/experiments/:id/run` | Sin cambios |
| `POST /api/experiments/:id/judge` | Sin cambios |

---

## Flujo de usuario resultante

```
Usuario llega a /laboratory
  │
  ├─ Sin experimento activo → WelcomeChatInput con suggestions de lab
  │   │
  │   └─ Escribe: "Crea un equipo para debatir sobre el impacto de la IA en la educacion"
  │       │
  │       ├─ Agente lab-architect responde (puede hacer preguntas)
  │       └─ Agente llama create_experiment tool → experimento creado
  │           │
  │           ├─ Tool result se renderiza en chat con card + boton "Ver Config"
  │           ├─ Tab "Config" muestra la configuracion completa
  │           └─ Tabs Single/Horizontal/Jerarquico disponibles
  │
  ├─ Usuario: "Agrega un agente QA que sea muy estricto"
  │   └─ Agente llama create_experiment de nuevo (upsert) → experimento actualizado
  │
  ├─ Usuario: "Ejecuta el experimento"
  │   └─ Agente NO tiene tool run_experiment. Usuario usa boton "Ejecutar" en UI.
  │       (o podriamos agregar run_experiment tool en H1 futuro)
  │
  └─ Usuario cambia a tab "Comparativa" → JudgeReport con scores
      └─ Usuario: "El baseline saco mejor puntuacion que el equipo con lider, ¿por que?"
          └─ Agente lee los resultados (via get_experiment_results tool futura o via system prompt)
             y explica el analisis
```

---

## Riesgos

| Riesgo | Mitigacion |
|---|---|
| El agente no genera JSON valido para la tool | Zod validation estricta en el backend; si falla, la tool retorna error descriptivo y el agente reintenta |
| Perdida del flujo "rapido" (escribir + enter = equipo generado) | Prompt del agente prioriza accion sobre charla cuando el input es claro |
| El tab Config se desincroniza del estado real | La tool retorna `experimentId` + `refresh_ui` event; el frontend re-fetcha desde el store |
| Usuarios que prefieren formularios sobre chat | `ExperimentEditorModal` (scratch mode) + `ExperimentConfigTab` con edicion minima permanecen |
