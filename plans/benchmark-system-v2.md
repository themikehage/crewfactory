# Benchmark System v2 — Inline Channel Benchmarking

Rediseño del sistema de benchmark de canales: de un runner manual aislado a un sistema integrado que se ejecuta en paralelo con cada mensaje del usuario.

---

## 1. Diagnóstico del Sistema Actual

### Problemas

| # | Problema | Impacto |
|---|---|---|
| 1 | `runBenchmarkSuite()` es fire-and-forget (`void`) sin feedback de errores | El usuario ve loader eterno sin saber qué falló |
| 2 | Briefs hardcodeados en `briefs.json` (3 casos de heladería/e-commerce/SaaS) | No tiene relación con lo que el usuario está pidiendo realmente |
| 3 | Vista separada (`viewMode === "benchmark"`) que reemplaza el chat | Rompe el flujo natural de trabajo |
| 4 | Hay que ir manualmente a la pestaña Benchmark y apretar "Ejecutar" | Fricción altísima, casi nadie lo usa |
| 5 | Sin historial navegable | Cada benchmark nuevo pisa el anterior (`latest-report.md`) |

### Lo que sí funciona

- La comparación A vs B (`harness.ts`) — la lógica de Condition A/B es sólida
- El `RichMarkdown` renderer para mostrar reportes

### El problema del scoring actual

El motor de scoring actual depende de un `goldAnswer` predefinido (ej. "20 fichas") para la métrica `precision`. Esto funciona con los 3 briefs hardcodeados de `briefs.json`, pero **es inútil para mensajes arbitrarios del usuario** — no hay un gold answer conocido de antemano.

Además, el `llm-judge` está acoplado a la ejecución del benchmark (se llama dentro de `computeGlobalScore()`), cuando debería ser una operación asincrónica separada que el usuario decide cuándo ejecutar.

---

## 2. Visión Propuesta

**Benchmark inline, siempre activo, transparente.**

Cada vez que el usuario manda un mensaje al canal, el benchmark corre automáticamente una sesión single-agent en paralelo y compara resultados. El historial se acumula y se puede navegar.

### Flujo de usuario

```
1. Usuario abre Configuración del Canal
2. Activa toggle "Benchmark Mode"
3. Vuelve al chat, ve una nueva pestaña "Benchmark" al lado de "Files"
4. Envía un mensaje normal al canal
5. El chat funciona igual que siempre (todos los agentes)
6. En paralelo, la pestaña "Benchmark" muestra en vivo la sesión single-agent
7. Cuando ambos terminan, se genera un reporte comparativo
8. Si hay reportes previos, aparece pestaña "History" listándolos
```

---

## 2.5 Sistema de Métricas — Sin Gold Answer

Las métricas del benchmark inline no pueden depender de un valor correcto predefinido. Se dividen en dos categorías:

### 2.5.1 Métricas Automáticas (calculadas al finalizar ambas ejecuciones)

Estas se computan **instantáneamente** sin costo adicional de LLM:

| Métrica | Descripción | Cálculo |
|---|---|---|
| **Tiempo de ejecución** | Cuánto tardó cada lado | `Date.now() - startTime` en segundos |
| **Tokens totales** | Tokens consumidos (input + output) | Suma de `usage.promptTokens + completionTokens` |
| **Rondas de negociación** | Solo channel: cuántos turnos de diálogo hubo | Contador de mensajes entre agentes |
| **Longitud de respuesta** | Cantidad de caracteres en el output final | `output.length` |
| **Costo estimado** | USD estimado según pricing del modelo | `tokensIn * inputPrice + tokensOut * outputPrice` |

Estas métricas se muestran **siempre** en la tabla comparativa al finalizar el benchmark. No requieren LLM adicional.

### 2.5.2 Métricas con LLM-Judge (desacopladas, bajo demanda)

El LLM-Judge **no se ejecuta automáticamente**. El benchmark completa con métricas automáticas, y luego el usuario decide si quiere evaluar calidad con un botón explícito.

| Métrica | Peso | Descripción |
|---|---|---|
| **Completitud** | 35% | ¿Cubre todos los aspectos del requerimiento? ¿Omite algo importante? |
| **Estructura** | 35% | ¿La respuesta está bien organizada? ¿Es accionable? ¿Tiene secciones claras? |
| **Precisión técnica** | 30% | ¿Los conceptos técnicos son correctos? ¿Hay errores factuales? |

**Flujo del Judge desacoplado:**

```
Benchmark completo → usuario ve tabla con métricas automáticas
                        │
                        ▼
              ┌─────────────────────┐
              │  [▶ Run LLM Judge]  │  ← Botón explícito
              └─────────────────────┘
                        │
                        ▼
              POST /api/channels/:id/benchmark/:runId/judge
                        │
                        ▼
              El servidor crea una sesión de LLM temporal,
              le pasa ambos outputs + el prompt original,
              evalúa las 3 métricas, y devuelve scores.
                        │
                        ▼
              El reporte se actualiza con las métricas de
              calidad. El usuario puede re-ejecutar el judge
              cuantas veces quiera.
```

