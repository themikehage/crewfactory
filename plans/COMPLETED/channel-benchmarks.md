# Channel-First Experiments: Benchmark Canales Reales

**Tipo:** Arquitectura / Feature
**Fecha:** 2026-07-14
**Estado:** Investigacion y Diseno

---

## Resumen Ejecutivo

Hoy los experimentos estan construidos "al reves": el usuario describe una idea en lenguaje natural al `lab-architect`, este genera agentes temporales (sin tools, sin skills, modo `experiment-member`), ejecuta 3 variantes, y opcionalmente exporta a un canal permanente.

El problema: **no se puede tomar un canal que ya existe y ejecutar un experimento sobre el**. Esto impide:

1. Crear un canal desde el agente global (`manage_factory`), afinarlo conversacionalmente
2. Ejecutar un benchmark para ver si el canal multi-agente rinde mejor que un solo agente
3. Iterar: ajustar prompts → re-benchmark → comparar resultados historicos

Este plan invierte el flujo: **el canal es el punto de partida**, no el destino.

---

## 1. Motivacion y Casos de Uso

### 1.1 Flujo Ideal

```
1. El usuario describe un equipo en lenguaje natural
2. El agente global crea el canal via manage_factory (con agentes, roles, prompts)
3. El usuario chatea con el canal, prueba funcionalidades, itera
4. El usuario dice: "Ejecuta un experimento sobre este canal"
5. El sistema:
   a. Clona el canal (para no contaminar el original)
   b. Ejecuta 2 variantes: canal real (multi-agente) vs single agent baseline
   c. Usa los AGENTES REALES del canal (con sus tools, skills, prompts completos)
   d. Compara resultados con LLM Judge
6. El usuario ve: "Modo multi-agente: 85/100 | Modo single: 72/100"
7. El usuario ajusta prompts y repite el benchmark
```

### 1.2 Casos de Uso Concretos

- **Benchmark de canal `autoconsulting`**: ¿El equipo completo de 6 agentes produce mejores resultados que un unico agente generalista?
- **A/B testing de configuraciones**: ¿El canal rinde mejor con `maxChainDepth=5` o `maxChainDepth=10`? ¿Con `showThinking=true` o `false`?
- **Iteracion de prompts**: ¿El sistema prompt del CEO es efectivo? ¿El rol de "senior" del Tech Lead aporta valor?
- **Regresion**: Despues de modificar un agente del canal, ?sigue mejorando respecto al baseline single?

---

## 2. Arquitectura Propuesta

### 2.1 Nuevos Tipos

```typescript
// En schemas.ts
const ChannelExperimentSchema = z.object({
  id: z.string(),
  channelId: z.string(),           // El canal ORIGEN (el que se quiere benchmarkear)
  channelSnapshot: z.any(),        // Snapshot del channel.json al momento del experimento
  name: z.string(),
  taskPrompt: z.string(),
  status: z.enum(["draft", "running", "completed", "failed"]),
  variants: z.object({
    multiAgent: z.object({         // El canal real clonado
      channelId: z.string(),       // ID del canal clonado (tmp_clone_<uuid>)
      result: VariantRunResult.optional(),
    }),
    singleAgent: z.object({        // Un unico agente (el lead del canal, o el default)
      agentId: z.string(),
      result: VariantRunResult.optional(),
    }),
  }),
  judge: z.object({
    criteria: z.array(CriteriaSchema),
    autoEvaluate: z.boolean().default(true),
    result: JudgeResult.optional(),
  }),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  runHistory: z.array(RunHistoryEntrySchema).optional(), // Para iteraciones
});

const RunHistoryEntrySchema = z.object({
  runId: z.string(),
  timestamp: z.string(),
  channelSnapshotId: z.string(),    // Referencia al snapshot de config del canal
  results: z.object({
    multiAgent: VariantRunResult,
    singleAgent: VariantRunResult,
  }),
  judgeResult: JudgeResult.optional(),
});
```

### 2.2 Flujo de Ejecucion

```
POST /api/channels/:channelId/experiments
Body: { taskPrompt, name?, criteria? }

1. Snapshot del canal original (channel.json + members + agent definitions)
2. Clonar el canal:
   - Nuevo ID: tmp_bench_<uuid>
   - Copiar channel.json con members identicos
   - REUSAR los mismos agentes registrados (no crear copias)
   - Marcar como "benchmark clone" para que no aparezca en listados
3. Ejecutar variante multi-agent:
   - channelOrchestrator.runToCompletion() sobre el clon
   - Usando los AGENTES REALES (con tools, skills, prompts completos)
   - Modo "channel-member" normal (NO "experiment-member")
4. Ejecutar variante single-agent:
   - Usar el agente LEAD del canal (o permitir seleccionar)
   - Enviar taskPrompt a una sesion normal de ese agente
   - Recopilar respuesta, tokens, tiempo
5. LLM Judge evalua ambas variantes (double-blind)
6. Resultados: scores, winner, analisis
7. Limpiar canal clonado
```

