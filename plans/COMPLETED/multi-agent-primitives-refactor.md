COMPLETED 
# Plan: Refactorizacion a Primitivas Multi-Agente

**Estado:** Pendiente
**Objetivo:** Consolidar 7+ flujos de ejecucion multi-agente en 4 primitivas componibles, eliminando duplicacion y complejidad accidental.

---

## Diagnostico

El sistema actual tiene **7 mecanismos** de ejecucion multi-agente dispersos en ~2800 lineas de orquestacion. El analisis en `docs/multi-agent-flows-analysis.md` identifica que conceptualmente son solo **4 patrones** con distintas configuraciones de visibilidad, persistencia y depth.

### Los 4 patrones reales

| Patron | Tipo | Que hace |
|---|---|---|
| **Spawn** | Tool | Crea un agente aislado con fresh context, ejecuta una tarea, retorna envelope estructurado |
| **Delegate** | Tool | Envia una tarea a un agente/proyecto/canal/sesion existente, retorna envelope |
| **Negotiate** | Protocolo | N agentes discuten/colaboran con state machine de acuerdo/contraoferta/rechazo |
| **Arbitrate** | Protocolo | Un agente arbitro resuelve deadlocks cuando negotiate no llega a acuerdo |

### Mapeo actual -> primitivas

| Flujo actual | Se convierte en |
|---|---|
| `spawn_subagent` (Flujo 7) | **Spawn** |
| Lab Single (Flujo 3) | **Spawn** con `lab_` prefix + no streaming |
| `delegate_task` (Flujo 6) | **Delegate** |
| DELEGATE: text parsing en channels | **Delegate** invocado via tool (no text parsing) |
| Ch. Paralelo (Flujo 1) | **Negotiate** (topology: parallel) |
| Ch. Secuencial (Flujo 2) | **Negotiate** (topology: sequential) + **Arbitrate** (on escalate) |
| Lab No Lider (Flujo 4) | **Negotiate** (topology: broadcast) con `lab_` prefix |
| Lab Con Lider (Flujo 5) | **Negotiate** + **Delegate** (lead tree) con `lab_` prefix |

---

## Milestones

### H0: Limpieza de Fundacion (1-2 sesiones)

#### H0.1 — Extraer `parseEnvelope` a shared utility
- **Archivos:** `delegate-tool.ts:18-62`, `spawn-subagent-tool.ts:26-73`
- **Accion:** Crear `apps/server/src/core/envelope-parser.ts` con `parseEnvelope(text: string): EnvelopeResult`
- **Validacion:** Compilacion limpia, ambos tools usan el shared parser

#### H0.2 — Definir `SessionPrefix` enum centralizado
- **Archivos afectados:** `session-manager.ts`, `spawn-subagent-tool.ts`, `agent-registry.ts`, `channel-store.ts`, `routes/experiments.ts`, `benchmark/harness.ts`, `routes/sessions.ts`
- **Accion:** Crear `packages/shared/src/session-prefix.ts` con enum documentado:
  ```
  exec_    → Read-only execution logs
  del_     → Delegated task session
  sub_     → Spawned subagent session
  lab_     → Laboratory agents/channels
  bench_   → Benchmark sessions
  generate_ → AI experiment generation
  ```
- **Validacion:** Todos los condicionales de prefijo usan el enum, no strings hardcodeados

#### H0.3 — Unificar forwarding de eventos de subagente
- **Duplicacion:** 5 ocurrencias del patron `broadcastToSession(parentSessionId, { type: "subagent_event", ... })`
- **Accion:** Crear helper `forwardSubagentEvents(subSession, parentSessionId, delegateSessionId, toolCallId)` en `envelope-parser.ts`
- **Validacion:** delegate-tool y spawn-subagent-tool usan el helper

#### H0.4 — Unificar extraccion de ultimo mensaje de asistente
- **Duplicacion:** 6 ocurrencias del patron "buscar ultimo mensaje assistant, manejar string y ContentBlock[]"
- **Accion:** Funcion `getLastAssistantText(messages: Message[]): string` en shared utility
- **Validacion:** Todos los callers usan la funcion unificada

#### H0.5 — Unificar resolucion de modelo con fallback
- **Duplicacion:** channel-orchestrator y experiment-runner replican la misma logica de "resolver modelo -> fallback a primer available"
- **Accion:** Metodo `resolveModel(modelId, modelRegistry)` en session-manager o utility
- **Validacion:** Ambos callers usan el metodo compartido

---

### H1: Unificacion de Herramientas Spawn y Delegate (2-3 sesiones)

