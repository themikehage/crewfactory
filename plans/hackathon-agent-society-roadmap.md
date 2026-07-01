# CrewFactory x Track 3 "Agent Society" — Hoja de Ruta a Joya

**Fecha:** 2026-07-01
**Track:** Agent Society (multi-agent collaboration)
**Premio:** $7,000 cash + $3,000 cloud credits
**Estado:** Estrategia + roadmap detallado para llevar CrewFactory de "plataforma multi-agente funcional" a "submission ganadora del jurado"

---

## 1. Veredicto ejecutivo

CrewFactory es hoy una **plataforma multi-agente con UI en vivo, streaming real-time, actor-model dispatch y 35+ providers** — eso ya lo diferencia de la mayoría de los frameworks del mercado. Pero para Track 3, **los tres requisitos obligatorios no están demostrables en código**:

| Requisito oficial (obligatorio) | Estado en código | Riesgo |
|---|---|---|
| Descomponer tareas y asignar roles | **PARCIAL** — roles son metadata visual; la descomposición es prompt-induced, no algorítmica | Medio |
| Resolver desacuerdos y conflictos de ejecución | **AUSENTE** — no hay contador de rondas, ni máquina de estados de acuerdo, ni hook de arbitraje | **CRÍTICO** |
| Ganancia medible sobre baseline single-agent | **AUSENTE** — no hay benchmark, scores, ni harness A/B/C | **CRÍTICO** |

Además, dos requisitos de submission son binarios y hoy faltan: **LICENSE** (no existe) y **deploy en Alibaba Cloud** (estamos en Coolify). MCP —mencionado explícitamente en el criterio de 30%— está **completamente ausente** del codebase.

**Conclusión:** la infraestructura de UI/streaming/observabilidad ya es de nivel ganador. Lo que falta es la **sustancia algorítmica de colaboración** que el jurado busca, más los assets de submission. Todo es cerrable en ~6-8 fases de trabajo enfocado.

---

## 2. Análisis competitivo

Investigué los cuatro frameworks multi-agente más relevantes del mercado y cómo se posicionan frente a Track 3.

### CrewAI (crewai.com)
- **Enfoque:** Plataforma enterprise de producción. 60% de Fortune 500. 450M+ workflows/mes.
- **Fortaleza:** Adopción enterprise, case studies con métricas (90% reducción de dev time, 96% reducción de QA time). Orchestration product-grade.
- **Debilidad para un hackathon:** Es framework bestemado a producción, no a "sorprender al jurado con novedad algorítmica". Sin UI demostrable en 3 min — se vende via dashboards y case studies, no via demo en vivo.
- **Lección:** Las métricas de impacto (reducción %) son lo que vende. Necesitamos nuestras propias métricas comparativas.

### LangGraph (langchain.com/langgraph)
- **Enfoque:** Runtime de orquestación low-level con control fino. Grafos de estado, human-in-the-loop, memoria persistente.
- **Fortaleza:** Flexibilidad arquitectónica (single, multi-agent, jerárquico), streaming first-class, LangSmith para observabilidad. Aclamado por desarrolladores.
- **Debilidad:** Es una librería Python, no un producto. Sin UI; el "demo" es código. Para Track 3 (que pide demo de 3 min), un framework sin interfaz visual queda en desventaja.
- **Lección:** El control fino (human-in-the-loop, interrupters) es valioso. Nuestro sistema de roles + arbitraje puede ser nuestro equivalente de "interrupts".

### MetaGPT (github.com/FoundationAgents/MetaGPT) — 69.1k stars
- **Enfoque:** "The Multi-Agent Framework: First AI Software Company". `Code = SOP(Team)`. Roles: Product Manager / Architect / Project Manager / Engineer con SOPs orquestados.
- **Fortaleza:** Filosofía clara y memorable ("software company"). ICLR 2025 oral (top 1.8%) con AFlow (automated agentic workflow generation). Producto comercial MGX lanzado (Product of the Week en Product Hunt).
- **Debilidad:** CLI/librería. El "demo" es `metagpt "Create a 2048 game"` → repo generado. Sin UI de colaboración en vivo; el jurado no "ve" a los agentes negociar.
- **Lección directa para nosotros:** MetaGPT ya hace exactamente lo que Track 3 pide (roles + SOPs + software company), pero **sin UI en vivo**. Ese es nuestro ángulo de ventaja: nosotros SÍ tenemos el canvas visual donde el jurado ve la negociación en tiempo real. AutoConsulting es nuestra "software company" — hay que elevarla.

### ChatDev 2.0 (github.com/OpenBMB/ChatDev) — 33.6k stars
- **Enfoque:** "Zero-Code Multi-Agent Platform for Developing Everything". Evolucionó de "virtual software company" (v1, igual que MetaGPT) a plataforma de orquestación visual con workflow canvas drag-and-drop.
- **Fortaleza:** UI visual (Vue 3) con workflow canvas, launch tab con logs en vivo, human-in-the-loop. **NeurIPS 2025** con "Puppeteer": orchestrator central aprendible via RL que activa/sequencia agentes dinámicamente para reducir costo computacional. MacNet (DAG, 1000+ agentes). Experiential Co-Learning (IER) — agentes acumulan shortcut experiences para reducir errores repetidos.
- **Debilidad:** Python-centric; UI es workflow canvas estática (configuras y ejecutas), no chat en vivo del estilo "veo a los agentes debatir" como un Slack.
- **Lección CRÍTICA:** ChatDev tiene paper en NeurIPS sobre "evolving orchestration" — un orchestrator que *aprende* a secenciar agentes. Nuestro plan `meta-agent-optimization-loop.md` es conceptualmente el mismo ángulo (observe → optimize → redeploy skills) pero NO está cerrado como loop automatizado. Si lo cerramos, tenemos nuestra propia narrativa de "orquestación evolutiva" medible. Además, IER (experiential co-learning: reducir errores repetidos) es EXACTAMENTE lo que mide nuestro requisito #3 (eficiencia vs baseline).