### 2.3 Channel Cloning

La clave tecnica: **no duplicar los agentes**. El canal clonado referencia los mismos `agentId` del canal original. Los agentes ya existen en el `agentRegistry` y pueden ser usados por multiples canales simultaneamente.

```typescript
async function cloneChannelForBenchmark(
  username: string,
  originalChannelId: string
): Promise<string> {
  const original = channelStore.getChannel(username, originalChannelId);
  const cloneId = `tmp_bench_${crypto.randomUUID()}`;

  // Crear canal clon con mismos miembros, config, contexto
  await channelStore.createChannel(username, {
    id: cloneId,
    name: `[Benchmark] ${original.name}`,
    description: `Benchmark clone of ${originalChannelId}`,
    members: original.members,        // MISMOS agentId
    context: original.context,
    maxChainDepth: original.maxChainDepth,
    showThinking: original.showThinking,
    showTools: original.showTools,
    negotiationProtocol: original.negotiationProtocol,
  });

  // Marcar como clon para filtrado
  return cloneId;
}
```

### 2.4 Variante Single Agent

Para la comparacion, se necesita un baseline de un solo agente. Opciones:

1. **El LEAD del canal**: Usar el agente con `role: "lead"` del canal. Es el que mejor conoce el contexto.
2. **El primer agente**: Si no hay lead, usar el primer miembro.
3. **El agente global default**: El mismo que usa el usuario en su chat normal.
4. **Selector en UI**: Que el usuario elija que agente usara como baseline.

La ejecucion es simple: crear una sesion para ese agente, enviar el `taskPrompt`, recopilar respuesta.

```typescript
async function runSingleAgentVariant(
  username: string,
  agentId: string,
  taskPrompt: string,
  signal?: AbortSignal
): Promise<VariantRunResult> {
  const session = await sessionManager.getOrCreateSession(username, {
    agentId,
    metadata: { isExecution: true, name: "Benchmark Single Agent" }
  });

  const startTime = Date.now();
  const result = await session.prompt(taskPrompt, { signal });
  const durationMs = Date.now() - startTime;

  return {
    status: "completed",
    durationMs,
    tokensIn: result.tokensIn || 0,
    tokensOut: result.tokensOut || 0,
    finalOutput: result.messages
      .filter(m => m.role === "assistant")
      .map(m => m.content)
      .join("\n"),
    scores: {} as any, // Se llena despues con el Judge
  };
}
```

### 2.5 Diferencias con el Experimento Actual

| Aspecto | Experimento Actual (lab-architect) | Channel Benchmark (nuevo) |
|---------|-----------------------------------|--------------------------|
| **Origen de agentes** | Creados temporalmente por lab-architect | AGENTES REALES del canal |
| **Modo de ejecucion** | `experiment-member` (sin tools) | `channel-member` (con tools, skills) |
| **Skills/Tools** | Deshabilitadas | HABILITADAS (las del agente real) |
| **Sistema prompt** | Generado por lab-architect | EL PROMPT REAL del agente en el canal |
| **Variantes** | 3: single, multiNoLeader, multiWithLeader | 2: multiAgent (canal real) vs singleAgent (baseline) |
| **Exportacion** | De experimento a canal | NO necesita exportacion (el canal ya existe) |
| **Iteracion** | No soportada (se crea desde cero) | HISTORIAL DE RUNS sobre el mismo canal |
| **Duracion** | Larga (3 variantes x 3 configs) | Corta (2 variantes directas) |
| **Valor principal** | Explorar topologias | VALIDAR y OPTIMIZAR canales existentes |

### 2.6 Historial de Iteraciones

Cada vez que se ejecuta un benchmark sobre el mismo canal, se guarda un `RunHistoryEntry` con:
- Snapshot de la configuracion del canal en ese momento (`channel.json` + prompts de agentes)
- Resultados de ambas variantes
- Evaluacion del Judge

Esto permite:
```typescript
GET /api/channels/:channelId/experiments/runs
// Devuelve: [{ runId, timestamp, scores: { multi, single }, winner }]

GET /api/channels/:channelId/experiments/runs/:runId
// Devuelve: detalle completo con mensajes, tokens, judge reasoning
```

Visualizacion en frontend: grafico de lineas mostrando la evolucion del score multi-agente a traves de las iteraciones.

