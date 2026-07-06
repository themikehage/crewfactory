COMPLETED ✅
# CrewFactory x Track 3 "Agent Society" — Hoja de Ruta a Joya

**Fecha:** 2026-07-01 (v2 — plataforma desacoplada)
**Track:** Agent Society (multi-agent collaboration)
**Estado:** Estrategia + roadmap detallado para llevar CrewFactory de "plataforma multi-agente funcional" a "submission ganadora del jurado"

---

## Principio rector: plataforma vs caso de uso

CrewFactory es una **plataforma** multi-agente con UI en vivo, streaming, y orquestación actor-model. **AutoConsulting es un caso de uso demostrable** construido sobre esa plataforma — uno de miles posibles.

Toda capacidad nueva debe ser una **extensión configurable del channel schema** (o del agent/server), no lógica embebida. AutoConsulting aporta su config (roles, prompts, routing, protocolos) vía API — igual que hoy lo hace `setup-autoconsulting-channel.ts`. La única excepción legítima es un shared engine genérico (state machine, parser regex-driven, scoring framework) que lee runtime config — el código nunca sabe qué es una ficha.

**Regla práctica:** si un reviewer abre `channel-orchestrator.ts` y ve la cadena `"ACUERDO ALCANZADO"`, fallamos. La regex vive en `channel.negotiationProtocol.agreementPattern`. El orchestrator compila esa regex y la aplica.

Este patrón nos da dos cosas que el hackathon premia:
1. **Sophistication (Innovation 30%)** — motor config-driven, no hardcoded
2. **Problem Value 25%** — AutoConsulting es 1 caso demostrable; la plataforma implica 1000 no demostrados. Esa frase multiplicada en pitch vende scalability.

---

## 1. Veredicto ejecutivo

CrewFactory ya es **plataforma multi-agente con UI en vivo, streaming real-time, actor-model dispatch y 35+ providers** — eso la diferencia de la mayoría de los frameworks del mercado.

Track 3 exige 3 requisitos obligatorios que **no son demostrables en código hoy**:

| Requisito oficial | Estado en código | Riesgo |
|---|---|---|
| Descomponer tareas y asignar roles | **PARCIAL** — roles son metadata visual; la descomposición es prompt-induced, no algorítmica | Medio |
| Resolver desacuerdos y conflictos | **AUSENTE** — no hay contador de rondas, ni state machine, ni hook de arbitraje | **CRÍTICO** |
| Ganancia medible sobre baseline single-agent | **AUSENTE** — no hay benchmark, scores ni harness A/B/C | **CRÍTICO** |

Más dos requisitos de submission binarios que faltan (**LICENSE**, **proof de Alibaba Cloud**) y **MCP —citado explícitamente en el criterio de 30%— ausente**.

**Target de la v2:** cerrar los 3 requisitos con extensiones **config-driven del channel schema** + AutoConsulting como config instance demo, sin tocar una línea de lógica específica de dominio en el orchestrator.

---

## 2. Análisis competitivo (resumen — detalle en v1)

Investigados: CrewAI, LangGraph, MetaGPT (69.1k stars, "First AI Software Company"), ChatDev 2.0 (33.6k stars, NeurIPS 2025 "Puppeteer" = orchestrator RL-learnable).

**Tesis competitiva (refrendada):**
> Ningún competidor combina "chat multi-agente en vivo" + "negociación algorítmica determinista" + "benchmark de eficiencia" + "orquestación evolutiva self-hosted". La plataforma CrewFactory puede ofrecer las cuatro; AutoConsulting demuestra la 1-2.

**Ventaja añadida por el reframe v2:** MetaGPT y ChatDev son **frameworks** (sus SOPs y roles son código/YAML). CrewFactory es **plataforma con UI** donde crear un caso como AutoConsulting es un POST a `/api/channels` + 5 POSTs a `/api/agents` — ningún archivo de framework se edita. Esa diferencia de UX vende en Problem Value: menor barrera entry → más replicabilidad → más adoption.

| Dimensión | CrewAI | LangGraph | MetaGPT | ChatDev 2.0 | **CrewFactory** |
|---|---|---|---|---|---|
| UI live multi-agent | No | No | No | Sí (canvas estática) | **Sí (Slack-like chat)** |
| Configurar un caso = code | Sí | Sí | Sí (YAML) | Sí (YAML) | **No (API/UI)** |
| Negociación algorítmica | No destacado | No | No | No | **AUSENTE → oportunidad** |
| Benchmark vs baseline | CaseStudies | LangSmith | No | IER papers | **AUSENTE → oportunidad** |
| Orquestación evolutiva | No | No | AFlow (ICLR) | Puppeteer (NeurIPS) | **Plan existe, no cerrado** |
| MCP support | Vía tools | Vía tools | No | mcp_example | **AUSENTE — gap del 30%** |

---