### AutoGen (microsoft.github.io/autogen)
- **Enfoque:** Framework de Microsoft para conversaciones multi-agente. Group chat, agent personas.
- **Fortaleza:** Patrón de "group chat con agentes" muy influente. Flexible.
- **Debilidad:** Sin UI propia; nuevamente librería.
- **Lección:** El patrón de "channel = group chat de agentes" ya lo tenemos implementado. AutoGen popularizó la idea; nosotros la realizamos con UI.

### Tabla comparativa — posición de CrewFactory

| Dimensión | CrewAI | LangGraph | MetaGPT | ChatDev 2.0 | **CrewFactory** |
|---|---|---|---|---|---|
| UI live multi-agent | No (enterprise dashboards) | No (librería) | No (CLI) | Sí (workflow canvas estático) | **Sí (chat en vivo estilo Slack)** |
| Streaming token-a-token | No | Sí (API) | No | Sí (logs) | **Sí (WS + SSE)** |
| Roles jerárquicos | Vía config | Vía graph | SOPs hardcoded | Via YAML roles | **Sí + Org Chart SVG visual** |
| Negociación/desacuerdo | No destacado | Human-in-loop | No algorítmico | No algorítmico | **AUSENTE — oportunidad clara** |
| Medición vs baseline | Case studies externos | LangSmith eval | No | IER papers | **AUSENTE — oportunidad clara** |
| Orquestación evolutiva | No | No | AFlow (ICLR) | Puppeteer (NeurIPS) | **Plan existe, no cerrado** |
| MCP support | Via tools | Via tools | No | mcp_example + skills | **AUSENTE — gap del 30%** |
| Self-hostable multi-provider | Cloud / Enterprise | Self-host | Self-host | Self-host | **Sí (35+ providers, Qwen nativo)** |
| Open source + UI deployable | Parcial | MIT | MIT | Apache-2.0 | **Por definir (falta LICENSE)** |

### Tesis competitiva

> **Ningún competidor combina "UI de chat multi-agente en vivo" + "negociación algorítmica determinista" + "medición de eficiencia vs baseline" + "orquestación evolutiva self-hosted".** Esa combinación es nuestra propuesta de valor única y nuestra narrativa para el jurado: **"AutoConsulting — la primera consultora de software donde ves a los agentes negociar en vivo, mediblemente más eficiente que un solo agente, y que aprende de cada ejecución."**

Los competidores tienen o la UI (ChatDev) o la ciencia (MetaGPT/ChatDev papers) o la producción (CrewAI). Nosotros podemos tener las tres en una demo de 3 minutos si cerramos los gaps algorítmicos.

---

## 3. Puntos fuertes — lo que ya hacemos bien

Estos son nuestros activos; el roadmap los preserva y los amplifica, no los reemplaza.

### 3.1 Infraestructura de UI y streaming (nivel ganador)
- **ChatArea + ChannelChatArea en vivo**: el jurado VERÁ a los agentes debatir token a token, con badges, avatares, thinking blocks expuestos. Ningún competidor ofrece esto en un demo de 3 min. — `components/channels/ChannelChatArea.tsx`
- **Slack-like sidebar** con acordeones de Proyectos / Agentes / Canales — `components/sidebar/SessionSidebar.tsx`
- **Org Chart SVG interactivo** mostrando jerarquía lead/senior/member — `ChannelOrgChart.tsx`. Visualmente impactante para "task division and role assignment".
- **Global Logs Console** — dashboard en vivo de todos los eventos del sistema (mensajes, reasoning, tool calls) con filtros — `LogsConsolePage.tsx`. Es nuestro "LangSmith built-in".
- **Context Meter**, abort, steer/follow-up durante streaming — pulido de UX que 시니ores del jurado notan.

### 3.2 Arquitectura de orquestación
- **Actor model dispatch ya implementado** — fire-and-forget por agente, FIFO estricto dentro de cada agente, paralelismo entre agentes. — `channels/agent-work-queue.ts` + `channel-orchestrator.ts:186-189`. Esto es lo que `plans/parallel-agent-dispatch.md` v2 describía y ya está en código. ChatDev Puppeteer lo hace via RL (más sofisticado pero más lento de demostrar); nosotros lo hacemos determinista y observable.
- **Reply modes configurables** (user-only / broadcast / targeted / mention-only) + @mention parsing con autocomplete — `mention-parser.ts`. Routing real, no hardcodeado.
- **Anti-chatter con token `(silent)`** — los agentes saben cuándo callarse en lugar de ping-pong infinito. — `channel-orchestrator.ts:519-540`. Esta es ingeniería sutil que un jurado técnico nota.
- **maxChainDepth configurable por canal** (1-50) — circuit breaker contra debates infinitos. — `channel-orchestrator.ts:175`.