**Ventajas de desacoplarlo:**
- El benchmark completa rápido (sin esperar llamadas extra al LLM)
- El usuario decide si vale la pena el costo de tokens del judge
- Puede re-ejecutar el judge si no está conforme con la evaluación
- Múltiples judges sobre el mismo benchmark permiten comparar consistencia

### 2.5.3 Score Global (solo cuando hay Judge)

```typescript
globalScore = completitud × 0.35 + estructura × 0.35 + precisión × 0.30
```

Si no se ha ejecutado el judge, el score global no se muestra — solo las métricas automáticas. La tabla comparativa siempre tiene dos secciones: "Métricas Automáticas" (siempre visibles) y "Evaluación de Calidad" (visible solo si se ejecutó el judge).

Cada lado (Channel y Baseline) recibe su propio judge independiente. Luego se comparan los scores.

---

## 3. Arquitectura

### 3.1 Configuración del Benchmark (Channel Settings)

**Channel Settings Modal** gana una sección nueva:

```
┌─────────────────────────────────────────┐
│  ⚙️  Channel Settings                    │
│                                         │
│  ── General ──                          │
│  Name: [………………]                        │
│  Description: [………………]                 │
│                                         │
│  ── Benchmark ──          [Toggle ON/OFF]│
│  ☑ Enable inline benchmarking            │
│                                         │
│  Model for baseline:                     │
│  [ModelSelector ▼]                      │
│                                         │
│  ── Members ──                          │
│  …                                      │
└─────────────────────────────────────────┘
```

**Campo nuevo en el schema del canal:**

```typescript
interface ChannelBenchmarkConfig {
  enabled: boolean;                        // default: false
  baselineModelId?: string;                // modelo para el single-agent (default: lead agent model)
}
```

Se persiste en el store del canal (parte del JSON del canal en disco).

### 3.2 Tabs en ChannelChatArea

El header del chat gana un sistema de tabs. Layout actual vs propuesto:

**Layout propuesto:**
```
┌──────────────────────────────────────────────────────┐
│  [Chat] [Files] [Benchmark ●] [History (3)]     ⚙️   │
├──────────────────────────────────────────────────────┤
│  (contenido del tab activo)                          │
└──────────────────────────────────────────────────────┘
```

- **Chat**: Siempre visible. El chat multi-agente normal.
- **Files**: Siempre visible (ya existe).
- **Benchmark**: Solo visible cuando `benchmark.enabled === true` Y hay una sesión single-agent activa. Muestra en vivo el output del single-agent y, al finalizar, el diff comparativo.
- **History**: Solo visible cuando hay al menos 1 reporte guardado. Badge con contador. Lista cronológica de benchmarks + optimizaciones.

### 3.3 Ejecución Paralela

Cuando el usuario envía un mensaje Y `benchmark.enabled === true`:

```typescript
// En el handler del envío de mensaje (ChannelInput → server):
const userMessage = "...";

// 1. Disparar el canal multi-agente (NORMAL — como siempre)
channelOrchestrator.dispatchUserMessage(channelId, userMessage, sessionId);

// 2. Disparar baseline single-agent (NUEVO — solo si benchmark enabled)
if (channel.benchmark?.enabled) {
  const baselineSessionId = `bench_${channelId}_${Date.now()}`;
  const modelId = channel.benchmark.baselineModelId || leadAgent.model;
  
  // Stream en vivo a la pestaña Benchmark via WebSocket
  runBaselineAgent(channelId, userMessage, baselineSessionId, modelId, {
    onToken: (token) => eventBroker.publish(channelId, "benchmark_token", { sessionId: baselineSessionId, token }),
    onComplete: (result) => {
      // Guardar reporte y notificar al frontend
      saveBenchmarkReport(channelId, { userMessage, channelResult, baselineResult });
      eventBroker.publish(channelId, "benchmark_complete", report);
    },
    onError: (err) => eventBroker.publish(channelId, "benchmark_error", { error: err.message })
  });
}
```

### 3.4 Tab "Benchmark" — Vista en Vivo

Mientras la sesión single-agent está corriendo:

```
┌──────────────────────────────────────────────────────┐
│  🔬 Baseline Agent (Claude 3.5 Sonnet)    [● Running]│
│                                                      │
│  ┌──────────────┬──────────────┐                     │
│  │  Channel     │  Baseline    │                     │
│  │  (3 agents)  │  (1 agent)   │                     │
│  ├──────────────┼──────────────┤                     │
│  │ @lead: ...   │ Thinking...  │                     │
│  │ @senior: ... │ Generando    │                     │
│  │ @member: ... │ respuesta... │                     │
│  └──────────────┴──────────────┘                     │
│                                                      │
│  ── Métricas parciales ──                            │
│  Channel: 1,250 tokens | 12s elapsed                 │
│  Baseline: 340 tokens | 4s elapsed                   │
└──────────────────────────────────────────────────────┘
```

Cuando ambos terminan (métricas automáticas visibles, judge pendiente):

```
┌──────────────────────────────────────────────────────┐
│  📊 Benchmark — "Estimar landing page..."             │
│                                                      │
│  ── Métricas Automáticas ──                          │
│  ┌────────────────┬──────────┬──────────┬──────────┐ │
│  │ Metric         │ Channel  │ Baseline │ Delta    │ │
│  ├────────────────┼──────────┼──────────┼──────────┤ │
│  │ Tiempo (s)     │ 45.2     │ 8.1      │ +458%    │ │
│  │ Tokens total   │ 3,420    │ 820      │ +317%    │ │
│  │ Rondas         │ 5        │ 1        │ +400%    │ │
│  │ Costo (USD)    │ $0.052   │ $0.012   │ +333%    │ │
│  └────────────────┴──────────┴──────────┴──────────┘ │
│                                                      │
│  ── Evaluación de Calidad ──                         │
│  ┌──────────────────────────────────────────────────┐│
│  │  🤖 LLM Judge no ejecutado                       ││
│  │  Evalúa completitud, estructura y precisión       ││
│  │  técnica con un LLM independiente.               ││
│  │                                                  ││
│  │  [▶ Run LLM Judge]                               ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

Después de ejecutar el judge:

```
  ── Evaluación de Calidad ──
  ┌────────────────┬──────────┬──────────┬──────────┐ │
  │ Metric         │ Channel  │ Baseline │ Delta    │ │
  ├────────────────┼──────────┼──────────┼──────────┤ │
  │ Tiempo (s)     │ 45.2     │ 8.1      │ +458%    │ │
  │ Tokens total   │ 3,420    │ 820      │ +317%    │ │
  │ Completitud    │ 85/100   │ 62/100   │ +37%     │ │
  │ Estructura     │ 78/100   │ 70/100   │ +11%     │ │
  │ Prec. Técnica  │ 90/100   │ 88/100   │ +2%      │ │
  ├────────────────┼──────────┼──────────┼──────────┤ │
  │ Global Score   │ 84.3     │ 73.3     │ +15%     │ │
  └────────────────┴──────────┴──────────┴──────────┘ │
                                                      │
  [▶ Re-run Judge]  [📋 Copy Report]                   │
```

### 3.5 Tab "History" — Historial Acumulado

```
┌──────────────────────────────────────────────────────┐
│  📋 Benchmark History (5 reports)                     │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Jun 15 14:32  Global: 74.5  ▲ +28% vs baseline  │ │
│  │ "Estimar landing page para heladería..."         │ │
│  ├─────────────────────────────────────────────────┤ │
│  │ Jun 15 13:10  Global: 68.2  ▲ +15% vs baseline  │ │
│  │ "Diseñar API REST para e-commerce..."            │ │
│  ├─────────────────────────────────────────────────┤ │
│  │ Jun 14 18:45  Global: 81.0  ▲ +35% vs baseline  │ │
│  │ "Arquitectura de microservicios..."              │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ── Optimization History (2 runs) ──                  │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Iter 3  Avg: 82.3%  ▲ +12% from iter 0          │ │
│  │ Jun 15 15:00                                    │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### 3.6 Almacenamiento

```
/tmp/crewfactory/{username}/benchmarks/{channelId}/
  config.json                    # { enabled: true, baselineModelId: "..." }
  history/
    {runId}/
      userPrompt.txt             # El mensaje del usuario
      channelOutput.txt          # Output del canal multi-agente
      baselineOutput.txt         # Output del single-agent
      metrics.json               # Métricas automáticas (tiempo, tokens, rondas, costo)
      judge.json                 # Resultado del LLM-Judge (scores de calidad) — solo si se ejecutó
  optimization/
    {timestamp}/
      iteration_{n}/
        prompts.json
        scores.json
```

### 3.7 Eventos WebSocket

Nuevos eventos para la pestaña Benchmark en vivo:

| Evento | Dirección | Payload |
|---|---|---|
| `benchmark_token` | server → client | `{ sessionId, token, side: "baseline" \| "channel" }` |
| `benchmark_metric` | server → client | `{ metric, value, side }` |
| `benchmark_complete` | server → client | `{ runId, metrics }` |
| `benchmark_error` | server → client | `{ error }` |
| `benchmark_judge_start` | server → client | `{ runId }` |
| `benchmark_judge_complete` | server → client | `{ runId, scores }` |
| `benchmark_judge_error` | server → client | `{ runId, error }` |

