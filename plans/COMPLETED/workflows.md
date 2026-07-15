COMPLETED
# Workflows — Entidad de Flujos Deterministas con Lenguaje Natural

**Tipo:** Arquitectura / Evaluacion de Complejidad
**Fecha:** 2026-07-10
**Estado:** Evaluacion

---

## Vision

Un workflow es una secuencia determinista de pasos — cada uno con inputs claros, outputs tipados, y un agente executor asignado — que se define enteramente en lenguaje natural y se ejecuta de principio a fin sin intervencion humana. Algo asi como n8n pero donde la construccion del flujo se hace conversando con un agente, no arrastrando nodos.

**Ejemplo de uso:** "Crea un workflow que cada lunes a las 9am lea las issues abiertas de GitHub, las clasifique por severidad usando un agente revisor, y le asigne cada una al developer mas adecuado del equipo."

---

## 1. Analisis de lo que YA existe

CrewFactory tiene una base solida que cubre ~60% de lo necesario:

### Infraestructura reutilizable

| Componente | Archivo | Relevancia |
|---|---|---|
| `manage_factory` + contratos | `factory-tool.ts`, `factory-contracts.ts` | Patron exacto para agregar la entidad `workflows` con get/upsert/delete |
| `decompose_tasks` | `decompose-tool.ts` | Ya descompone objetivos en DAGs de pasos con `depends_on`, `estimated_steps` |
| `update_task_status` / `complete_task_list` | `update-task-tool.ts` | Maquina de estados de tareas (pending → running → completed/failed) |
| `spawn_subagent` | `spawn-subagent-tool.ts` | Ejecucion aislada de subtareas con envelope de resultados |
| `delegate_task` | `delegate-tool.ts` | Delegacion a agentes programaticos con structured result envelope |
| `ChannelOrchestrator` | `channel-orchestrator.ts` | Orquestacion secuencial/paralela multi-agente con agent work queues |
| `SessionManager` | `session-manager.ts` | Creacion de sesiones con workspace, tools, skills, MCP por entidad |
| `SessionToolFactory` | `tool-factory.ts` | Ensamblaje condicional de tools por sesion |
| WebSocket protocol | `ws/handler.ts` | Streaming en tiempo real, entity-updated broadcasts, session subscriptions |
| Path helpers | `packages/shared/src/paths.ts` | Estructura de directorios por entidad y usuario |
| `FloatingTasks` | `FloatingTasks.tsx` | UI de tracking de tareas con progress bars, play/pause |
| `DecomposeResult` | `DecomposeResult.tsx` | Visualizacion de plan DAG inline en el chat |

### Que falta construir (~40%)

1. **Definicion del schema de workflow** — La estructura de datos que describe pasos, inputs, outputs, triggers, condiciones
2. **Motor de ejecucion de workflows** — El runtime que ejecuta pasos en orden/DAG, resuelve outputs → inputs, maneja branching condicional
3. **NLP → Workflow compiler** — Un tool o agente especializado que convierte lenguaje natural en una definicion de workflow estructurada (el verdadero diferenciador)
4. **Triggers y scheduling** — Webhooks, cron, o eventos que disparen workflows
5. **UI de diseno/monitoreo** — Visualizacion del DAG, editor de pasos, historial de ejecuciones
6. **Type system para inputs/outputs** — Validacion de tipos entre pasos encadenados

---

## 2. Modelo de Datos Propuesto

### Workflow Definition (`workflows/{id}/definition.json`)