## 3. Puntos fuertes — preservar y amplificar

Activos existentes — el roadmap no los reemplaza, los expone.

### 3.1 UI y streaming
- `ChannelChatArea.tsx` — chat multi-agente en vivo, badges, avatares, thinking blocks. Diferenciador vs MetaGPT/ChatDev.
- `SessionSidebar.tsx` — Slack-like con acordeones de Proyectos/Agentes/Canales.
- `ChannelOrgChart.tsx` — SVG jerárquico de roles. Visualmente impactante para "rol assignment".
- `LogsConsolePage.tsx` — LangSmith-built-in con filtros source/event type.

### 3.2 Orquestación
- Actor-model dispatch (`agent-work-queue.ts` + `channel-orchestrator.ts:186-189`) — paralelo entre agentes, FIFO dentro.
- Reply modes + @mention parser (`mention-parser.ts`) — routing real, configurable por canal.
- Anti-chatter con token `(silent)` (`channel-orchestrator.ts:519-540`).
- `maxChainDepth` configurable 1-50.

### 3.3 Observabilidad + meta-loop building blocks
- `GET /api/agents/:id/observe` SSE (`create-agent-server.ts:130-144`).
- Execution log store con `prompt.json/messages.jsonl/tool-calls.json/summary.json` (`create-agent-server.ts:206-265`) — **cimiento del harness genérico**.
- `eventBroker` (`lib/event-broker.ts`) fan-out WS.
- `scripts/delegate.ts` — CLI ya sabe delegar a agents/repos/channels via SSE.
- `factory-observe` + `factory-quick-actions` skills existen; **`factory-delegate` falta en `DEFAULT_FACTORY_SKILLS`**.

### 3.4 Stack
- 35+ providers vía vendored agent runtime + Qwen Cloud nativo (`qwen-provider.ts`, 8 modelos Qwen 3.x vía DashScope).
- Bun + Hono + React 19 + TS estricto + Tailwind v4 — sophistication visible en code review.

### 3.5 La narrativa de AutoConsulting (caso demo)
`scripts/setup-autoconsulting-channel.ts` crea 5 agentes (CEO / Tech Lead / Senior Dev / Marketing / WebBuilder) con prompts, routing targeted, y context variables (HOURS_PER_FICHA, USD_PER_FICHA, rangos). **Historia coherente y comercialmente real** — una consultora de software donde los agentes negocian presupuesto. Es el caso perfecto para Track 3; falta volverlo determinista y medible.

---

## 4. Gaps críticos — qué falta para ganar

Mapeados a requisitos obligatorios y pesos del jurado.

### Gap A — Negociación algorítmica (Req #2, Innovation 30%)
**Hoy:** "negociación" solo en texto prompts de `setup-autoconsulting-channel.ts:85-119`. El LLM decide; no hay código que cuente rondas, detecte acuerdos, o escale al árbitro.
**Target v2:** protocolo **configurable vía channel schema** — el orchestrator lee `channel.negotiationProtocol` y aplica una state machine genérica. AutoConsulting define sus patrones (`/ACUERDO ALCANZADO:/`, `/ACEPTO/`, `/CONTRAPROPONE/`) por config. Otro canal define otros.
**Por qué v2:** la regex nunca vive en `channel-orchestrator.ts`. El reviewer ve una engine config-driven.

### Gap B — Benchmark de eficiencia (Req #3, Problem Value 25%)
**Hoy:** solo `summary.json` con `durationMs`. Sin scores, sin baseline single-agent, sin script comparativo.
**Target v2:** framework genérico de **scoring rubric configurable por canal** + harness script agnóstico. AutoConsulting define rubric con tres metrics (desviación de fichas vs gold, LLM-judge de propuesta, score global). Otro canal define otra rubric (code quality, etc.). El harness corre A/B/C sobre briefs y produce report — **sin saber qué es una ficha**.
**Por qué v2:** el harness se reutiliza para futuras demos y社区 cases. El jurado ve un tool reusable, no un experimento one-off.

### Gap C — Descomposición algorítmica (Req #1, parcial)
**Hoy:** roles son metadata visual + systemPrompt. No hay código que asigne sub-tareas por rol.
**Target v2:** parser de delegación **configurable** (`channel.delegationPattern`), más ledger genérico de asignaciones. El formato `DELEGATE: @agent — task` es default; AutoConsulting lo usa, pero el patrón es overrideable. El orchestrator programa sub-dispatches cuando detecta el patrón en el output del lead.
**Por qué v2:** el parser está parametrizado; un canal de code review podría usar `ASSIGN: @reviewer — file`.

### Gap D — MCP integration (criterio 30% explícito)
**Hoy:** cero dependencia MCP. `plans/mcp-marketplace.md` existe como diseño ambicioso.
**Target v2:** scope mínimamente viable del plan existente — cliente stdio, 2-3 builtin servers (filesystem, github), registro en sesión como customTools, UI mínima. Sin marketplace todavía.
**Por qué v2:** MCP es agnóstico a AutoConsulting. Solo añade sophistication.