---

## 4. Implementación

### Fase 1: Configuración + Schema
1. Agregar `benchmark` al schema del canal en `packages/shared/src/schemas.ts`
2. Agregar toggle + ModelSelector en `ChannelSettingsModal.tsx`
3. Persistir en `channelStore` (server)

### Fase 2: Tab System + Ejecución Paralela
4. Implementar sistema de tabs en `ChannelChatArea` (Chat / Files / Benchmark / History)
5. Modificar el handler de envío de mensajes para disparar baseline en paralelo
6. Crear `BaselineRunner` — sesión single-agent con streaming de tokens vía evento `benchmark_token`
7. Conectar WebSocket events para la pestaña Benchmark en vivo
8. Crear componente `BenchmarkLiveTab` — vista side-by-side en vivo con métricas automáticas
9. Computar métricas automáticas (tiempo, tokens, rondas, costo) al finalizar ambas ejecuciones

### Fase 3: LLM-Judge Desacoplado
10. Crear endpoint `POST /api/channels/:id/benchmark/:runId/judge` — ejecuta judge bajo demanda
11. Crear `llm-judge.ts` — sesión de LLM temporal que evalúa completitud, estructura, precisión técnica
12. Agregar botón `[▶ Run LLM Judge]` en `BenchmarkLiveTab` cuando el benchmark está completo
13. Manejar estado del judge: idle → running → complete (con scores) o failed
14. Permitir re-ejecutar el judge sobre el mismo benchmark

### Fase 4: Reportes + Historial
15. Crear `saveBenchmarkReport()` — guarda report.json (métricas automáticas + judge si existe)
16. Crear componente `BenchmarkHistoryTab` — lista cronológica + detail view expandible
17. Migrar `ChannelBenchmarkPanel` actual a usar el historial (o eliminarlo)
18. Unificar `ChannelOptimizePanel` en la misma pestaña History (sección "Optimizations")

### Fase 5: Polish
20. Animaciones de transición entre tabs
21. Indicadores visuales en el tab cuando hay benchmark corriendo (punto verde pulsando)
22. Notificación toast cuando un benchmark completa o un judge termina
23. Exportar reporte como Markdown / JSON

---

## 5. Archivos Afectados

| Archivo | Cambio |
|---|---|
| `packages/shared/src/schemas.ts` | Agregar `ChannelBenchmarkConfig` al channel schema |
| `apps/server/src/channels/channel-store.ts` | Tipar + validar `benchmark` en channel JSON |
| `apps/server/src/routes/channels.ts` | Handler de mensaje: disparar baseline en paralelo si enabled |
| `apps/server/src/benchmark/harness.ts` | Extraer `runBaselineAgent()` como función independiente con streaming |
| `apps/server/src/benchmark/baseline-runner.ts` | **NUEVO** — Single-agent session wrapper con streaming |
| `apps/server/src/benchmark/report-store.ts` | **NUEVO** — Save/load benchmark reports del filesystem |
| `apps/server/src/benchmark/metrics.ts` | **NUEVO** — Cálculo de métricas automáticas (tiempo, tokens, rondas, costo) |
| `apps/server/src/benchmark/llm-judge.ts` | **NUEVO** — LLM Judge desacoplado: evalúa completitud, estructura, precisión |
| `apps/server/src/routes/benchmark-judge.ts` | **NUEVO** — Endpoint `POST /api/channels/:id/benchmark/:runId/judge` |
| `apps/client/src/components/channels/ChannelSettingsModal.tsx` | Agregar sección Benchmark con toggle + ModelSelector |
| `apps/client/src/components/channels/ChannelChatArea.tsx` | Sistema de tabs, render condicional de Benchmark/History |
| `apps/client/src/components/channels/ChannelTabs.tsx` | **NUEVO** — Barra de tabs con badges e indicadores |
| `apps/client/src/components/channels/BenchmarkLiveTab.tsx` | **NUEVO** — Vista side-by-side en vivo |
| `apps/client/src/components/channels/BenchmarkHistoryTab.tsx` | **NUEVO** — Historial de benchmarks + optimizaciones |
| `apps/client/src/components/channels/ChannelBenchmarkPanel.tsx` | Deprecar o migrar lógica a los nuevos componentes |

---

## 6. No Cambiar

- `ChannelOptimizePanel.tsx` — Se integra en History tab pero su lógica se preserva
- `briefs.json` — Se deja de usar para el flujo inline (solo queda como referencia/dev)
- La API `GET/POST /api/channels/:id/benchmark` — Se mantiene por compatibilidad, pero se marca como legacy
- `ChannelOrgChart` y el resto de componentes del canal — Sin cambios