### 3.3 Observabilidad y meta-loop (parcial pero real)
- **SSE `/api/agents/:id/observe`** — stream en vivo de thoughts/text-deltas/tool-calls de un agente individual. — `create-agent-server.ts:130-144`
- **Execution log store** — cada prompt se persiste con `prompt.json`/`messages.jsonl`/`tool-calls.json`/`summary.json` (incluyendo `durationMs`). — `create-agent-server.ts:206-265`. **Este es el cimiento del harness de medición que falta.**
- **eventBroker** singleton broadcasting `global_log` via WS — `lib/event-broker.ts`
- **Delegate CLI** — `scripts/delegate.ts` déjà delega a agents/repos/channels via SSE. Utilizable como harness de benchmarking.
- **factory skills** (factory-observe, factory-quick-actions) — el meta-agent ya sabe observar y registrar quick actions vía API. Falta `factory-delegate` (mencionado en docs, ausente en `DEFAULT_FACTORY_SKILLS`).

### 3.4 Stack y deployment
- **35+ providers vía pi SDK + Qwen Cloud nativo** — `qwen-provider.ts` registra 8 modelos Qwen 3.x vía `registry.registerProvider` con endpoint DashScope. **No agregamos dependencias; usamos el SDK que el hackathon quiere ver (Qwen vía OpenAI-compatible).**
- **Bun + Hono + React 19 + Tailwind v4** — stack moderno, typecheck estricto, sin `any`. Limpio y sophisticated.
- **Coolify Docker deploy probado** — producción corriendo en `crewfactory.pages.therry.dev`.

### 3.5 La narrativa de AutoConsulting
El script `scripts/setup-autoconsulting-channel.ts` ya crea 5 agentes (CEO / Tech Lead / Senior Dev / Marketing / WebBuilder) con prompts de roles, routing targeted, y context variables (HOURS_PER_FICHA, USD_PER_FICHA, rangos de proyecto). **La historia es coherente y comercialmente real:** una consultora de software donde los agentes negocian el scope de un proyecto y producción se externalizó al WebBuilder. Es el caso de uso perfecto para "Problem Value & Impact" (25%). Falta volverla determinista y medible.

---

## 4. Gaps críticos — lo que falta para ganar

Mapeados a los requisitos obligatorios y a los pesos del jurado.

### Gap A — Negociación algorítmica (REQ OBLIGATORIO #2, peso en Innovation 30%)
**Hoy:** la "negociación" vive solo en los prompts de `setup-autoconsulting-channel.ts` (líneas 85-119: "2+ intercambios sin converger", "ACUERDO ALCANZADO:", umbrales de 15%/40%). El LLM decide si negociar; no hay código que cuente rondas, detecte acuerdos, o escale al CEO.
**Por qué importa:** el jurado quiere ver "how they resolve disagreements and execution conflicts". Si el LLM simplemente decide no negociar, no hay nada que demostrar. Necesitamos un protocolo determinista.
**Ver Fase 1.**

### Gap B — Benchmark de eficiencia vs single-agent (REQ OBLIGATORIO #3, peso en Problem Value 25%)
**Hoy:** solo existe `summary.json` con `durationMs` por ejecución. No hay scores agregados, no hay condición single-agent de control, no hay A/B/C, no hay script que corra el mismo brief dos veces (una con 1 agente, otra con el canal) y compare.
**Por qué importa:** es probablemente el requisito MÁS diferenciador — pocos submissions tendrán un harness real. Casi todos "demostrarán" eficiencia con hand-waving. Un harness que produce una tabla `GlobalScore/ClienteScore/ConsultoraScore` para A (single) vs B (canal) vs C (canal+optimización) es un knockout para el jurado.
**Ver Fase 2.**

### Gap C — Descomposición de tareas algorítmica (REQ OBLIGATORIO #1, parcial)
**Hoy:** roles (`lead/senior/member/observer`) son metadata visual + systemPrompt. No hay código que asigne sub-tareas por rol. El "CEO descompone → Lead propone → Dev evalúa" funciona solo porque los prompts lo dicen, no porque el orchestrator lo imponga.
**Por qué importa:** parcialmente cubierto (los roles existen y se muestran en Org Chart), pero el jurado técnico querrá ver lógica de descomposición, no solo prompts.
**Ver Fase 3.**

### Gap D — MCP integration (criterio "Technical Depth" 30% explícito)
**Hoy:** cero dependencia MCP. `plans/mcp-marketplace.md` existe como diseño pero no se construyó. El pi SDK declara "No MCP". El criterio de evaluación cita textualmente "custom skills, MCP integrations".
**Por qué importa:** el 30% del criterio "Technical Depth & Engineering" menciona MCP por nombre. Sin MCP, perdemos puntos directos contra submissions que sí lo tengan.
**Ver Fase 4.**

### Gap E — Meta-agent optimization loop cerrado (Innovation 30%, diferenciador narrativo)
**Hoy:** observe + execution logs + 2 factory skills existen, pero el loop (observe → analiza tool-calls → detecta patrones repetitivos → compila y registra Quick Action / skill → re-ejecuta → compara) NO está automatizado. `factory-delegate` falta en `DEFAULT_FACTORY_SKILLS`. Ningún script ejecuta el ciclo completo.
**Por qué mata:** es nuestro equivalente de "Puppeteer" (ChatDev NeurIPS) y "AFlow" (MetaGPT ICLR) — la narrativa de "orquestación evolutiva". Si lo cerramos, tenemos una historia científica medible de mejora continua, no solo una demo estática.
**Ver Fase 5.**