### Gap E — Meta-agent optimization loop cerrado (Innovation 30%, narrativa)
**Hoy:** observe + execution logs + 2 skills existen. Loop no automatizado; `factory-delegate` falta.
**Target v2:** `factory-delegate` añadido, `scripts/optimize.ts` analiza tool-calls de N ejecuciones de UN canal (genérico) y registra quick actions. Loop corre sobre AutoConsulting para el demo pero el código es canal-agnóstico.
**Por qué v2:** es nuestro "Puppeteer"; debe ser reusable para que el jurado lo lea como plataforma-feature, no hack-demo.

### Gap F — Requisitos de submission binarios
- F1 LICENSE, F2 proof Alibaba Cloud deploy, F3 architecture diagram, F4 demo 3min, F5 text description, F6 track identification, F7 blog post (bonus).

---

## 5. Hoja de ruta — fases desacopladas

Ordenadas por (1) requisito obligatorio, (2) peso del criterio, (3) build-up: cada fase extiende el channel schema con un bloque config-driven, agrega engine genérico, y actualiza AutoConsulting config para demostrar. AutoConsulting nunca se referencia dentro de lógica de dominio.

### Arquitectura conceptual de extensiones del channel schema

```
ChannelSchema (existe)
  ├── negotiationProtocol?  ← Fase 1  (NUEVO)
  ├── scoringRubric?         ← Fase 2  (NUEVO)
  ├── delegationPattern?     ← Fase 3  (NUEVO, optional)
  └── optimizationTarget?    ← Fase 5  (NUEVO, ref a canal para meta-loop)
```

Cada bloque es **opcional** — un canal simple no los tiene y se comporta como hoy. AutoConsulting setea los cuatro.

```
┌─────────────────────────────────┐
│  Channel Orchestrator (engine)  │  ← genérico, no sabe nada de fichas
│  - lee negotiationProtocol      │
│  - aplica state machine         │
│  - parsea delegationPattern     │
│  - emite events a eventBroker   │
└─────────────────────────────────┘
              │ config
              ▼
┌─────────────────────────────────┐
│  AutoConsulting channel.json   │  ← instancia demo
│  negotiationProtocol: {          │
│    agreementPattern:            │
│      "ACUERDO ALCANZADO:"        │
│    counterPattern: "CONTRAPROPONE" │
│    rejectPattern: "RECHAZO"      │
│    maxRounds: 3                  │
│    arbiterAgentId: <ceoId>      │
│  }                              │
│  scoringRubric: { ... }          │
│  delegationPattern:             │
│    "DELEGATE: @\\w+ — (.+)"      │
└─────────────────────────────────┘
```

---

### FASE 0 — Channel Schema Extensions (foundation)

**Por qué primero:** todas las fases 1-3 dependen de nuevos bloques en `ChannelSchema`. Hacer la foundation una vez.
**Criterio:** "Innovation 30%" (arquitectura modular).

**Lógica:**
1. `packages/shared/src/schemas.ts` — extender `ChannelSchema` con tres bloques opcionales: `negotiationProtocol`, `scoringRubric`, `delegationPattern`. Cada uno Zod schema con defaults razonables (vacío = feature off).
2. `channel-store.ts` — persistir/validate los nuevos bloques en `channel.json`. Backwards compatible: canales existentes no los tienen, defaults off.
3. `routes/channels.ts` — `PATCH /api/channels/:id` ya soporta update; asegurar que los nuevos bloques pasan.
4. **UI mínima:**为新 bloques agregar fields editables en `ChannelSettingsModal.tsx` (sólo textareas para raw JSON inicialmente — avanzamos rápido, pulimos después).

**Aceptación:**
- Crear canal sin nuevos bloques → behavior idéntico a hoy.
- Crear canal con `negotiationProtocol.agreementPattern: "/TEST/"` → persiste en `channel.json`, visible en settings.

---

### FASE 1 — Negociation Protocol Engine (cierra Req #2)

**Criterio:** Innovation 30% + Req obligatorio #2.
**Narrativa:** "No dejamos la negociación al azar del LLM. El canal declara su protocolo (patrones de acuerdo/contrapropuesta, máximo de rondas, árbitro). Una state machine determinista lo aplica."