```typescript
interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: number;
  steps: WorkflowStep[];
  triggers?: WorkflowTrigger[];
  createdAt: string;
  updatedAt: string;
}

interface WorkflowStep {
  id: string;                    // "step_1", "step_2"
  name: string;
  description: string;           // lenguaje natural del proposito
  prompt: string;                // instrucciones completas para el agente
  agentId?: string;              // agente asignado (opcional, usa default si no)
  dependsOn: string[];            // IDs de pasos que deben completarse antes
  inputSchema?: InputMapping[];  // que inputs espera y de donde vienen
  outputSchema?: OutputField[];  // que outputs produce este paso
  condition?: string;            // expresion condicional (ej: "$step_1.score > 80")
  timeoutMs?: number;            // timeout maximo para este paso
  retries?: number;              // reintentos en caso de error
}

interface InputMapping {
  name: string;                  // nombre del input
  source: "trigger" | "step" | "literal";
  sourceStepId?: string;         // de que paso anterior viene
  sourceField?: string;          // que campo del output del paso fuente
  defaultValue?: string;         // valor por defecto si no se resuelve
}

interface OutputField {
  name: string;
  type: "string" | "number" | "boolean" | "json" | "file";
  description: string;
  extractFrom?: string;          // regex o jsonpath para extraer del output del agente
}

interface WorkflowTrigger {
  type: "manual" | "cron" | "webhook";
  cron?: string;                 // expresion cron
  webhookToken?: string;         // token para webhook
}
```

### Workflow Execution (`workflows/{id}/runs/{runId}/`)

```typescript
interface WorkflowRun {
  id: string;                    // UUID de la ejecucion
  workflowId: string;
  trigger: "manual" | "cron" | "webhook";
  triggerPayload?: Record<string, unknown>;
  status: "running" | "completed" | "failed" | "paused";
  startedAt: string;
  finishedAt?: string;
  stepResults: Record<string, StepResult>;
}

interface StepResult {
  stepId: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  sessionId?: string;            // sesion del agente que ejecuto este paso
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  rawOutput?: string;            // texto completo del agente
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  tokensIn?: number;
  tokensOut?: number;
}
```

---

## 3. Estrategia de Implementacion

### Fase 1 — Entidad y API (baja complejidad, alto apalancamiento)

Agregar `workflows` como novena entidad en el sistema existente:

1. **`packages/shared/src/paths.ts`**: Agregar `WORKFLOWS_DIR`, `getWorkflowsDir()`, `getWorkflowDir()`, `getWorkflowRunsDir()`, paths para `definition.json` y `runs/`
2. **`packages/shared/src/schemas.ts`**: Agregar `WorkflowDefinitionSchema` (Zod), `WorkflowRunSchema`, y tipos TypeScript
3. **`apps/server/src/core/tools/factory-contracts.ts`**: Agregar contrato `workflows` con get/upsert/delete
4. **`apps/server/src/core/tools/factory-tool.ts`**: Agregar handlers CRUD en el switch principal — crear/leer/actualizar/eliminar `definition.json`
5. **`apps/server/src/routes/workflows.ts`**: Router Hono con endpoints REST:
   - `GET /api/workflows` — listar todos
   - `GET /api/workflows/:id` — obtener definicion
   - `POST /api/workflows` — crear (desde JSON o desde NLP)
   - `PUT /api/workflows/:id` — actualizar definicion
   - `DELETE /api/workflows/:id` — eliminar + runs
   - `POST /api/workflows/:id/run` — ejecutar manualmente
   - `GET /api/workflows/:id/runs` — historial de ejecuciones
   - `GET /api/workflows/:id/runs/:runId` — detalle de ejecucion
   - `POST /api/workflows/:id/pause` / `POST /api/workflows/:id/resume` — pausar/reanudar
6. Inyectar el router en `apps/server/src/index.ts`

**Reuso directo:** El patron es identico a como se agrego `experiments` (experiment-store.ts → routes/experiments.ts → factory-contracts.ts). La implementacion de agents y channels son el template exacto.

### Fase 2 — NLP → Workflow Compiler (complejidad media, el diferenciador)

Este es el corazon de la feature. Un tool especializado (`compile_workflow`) que:

1. Recibe descripcion en lenguaje natural + contexto opcional
2. Usa un LLM (el modelo activo de la sesion) con un prompt estructurado para generar la `WorkflowDefinition` completa
3. Valida la definicion contra el schema Zod
4. La persiste via `manage_factory` o directamente en `workflowStore`
5. Retorna la definicion + un resumen visual para que el usuario confirme

**Prompt engineering necesario:**
- Instrucciones precisas sobre que es un paso, como definir inputs/outputs
- Reglas sobre dependencias (DAG valido, sin ciclos)
- Templates de pasos comunes (leer archivo, ejecutar bash, delegar a agente, llamar API)
- Validacion sintactica de condiciones y referencias entre pasos

**Implementacion:** Similar a `decompose_tasks` — llamada directa al LLM con `streamSimple()` (patron que ya se planea en `fast-decompose-tasks.md`), parseo del JSON, validacion Zod, y persistencia.

**Complejidad real:** Media. El prompt es el 80% del trabajo. La infraestructura de llamada al LLM, parseo, y validacion ya existe.

### Fase 3 — Motor de Ejecucion (complejidad alta)

El runtime que ejecuta workflows paso a paso:

1. **WorkflowRunner** (nuevo modulo `apps/server/src/workflows/workflow-runner.ts`):
   - Lee `definition.json` y construye un DAG en memoria
   - Topological sort para orden de ejecucion respetando `dependsOn`
   - Ejecuta pasos secuencialmente o en paralelo (mismos depends_on = concurrentes)
   - Para cada paso:
     a. Resuelve inputs (desde trigger, pasos anteriores, o literales)
     b. Crea una sesion de agente via `SessionManager.getOrCreateSession()` con el `agentId` del paso
     c. Inyecta el `prompt` del paso + los inputs resueltos
     d. Ejecuta `session.prompt()` y espera resultado
     e. Extrae outputs segun `outputSchema` (regex/jsonpath del texto del agente)
     f. Almacena `StepResult` en el run
   - Evalua condiciones para branching (`$step_2.score > 80`)
   - Maneja errores con retry y fallback
   - Emite eventos via WebSocket (`workflow_step_start`, `workflow_step_end`, `workflow_completed`)

2. **Integracion con WebSocket**: Agregar tipos de eventos:
   - `workflow_run_started` — inicio de ejecucion
   - `workflow_step_started` — un paso comenzo
   - `workflow_step_streaming` — streaming del agente del paso (forward de session events)
   - `workflow_step_completed` — paso terminado con resultado
   - `workflow_step_failed` — paso fallo con error
   - `workflow_run_completed` — workflow completo
   - `workflow_run_failed` — workflow fallo

3. **Triggers**:
   - Manual: `POST /api/workflows/:id/run`
   - Cron: `node-cron` o Bun-native scheduler que lee workflows con trigger `cron`
   - Webhook: endpoint `POST /api/workflows/webhook/:id` con token validation

**Complejidad real:** Alta. Es esencialmente un mini-orquestador. Pero el `ChannelOrchestrator` ya hace algo similar (dispatch secuencial de agentes con work queues). Se puede extraer una abstraccion comun.

### Fase 4 — Frontend (complejidad media)

1. **`WorkflowsPage`**: Lista de workflows con cards (nombre, pasos, ultima ejecucion, triggers)
2. **`WorkflowDetailPage`**: Visualizacion del DAG + editor de pasos
   - React Flow (`@xyflow/react` — ya instalado para org charts) para visualizar el grafo de pasos
   - Panel lateral con detalle del paso seleccionado (prompt, inputs, outputs, agente)
3. **`WorkflowRunViewer`**: Visualizacion de ejecucion en tiempo real
   - Nodos del DAG coloreados por estado (pending/gray, running/blue, completed/green, failed/red)
   - Streaming inline del agente activo (reusa `MessageList`)
   - Timeline de ejecucion