#### H1.1 — Refactorizar `delegate_task` para usar patrones compartidos
- Integrar `forwardSubagentEvents`, `getLastAssistantText`, `parseEnvelope`
- Unificar los 4 branches (agent/project/channel/session) para que compartan la misma post-ejecucion
- Los branches solo deben diferir en como obtienen la sesion/canal objetivo

#### H1.2 — Refactorizar `spawn_subagent` para usar patrones compartidos
- Misma integracion de helpers
- Extraer la inyeccion de "Subagent Executor Mode" prompt a un template compartido

#### H1.3 — Eliminar `DELEGATE:` text parsing del channel-orchestrator
- **Problema:** Dos mecanismos de delegacion (tool + text parsing) crean confusion y race conditions potenciales
- **Accion:** 
  - El `delegate_task` tool debe funcionar dentro de canales (ya tiene `targetType: "agent"`)
  - Si un agente en canal necesita delegar, usa el tool, no el texto
  - Eliminar lineas ~412-485 del channel-orchestrator (DELEGATE parsing)
  - Eliminar `TaskLedger` como concepto independiente (la tool ya trackea via sesiones `del_`)
- **Riesgo:** Romper scripts de setup existentes que dependen de DELEGATE parsing
- **Validacion:** Agentes en canales pueden delegar via `delegate_task` tool; setup-autoconsulting-channel sigue funcionando

#### H1.4 — Formato de envelope unificado
- Definir `EnvelopeFormat` schema en shared:
  ```ts
  interface EnvelopeResult {
    status: "success" | "blocked" | "error";
    executive_summary: string;
    artifacts: string;
    risks: string;
    subagentSessionId?: string;
  }
  ```
- Ambos tools (`delegate_task`, `spawn_subagent`) retornan exactamente este formato
- El UI de `ToolCallRow` espera este contrato unico

---

### H2: Extraccion de Protocolos Negotiate y Arbitrate (2-3 sesiones)

#### H2.1 — Extraer `NegotiationProtocol` como primitiva independiente
- **Actual:** `NegotiationStateMachine` vive acoplado al channel-orchestrator
- **Objetivo:** `NegotiationProtocol` debe ser inyectable en cualquier entry point:
  - Canales (persistente, streaming)
  - Laboratorio (temporal, sin streaming)
  - Futuro: sesion 1:1 que escale a multi-agente
- **Accion:**
  - Crear `apps/server/src/core/negotiation/negotiation-protocol.ts`
  - Encapsular state machine + config + round tracking
  - Exponer interfaz: `ingest(senderId, receiverId, text) → IngestResult`
  - Exponer hooks: `onAgreement`, `onEscalation`, `onRejection`
  - El channel-orchestrator pasa a ser un *consumer* del protocolo, no su dueno

#### H2.2 — Extraer `ArbitrationProtocol` como primitiva independiente
- **Actual:** `shouldEscalate` en NegotiationStateMachine emite flag, pero la resolucion del arbitro esta hardcodeada en el channel-orchestrator
- **Objetivo:** `ArbitrationProtocol` debe ser configurable e inyectable:
  ```ts
  interface ArbitrationConfig {
    arbiterAgentId: string;
    escalationPrompt: (context: EscalationContext) => string;
    resolutionStrategy: "vote" | "authoritative" | "compromise";
  }
  ```
- **Accion:**
  - Crear `apps/server/src/core/negotiation/arbitration-protocol.ts`
  - Encapsular: dispatch al arbitro + parseo de veredicto + broadcast de resolucion
  - El channel-orchestrator compone `NegotiationProtocol` con `ArbitrationProtocol`

#### H2.3 — Definir topologias de Negotiate como config, no como code paths
- **Actual:** `isBroadcastChannel` bifurca a `runSequentialBroadcastLoop` vs `runDispatchRound`
- **Objetivo:** Topologia es un parametro de configuracion:
  ```ts
  type NegotiationTopology = "parallel" | "sequential" | "star" | "mesh";
  ```
- **Accion:**
  - Unificar `runDispatchRound` + `runSequentialBroadcastLoop` en un solo metodo `runNegotiationRound`
  - La diferencia entre parallel y sequential es si se await o no cada dispatch
  - `star` = un agente central recibe y distribuye (patron lead)
  - `mesh` = todos contra todos (broadcast actual)

---

### H3: Consolidacion de Entry Points (2 sesiones)