### Gap F — Requisitos de submission binarios
- **F1:** LICENSE file (no existe). Repo debe ser público y OSS con licencia detectable en "About" de GitHub.
- **F2:** Deploy en Alibaba Cloud (no Coolify). Requiere grabación corta + link a archivo de código que use Alibaba Cloud services/APIs.
- **F3:** Architecture diagram (no existe, formato libre — recomiendo Mermaid + PNG export).
- **F4:** Demo video ~3 min en YouTube/Vimeo público.
- **F5:** Text description de features.
- **F6:** Identificar Track (Track 3).
- **F7 (bonus):** Blog/social post sobre building with QwenCloud → prize de blog post.

**Ver Fase 6.**

---

## 5. Hoja de ruta — fases detalladas

Ordenadas por: (1) requisitos obligatorios primero, (2) peso del criterio, (3) riesgo de demo. Cada fase lista objetivo, cómo satisface el criterio, archivos a crear/modificar, y criterio de aceptación.

---

### FASE 1 — Negotiation Protocol Engine (cierra Req #2)

**Por qué primero:** es el gap más crítico — el requisito obligatorio que peor cubrimos. Sin esto, el jurado no ve "disagreement resolution", solo LLMs hablando.
**Criterio que satisface:** "Innovation & AI Creativity" (30%, descrito como arquitectura/modularidad/lógica no-trivial) + Req obligatorio #2.
**Narrativa para el jurado:** "No dejamos la negociación al azar del LLM. Hay un protocolo determinista con rondas contadas, detección de acuerdos, y escalamiento al árbitro."

**Lógica a implementar:**
1. **Round counter:** por cada par `(senderId, receiverId)` en un dispatch, contar intercambios. Persistir en el canal `negotiationState: { [pairKey]: { rounds: number, lastOffer: string | null, status: "open"|"agreed"|"escalated" } }`.
2. **Agreement parser:** regex sobre el output del agente receptor — detecta `ACUERDO ALCANZADO:`, `ACEPTO la propuesta`, `RECHAZO`, `CONTRAPROPONE`. Marca status en el state machine.
3. **Escalation hook:** cuando `rounds >= N` (configurable, default 3) sin `agreed`/`rejected` terminal, el orchestrator inyecta un mensaje dirigido al miembro con `role: "lead"` (el CEO en AutoConsulting) con prompt: `"Bloqueo detectado tras N rondas entre @TechLead y @SeniorDev. Emite veredicto vinculante."` Esto convierte el "arbitraje del CEO" de texto-prompt a lógica enforced.
4. **Termination gate:** cuando `status === "agreed"`, el orchestrator rompe la cadena para ese par y notifica al siguiente rol (Marketing para redactar la propuesta final). Hoy esto no pasa — hoy la cadena sigue hasta `maxChainDepth`.
5. **WS events nuevos:** `channel_negotiation_round`, `channel_negotiation_agreement`, `channel_negotiation_escalation` — para que el UI muestre badges de "Ronda 2/3", "ACUERDO", "ARBITRAJE CEO" en cada mensaje.

**Archivos:**
- **NUEVO** `apps/server/src/channels/negotiation-state.ts` — `NegotiationStateMachine` (per-pair, per-channel), persiste en `channel.json` extendido.
- **MOD** `apps/server/src/channels/channel-orchestrator.ts` — invoca el state machine en `runAgentPrompt` post-prompt; gate de terminación; hook de escalamiento.
- **MOD** `apps/server/src/channels/channel-store.ts` — persistir `negotiationState`.
- **MOD** `packages/shared/src/schemas.ts` — `NegotiationStateSchema`, `NegotiationRoundSchema`.
- **MOD** `apps/client/src/components/channels/ChannelMessageList.tsx` — badges visuales de ronda / acuerdo / arbitraje.
- **MOD** `scripts/setup-autoconsulting-channel.ts` — ajustar prompts para que el formato `ACUERDO ALCANZADO:`/`ACEPTO`/`CONTRAPROPONE` sea canónico (ya casi lo es).

**Aceptación:**
- Corro un brief "ecommerce MVP" → veo `Ronda 1`, `Ronda 2`, `ACUERDO ALCANZADO: 85 fichas` en el chat con badges.
- Corro un brief deliberadamente ambiguo que cause desacuerdo > N rondas → veo `ARBITRAJE CEO` badge y el CEO interviene automáticamente.
- `negotiationState` persiste en `channel.json` y recupera al recargar.

---

### FASE 2 — Efficiency Benchmark Harness (cierra Req #3)

**Por qué segundo:** es el diferenciador competitivo más fuerte. Pocos submissions tendrán medición real; casi todos hand-wavearán "es más eficiente". Una tabla de scores es un knockout.
**Criterio que satisface:** "Problem Value & Impact" (25%, "real-world relevance" + "scalability") + Req obligatorio #3.
**Narrativa:** "No decimos que somos más eficientes — lo medimos. Tres condiciones experimentales, same brief, scores comparables."