**Lógica:**
1. **NUEVO** `apps/server/src/channels/negotiation-state.ts` — `NegotiationStateMachine` genérico, per-pair `(senderId, receiverId)`. Acepta la config del canal:
   ```
   interface NegotiationProtocol {
     agreementPattern: string;   // regex source
     counterPattern: string;     // regex source
     rejectPattern: string;      // regex source
     maxRounds: number;
     arbiterAgentId?: string;    // rol que arbitra
   }
   interface NegotiationState {
     [pairKey: string]: {
       rounds: number,
       lastOffer: string | null,
       status: "open"|"agreed"|"rejected"|"escalated"
     }
   }
   ```
   Métodos: `ingest(sender, receiver, text)` → returns `{ matched: "agreed"|"counter"|"rejected"|null, rounds, shouldEscalate }`. La regex se compila en constructor con `new RegExp(cfg.agreementPattern, "i")`.
2. **MOD** `channel-orchestrator.ts` — en `runAgentPrompt` post-prompt, llamar `stateMachine.ingest(...)`. Gating:
   - `matched === "agreed"` → marca pair agreed; rompe recursión para ese par; emite `channel_negotiation_agreement`; notifica al siguiente miembro según config (vía `arbiterAgentId` o reply mode).
   - `matched === "counter"` → incrementa rounds.
   - `matched === "rejected"` → rompe con `channel_negotiation_rejected`.
   - `rounds >= maxRounds && !matched` → inyecta dispatch dirigido a `arbiterAgentId` con `prompt: "Bloqueo detectado tras N rondas entre @A y @B. Emite veredicto vinculante."` → emite `channel_negotiation_escalation`.
3. **MOD** `channel-store.ts` — persistir `negotiationState` (egratoriedades dentro de channel.json o archivo separado `negotiation-state.json` por canal).
4. **MOD** `packages/shared/src/schemas.ts` (Fase 0 ya extendió `ChannelSchema`; aquí solo el schema de `NegotiationProtocol` el formato completo).
5. **NUEVOS WS events:** `channel_negotiation_round` (cada prompt con rounds/contract), `channel_negotiation_agreement`, `channel_negotiation_escalation`.
6. **MOD** `apps/client/src/components/channels/ChannelMessageList.tsx` — badges visuales "Ronda 1/3", "ACUERDO", "ARBITRAJE {arbiterName}". Genéricos — leen el event payload y render por `event.type`, no por dominio.
7. **MOD** `scripts/setup-autoconsulting-channel.ts` — setear `negotiationProtocol` en el canal con los valores de AutoConsulting. Los prompts ya casi están canónicos (`ACUERDO ALCANZADO:`, `ACEPTO la propuesta`, `CONTRAPROPONE`, `RECHAZO`); alinear un poco.

**Aceptación:**
- Canal AutoConsulting + brief "ecommerce MVP" → veo badges `Ronda 1`, `Ronda 2`, `ACUERDO ALCANZADO: 62 fichas`.
- Brief deliberadamente ambiguo → triggers `ARBITRAJE CEO` badge y el CEO interviene automáticamente.
- `negotiationState` persiste y recupera al recargar.
- **Test de desacoplamiento:** `grep -r "ACUERDO ALCANZADO" apps/server/src/` → 0 hits. La regex vive en `channel.json` de AutoConsulting.

---

### FASE 2 — Efficiency Benchmark Framework (cierra Req #3)

**Criterio:** Problem Value 25% + Req obligatorio #3.
**Narrativa:** "No decimos que somos más eficientes — lo medimos. Cada canal declara su rubric de scoring. El harness corre el mismo brief bajo tres condiciones y produce un report comparable."

**Lógica:**
1. **Schema genérico de rubric** (en `packages/shared`):
   ```
   interface ScoringRubric {
     metrics: ScoringMetric[]
   }
   interface ScoringMetric {
     id: string,
     name: string,
     weight: number,        // 0-1
     type: "numeric-deviation" | "llm-judge" | "custom-script",
     // numeric-deviation: target value, scoring = 100 - abs(deviation)/tolerance * 100
     config: {
       targetField?: string,   // path en el reportExecution para leer value propuesto
       referenceField?: string // path para gold answer
       tolerance?: number,     // % de desviación tol = 0
       judgePrompt?: string,  // para llm-judge
       scriptPath?: string,   // para custom-script
     }
   }
   ```
   AutoConsulting rubric: 
   - `ConsultoraScore` (numeric-deviation, target=`fichas_propuestas`, reference=`fichas_referencia`, tolerance=15%)
   - `ClienteScore` (llm-judge, judgePrompt=rubric de 5 criterios sobre la propuesta final)
   - `GlobalScore` (derived = `weight_1 * ConsultoraScore + weight_2 * ClienteScore`)
2. **NUEVO** `apps/server/src/benchmark/scoring.ts` — `computeMetric(metric, executionReport, goldAnswer)` y `computeGlobalScore(rubric, report)`. Soporta tres tipos de metric. `llm-judge` usa un LLM call (con el active model del canal).
3. **NUEVO** `apps/server/src/benchmark/harness.ts` — `runCondition(channelOrSingleAgent, brief, rubric)`:
   - **A (single baseline):** crea 1 agente "Consultor General" (o el rol que sea) con un systemPrompt que hace todo el brief end-to-end. Sin canal.
   - **B (channel):** dispatch del brief al canal configurado.
   - **C (optimized):** canal tras optimización loop (Fase 5).
   Cada condición captura: `fichas_propuestas` (parseado del output final), `tokens_total`, `durationMs`, `rounds_to_agreement`, `tool_calls_total`, `cost_estimate`, y el output de Marketing (para LLM-judge).
