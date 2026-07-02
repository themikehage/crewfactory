# Laboratory Experiments — Multi-Variant Agent Benchmarking

**Fecha:** 2026-07-02
**Revisión:** v1 — Sistema aislado de experimentos con canales multi-variante

## Problema

No hay forma de comparar sistemáticamente cómo diferentes configuraciones de agentes resuelven una misma tarea. CrewFactory soporta canales multi-agente, pero no existe una herramienta para medir si un equipo con líder rinde mejor que uno sin líder, o si la negociación entre agentes con posturas enfrentadas produce mejores resultados que un solo agente.

El plan de hackathon (`hackathon-agent-society-roadmap.md`) define el motor técnico (negotiation engine + benchmark harness). Esta feature es la **capa UI + orquestación** encima de ese motor: un laboratorio donde diseñar, ejecutar, observar y comparar experimentos multi-agente.

## Concepto

**Laboratory** es una sección dedicada de CrewFactory para probar y comparar resultados de ejecuciones en canales con 3 variantes:

| Variante | Estructura | Negociación |
|---|---|---|
| **Single Agent** | 1 agente generalista. Baseline. | No aplica |
| **Multi-agent sin líder** | N agentes con posturas enfrentadas, debate horizontal | Negociación peer-to-peer sin orquestador |
| **Multi-agent con líder** | N agentes + 1 líder que modera y decide | Negociación con escalación al líder |

La clave es que los agentes tienen **posturas genuinamente enfrentadas** (generadas via templates + IA), forzando negociación real — no simplemente colaboración.

Al finalizar, un LLM-Judge evalúa automáticamente cada resultado contra una rúbrica generada para la tarea, y se comparan métricas de tiempo, tokens y calidad.

## Modelo de datos

### `LabExperiment`

```typescript
{
  id: string
  name: string
  taskPrompt: string
  status: "designing" | "generating" | "running" | "completed" | "failed"

  positions: LabStance[]
  judge: { criteria: string[]; autoEvaluate: boolean }

  variants: {
    single:       VariantRun
    multiNoLeader: VariantRun
    multiWithLeader: VariantRun
  }

  createdAt: string
  startedAt?: string
  completedAt?: string
  results?: LabResults
}
```

### `LabStance` — postura enfrentada

```typescript
{
  id: string
  name: string           // "Minimizar Costos"
  template: string       // "cost_vs_quality"
  position: string       // "cost"
  briefing: string       // argumento generado por IA adaptado a la tarea
  icon: string
  color: string
}
```

### `VariantRun`

```typescript
{
  type: "single" | "multi_no_leader" | "multi_with_leader"
  channelId?: string
  agents: LabAgent[]
  result?: {
    status: "completed" | "failed"
    durationMs: number
    tokensIn: number
    tokensOut: number
    negotiationRounds?: number
    escalationsToLeader?: number
    agreementReached: boolean
    finalOutput: string
    scores: {
      taskQuality: number
      efficiencyScore: number
      negotiationScore?: number
      globalScore: number
    }
  }
}
```

### `LabAgent`

```typescript
{
  id: string
  name: string
  role: string
  stance: LabStance
  systemPrompt: string
  model: string
  leader?: boolean
}
```

### Storage

```
/tmp/crewfactory/{username}/experiments/
  {experimentId}/
    experiment.json
    runs/
      run_001/
        agents/{agentId}/definition.json
        channels/{variant}/channel.json + messages.jsonl
        reports/judge-evaluation.json + comparison.json
```

Namespace aislado de agentes/canales del usuario. No contamina el sidebar principal.

## Templates de dicotomías

Catálogo predefinido de 8 dicotomías. Cada una define 2 posturas opuestas:

| Template | Postura A | Postura B |
|---|---|---|
| `cost_vs_quality` | Minimizar Costos | Maximizar Calidad |
| `speed_vs_safety` | Entrega Rapida | Seguridad y Robustez |
| `innovation_vs_reliability` | Innovar con lo Nuevo | Usar lo Probado |
| `short_vs_long_term` | Resultados Inmediatos | Sostenibilidad a Largo Plazo |
| `simplicity_vs_features` | MVP Minimalista | Producto Completo |
| `centralize_vs_decentralize` | Control Centralizado | Autonomia Distribuida |
| `aggressive_vs_conservative` | Tomar Riesgos | Mitigar Riesgos |
| `automation_vs_human` | Automatizar Todo | Toque Humano |