**Lógica a implementar:**
1. **Tres condiciones:**
   - **A (single-agent baseline):** el mismo brief se envía a UN solo agente "Consultor General" con un systemPrompt que hace todo (descomponer + estimar + redactar propuesta). Sin canal, sin roles, sin negociación.
   - **B (multi-agent channel):** el brief va al canal AutoConsulting completo (Fase 1 ya agregó negociación determinista).
   - **C (multi-agent + optimization loop):** el canal se ejecuta tras haber corrido el meta-agent loop (Fase 5) que registró Quick Actions optimizadas a partir de ejecuciones previas.
2. **Scores:**
   - `ConsultoraScore` — calidad técnica de la estimación: `fichas_propuestas` vs `fichas_referencia` (gold answer para el brief). 0-100, penaliza desviación > X%.
   - `ClienteScore` — calidad de la propuesta final ( Marketing): score via LLM-as-judge con rubric (claridad, completitud, accionabilidad). 0-100.
   - `GlobalScore` — `0.5*ConsultoraScore + 0.5*ClienteScore` ponderado, ajustable.
3. **Métricas auxiliares:** `durationMs`, `rounds_to_agreement`, `tokens_total`, `tool_calls_total`, `cost_estimate` (vía pricing del modelo).
4. **Script:** `scripts/benchmark.ts` — toma un JSON de briefs (3-5 casos), corre A/B/C por cada brief, persiste resultados en `/tmp/crewfactory/admin/benchmarks/{timestamp}/` y genera un `report.md` con tabla comparativa.
5. **UI:** tab "Benchmark" en la página del canal que muestra la tabla A vs B vs C con barras (`GlobalScore`) y diferencial `%` (ej. "B es 34% más preciso que A en 40% menos tiempo").

**Archivos:**
- **NUEVO** `scripts/benchmark.ts` — orquesta A/B/C, persiste, genera report.
- **NUEVO** `apps/server/src/benchmark/scoring.ts` — `computeConsultoraScore`, `computeClienteScore` (LLM-as-judge), `computeGlobalScore`.
- **NUEVO** `apps/server/src/benchmark/harness.ts` — corre una condición (single/channel/optimized) sobre un brief.
- **NUEVO** `apps/server/src/benchmark/briefs.json` — 5 briefs de test con gold answers (fichas de referencia de experto).
- **MOD** `apps/server/src/routes/channels.ts` — `GET /api/channels/:id/benchmark` lee último report.
- **MOD** `apps/client/src/components/channels/ChannelBenchmarkPanel.tsx` — tabla A/B/C.
- **MOD** `apps/server/src/lib/event-broker.ts` — emite `benchmark_run_start/end` para live UI.

**Aceptación:**
- `bun run scripts/benchmark.ts` produce `report.md` con tabla: 5 briefs × 3 condiciones × 3 scores + deltas.
- La tabla muestra claramente B > A en `ConsultoraScore` (negociación reduce sobre/subestimación) y C > B (optimización reduce errores repetidos).
- El demo video muestra el panel de benchmark con barras.

---

### FASE 3 — Role-Driven Task Decomposition (cierra Req #1, refuerza narrativa)

**Por qué tercero:** parcialmente cubierto; falta hacerlo algorítmico para que el jurado técnico vea lógica, no solo prompts.
**Criterio:** "Innovation & AI Creativity" (30%) + Req obligatorio #1.

**Lógica:**
1. **Decompose step en el orchestrator:** cuando el receptor del mensaje es el miembro con `role: "lead"`, el orchestrator parsea su output buscando bloques `DELEGATE: @agentName — tarea`. Cada bloque genera sub-dispatches dirigidos (no depende de que el lead @mencione naturalmente; el orchestrator programa los sub-dispatches). Esto convierte "el CEO descompone" en un paso orquestado.
2. **Role-based prompt enrichment:** el `buildAgentPrompt` ya inyecta roster pero no rol. Agregar al roster block: `- @user (human, lead)`, `- @TechLead (senior)`, etc. El LLM ve la jerarquía explícitamente. Hoy `role` NO entra en el roster (audit confirmó `channel-orchestrator.ts:644-648` solo lista id+name).
3. **Task assignment ledger:** por cada dispatch, registrar `assignedBy: agentId, assignedTo: agentId, role, task, status`. UI: panel "Asignaciones" en el canal mostrando el árbol `CEO → [TechLead: scope, Marketing: propuesta]` como grafo. Esto REFUERZA el Org Chart: el Org Chart muestra la estructura, el ledger muestra las asignaciones-en-vuelo.
4. **Integration con Task Runner:** opcionalmente, los sub-tasks delegados pueden escribirse al `tasks.json` del canal session para tracking persistente (hoy Task Runner es solo single-session).

**Archivos:**
- **MOD** `apps/server/src/channels/channel-orchestrator.ts` — `parseDelegationBlocks(output)`, sub-dispatch programado, registro en ledger.
- **MOD** `apps/server/src/channels/channel-orchestrator.ts:644-648` — incluir `role` en el roster block del prompt.
- **NUEVO** `apps/server/src/channels/task-ledger.ts` — persistencia de asignaciones en `channel.json`.
- **MOD** `packages/shared/src/schemas.ts` — `TaskAssignmentSchema`, `TaskLedgerSchema`.
- **NUEVO** `apps/client/src/components/channels/ChannelTaskLedger.tsx` — grafo de asignaciones en vivo.