4. **NUEVO** `apps/server/src/benchmark/briefs.json` — 5 briefs de test con gold answers (fichas de referencia de experto). AutoConsulting-specifico como dataset de demo.
5. **NUEVO** `scripts/benchmark.ts` — orquesta A/B/C sobre los 5 briefs con la rubric del canal, persiste en `/tmp/crewfactory/{user}/benchmarks/{channelId}/{timestamp}/` y genera `report.md` con tabla comparativa.
6. **REST:** `GET /api/channels/:id/benchmark` lee último report; `POST /api/channels/:id/benchmark` lo dispara.
7. **UI:** NUEVO `apps/client/src/components/channels/ChannelBenchmarkPanel.tsx` — tabla A/B/C con barras de scores y deltas `%` (ej. "B es 34% más preciso que A en 42% menos tiempo"). La tabla muestra el `name` de las metrics (definido en rubric), no nombres hardcoded.
8. **eventBroker:** emite `benchmark_run_start/end` para UI en vivo.

**Aceptación:**
- `bun run scripts/benchmark.ts --channel <autoconsulting_id>` produce `report.md` con tabla 5 briefs × 3 condiciones × N metrics + deltas.
- B > A en `ConsultoraScore` (negociación reduce desviación de fichas).
- C > B en consistencia (optimización reduce errores repetidos — breakdown en Fase 5).
- **Test de desacoplamiento:** `grep -r "fichas" apps/server/src/benchmark/` → 0 hits. La rubric vive en `channel.json`.

---

### FASE 3 — Role-Driven Task Decomposition (cierra Req #1)

**Criterio:** Innovation 30% + Req obligatorio #1.
**Narrativa:** "El canal declara su patrón de delegación. Cuando el orchestrator lo detecta en el output de un agente con `role: lead`, programa sub-dispatches dirigidos. Cada asignación se registra en el ledger del canal."

**Lógica:**
1. **Schema** (en `ChannelSchema`, Fase 0):
   ```
   delegationPattern?: {
     token: string;        // regex source, default "DELEGATE: @(\\w+) — (.+)"
     applyToRole?: string; // default "lead"; solo aplica si el sender tiene este rol
   }
   ```
   AutoConsulting setea `token: "DELEGATE: @(\\w+) — (.+)"`, `applyToRole: "lead"`.
2. **MOD** `channel-orchestrator.ts` — en `runAgentPrompt` post-prompt:
   - Si `channel.delegationPattern` está presente y `sender.role === delegationPattern.applyToRole`:
     - Compila `new RegExp(channel.delegationPattern.token, "g")` sobre el output.
     - Para cada match: programa un sub-dispatch dirigido al `@agent` con el task capturado como prompt.
     - Registra en `taskLedger`: `{ assignedBy, assignedTo, role, task, status: "open" }`.
   - Gate de terminación de la cadena para el lead: hasta que todas las asignaciones abiertas se cierren (los receptores responden, marcando `status: "done"`). Hoy la cadena sigue hasta `maxChainDepth`.
   - `resolved` vs `in-flight` visible al orchestrator.
3. **Roster enrichment (gap del audit):** hoy `buildAgentPrompt:644-648` lista solo id+name. Agregar rol: `- @${name} (id: ${agentId}, role: ${member.role ?? "member"})`. El LLM ve la jerarquía explícitamente. Cambio trivial pero documentado en审计 como gap real.
4. **NUEVO** `apps/server/src/channels/task-ledger.ts` — `TaskLedger` persistente en `channel.json` (o archivo separado). Métodos `record`, `updateStatus`, `list`.
5. **NUEVO** `apps/client/src/components/channels/ChannelTaskLedger.tsx` — grafo/árbol de asignaciones en vivo: `CEO → [TechLead: scope, Marketing: propuesta]` → expande sub-asignaciones. Refuerza visual del Org Chart.

**Aceptación:**
- Brief del user → CEO output contiene `DELEGATE: @TechLead — Generar ScopeProposal para ecommerce MVP`. El orchestrator dispara dispatch a TechLead con ese task.
- Panel de Asignaciones muestra árbol `CEO → TechLead (scope)` y después `TechLead → SeniorDev (eval)`.
- Org Chart ahora refleja asignaciones reales, no solo metadata.
- **Test de desacoplamiento:** `grep -r "DELEGATE:" apps/server/src/` → 0 hits. El patrón vive en `channel.json`.

---