---

## 3. Cambios Detallados por Archivo

### 3.1 Backend - Schemas

| Archivo | Cambio |
|---------|--------|
| `packages/shared/src/schemas.ts` | Anadir `ChannelExperimentSchema`, `RunHistoryEntrySchema`, `ChannelBenchmarkConfigSchema` |
| `packages/shared/src/index.ts` | Re-exportar nuevos tipos |

### 3.2 Backend - Channel Benchmark Store

Nuevo archivo: `apps/server/src/laboratory/channel-benchmark-store.ts`

```typescript
class ChannelBenchmarkStore {
  getDir(username, channelId): string    // {userDir}/channels/{channelId}/benchmarks/
  saveRun(username, channelId, run): void
  listRuns(username, channelId): RunHistoryEntry[]
  getRun(username, channelId, runId): RunHistoryEntry
  deleteRuns(username, channelId): void  // Cascade con el canal
}
```

Almacenamiento en disco:
```
/app/data/users/{username}/channels/{channelId}/
  channel.json
  messages.jsonl
  benchmarks/                    # NUEVO
    _index.json                  # Lista de runs
    runs/
      {runId}/
        snapshot.json            # Snapshot del canal al momento del run
        result-multi.json        # Resultado variante multi-agente
        result-single.json       # Resultado variante single
        judge-result.json        # Evaluacion del Judge
```

### 3.3 Backend - Channel Benchmark Runner

Nuevo archivo: `apps/server/src/laboratory/channel-benchmark-runner.ts`

```typescript
class ChannelBenchmarkRunner {
  async runBenchmark(username, channelId, taskPrompt, opts?: {
    singleAgentId?: string;
    criteria?: Criteria[];
    signal?: AbortSignal;
  }): Promise<BenchmarkResult>

  // Steps:
  // 1. Snapshot channel config + agent definitions
  // 2. Clone channel (tmp_bench_<uuid>)
  // 3. Run multi-agent variant on clone (real agents, real prompts, real tools)
  // 4. Run single-agent baseline
  // 5. Evaluate with LLM Judge
  // 6. Save run to ChannelBenchmarkStore
  // 7. Clean up clone channel
  // 8. Broadcast results via WS

  async stopBenchmark(username, channelId): Promise<void>
}
```

### 3.4 Backend - API Routes

Nuevo archivo o extension: `apps/server/src/routes/channel-benchmarks.ts`

```
POST   /api/channels/:channelId/benchmark           # Ejecutar benchmark
                  Body: { taskPrompt, singleAgentId?, criteria?, name? }
                  Response: { runId, status }

GET    /api/channels/:channelId/benchmark            # Listar runs historicos
                  Response: { runs: RunHistoryEntry[] }

GET    /api/channels/:channelId/benchmark/:runId     # Detalle de un run
                  Response: { run: RunHistoryEntry }

DELETE /api/channels/:channelId/benchmark/:runId     # Eliminar un run
POST   /api/channels/:channelId/benchmark/:runId/re-evaluate  # Re-evaluar con Judge
```

### 3.5 Backend - Factory Contract

Extender `FACTORY_CONTRACTS` con nueva entidad `benchmarks`:

```typescript
benchmarks: {
  entity: "benchmarks",
  description: "Channel benchmark runs for multi-agent vs single-agent comparison",
  actions: {
    get: { description: "List or get benchmark runs for a channel", params: { channelId, runId? } },
    upsert: { description: "Run a new benchmark", params: { channelId, taskPrompt, singleAgentId?, criteria? } },
    delete: { description: "Delete a benchmark run", params: { channelId, runId } },
  }
}
```

### 3.6 Backend - Channel Clone Cleanup

En `DELETE /api/channels/:channelId`, agregar cascade delete de:
- Canales clonados (`tmp_bench_*`) que referencien este canal
- Directorio de benchmarks

Ademas, los canales `tmp_bench_*` deben:
- Ser filtrados de `listChannels()` (como los `lab_`)
- Tener un TTL o limpieza periodica por si quedan huerfanos

### 3.7 Frontend - Channel Benchmark Tab

Nueva pestana en `ChannelDetailPage`: "Benchmark"

```typescript
// ChannelDetailPage.tsx
const tabs = ["chat", "org-chart", "members", "benchmark", "settings"];
//                                          ^^^^^^^^ NUEVO
```

Componentes nuevos en `apps/client/src/components/channels/`:

- **`ChannelBenchmarkTab.tsx`**: Contenedor principal con:
  - Historial de runs (tabla con fecha, scores, winner)
  - Grafico de evolucion (scores a traves de iteraciones)
  - Boton "New Benchmark"