**Aceptación:**
- Brief del user → CEO output contiene `DELEGATE: @TechLead — Generar ScopeProposal para ecommerce MVP`. El orchestrator dispara dispatch a TechLead con ese task como prompt.
- Panel de Asignaciones muestra `CEO → TechLead (scope)` y luego `TechLead → SeniorDev (eval)` como árbol.
- El Org Chart ahora refleja asignaciones reales, no solo estructura estática.

---

### FASE 4 — MCP Integration Minimal (cierra el 30% "Technical Depth")

**Por qué:** el criterio cita MCP por nombre. No necesitamos el marketplace completo (eso es post-hackathon) — necesitamos 1 demo funcional + 2 builtin servers para "sophisticated use of QwenCloud APIs (custom skills, MCP integrations)".
**Criterio:** "Technical Depth & Engineering" (30%).

**Scope mínimo viable:**
1. **Cliente MCP** — `mcp-manager.ts` reducido: connect (stdio only), listTools, callTool. Sin HTTP transport, sin reconnect, sin marketplace UI. Solo lo suficiente para que un MCP server funciones dentro de una sesión.
2. **2 builtin servers** del catálogo pequeño (`mcp-registry.ts` reducido):
   - `filesystem` (`@modelcontextprotocol/server-filesystem`) — útil + obvio.
   - `github` (`@modelcontextprotocol/server-github`) — injerta tools reales (create issue, list PRs) en un agente. Demuestra valor de MCP.
3. **Registro en sesión:** al crear `AgentSession`, llamar `mcpManager.listTools()` de los servers enabled y registrar como `customTools`. El LLM las ve y las llama; el orchestrator las enruta via `mcpManager.callTool()`.
4. **UI mínima:** una página `MCPSettings.tsx` simple (lista de servers, toggle on/off, ver tools). NO hacer marketplace . Estilo "Settings > Integrations".
5. **Archivo de prueba de Alibaba Cloud:** aprovechar MCP para crear `alibaba-cloud-oss.ts` que use el OSS SDK para subir el report de benchmark a un bucket — satisface el requisito de "Proof of Alibaba Cloud Deployment" (ver Fase 6).

**Archivos:**
- **NUEVO** `apps/server/src/pi/mcp-manager.ts` — versión reducida (stdio, connect/listTools/callTool).
- **NUEVO** `apps/server/src/pi/mcp-registry.ts` — catálogo con 2-3 servers.
- **NUEVO** `apps/server/src/routes/mcp.ts` — REST mínimo (list, toggle, install-from-catalog).
- **MOD** `apps/server/src/pi/session-manager.ts` — al crear sesión, registrar tools MCP como customTools.
- **MOD** `apps/server/src/index.ts` — montar `mcpRouter`.
- **NUEVO** `apps/client/src/pages/MCPSettings.tsx` — página simple.
- **NEW dep** `@modelcontextprotocol/sdk` en `apps/server/package.json`.

**Aceptación:**
- En una sesión, el LLM llama a `mcp_github_list_issues` y retorna issues reales de un repo.
- Toggle filesystem MCP on/off en la UI afecta las tools disponibles en la sesión.
- La página de MCP funciona sin crash; el server typecheckea.

---

### FASE 5 — Meta-Agent Optimization Loop cerrado (diferenciador narrativo)

**Por qué:** es nuestro "Puppeteer" / "AFlow" — la historia de "orquestación que aprende". Diferenciador vs todos los competidores.
**Criterio:** "Innovation & AI Creativity" (30%) + Refuerza Fase 2 (C vs B).
**Narrativa:** "Después de N ejecuciones, el meta-agent observa patrones repetitivos en los tool-calls, y registra Quick Actions optimizadas. La condición C del benchmark usa esas optimizaciones y puntúa más alto que B."

**Lógica:**
1. **`factory-delegate` skill** — agregar a `DEFAULT_FACTORY_SKILLS` (hoy falta). Documenta el CLI `scripts/delegate.ts` y el workflow observe→analyze→improve.
2. **Analysis script** — `scripts/optimize.ts`: lee los `executions/*/tool-calls.json` de las últimas N ejecuciones del canal; usa un LLM call para detectar patrones (ej. "en 4/5 runs, TechLead ejecutó `bash git status` antes de proponer scope"); propone una quick action (ej. "auto-inject git context en el prompt del TechLead"); la registra vía `POST /api/integrations/templates`.
3. **Cierre del loop en código:** un script `scripts/run-optimization-cycle.ts` que ejecute: `delegate brief → observe → analyze tool-calls → register quick action → re-delegate same brief → compare durationMs/score`. Persiste el delta en `optimization-log.json`.
4. **UI:** tab "Optimization" en AgentsPage mostrando el log de ciclos (ej. "Ciclo 1: detectado patrón X, registrada quick action Y, mejora +12% en ConsultoraScore").

**Archivos:**
- **MOD** `apps/server/src/pi/default-factory-skills.ts` — agregar `factory-delegate`.
- **NUEVO** `scripts/optimize.ts` — analyze tool-calls, propose + register quick action.
- **NUEVO** `scripts/run-optimization-cycle.ts` — orquesta el ciclo completo.
- **NUEVO** `apps/server/src/benchmark/optimization-log.ts` — persiste deltas.
- **MOD** `apps/client/src/pages/AgentsPage.tsx` — tab "Optimization".