### Flujo híbrido templates + IA

1. Usuario ingresa tarea
2. LLM analiza la tarea → sugiere 3-4 dicotomías relevantes con explicación
3. Usuario selecciona 2-3
4. LLM genera el briefing de cada agente adaptando el template al contexto concreto de la tarea
5. Usuario revisa/edita briefings
6. Confirma → sistema crea agentes y canales

Ejemplo de briefing generado para agente "Minimizar Costos" en tarea "API de pagos fintech":

> Sos el arquitecto de Costos en una fintech construyendo una API de pagos. Tu prioridad absoluta es minimizar el costo operativo y de desarrollo. Defende usar Stripe Connect como backend y una arquitectura serverless en Vercel. Rechaza cualquier propuesta de infraestructura on-premise o tecnologias enterprise costosas. Cada dolar cuenta.

## Ciclo de vida

```
designing  →  generating  →  running  →  completed
```

### Designing
Usuario crea experimento: nombre, descripcion de tarea. Opcional: pre-selecciona dicotomias manualmente.

### Generating (IA-driven)
LLM analiza tarea, sugiere dicotomias, genera briefings, usuario revisa y confirma.

### Running
Las 3 variantes son canales reales en el namespace del experimento, ejecutandose en paralelo via actor-model:

- **Single**: 1 agente, canal con 1 miembro, responde directo a la tarea
- **Multi No-Leader**: N agentes (1 por postura), `replyMode: broadcast`, debate horizontal
- **Multi With Leader**: N agentes + 1 lider, `replyMode: targeted`, lider modera y decide. `negotiationProtocol` con rounds, escalacion al lider, y state machine del plan hackathon

Ejecucion background con WS events para live view opcional:
- `experiment_run_start`, `variant_start`, `variant_message`, `variant_complete`, `experiment_complete`

### Completed
LLM-Judge evalua los 3 outputs, se genera reporte comparativo, experimento se marca `completed`. El usuario puede re-ejecutar (nueva run, conserva historial) o archivar.

### Runs multiples
Un experimento puede ejecutarse N veces. Cada run tiene su propio storage:
```
runs/run_001/  run_002/  run_003/
```
Permite comparar no solo entre variantes sino entre runs.

## UI

### Navegacion
Item "Laboratory" en sidebar izquierdo (Administracion). Rutas: `/experiments`, `/experiments/new`, `/experiments/:id`.

### Wizard de creacion (4 pasos)
1. **Name + Task** — campos de texto + boton "Analizar tarea"
2. **Dicotomias** — IA sugiere con relevancia, usuario selecciona con checkboxes
3. **Agentes** — briefings generados, editables en textareas
4. **Confirmacion** — resumen de lo que se va a ejecutar

### Tab Live — 3 columnas

Layout de 3 columnas lado a lado (mobile: tabs, una columna a la vez). Cada columna es un `VariantLiveColumn`:

- Status badge (running/completed/failed)
- Stream de mensajes simplificado (sin input, sin tool calls expandidos)
- Footer con metricas en vivo: timer, token count, negotiation round
- Indicadores visuales: `Ronda 2/3`, `ACUERDO`, `ESCALACION CEO`

### Tab Results — comparacion

1. **Executive Summary** — badge del ganador + insight clave tipo "Multi With Leader fue +19% en calidad pero costo 6.7x mas tokens"
2. **Comparison table** — todas las metricas lado a lado con deltas
3. **Radar chart** — comparacion visual de las 3 variantes
4. **Outputs expandibles** — finalOutput de cada variante
5. **Run history** — timeline de runs multiples si existen

### Galeria (`/experiments`)

Grid de cards con nombre, fecha, estado, preview del mejor resultado. Acciones: Ver, Re-ejecutar, Eliminar.