- **`RunBenchmarkModal.tsx`**: Modal para configurar y lanzar benchmark:
  - Task prompt (textarea)
  - Selector de agente para baseline single
  - Criterios de evaluacion (opcional, defaults del sistema)
  - Boton "Run Benchmark"

- **`BenchmarkRunViewer.tsx`**: Visualizacion de un run completado:
  - Scores lado a lado: Multi-Agent vs Single Agent
  - Detalle de criterios
  - Judge reasoning expandible
  - Boton "Re-evaluate"

### 3.8 Frontend - Iteration Chart

**`ScoreEvolutionChart.tsx`**: Grafico de lineas (Recharts) mostrando:
- Eje X: runs (fecha/numero de iteracion)
- Eje Y: score global (0-100)
- Linea azul: score multi-agente
- Linea gris: score single-agent (baseline)
- Tooltip con detalle de cada run

### 3.9 WebSocket Events

Nuevos eventos WS para broadcasting en tiempo real:

```typescript
// Durante la ejecucion
{ type: "benchmark_status", channelId, runId, status: "running" }
{ type: "benchmark_progress", channelId, runId, variant: "multi" | "single", progress: 0.5 }
{ type: "benchmark_variant_complete", channelId, runId, variant, result }

// Al completar
{ type: "benchmark_complete", channelId, runId, result: BenchmarkResult }

// Judge streaming
{ type: "benchmark_judge_streaming", channelId, runId, textDelta, thinkingDelta }
```

---

## 4. Integracion con el Sistema Actual

### 4.1 Via `manage_factory` (Agente Global)

El agente global podra ejecutar benchmarks directamente:

```
User: "Ejecuta un benchmark en el canal autoconsulting para ver si rinde mejor que un solo agente"

Agent: (llama a manage_factory)
  manage_factory({
    entity: "benchmarks",
    action: "upsert",
    params: {
      channelId: "autoconsulting",
      taskPrompt: "Crea un SAAS de seguimiento de habitos con dashboard, API REST, y autenticacion"
    }
  })
```

### 4.2 Via Lab-Architect (Experimentos Tradicionales)

El lab-architect puede seguir existiendo para el flujo actual (exploracion de topologias desde cero).
El nuevo flujo (channel benchmark) es complementario:

| Flujo | Cuando usarlo |
|-------|--------------|
| Lab-Architect -> Experimento -> Export | No tengo un canal, quiero explorar topologias |
| Channel -> Benchmark | YA tengo un canal, quiero validarlo y optimizarlo |

### 4.3 Integracion con el Plan de Scoping

Si implementamos el scoping de agentes (ver `agent-tools-scoping.md`), los benchmarks de canales con agentes scoped funcionan igual: el clon del canal referencia los mismos `agentId` scoped.

---

## 5. Consideraciones de Diseno

### 5.1 Mutacion del Canal Durante el Benchmark

Si el usuario modifica el canal mientras se ejecuta un benchmark, el snapshot capturado al inicio refleja la configuracion original. El resultado incluye un warning indicando que el canal ha cambiado desde que se lanzo el benchmark.

### 5.2 Agentes Compartidos entre Canales

Un agente puede pertenecer a multiples canales. El benchmark de un canal no afecta al agente ni a sus otros canales. El clon del canal reusa los mismos `agentId`, y el `ChannelOrchestrator` maneja sesiones separadas por `channelId`.

### 5.3 Costo de Tokens

Cada benchmark ejecuta:
- 1 corrida multi-agente (potencialmente varias rondas, varios agentes)
- 1 corrida single-agent (1 solo prompt)
- 1 evaluacion del Judge (1 prompt con los 2 outputs)

El usuario debe ser consciente del costo. Mostrar estimacion antes de ejecutar:
```
"Este benchmark consumira aproximadamente:
- Multi-agent: ~15 llamadas LLM (6 agentes x ~2.5 rondas)
- Single agent: 1 llamada LLM
- Judge: 1 llamada LLM
Total estimado: ~150K tokens"
```

### 5.4 Canal Clonado como Side Effect

El canal clonado (`tmp_bench_*`) se elimina al finalizar el benchmark. Pero si el benchmark falla o se aborta, puede quedar huerfano. Soluciones:
- Timeout de limpieza: un `setTimeout` que elimine el clon a los 30 min si no se completa
- Limpieza en startup: al iniciar el servidor, barrer canales `tmp_bench_*` huerfanos
- El DELETE del canal padre tambien barre clones huerfanos

---

## 6. Plan de Implementacion (Phases)