**Aceptación:**
- Tras 3 ejecuciones del mismo brief, `run-optimization-cycle.ts` detecta al menos un patrón y registra una quick action.
- Re-ejecutar el brief muestra reducción de `durationMs` o mejora de `ConsultoraScore`.
- La condición C del benchmark (Fase 2) puntúa más alto que B.

---

### FASE 6 — Submission assets (requisitos binarios)

Todos obligatorios salvo el blog. Hacerlos en paralelo a 1-5; no bloquean código.

**F1 — LICENSE**
- **Acción:** agregar `LICENSE` (MIT, consistente con el stack Open Source del espacio) en repo root. GitHub detectará automáticamente y mostrará en "About".
- **Aceptación:** `ls LICENSE` existe; GitHub About muestra "MIT license".

**F2 — Alibaba Cloud Deployment proof**
- **Acción:** crear `apps/server/src/alibaba-cloud/oss-upload.ts` (MCP filesystem ya está de Fase 4). Usar `ali-oss` (npm) o fetch directo al OSS API. Endpoint: subir `benchmark/report.md` a un bucket `crewfactory-benchmarks`. Documentar variable `ALIBAY_ACCESS_KEY_ID/SECRET` en env.
- **Archivo de prueba:** `alibaba-cloud/proof-deployment.md` en repo root con screenshots/código + link al bucket público del report subido.
- **Video corto:** grabar server corriendo en una instancia ECS, ejecutar `bun run benchmark:alibaba`, ver OSS upload en OBS console.
- **Aceptación:** el link a `oss-upload.ts` en el repo demuestra uso de Alibaba Cloud services; el video prueba el backend corriendo en Alibaba infra.

**F3 — Architecture Diagram**
- **Acción:** crear `docs/architecture.md` con diagrama Mermaid:
  - Qwen Cloud (DashScope) → nuestro `qwen-provider.ts` → `ModelRegistry` → `AgentSession`
  - Canal AutoConsulting: User → Orchestrator → [CEO, TechLead, SeniorDev, Marketing, WebBuilder] → WS → Client
  - NegotiationStateMachine + TaskLedger + MCP Manager + Benchmark Harness
  - Frontend (React) ↔ WS ↔ Backend (Hono/Bun)
  - Filesystem persistence `/tmp/crewfactory`
- Exportar a PNG via `mmdc` para GitHub render. Poner el PNG en `docs/architecture.png`.
- **Aceptación:** `docs/architecture.md` + `.png` existen y renderizan en GitHub.

**F4 — Demo video (~3 min)**
- **Acción:** grabar (OBS) el siguiente flujo en la UI en vivo:
  1. (0:00-0:20) Login → mostrar Slack-like UI, sidebar con relay de canales.
  2. (0:20-0:50) Abrir canal AutoConsulting, mostrar Org Chart con roles, abrir brief del user.
  3. (0:50-2:00) Enviar brief "ecommerce MVP, presupuesto ~$30k". Ver a CEO → TechLead → SeniorDev negociar en VIVO, con badges de "Ronda 1/2", "ACUERDO ALCANZADO: 62 fichas", Marketing redactando propuesta.
  4. (2:00-2:30) Abrir tab Benchmark: ver tabla A vs B vs C con GlobalScore, ver B > A (34% más preciso), C > B (+12%).
  5. (2:30-3:00) Abrir Optimization log: ver el ciclo de mejora; abrir MCP settings y mostrar filesystem/github conectados. Cerrar con logo + URL del repo.
- Subir a YouTube unlisted-público.
- **Aceptación:** video en YouTube, link en README.

**F5 — Text description**
- **Acción:** sección en README titulada "Features & Functionality" — 4-5 párrafos cubriendo: problema (consultoras de software tardan días en estimar), solución (pipeline multi-agente con negociación determinista), métricas (benchmark A/B/C), arquitectura (link a diagrama), diferente (UI live + optimization loop + MCP).
- **Aceptación:** README.md incluye esa sección.

**F6 — Track identification**
- **Acción:** en README, una línea "Submitted to: Track 3 — Agent Society".
- **Aceptación:** presente.

**F7 (bonus) — Blog post**
- **Acción:** publicar en Medium/dev.to "Building AutoConsulting: a multi-agent consultancy with measurable efficiency gains over Qwen Cloud". Cubrir journey (negotiation protocol, benchmark harness, MCP, optimization loop). Link al repo.
- **Aceptación:** URL pública en README.

---

## 6. Secuencia de ejecución recomendada

```
Semana 1:  Fase 1 (Negotiation) ──► Fase 3 (Decompose)     [req oblig #1+#2 cerrados]
Semana 2:  Fase 2 (Benchmark) ──► Fase 5 (Optimization)     [req oblig #3 + narrativa]
Semana 3:  Fase 4 (MCP) + F6 (submission assets)            [criterio 30% + binarios]
Conting.:   bug fixes, polish, video, blog
```

Fase 1 desbloquea Fase 2 (necesitas negociación determinista para que B sea reproducible). Fase 2 desbloquea Fase 5 (necesitas benchmark para medir mejora). Fase 4 (MCP) es independiente — meterse en paralelo con cualquier otra si hay tiempo.

---

## 7. Matriz criterio × fase (para tracking de score)