4. **NLP Creation Flow**: Integrado en el chat — el usuario describe el workflow, el agente llama a `compile_workflow`, se muestra un preview card (`WorkflowPreview`) con el DAG generado, el usuario confirma o itera
5. **Sidebar Integration**: Agregar seccion "Workflows" en `SessionSidebar` con accordion

**Reuso directo:**
- `@xyflow/react` ya esta instalado y configurado (usado en `OrgFlowCanvas`)
- `MessageList` ya soporta streaming en tiempo real
- `FloatingTasks` ya muestra progreso de tareas
- `DecomposeResult` ya renderiza DAGs inline
- El patron de pagina + detail page ya existe (Agents, Channels, Experiments)

### Fase 5 — Type System & Validacion (complejidad baja-media)

Validacion estructural del workflow en tiempo de compilacion (no ejecucion):

1. Verificar que no hay ciclos en `dependsOn` (DAG validation)
2. Verificar que todos los `sourceStepId` en `InputMapping` existen
3. Verificar que todos los `sourceField` en `InputMapping` existen en el `outputSchema` del paso fuente
4. Verificar que los `agentId` referenciados existen en el registro
5. Type checking basico entre outputs e inputs encadenados

---

## 4. Archivos Nuevos Requeridos

```
packages/shared/src/
  schemas.ts                          (+WorkflowDefinitionSchema, +WorkflowRunSchema)

apps/server/src/
  workflows/
    workflow-store.ts                 (CRUD de definition.json y runs en filesystem)
    workflow-runner.ts                (motor de ejecucion DAG)
    workflow-compiler.ts              (NLP → WorkflowDefinition via LLM)
    compile-workflow-tool.ts          (tool compile_workflow expuesta a agentes)
  routes/
    workflows.ts                      (router Hono con endpoints REST)
  core/tools/
    factory-contracts.ts              (+contract workflows)
    factory-tool.ts                   (+handlers workflows)
  ws/
    handler.ts                        (+eventos workflow_*)

apps/client/src/
  pages/
    WorkflowsPage.tsx                 (lista de workflows)
    WorkflowsPage.literals.ts
    WorkflowDetailPage.tsx            (editor visual + DAG)
    WorkflowDetailPage.literals.ts
  components/workflows/
    WorkflowCard.tsx                  (card en lista)
    WorkflowCard.literals.ts
    WorkflowDAGCanvas.tsx             (React Flow canvas)
    WorkflowStepPanel.tsx             (panel de edicion de paso)
    WorkflowRunViewer.tsx             (visor de ejecucion en vivo)
    WorkflowRunViewer.literals.ts
    WorkflowPreview.tsx               (card de preview post-compilacion NLP)
    WorkflowPreview.literals.ts
  components/sidebar/
    SessionSidebar.tsx                (+seccion Workflows)
```

---

## 5. Evaluacion de Complejidad

| Capa | Complejidad | Esfuerzo Estimado | Riesgos |
|---|---|---|---|
| Fase 1: Entidad + API CRUD | **Baja** | 3-5 horas | Ninguno. Patron 100% conocido. |
| Fase 2: NLP Compiler | **Media** | 8-12 horas | Calidad del prompt. El LLM debe generar JSON estructuralmente valido. Hallucinacion de agentIds. |
| Fase 3: Motor de Ejecucion | **Alta** | 15-25 horas | Resolucion de outputs→inputs (extraer datos estructurados de texto libre de agente). Branching condicional. Manejo de errores y retry. |
| Fase 4: Frontend | **Media** | 12-18 horas | React Flow para DAG editing (no solo visualizacion como en org charts). Sincronizacion WS en tiempo real. |
| Fase 5: Type System | **Baja-Media** | 3-5 horas | Validacion de tipos entre pasos. Parseo de expresiones condicionales. |
| Triggers (Cron + Webhooks) | **Media** | 5-8 horas | Scheduling robusto. Webhook security. |
| Testing + Edge Cases | **Media** | 5-8 horas | DAGs con ciclos, pasos huerfanos, fallos en cascada. |