#### H3.1 — Refactorizar `ExperimentRunner` para componer primitivas
- **Actual:** `runSingleVariant` y `runMultiVariant` recrean agentes, canales, y configs manualmente (~650 lineas con duplicacion interna)
- **Objetivo:** El runner es un *composer* de primitivas, no un implementador de logica multi-agente
- **Accion:**
  - `runSingleVariant` → `SpawnProtocol.execute(config)` con `lab_` prefix + no streaming
  - `runMultiVariant` → `NegotiationProtocol.execute(config)` con `lab_` prefix + `ArbitrationProtocol` si configurado
  - `ExperimentRunner` solo orquesta el ciclo de vida: crear agentes temporales, ejecutar primitivas en secuencia, recolectar metricas, limpiar

#### H3.2 — Refactorizar `ChannelOrchestrator` como composer de primitivas
- **Actual:** 1138 lineas que mezclan dispatch, negociacion, delegacion, streaming, y persistencia
- **Objetivo:** ~400-500 lineas que componen `SpawnProtocol`, `DelegateProtocol`, `NegotiationProtocol`, `ArbitrationProtocol` con persistencia y streaming
- **Accion:**
  - `dispatchUserMessage()` delega a `NegotiationProtocol.run()` con la config del canal
  - El orquestador solo maneja: cola de trabajo por agente, streaming WS, persistencia JSONL
  - La logica de dispatch/resolucion de destinatarios se mueve al NegotiationProtocol

#### H3.3 — Eliminar `benchmark/harness.ts` segun corresponda
- **Actual:** `waitChannelIdle` hace polling manual cada 800ms ignorando `chainPromise`
- **Accion:** Usar `chainPromise` del orquestador; si el lab se refactoriza, el harness usa las mismas primitivas

---

### H4: Calidad, Testing y Documentacion (1-2 sesiones)

#### H4.1 — Tests de integracion para cada primitiva
- **Spawn:** Crear subagente, verificar envelope, verificar aislamiento de contexto
- **Delegate:** Delegar a agente/proyecto/canal, verificar envelope, verificar no contaminacion
- **Negotiate:** 2 agentes en sequential, verificar deteccion de agreement/rejection, verificar chain depth
- **Arbitrate:** 2 agentes en deadlock, verificar escalacion al arbitro, verificar resolucion

#### H4.2 — Migrar scripts de setup existentes
- `setup-autoconsulting-channel.ts` y similares deben funcionar con la nueva API
- Si usaban `DELEGATE:` text parsing, migrar a `delegate_task` tool

#### H4.3 — Documentar arquitectura de primitivas
- Actualizar `docs/multi-agent-flows-analysis.md` con el nuevo diseno
- Documentar cada primitiva: firma, config, eventos emitidos, persistencia
- Diagrama de como los entry points componen primitivas

#### H4.4 — Eliminar codigo muerto
- `DELEGATE:` text parsing en channel-orchestrator
- `TaskLedger` si se reemplaza por sesiones `del_`
- `parseEnvelope` duplicado en delegate-tool y spawn-subagent-tool
- Forwarding de eventos duplicado (5 ocurrencias)

---

## Riesgos y Mitigaciones

| Riesgo | Prob. | Impacto | Mitigacion |
|---|---|---|---|
| Romper canales existentes (setup-autoconsulting) | Media | Alto | Tests de migracion en H4.2; preservar compatibilidad via wrapper temporal |
| Race conditions en Negotiate parallel al unificar code paths | Baja | Alto | Tests de integracion con timing (H4.1); preservar AgentWorkQueue como serializador |
| Regresion en streaming (tokens/thinking en tiempo real) | Media | Medio | Verificar WS events emitidos antes/despues del refactor en cada entry point |
| Aumento de latencia al mover DELEGATE de text parsing a tool call | Baja | Bajo | El tool call es mas robusto; el text parsing actual ya tiene ~misma latencia (1 prompt extra) |
| Complejidad del refactor supera el beneficio | Baja | N/A | Cada milestone es independiente y mergeable; H0 ya entrega valor por si solo |

---

## Impacto esperado

| Metrica | Antes | Despues |
|---|---|---|
| Mecanismos multi-agente | 7 | 4 primitivas + entry points |
| Lineas de orquestacion | ~2800 | ~1400 |
| Duplicacion de codigo (parseEnvelope, forwarding) | 2-6 copias | 1 modulo compartido |
| Session prefixes sin centralizar | 6 strings en 6 archivos | 1 enum en 1 archivo |
| Entry points para nuevo caso de uso | Reimplementar logica (Lab = 650 lineas) | Declarar config (~30 lineas) |
| Bugs por divergencia entre flujos | Alto (cada flujo tiene su propia logica de modelo, envelope, abort) | Bajo (un solo code path) |