### FASE 4 — MCP Integration Minimal (criterio "Technical Depth" 30%)

**Criterio:** "Technical Depth & Engineering" 30% — texto menciona MCP por nombre.
**Narrativa:** "CrewFactory agents ganan herramientas via MCP servers — filesystem para leer código, github para crear issues. Registro en sesión como customTools; el LLM las llama y el orchestrator las enruta via MCP client."

**Scope mínimo viable del plan existente `mcp-marketplace.md`:**
- Cliente MCP reducido (stdio only, no HTTP, no reconnect).
- 2-3 builtin servers (filesystem, github).
- Registro en sesión al crear `AgentSession` — tools MCP como customTools.
- UI mínima: `MCPSettings.tsx` simple (lista, toggle).
- Integración con Alibaba Cloud: `oss-upload.ts` (Fase 6).

**Archivos (resumen del plan existente, scoped):**
- **NUEVO** `apps/server/src/core/mcp-manager.ts`, `mcp-registry.ts`, `mcp-types.ts`.
- **NUEVO** `apps/server/src/routes/mcp.ts` (REST mínimo).
- **MOD** `apps/server/src/core/session-manager.ts` — conectar enabled y registrar customTools.
- **MOD** `apps/server/src/index.ts` — montar router.
- **NUEVO** `apps/client/src/pages/MCPSettings.tsx`.
- **NEW dep** `@modelcontextprotocol/sdk`.

**Aceptación:**
- En una sesión, el LLM llama `mcp_github_list_issues` y retorna issues reales.
- Toggle filesystem MCP on/off en UI afecta tools disponibles.
- El server typecheckea.

---

### FASE 5 — Meta-Agent Optimization Loop cerrado (diferenciador narrativo, refuerza Fase 2)

**Criterio:** Innovation 30% — nuestro "Puppeteer" / "AFlow".
**Narrativa:** "Tras N ejecuciones del canal AutoConsulting, el meta-agent analiza tool-calls, detecta patrones repetitivos, registra Quick Actions optimizadas, y las usa en la condición C del benchmark. Es orquestación evolutiva medible."

**Lógica:**
1. **`factory-delegate` skill** — agregar a `DEFAULT_FACTORY_SKILLS` (hoy falta; se menciona en about/steps pero no existe en `default-factory-skills.ts:47-358`). Documenta CLI `scripts/delegate.ts` y el workflow observe→analyze→improve.
2. **NUEVO** `scripts/optimize.ts` — lee `executions/*/tool-calls.json` de las últimas N ejecuciones de un canal dado (genérico). Un LLM call con prompt: "Analiza estos tool-calls. Identifica patrones repetitivos (ej. `bash git status` antes de cada scope proposal). Propón una quick action (auto-inject context, skip manual tool) con rationale. Devuelve JSON `{pattern, rationale, quickActionDefinition}`". Por config del canal (`optimizationTarget?: { minOccurrences: number,(canonical) }`) mínimo 3 ocurrencias para proponer. Registra vía `POST /api/integrations/templates`.
3. **NUEVO** `scripts/run-optimization-cycle.ts` — secuencia completa:
   - ejecuta brief via `delegate.ts` (canal target)
   - `observe` graba executions
   - `optimize.ts` analiza y registra quick action si hay patrón
   - re-ejecuta el mismo brief
   - compara `durationMs` / `ConsultoraScore` / `tokens_total` y persiste delta en `optimization-log.json`
4. **NUEVO** `apps/server/src/benchmark/optimization-log.ts` — persiste deltas históricos.
5. **MOD** `apps/client/src/pages/AgentsPage.tsx` — tab "Optimization" muestra el log.

**Aceptación:**
- Tras 3 ejecuciones del mismo brief, `run-optimization-cycle.ts` detecta ≥1 patrón y registra quick action.
- Re-ejecutar el brief muestra reducción de `durationMs` o mejora de score.
- Fase 2 condición C mejora sobre B.
- **Test de desacoplamiento:** el script acepta `--channel <id>` y no hard-codea AutoConsulting en ningún sitio.

---

### FASE 6 — Submission assets (requisitos binarios)

Hacer en paralelo; no bloquean código.

**F1 — LICENSE**
- Agregar `LICENSE` MIT en repo root. GitHub detecta y muestra en About.
- Aceptación: `ls LICENSE` existe; About muestra "MIT license".

**F2 — Alibaba Cloud Deployment proof**
- **NUEVO** `apps/server/src/alibaba-cloud/oss-upload.ts` — usa `ali-oss` o fetch directo al OSS API para subir `benchmark/report.md` a bucket `crewfactory-benchmarks`. Documenta `ALIYUN_ACCESS_KEY_ID/SECRET` en env.
- **NUEVO** `alibaba-cloud/proof-deployment.md` — doc con código del `oss-upload.ts`, link al bucket público del report subido, screenshots.
- Desplegar en Alibaba Cloud ECS (free-tier) o usar Function Compute + OSS — mínimo para "backend running on Alibaba Cloud". El server Bun corre wrap igual; lo distintivo es el archivo que usa Alibaba services (`oss-upload.ts`).
- Video corto: server corriendo en Alibaba infra, ejecutando `bun run benchmark:alibaba`, OSS upload visible en OBS console.