**Total estimado:** 50-80 horas de desarrollo (2-3 semanas full-time).

---

## 6. Decisiones de Arquitectura Pendientes

1. **Ejecucion de pasos: ¿agente completo o LLM directo?**
   - Agente completo: tiene acceso a tools (bash, files, MCPs), puede tomar decisiones, pero es mas lento y menos determinista
   - LLM directo (`streamSimple`): mas rapido, mas determinista, pero sin tools
   - **Recomendacion:** Soportar ambos. El step define `executor: "agent" | "llm"`. Agent para pasos que necesitan tools, LLM para pasos de analisis/clasificacion pura.

2. **¿Donde se almacenan los resultados intermedios?**
   - En memoria durante la ejecucion (rapido, volatil)
   - En el `StepResult` del run (persistente, trazable)
   - **Recomendacion:** Ambos. Memoria para resolucion de inputs entre pasos, persistencia para debug e historial.

3. **¿Workflows como entidad first-class o extension de channels?**
   - First-class: mas limpio, API propia, UI dedicada
   - Extension de channels: reusa infraestructura de dispatch, pero acopla conceptos distintos
   - **Recomendacion:** First-class. Un workflow es deterministico (pasos fijos, outputs tipados), un channel es colaborativo (dialogo abierto entre agentes). Son conceptos diferentes.

4. **¿Scheduling con node-cron o externo?**
   - node-cron: simple, en proceso, pero no sobrevive restarts (aunque se puede reiniciar al levantar)
   - **Recomendacion:** node-cron para MVP. Al iniciar el servidor, escanear workflows con trigger `cron` y registrarlos.

5. **¿Webhook endpoint unico o por workflow?**
   - Unico (`/api/workflows/webhook/:id`): simple, un endpoint
   - **Recomendacion:** Unico con token por workflow.

---

## 7. Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigacion |
|---|---|---|
| LLM genera JSON invalido en NLP compiler | Alto | Zod validation estricta + retry con error feedback. Prompt con ejemplos concretos. |
| Extraer outputs estructurados de texto libre de agente | Alto | Instrucciones explicitas en el prompt del paso para que el agente emita JSON. `outputSchema` con regex/jsonpath como fallback. |
| DAGs con ciclos o dependencias rotas | Medio | Validacion topologica en `workflow-runner.ts` antes de ejecutar. |
| Sesiones de agentes que no terminan (timeout) | Medio | Timeout configurable por paso. AbortSignal propagado. |
| Carga de WebSocket con multiples streams simultaneos | Bajo | Ya soportado (channel orchestrator transmite multiples agentes). |
| Seguridad de webhooks | Medio | Token por workflow. Rate limiting. Validacion de payload. |

---

## 8. Conclusión

La feature de workflows es **viable y de complejidad media-alta**. El proyecto ya tiene ~60% de la infraestructura necesaria (entidad CRUD, sesiones de agente, tools, WebSocket streaming, DAG task decomposition, UI de tareas). Lo realmente nuevo es:

1. **El motor de ejecucion determinista** — un mini-orquestador que ejecuta pasos en orden/DAG con resolucion de inputs/outputs
2. **El compilador NLP → Workflow** — un prompt ingenieria + tool que convierte lenguaje natural en definiciones estructuradas
3. **La UI de diseno visual** — React Flow para editar el DAG (extendiendo lo que ya existe para org charts)

El esfuerzo total (50-80 horas) es significativo pero manejable. La arquitectura actual del proyecto — con su patron de entidades, factory tool, session manager, y WebSocket protocol — esta excepcionalmente bien preparada para absorber esta nueva entidad sin cambios arquitectonicos profundos.

**Recomendacion:** Proceder con la Fase 1 (CRUD) inmediatamente para tener el esqueleto. Luego Fase 2 (NLP compiler) porque es el diferenciador. Fase 3 (motor) y Fase 4 (UI) pueden desarrollarse en paralelo.