| Criterio (peso) | F1 Neg | F2 Bench | F3 Decomp | F4 MCP | F5 Loop | F6 Assets |
|---|---|---|---|---|---|---|
| Technical Depth & Engineering (30%) | • | ◦ | •• | ••• | • | ◦ |
| Innovation & AI Creativity (30%) | ••• | •• | •• | • | ••• | ◦ |
| Problem Value & Impact (25%) | • | ••• | •• | • | •• | •• |
| Presentation & Documentation (15%) | ◦ | • | ◦ | ◦ | • | ••• |
| **Req oblig #1 (decompose)** | ◦ | ◦ | ••• | ◦ | ◦ | ◦ |
| **Req oblig #2 (disagree)** | ••• | ◦ | • | ◦ | ◦ | ◦ |
| **Req oblig #3 (efficiency)** | ◦ | ••• | ◦ | ◦ | •• | ◦ |
| **Submission binarios** | ◦ | ◦ | ◦ | ◦ | ◦ | ••• |

`•••` impacto crítico, `••` fuerte, `•` medio, `◦` no afecta.

---

## 8. Riesgos y mitigaciones

- **Riesgo:** el LLM no sigue el formato `ACUERDO ALCANZADO:` y el parser falla. **Mit:** sysprompt estricto + few-shot de 1 ejemplo + fallback "si no detecta token tras 5 rondas, força escalation".
- **Riesgo:** Qwen 3.x en reasoning mode produce output distinto al esperado para detección de acuerdos. **Mit:** tests con los 5 briefs del benchmark; ajustar thresholds antes de grabar el video.
- **Riesgo:** MCP stdio servers требуют Node/npm en el contenedor de prod. **Mit:** el Dockerfile ya usa Bun; verificar que `npx` esté disponible o preinstalar `@modelcontextprotocol/server-filesystem` globalmente.
- **Riesgo:** Alibaba Cloud deployment requiere cuenta + ECS. **Mit:** usar capa free de Alibaba; mínimo instancia 1 vCPU para la demo. Alternativa: usar Function Compute (serverless) y probar el `oss-upload.ts` localmente contra el OSS endpoint público (satisface "use of Alibaba Cloud APIs").
- **Riesgo:** el meta-loop detecta "patrones" spurios. **Mit:** requerir mínimo 3 ocurrencias del mismo patrón antes de proponer quick action; usuario confirma antes de registrar.
- **Riesgo:** tiempo. Si Fase 5 (loop) no cierra, cortar y hacer solo A vs B (Fase 2 sin condición C). El demo igual es fuerte con negociación + benchmark + MCP.

---

## 9. Estado de los planes existentes (no duplicar)

Algunos planes en `plans/_index.md` ya cubren piezas de este roadmap. Estado actualizado:

- `parallel-agent-dispatch.md` — **COMPLETADO en código** (actor model, `agent-work-queue.ts`). No action.
- `mcp-marketplace.md` — **NO empezado**. Fase 4 aquí es una VERSIÓN REDUCIDA (sin marketplace UI, sin HTTP transport, sin 15-server catalog). No construir el marketplace completo ahora; post-hackathon.
- `meta-agent-optimization-loop.md` — **PARCIAL**. Fase 5 aquí lo CIERRA (agrega `factory-delegate`, `optimize.ts`, `run-optimization-cycle.ts`).
- `channels-to-teams-with-orgchart.md` — **COMPLETADO** (roles + SVG org chart). Fase 3 aquí lo hace algorítmico (role entra en el prompt + ledger de asignaciones).
- `engram-agent-memory.md` — **NO empezado**. Fuera de scope del hackathon (memoria persistente es frío para un demo de 3 min). No action.
- `gentle-ai-prompt-patterns.md` — **research**, sin código. Patrones de subdelegación pueden informar `factory-delegate` (Fase 5). No action directa.
- `env-var-obfuscation.md` — fuera de scope hackathon.
- `qwen-cloud-provider.md` — **COMPLETADO** (`qwen-provider.ts`). No action.

---

## 10. Resumen para el jurado (pitch de la submission)

> **AutoConsulting** es una consultora de software multi-agente donde 5 agentes con roles distintos (CEO, Tech Lead, Senior Dev, Marketing, WebBuilder) negocian el scope de un proyecto en vivo. No es una demo de chatbot — es un pipeline de negociación determinista: contamos rondas, detectamos acuerdos con un parser, escalamos al CEO como árbitro cuando no hay convergencia, y delegamos sub-tareas por rol.
>
> A diferencia de MetaGPT y ChatDev (CLI/librería), AutoConsulting corre sobre CrewFactory, una plataforma web self-hosted donde el jurado VE a los agentes debatir token a token, con un Org Chart jerárquico y logs globales en vivo.
>
> Y no decimos que somos más eficientes — lo medimos. Un benchmark corre el mismo brief en tres condiciones: single-agent baseline (A), multi-agent channel (B), y multi-agent + optimization loop (C). Los scores `GlobalScore/ConsultoraScore/ClienteScore` muestran que B supera a A en precisión de estimación y C a B en consistencia, porque el meta-agent observa ejecuciones y registra Quick Actions optimizadas — 我们的 equivalente de "evolving orchestration" (cf. Puppeteer NeurIPS 2025).
>
> Todo construido sobre Qwen Cloud (8 modelos Qwen 3.x vía DashScope), con integración MCP funcional (filesystem, GitHub) y deploy probado en Alibaba Cloud.
>
> **Track 3 — Agent Society. Repo público con licencia MIT.**