**F3 — Architecture Diagram**
- **NUEVO** `docs/architecture.md` con Mermaid:
  - Qwen Cloud (DashScope) → `qwen-provider.ts` → `ModelRegistry` → `AgentSession`
  - Canal AutoConsulting: User → Orchestrator → 5 roles → WS → Client
  - NegotiationStateMachine + TaskLedger + MCP Manager + Benchmark Harness
  - Frontend ↔ WS ↔ Backend; Filesystem `/tmp/crewfactory`
- Exportar a PNG via `mmdc` para GitHub render.

**F4 — Demo video (~3 min)**
- Flujo grabado en UI en vivo:
  1. (0:00-0:20) Login → mostrar sidebar Slack-like.
  2. (0:20-0:50) Abrir canal AutoConsulting → Org Chart con roles → abrir brief.
  3. (0:50-2:00) Enviar brief "ecommerce MVP, ~$30k". Ver CEO → TechLead → SeniorDev negociar con badges `Ronda 1/2`, `ACUERDO ALCANZADO: 62 fichas`, Marketing redactando propuesta.
  4. (2:00-2:30) Tab Benchmark → tabla A vs B vs C con barras → B > A 34%, C > B +12%.
  5. (2:30-3:00) Tab Optimization → ciclo de mejora → MCP settings (filesystem/github conectados) → logo + URL repo.
- YouTube unlisted-público.

**F5 — Text description**
- README sección "Features & Functionality" (4-5 párrafos): problema, solución, métricas, arquitectura, diferencia.

**F6 — Track identification**
- README línea "Submitted to: Track 3 — Agent Society".

**F7 (bonus) — Blog post sobre building with QwenCloud**
- Medium/dev.to post cubriendo: negotiation protocol, benchmark harness, MCP, optimization loop. Link al repo.

---

## 6. Secuencia de ejecución recomendada

```
Semana 1:  F0 Schemas + F1 Negociation + F3 Decompose     [req #1+#2]
Semana 2:  F2 Benchmark + F5 Optimization                   [req #3 + narrativa]
Semana 3:  F4 MCP + F6 Submission assets                    [criterio 30% + binarios]
Conting.:   bug fixes, polish, video, blog
```

F0 libera a F1+F3 parallelizable. F1 libera F2 (negociación determinista → B reproducible). F2 libera F5 (benchmark → medir mejora). F4 independiente — en paralelo si hay tiempo.

---

## 7. Matriz criterio × fase

| Criterio (peso) | F0 | F1 Neg | F2 Bench | F3 Decomp | F4 MCP | F5 Loop | F6 Assets |
|---|---|---|---|---|---|---|---|
| Technical Depth & Engineering (30%) | • | • | ◦ | • | ••• | • | ◦ |
| Innovation & AI Creativity (30%) | •• | ••• | •• | •• | • | ••• | ◦ |
| Problem Value & Impact (25%) | •• | • | ••• | •• | • | •• | •• |
| Presentation & Documentation (15%) | ◦ | ◦ | • | ◦ | ◦ | • | ••• |
| **Req #1 (decompose)** | ◦ | ◦ | ◦ | ••• | ◦ | ◦ | ◦ |
| **Req #2 (disagree)** | ◦ | ••• | ◦ | • | ◦ | ◦ | ◦ |
| **Req #3 (efficiency)** | ◦ | ◦ | ••• | ◦ | ◦ | •• | ◦ |
| **Submission binarios** | ◦ | ◦ | ◦ | ◦ | ◦ | ◦ | ••• |

`•••` crítico, `••` fuerte, `•` medio, `◦` no afecta.

---

## 8. Reglas de desacoplamiento (principios del reframe v2)

Antes de implementar cada fase, validar:

1. **Nada de dominio en el orchestrator.** Si el código referencia "fichas", "ACUERDO ALCANZADO", "ScopeProposal", "Marketing" → mover a `channel.json` de AutoConsulting.
2. **Toda nueva lógica es config-driven.** Nuevas capacidades viven como bloques opcionales en `ChannelSchema`; el orchestrator/harness las lee en runtime.
3. **AutoConsulting es solo config.** `scripts/setup-autoconsulting-channel.ts` setea los bloques; el orchestrator no la referencia.
4. **El harness y el optimization loop aceptan `--channel <id>`.** Deben correr sobre cualquier canal con rubric/protocol definido.
5. **Test de grep por fase.** Antes de commit, verificar con `grep -rE "ACUERDO ALCANZADO|DELEGATE:|fichas|ScopeProposal|ConsultoraScore|ClienteScore" apps/server/src/` → 0 hits (excepto comentarios del schema que documentan los defaults).