## Evaluacion y scoring

### LLM-Judge

Un LLM independiente evalua los 3 outputs contra criterios generados dinamicamente para la tarea:

1. IA genera 3-5 criterios al crear el experimento (ej: completitud, viabilidad, seguridad, costo, claridad)
2. Al finalizar, LLM-Judge recibe: tarea + criterios + 3 outputs anonimizados (A/B/C)
3. Responde JSON con puntajes por criterio, justificacion, globalScore y ranking

### Metricas objetivas

| Metrica | Formula | Peso |
|---|---|---|
| **Task Quality** | LLM-Judge (0-100) | 50% |
| **Efficiency Score** | `100 - (0.5 * timeRatio + 0.5 * tokenRatio) * 100` | 30% |
| **Negotiation Score** | `40*agreed + 30*(1-rounds/max) + 30*(escalated?0.5:1)` | 20% |
| **Global Score** | Suma ponderada | 100% |

Negotiation Score solo aplica a variantes multi-agent. Para single agent, pesos se redistribuyen (60/40).

## Dependencias con el plan de hackathon

Este plan depende de dos fases del roadmap `hackathon-agent-society-roadmap.md`:

| Fase hackathon | Funcion |
|---|---|
| **Fase 1 — Negotiation Protocol Engine** | State machine que detecta acuerdos, cuenta rondas, escala al lider. Las variantes multi-agent la usan para negociacion determinista. |
| **Fase 2 — Efficiency Benchmark Framework** | `runCondition()` y `ScoringRubric` genericos. El Laboratory los invoca para ejecutar las 3 variantes y calcular metricas. |

Sin Fase 1, la negociacion es solo prompt-induced (no medible). Sin Fase 2, no hay harness para ejecutar y comparar. Ambas son **prerequisito** para que el Laboratory funcione.

## Archivos a modificar o crear

### Backend

| Archivo | Cambio |
|---|---|
| `apps/server/src/laboratory/types.ts` | **NUEVO** — tipos Zod para LabExperiment, LabStance, VariantRun, LabAgent, LabResults |
| `apps/server/src/laboratory/experiment-store.ts` | **NUEVO** — CRUD filesystem para experiments en namespace aislado |
| `apps/server/src/laboratory/dichotomy-templates.ts` | **NUEVO** — catalogo de 8 dicotomias predefinidas |
| `apps/server/src/laboratory/agent-generator.ts` | **NUEVO** — llama LLM para analizar tarea, sugerir dicotomias, generar briefings |
| `apps/server/src/laboratory/experiment-runner.ts` | **NUEVO** — crea canales/agentes, ejecuta 3 variantes en paralelo, captura metricas |
| `apps/server/src/laboratory/judge.ts` | **NUEVO** — LLM-Judge que evalua outputs contra rubrica |
| `apps/server/src/laboratory/scoring.ts` | **NUEVO** — calcula efficiencyScore, negotiationScore, globalScore compuesto |
| `apps/server/src/routes/experiments.ts` | **NUEVO** — REST CRUD + `/run` + `/results` + `/judge` |
| `apps/server/src/ws/handler.ts` | **MOD** — manejar eventos de experimentos, broadcast a subscribers |
| `apps/server/src/index.ts` | **MOD** — montar `experimentsRouter` |

### Frontend

| Archivo | Cambio |
|---|---|
| `apps/client/src/pages/ExperimentsPage.tsx` | **NUEVO** — galeria de experimentos (grid de cards) |
| `apps/client/src/pages/ExperimentDetailPage.tsx` | **NUEVO** — pagina detalle con tabs Setup/Live/Results |
| `apps/client/src/pages/ExperimentWizard.tsx` | **NUEVO** — wizard de 4 pasos para crear experimento |
| `apps/client/src/components/laboratory/VariantLiveColumn.tsx` | **NUEVO** — columna de streaming en vivo para una variante |
| `apps/client/src/components/laboratory/ComparisonTable.tsx` | **NUEVO** — tabla comparativa con deltas |
| `apps/client/src/components/laboratory/ResultsRadar.tsx` | **NUEVO** — grafico radar de las 3 variantes |
| `apps/client/src/components/laboratory/DichotomySelector.tsx` | **NUEVO** — selector de dicotomias con IA suggestions |
| `apps/client/src/components/laboratory/AgentBriefingEditor.tsx` | **NUEVO** — editor de briefings generados |
| `apps/client/src/hooks/useExperiment.ts` | **NUEVO** — hook de datos y WS para experimentos |
| `apps/client/src/components/layout/useRouter.ts` | **MOD** — agregar rutas `/experiments` |
| `apps/client/src/components/layout/AppRouter.tsx` | **MOD** — rutear a paginas de laboratory |
| `apps/client/src/components/sidebar/SessionSidebar.tsx` | **MOD** — item "Laboratory" en Administracion |