### Phase 1: Schemas y Tipos
- [ ] 1.1 Anadir `ChannelExperimentSchema`, `RunHistoryEntrySchema`
- [ ] 1.2 Anadir constantes (`SessionPrefix.BENCHMARK` ya existe, anadir `tmp_bench_`)

### Phase 2: Backend - Channel Benchmark Store
- [ ] 2.1 Crear `channel-benchmark-store.ts` con CRUD de runs
- [ ] 2.2 Implementar snapshot de canal (channel.json + agent definitions)
- [ ] 2.3 Integrar cascade delete con channel store

### Phase 3: Backend - Channel Cloning
- [ ] 3.1 Implementar `cloneChannelForBenchmark()` en channel-store o util
- [ ] 3.2 Implementar filtrado de canales `tmp_bench_*` en listChannels()
- [ ] 3.3 Implementar limpieza de clones huerfanos (startup + timeout)

### Phase 4: Backend - Channel Benchmark Runner
- [ ] 4.1 Crear `channel-benchmark-runner.ts`
- [ ] 4.2 Implementar variante multi-agent (runToCompletion sobre clon)
- [ ] 4.3 Implementar variante single-agent (sesion directa con el agente lead)
- [ ] 4.4 Integrar LLM Judge para evaluacion
- [ ] 4.5 WebSocket events para progreso en tiempo real

### Phase 5: Backend - API Routes
- [ ] 5.1 Crear rutas CRUD para benchmarks de canal
- [ ] 5.2 Integrar en factory contracts como entidad `benchmarks`
- [ ] 5.3 Anadir cascade cleanup en DELETE channel

### Phase 6: Frontend
- [ ] 6.1 Crear `ChannelBenchmarkTab` con listado de runs
- [ ] 6.2 Crear `RunBenchmarkModal` con configuracion
- [ ] 6.3 Crear `BenchmarkRunViewer` con scores y detalle
- [ ] 6.4 Crear `ScoreEvolutionChart` con Recharts
- [ ] 6.5 Anadir pestana "Benchmark" en ChannelDetailPage
- [ ] 6.6 Traducciones (literals)

### Phase 7: Validacion
- [ ] 7.1 Benchmark de canal simple (2 agentes)
- [ ] 7.2 Benchmark de canal autoconsulting (6 agentes)
- [ ] 7.3 Iteracion: modificar prompt, re-benchmark, comparar resultados
- [ ] 7.4 Verificar limpieza de clones al abortar/fallar
- [ ] 7.5 Compilacion TypeScript estricta

---

## Apendice: Diagrama de Flujo

```
ESTADO ACTUAL (reves):
  User idea -> lab-architect -> experiment (temp agents, no tools) -> export -> channel

ESTADO FUTURO (forward):
  User idea -> manage_factory -> CANAL REAL (con agentes, tools, prompts)
                                  |-- Chat/Iterar
                                  |-- BENCHMARK:
                                       |-- Clonar canal (tmp_bench_*)
                                       |-- Run multi-agente (tools ON, prompts reales)
                                       |-- Run single-agent baseline
                                       |-- LLM Judge evalua
                                       |-- Resultado: "Multi: 85 | Single: 72"
                                       |-- Limpiar clon
                                  |-- Ajustar prompts
                                  |-- Re-benchmark
                                  |-- Comparar historico: "Iteracion 3 mejoro +12%"
```

```
Ejemplo de uso concreto:

Usuario: "Crea un canal con un equipo de 3 agentes para construir landing pages"
  -> manage_factory(upsert, channel, { members: [designer, developer, reviewer] })

Usuario: (chatea, prueba, ajusta prompts)

Usuario: "Ejecuta benchmark: construye una landing page para una cafeteria"
  -> POST /api/channels/{id}/benchmark
     Body: { taskPrompt: "Landing page cafeteria: menu, ubicacion, galeria" }
  -> El sistema:
     1. Clona el canal (mismos agentes, prompts, tools)
     2. Multi-agente: los 3 agentes colaboran -> generan landing page
     3. Single-agent: solo el lead intenta lo mismo
     4. Judge evalua ambos outputs (double-blind)
     5. Resultado: "Multi: 88/100 | Single: 65/100 | Winner: Multi (+23pts)"

Usuario: "Mejora el prompt del revisor para que sea mas critico"
  -> PATCH /api/channels/{id} (modifica systemPrompt del agente reviewer)

Usuario: "Ejecuta benchmark de nuevo con el mismo prompt"
  -> POST /api/channels/{id}/benchmark (mismo taskPrompt)
  -> Resultado: "Multi: 92/100 | Single: 64/100 | Mejora: +4pts vs run anterior"
```