Si rompemos esta regla en un punto clave para time-pressure, documentarlo como deuda técnica y limpiarsear antes del submit final.

---

## 9. Riesgos y mitigaciones

- **Risk:** LLM no sigue formato `ACUERDO ALCANZADO:` y parser falla. **Mit:** sysprompt estricto + few-shot + fallback (si no detecta tras `maxRounds`, fuerza escalation). AutoConsulting-specific tweak vive en su script.
- **Risk:** Qwen 3.x en reasoning mode produce output distinto. **Mit:** tests con los 5 briefs del benchmark; ajustar prompts antes de grabar video.
- **Risk:** MCP stdio servers requieren npx/npm en prod container. **Mit:** Dockerfile ya usa Bun; verificar npx disponible o preinstalar servers.
- **Risk:** Alibaba Cloud deploy requiere cuenta + ECS. **Mit:** free tier ECS (mínimo 1 vCPU) o Function Compute + OSS (satisface "backend running on Alibaba Cloud" + "use of Alibaba Cloud APIs"). El archivo `oss-upload.ts` cubre el requisito formal.
- **Risk:** Meta-loop detecta patrones spurios. **Mit:** mínimo 3 ocurrencias; LLM proposal debe tener rationale; user confirma antes de registrar quick action.
- **Risk:** tiempo. Si F5 no cierra, cortar y hacer solo A vs B (Fase 2 sin C). Demo sigue siendo fuerte con negociación + benchmark + MCP.

---

## 10. Estado de planes existentes (vs v2)

- `parallel-agent-dispatch.md` — **COMPLETADO en código**. No action.
- `mcp-marketplace.md` — **NO empezado**. Fase 4 aquí es VERSIÓN REDUCIDA (sin marketplace UI, sin HTTP transport, sin 15-server catalog). Marketplace completo post-hackathon.
- `meta-agent-optimization-loop.md` — **PARCIAL**. Fase 5 lo CIERRA (agrega `factory-delegate`, `optimize.ts`, `run-optimization-cycle.ts`).
- `channels-to-teams-with-orgchart.md` — **COMPLETADO**. Fase 3 aquí lo hace algorítmico (role entra en roster prompt + ledger de asignaciones).
- `engram-agent-memory.md` — fuera de scope hackathon.
- `gentle-ai-prompt-patterns.md` — research; patrones informan `factory-delegate` (Fase 5).
- `env-var-obfuscation.md` — fuera de scope hackathon.
- `qwen-cloud-provider.md` — **COMPLETADO**. No action.

---

## 11. Resumen para el jurado (pitch v2)

> **CrewFactory** es una plataforma self-hosted para construir y ejecutar canales multi-agente con UI en vivo estilo Slack. Cualquier caso de uso —desde una consultora de software hasta code review, finance modeling, o redacción editorial— se define via API: crear canal, registrar agentes con roles y system prompts, configurar routing, y declarar protocolo de negociación + rubric de scoring.
>
> Para Track 3, demostramos **AutoConsulting**, un canal donde 5 agentes con roles jerárquicos (CEO, Tech Lead, Senior Dev, Marketing, WebBuilder) negocian el scope de un proyecto en vivo. La negociación no es LLM al azar: el canal declara su protocolo —patrones de acuerdo/contrapropuesta, máximo de rondas, árbitro— y una state machine determinista lo aplica. Contamos rondas, detectamos acuerdos con parser regex, escalamos al CEO cuando no hay convergencia, y delegamos sub-tareas por rol con un ledger visible.
>
> A diferencia de MetaGPT y ChatDev (CLI/librería), AutoConsulting corre en CrewFactory, donde el jurado VE a los agentes debatir token a token, con Org Chart jerárquico, logs globales en vivo, y panel de Benchmark. Y donde crear otro caso de uso es un POST, no editar framework.
>
> Y no decimos que AutoConsulting es más eficiente — lo medimos. El canal declara su rubric de scoring. Un harness corre el mismo brief en tres condiciones: single-agent baseline (A), multi-agent channel (B), multi-agent + optimization loop (C). Los scores comparables muestran que B supera a A en precisión de estimación y C a B en consistencia, porque el meta-agent observa tool-calls de ejecuciones previas y registra Quick Actions optimizadas — nuestro equivalente de "evolving orchestration" (cf. Puppeteer NeurIPS 2025).
>
> Todo construido sobre Qwen Cloud (8 modelos Qwen 3.x vía DashScope), con integración MCP funcional (filesystem, GitHub) y deploy probado en Alibaba Cloud. Plataforma con licencia MIT, caso de uso demostrable, 1000 casos implícitos.
>
> **Track 3 — Agent Society.**