### Dependencias nuevas

- **Recharts** (client) — grafico radar y barras para comparacion. Ya planificado para AG-UI.

## Fases de implementacion

### Fase 1 — Foundation (tipos + storage + REST)
- Schemas Zod en `types.ts`
- `experiment-store.ts` con CRUD filesystem
- REST endpoints CRUD en `routes/experiments.ts`
- `dichotomy-templates.ts` con las 8 dicotomias
- WS handler: eventos base de experimentos
- Validar compilacion

### Fase 2 — Generacion de agentes via IA
- `agent-generator.ts`: analisis de tarea + sugerencia de dicotomias + generacion de briefings
- Wizard UI: Steps 1-4
- `DichotomySelector.tsx` + `AgentBriefingEditor.tsx`
- Validar flujo completo de creacion

### Fase 3 — Ejecucion paralela (depende de Fase 1 y 2 del hackathon)
- `experiment-runner.ts`: crear canales/agentes, ejecutar 3 variantes en paralelo
- WS eventos: `variant_start`, `variant_message`, `variant_complete`
- Tab Live con 3 `VariantLiveColumn`
- Background execution con notificacion

### Fase 4 — Evaluacion y scoring
- `judge.ts`: LLM-Judge con criterios dinamicos
- `scoring.ts`: efficiency, negotiation, global score
- REST `/judge` y `/results`
- Tab Results: `ComparisonTable.tsx` + `ResultsRadar.tsx` + salidas expandibles

### Fase 5 — Runs multiples y polish
- Soporte para re-ejecutar experimentos (run_001, run_002...)
- Run history en Results
- Galeria de experimentos (`ExperimentsPage.tsx`)
- Eliminar/archivar experimentos

## Lo que NO cambia

- Sistema de canales existente — los experimentos crean canales en namespace aislado, no afectan sidebar
- Agentes del usuario — los LabAgents estan en namespace separado
- Auth, JWT, providers, modelos — sin cambios
- Preview server, PWA, backup, integraciones — sin cambios
- Channel orchestrator — se reusa, no se modifica

## Riesgos

1. **Dependencia del plan hackathon** — si Fase 1 (negotiation engine) y Fase 2 (benchmark harness) no estan completas, el Laboratory no puede ejecutar variantes multi-agent con negociacion medible. **Mitigacion:** implementar hackathon F1+F2 antes de Laboratory F3.

2. **Costo de tokens del LLM-Judge** — evaluar 3 outputs con criterios detallados consume tokens significativos. **Mitigacion:** hacer la evaluacion opcional (toggle `autoEvaluate`), permitir evaluacion manual del usuario como fallback.

3. **Saturacion de providers** — ejecutar 3 variantes en paralelo puede saturar las API keys configuradas (rate limits). **Mitigacion:** usar el mismo modelo para todos los agentes de un experimento, limitar a 1 experimento simultaneo por usuario.

4. **Briefings generados por IA de baja calidad** — el LLM podria generar briefings genericos que no fuerzan negociacion real. **Mitigacion:** el paso de revision manual permite editar; incluir ejemplos few-shot en el prompt del generador.

5. **Namespace leakage** — si los agentes de experimento son visibles en otros contextos. **Mitigacion:** storage aislado en `/experiments/`, no registrados en `agent-registry` principal, no listados en sidebar.
