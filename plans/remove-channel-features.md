# Remove Channel Features: Tasks, Optimize, Benchmark

Eliminar de forma profesional (sin dejar codigo muerto) tres funcionalidades de los canales: Tareas (Task Ledger), Optimizar (Prompt Optimizer), y Benchmark (Comparativa A/B).

## Alcance

El laboratorio (`apps/server/src/laboratory/`) tiene su propio sistema de scoring y LLM-Judge independiente. No depende de ningun archivo de `apps/server/src/benchmark/`. Los modulos a eliminar son usados exclusivamente por canales.

## Fase 1: Shared Types

### `packages/shared/src/schemas.ts`

Eliminar:

- `ScoringMetricSchema`, `ScoringRubricSchema` y sus tipos derivados (lines 249-267)
- `ChannelBenchmarkConfigSchema` y `ChannelBenchmarkConfig` type (lines 275-279)
- Campos `scoringRubric` y `benchmark` de `ChannelSchema` (lines 290-293)
- Campos `scoringRubric` y `benchmark` de `CreateChannelSchema` (lines 307-310)
- Campos `scoringRubric` y `benchmark` de `UpdateChannelSchema` (lines 322-325)
- Eventos de benchmark (`benchmark_start`, `benchmark_token`, `benchmark_complete`, `benchmark_error`, `judge_start`, `judge_complete`, `judge_error`) de `GlobalLogEvent.eventType` union (line 370)

### `packages/shared/src/paths.ts`

Eliminar:

- `BENCHMARKS_DIR` constant (line 19)
- `getBenchmarksDir(username)` (lines 100-101)
- `getBenchmarkDir(username, channelId)` (lines 104-105)
- `getChannelBenchmarkReportPath()` (lines 170-171)
- `getChannelBenchmarkHistoryPath()` (lines 174-175)
- `getChannelBenchmarkDir()` (lines 178-179)

## Fase 2: Server - Benchmark Module

Eliminar completamente el directorio y sus archivos:

- `apps/server/src/benchmark/` (directorio completo con harness.ts, optimizer.ts, baseline-runner.ts, scoring.ts, llm-judge.ts, briefs.json)
- No hay otros importers de estos archivos fuera de `routes/channels.ts`

## Fase 3: Server - Task Ledger

Eliminar:

- `apps/server/src/channels/task-ledger.ts` (archivo completo)
- Linea `export { TaskLedger } from "./task-ledger"` de `apps/server/src/channels/index.ts` (line 5)
- Metodo `getTaskLedgerPath` de `apps/server/src/channels/channel-store.ts` (lines 262-263)
- Import de `TaskLedger` en `apps/server/src/channels/channel-orchestrator.ts` (line 11)
- Reseteo del ledger en `channel-orchestrator.ts` (lines 171-175)
- Plantillas de instrucciones de task delegation en `channel-orchestrator.ts` (lines 895, 903)

## Fase 4: Server - Routes

### `apps/server/src/routes/channels.ts`

Eliminar:

- `import { runOptimizationStep } from "../benchmark/optimizer"` (line 10)
- `import { runBenchmarkSuite } from "../benchmark/harness"` (line 9)
- `import { runBaselineAndCompare, listBenchmarkRuns, getBenchmarkRun, saveJudgeResult } from "../benchmark/baseline-runner"` (line 11)
- `import { runJudge } from "../benchmark/llm-judge"` (line 12)

Rutas a eliminar:

- `GET /:id/ledger` (lines 228-239)
- Auto-trigger baseline on message send (lines 256-267)
- `GET /:id/benchmark` (lines 282-301)
- `POST /:id/benchmark` (lines 303-347)
- `GET /:id/optimize` (lines 349-368)
- `POST /:id/optimize` (lines 370-457)
- `GET /:id/benchmark/history` (lines 459-466)
- `GET /:id/benchmark/history/:runId` (lines 468-477)
- `POST /:id/benchmark/history/:runId/judge` (lines 479-525)

## Fase 5: Client - Components

Eliminar los siguientes archivos completos:

- `apps/client/src/components/channels/ChannelTaskLedger.tsx`
- `apps/client/src/components/channels/ChannelOptimizePanel.tsx`
- `apps/client/src/components/channels/ChannelOptimizePanel.literals.ts`
- `apps/client/src/components/channels/ChannelBenchmarkPanel.tsx`
- `apps/client/src/components/channels/ChannelBenchmarkPanel.literals.ts`
- `apps/client/src/components/channels/BenchmarkLiveTab.tsx`
- `apps/client/src/components/channels/BenchmarkLiveTab.literals.ts`

## Fase 6: Client - Integraciones

### `apps/client/src/components/channels/ChannelChatArea.tsx`

Eliminar:

- Import de `ChannelTaskLedger` (line 10)
- Import de `ChannelBenchmarkPanel` (line 11)
- Import de `ChannelOptimizePanel` (line 12)
- Import de `BenchmarkLiveTab` (line 13)
- Valor `"ledger"` del estado `viewMode` (line 30)
- Valor `"optimize"` del estado `viewMode` (line 30)
- Valor `"benchmark"` y `"benchmark_live"` del estado `viewMode`
- Boton "Tareas" (lines 175-183)
- Boton "Benchmark" condicional (lines 151-163)
- Boton "Optimizar" (lines 185-193)
- Render condicional de `ChannelTaskLedger` (lines 250-253)
- Render condicional de `BenchmarkLiveTab` (lines 254-260)
- Render condicional de `ChannelBenchmarkPanel` (lines 261-264)
- Render condicional de `ChannelOptimizePanel` (lines 265-268)

### `apps/client/src/components/channels/AgentDetailPanel.tsx`

Eliminar:

- Tipo `LedgerTask` local (lines 10-21)
- Estado `tasks` (line 58)
- `useEffect` de fetch de tasks (lines 68-89)
- Seccion "Active Tasks" (lines 310-336)

### `apps/client/src/components/channels/AgentDetailPanel.literals.ts`

Eliminar:

- `activeTasks` y `noTasks` en ingles (lines 17-18)
- `activeTasks` y `noTasks` en espanol (lines 36-37)

### `apps/client/src/components/channels/ChannelSettingsModal.tsx`

Eliminar:

- Import de `ChannelBenchmarkConfig` (line 4)
- Campo `benchmark` en la interfaz de save (line 20)
- Estados `benchmarkEnabled` y `benchmarkModel` (lines 31-32)
- Persistencia de benchmark al guardar (line 97)
- UI de benchmark checkbox + model selector (lines 205-231)

## Fase 7: CLI Script

Eliminar:

- `scripts/benchmark.ts` (archivo completo)

## Fase 8: Limpieza de literals globales

Verificar que no queden referencias a estas features en literals/shared.

## Dependencias

Ninguna. El ecosistema del laboratorio (LabJudge, experiment-scoring) es completamente independiente del modulo benchmark de canales.
