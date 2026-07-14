# Laboratory Efficiency Audit

Auditoria y correccion de las fugas de eficiencia en el sistema de experimentos del laboratorio: scoring injusto, agentes duplicados, system prompt inflado, y overhead de I/O/cortesia entre agentes.

Descubierto durante investigacion con subagentes: `ayudame a investigar con subagentes y analizar que caracteristicas en la creacion de experimentos, canales y agentes produce una perdida tan sustancial en la eficiencia`

---

## Drive

### Problema

El efficiencyScore de las variantes multi-agente llega sistematicamente a 0, anulando el 30% del peso del puntaje global. Tras investigar con 3 subagentes en paralelo, se identificaron **6 fugas estructurales** que actuan en cascada:

1. **Formula matematica injusta** — compara peras con manzanas (single 1-3 LLM calls vs multi 24-45 LLM calls)
2. **1,370 tokens de instrucciones inservibles por turno** — STANDARD_APPEND_INSTRUCTIONS describe herramientas que los agentes de laboratorio no tienen
3. **9 AgentServer completos creados y destruidos por experimento** — cada agente temporal monta HTTP server, MCP tools, skills del FS
4. **Re-ensamblado del system prompt en cada turno** — I/O y computacion redundante para datos que no cambian
5. **DivergenceDetector O(n) por cada mensaje** — escanea todo el historial con 8 regex incluso sin divergencia
6. **"(silent)" paga inferencia completa** — ~2,750 tokens de contexto para responder con 5 tokens de output

### Impacto

| Variante | LLM calls | System prompt total | Duración | efficiencyScore |
|---|---|---|---|---|
| Single | ~1-3 | ~2,750 | ~10s | 100 |
| MultiNoLeader | ~24 | ~66,000 | ~2.5min | 0 |
| MultiWithLeader | ~45 | ~123,750 | ~4.5min | 0 |

El sistema penaliza con el 30% del peso global a variantes que estan diseñadas para ser 20-50x mas costosas que el baseline, mientras les carga 1,370 tokens de instrucciones inutiles en cada llamada.

### Objetivos

1. EfficiencyScore justo: que refleje sobrecarga real, no penalizacion estructural
2. System prompt reducido: ~200 tokens vs ~1,370 para laboratorio
3. Reutilizacion de AgentServer: 3 agentes persistentes en vez de 9 temporales
4. Cache de prompts: zero I/O redundante entre turnos
5. Bypass de (silent): sin llamada LLM cuando no hay nada que aportar
6. DivergenceDetector O(1): solo escanear el ultimo mensaje

---

## Fase 1 — Scoring Formula Fix

### Archivos

- `apps/server/src/laboratory/scoring.ts`
- `apps/server/src/laboratory/experiment-runner.ts`

### Cambios

**1.1 Normalizar por cantidad de agentes**

```typescript
// Actual — castiga sin contemplaciones
const timeRatio = durationMs / (baseline.durationMs || 1);
const tokenRatio = totalTokens / (baseline.totalTokens || 1);
const penalty = (0.5 * timeRatio + 0.5 * tokenRatio) * 10;

// Propuesto — normaliza por agentes
const numAgents = /* cantidad de agentes en esta variante */;
const adjustedDuration = durationMs / numAgents;
const adjustedTokens = totalTokens / numAgents;
const timeRatio = adjustedDuration / (baseline.durationMs || 1);
const tokenRatio = adjustedTokens / (baseline.totalTokens || 1);
const penalty = (0.5 * Math.log2(1 + timeRatio) + 0.5 * Math.log2(1 + tokenRatio)) * 15;
efficiencyScore = Math.max(0, Math.min(100, 100 - penalty));
```

- `log2(1 + x)` suaviza: ser 10x mas liento penaliza ~13 puntos en vez de 100
- Normalizar por `numAgents` reconoce que mas agentes = mas trabajo
- Factor 15 en vez de 10 para mantener rango significativo

**1.2 Incorporar effectiveRounds en vez de maxChainDepth teorico**

El maxChainDepth actual (15 para multiWithLeader) no refleja las rondas reales. La formula debe usar las ejecutadas:

```typescript
const effectiveRounds = collector.negotiationStats?.totalRounds ?? numAgents;
```

**1.3 Exponer efficiency detallada en el reporte del juez**

Incluir en `VariantRunResult.scores` los sub-componentes: `durationRatio`, `tokenRatio`, `adjustedEfficiency`, `numAgents` para transparencia.

---

## Fase 2 — Lab System Prompt Slim Down

### Archivos

- `apps/server/src/core/prompts/system-instructions.ts`
- `apps/server/src/core/prompts/prompt-assembly.ts`
- `apps/server/src/core/prompts/composer.ts`

### Cambios

**2.1 Crear bloque LAB_APPEND_INSTRUCTIONS (~200 tokens)**

```typescript
export const LAB_APPEND_INSTRUCTIONS = [
  `You are operating in a laboratory experiment environment.
Focus exclusively on the assigned task. Do not use tools.
Respond with concise, substantive content only.`,
];
```

**2.2 Modo `experiment-member` en prompt-assembly**

```typescript
case "experiment-member":
  return [
    formatEnvironmentContext(ctx.workspaceDir),
    layered.composed,
    ...LAB_APPEND_INSTRUCTIONS,
  ];
```

No incluir STANDARD_APPEND_INSTRUCTIONS completo (HTML_PREVIEW, AG_UI, MEMORY, SUBAGENT, TASK). Los agentes de laboratorio se crean con `skills: []` y no tienen esas herramientas.

**2.3 Stripear capas innecesarias en composer**

En modo experimento:
- Identity layer: mantener (necesario para nombre/rol)
- Role layer: mantener
- Instance layer: simplificar — omitir roster completo si el agente solo necesita saber los roles de sus pares, no sus datos completos
- Protocol layer: mantener solo si hay negotiationProtocol

---

## Fase 3 — Reutilizar AgentServer entre Variantes

### Archivos

- `apps/server/src/laboratory/experiment-runner.ts`
- `apps/server/src/agents/agent-registry.ts`

### Cambios

**3.1 Dejar de crear agentes temporales por variante**

Actualmente `runVariant()` registra agentes con ID `lab_{expId}_{variantKey}_{agentId}` para CADA variante. Esto ejecuta `createAgentServer()` 9 veces (3 variantes x 3 agentes).

En vez de eso, los agentes ya fueron registrados en `createExperimentTool()` con IDs estables (`{agentId}` del workspace). Reutilizarlos:

```typescript
// En lugar de:
const regId = `lab_${exp.id}_${variantKey}_${ag.id}`;
await agentRegistry.register(username, { id: regId, ... }, false);

// Usar el mismo AgentServer del workspace:
const regId = ag.id;  // ID original del workspace
// El AgentServer ya existe, solo verificar que este vivo
if (!agentRegistry.get(regId) || agentRegistry.get(regId)!.status === "stopped") {
  await agentRegistry.register(username, { id: regId, ... }, true);
}
```

**3.2 Resetear sesion del agente entre variantes**

Entre variantes, limpiar el historial de la sesion del agente en vez de crear uno nuevo:

```typescript
const entry = agentRegistry.get(regId);
if (entry) {
  await entry.server.session.reset(); // descarta mensajes previos
  entry.server.session.setModel(resolvedModel);
}
```

**3.3 Ahorro estimado**

- 9 createAgentServer() -> 3 (solo si no existen)
- ~200ms x 6 startups evitados = ~1.2s por experimento
- Elimina 42 operaciones de I/O innecesarias (mkdir, existsSync, writeFile)

---

## Fase 4 — Cache de System Prompt en Canales de Laboratorio

### Archivos

- `apps/server/src/channels/agent-prompt-runner.ts`
- `apps/server/src/core/prompts/prompt-assembly.ts`

### Cambios

**4.1 Cache por (agentId, variantKey)**

```typescript
const cacheKey = `${agentId}:${variantKey}:channel-member`;
let appendSystemPrompts = promptCache.get(cacheKey);
if (!appendSystemPrompts) {
  appendSystemPrompts = assemblePromptAppends({
    mode: "experiment-member",
    workspaceDir,
    agentDef: entry.server.definition,
    deployment,
  });
  promptCache.set(cacheKey, appendSystemPrompts);
}
```

**4.2 Evitar resourceLoader.reload() si no cambio**

```typescript
if (appendSystemPrompts !== cachedAppendSystemPrompts) {
  resourceLoader.setAppendSystemPrompt(appendSystemPrompts);
  await resourceLoader.reload();
}
```

El `reload()` re-escanea el filesystem buscando AGENTS.md y SKILL.md. En laboratorio no hay skills (skills: []), asi que esta llamada es I/O puramente desperdiciada.

---

## Fase 5 — Bypass de (silent) sin LLM Call

### Archivos

- `apps/server/src/channels/agent-prompt-runner.ts`
- `apps/server/src/channels/response-parser.ts`
- `apps/server/src/channels/channel-orchestrator.ts`

### Cambios

**5.1 Detectar mencion antes de invocar al LLM**

En `AgentPromptRunner.run()`, antes de llamar `session.prompt()`:

```typescript
const wasMentioned = parseMentions(incomingMsg.content).has(agentId);
const hasPendingTask = /* verificar si el pipeline activo incluye este agente */;

if (!wasMentioned && !hasPendingTask && channel.members.length > 1) {
  return {
    agentMsg: { content: "(silent)", role: "agent", agentId, agentName },
    status: "silent",
  };
}
```

**5.2 No registrar la respuesta (silent) en el historial del canal**

Si el agente responde (silent), no hacer `appendMessage()` ni disparar negotiation handlers. Esto ahorra I/O y computacion de divergence detection.

**5.3 Ahorro estimado**

En un experimento multiWithLeader con 3 agentes y maxChainDepth=15:
- Sin bypass: ~45 LLM calls completas
- Con bypass: ~15-20 LLM calls (muchas rondas tienen agentes que no fueron mencionados)
- Ahorro: ~55% de llamadas LLM

---

## Fase 6 — DivergenceDetector O(1)

### Archivos

- `apps/server/src/laboratory/divergence-detector.ts`
- `apps/server/src/channels/channel-negotiation-handler.ts`

### Cambios

**6.1 Early exit si el mensaje no tiene patrones de divergencia**

```typescript
static detect(messages: LabMessage[], agentPairs: [string, string][]): DivergenceResult {
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg || !hasDivergencePatterns(lastMsg.content)) {
    return { divergences: [], agreement: true };
  }
  // Solo escanear si el ultimo mensaje contiene patrones de divergencia
  return this.fullScan(messages, agentPairs);
}
```

`hasDivergencePatterns()` es un solo regex rapido que busca SCORE, OBJECTION, VETO, DISCREPANCY:

```typescript
const DIVERGENCE_FAST_CHECK = /(?:SCORE|OBJECTION|VETO|DISCREPANCY|DISAGREE)/i;
```

**6.2 Escanear solo los ultimos N mensajes en vez de todo el historial**

Si el fast check pasa, escanear solo los ultimos 3 mensajes por par de agentes, no el historial completo:

```typescript
const recentWindow = messages.slice(-3);
return this.fullScan(recentWindow, agentPairs);
```

---

## Metricas de Exito

| Metrica | Antes | Despues (estimado) | Como medir |
|---|---|---|---|
| efficiencyScore en multiNoLeader | 0 | 40-60 | `scoring.ts` output |
| efficiencyScore en multiWithLeader | 0 | 30-50 | `scoring.ts` output |
| System prompt por LLM call | ~2,750 tokens | ~1,200 tokens | `estimateContextTokens()` |
| LLM calls por experimento | ~71 | ~40 | Logs de `experiment-runner.ts` |
| Duración multiWithLeader | ~4.5min | ~2min | `durationMs` en reporte |
| I/O ops por variante | ~50 | ~25 | strace / contador manual |
| AgentServer creados por exp | 9 | 3 | Log de `agentRegistry.register()` |
| DivergenceDetector tiempo | ~15ms por msg | <1ms por msg | `performance.now()` |

---

## Fase 7 — Output Protocol: Solo el Lider Redacta la Entrega Completa

Investigacion adicional revelo que la mayor ineficiencia en canales multi-agente (no solo laboratorio) proviene de **2 patrones humanos** que no aplican a agentes de IA.

### Causa Raiz

**7a. Halago antes de corregir ("sandwich feedback")**

| Donde ocurre | Archivo:Linea | Evidencia |
|---|---|---|
| **Leader fragments** no tienen instruccion anti-cortesia | `role-leader.ts:7-15` | Lider solo tiene "PROTOCOLO DE COORDINACION" — sin "SIN CHARLA DE CORTESIA" |
| **Member fragments** lo prohiben pero es negativo | `role-member.ts:7` | "SIN CHARLA DE CORTESIA" lucha contra el training base del LLM de "se amable" |
| **Protocol negotiation** lo prohibe pero igual | `protocol.ts:8` | "NUNCA comiences tu respuesta con cortesias" — misma lucha |
| **Identity** prompt base dice "Eres un asistente" | `identity.ts:7` | `Eres {name}, con el rol de {role}.\nInstrucciones de identidad:\n{systemPrompt}` — el system prompt del agente suele incluir "amable y servicial" |

El fragmento de member DICE "no sean corteses" con ~280 tokens, pero la mayoria de los agentes pasan por el identity fragment primero que los define como "asistentes" — y su training data los sesga a la cordialidad. El resultado es ~50-200 tokens de cortesia por respuesta que no aportan valor.

**7b. Repeticion de la entrega completa por cada agente en cada ronda**

| Donde ocurre | Archivo:Linea | Evidencia |
|---|---|---|
| `buildAgentPrompt()` envia historial COMPLETO | `agent-prompt-runner.ts:40-71` | `Conversation so far:\n${historyText}\n--- New message from ${senderLabel} ---\n${incomingMsg.content}` |
| Cada ronda pasa el mensaje COMPLETO del agente anterior | `channel-orchestrator.ts:442` | `currentIncomingMsg = result.agentMsg` — el contenido completo se pasa al siguiente |
| Los miembros no tienen restriccion de formato de output | `role-member.ts:7` | Solo dice "Se extremadamente breve" — no dice "solo incluye la linea que cambias" |
| El modo broadcast ejecuta AGENTES COMPLETOS secuencialmente | `channel-orchestrator.ts:399-518` | For loop sobre miembros, cada uno recibe el output completo del anterior |
| No hay post-procesamiento que extraiga diffs | `response-parser.ts` | `parseAgentResponse()` solo parsea silent/thinking — no detecta ni extrae repeticiones |

**La raiz:** El protocolo humano de "repetir el contexto para asegurar comprension" no tiene sentido entre agentes que comparten el mismo contexto de conversacion completo. Pero el sistema no diferencia entre el **rol del lider** (que SÍ debe presentar la propuesta completa al iniciar y al cerrar) y el **rol de los miembros especialistas** (que deberian solo senalar la linea a cambiar + porque).

### Solucion Propuesta: Output Protocol por Rol

```typescript
// Nuevo tipo en agent-prompt-runner.ts
type OutputMode = "full-proposal" | "diff-suggestion" | "final-proposal";

function getOutputMode(member: ChannelMember, channel: Channel): OutputMode {
  if (member.role === "lead") {
    // Lider: entrega completa al inicio y como propuesta final
    return "full-proposal";
  }
  if (channel.negotiationProtocol && member.agentId === channel.negotiationProtocol.arbiterAgentId) {
    // Arbitro: resolucion completa
    return "final-proposal";
  }
  // Miembros especialistas: solo diffs
  return "diff-suggestion";
}
```

**7.1 Fragmento `output-format.ts` — Nuevo sistema de formato por rol**

```typescript
// apps/server/src/core/prompts/fragments/output-format.ts
export const outputFormatFragments: PromptFragment[] = [
  {
    key: "output-format.full-proposal",
    category: "output-format",
    content: `FORMATO DE ENTREGA: PROPUESTA COMPLETA
Eres el líder y debes presentar la propuesta completa. Incluye todos los detalles necesarios.
NO incluyas cortesías, agradecimientos, ni preámbulos. Empieza directamente con la propuesta.`,
    priority: 1,
  },
  {
    key: "output-format.diff-suggestion",
    category: "output-format",
    content: `FORMATO DE ENTREGA: SUGERENCIAS CONCRETAS (DIFF)
NO redactes la propuesta completa. El líder ya la presentó y todos los agentes tienen acceso al contexto completo de la conversación.

Cada sugerencia debe incluir solo:
1. El punto específico a cambiar (target, linea o seccion)
2. El valor propuesto (reemplazo)
3. El motivo tecnico (breve, 15 palabras max por sugerencia)

Puedes listar todas las sugerencias que sean necesarias, cada una autonoma. Ejemplo:

security.policy: 'retentionDays: 90' -> 'retentionDays: 180' | PCI-DSS exige 180 dias
database.encryption: 'AES-128' -> 'AES-256-GCM' | Compliance del auditor
logging.level: 'info' -> 'debug' | Necesitamos trazar el breach anterior

NO incluyas: cortesias ("excelente propuesta", "gracias", "perfecto"), resumenes del contexto, ni propuestas completas. Solo las sugerencias.

Si no tienes cambios que sugerir, responde exactamente (silent).`,
    priority: 1,
  },
  {
    key: "output-format.final-proposal",
    category: "output-format",
    content: `FORMATO DE ENTREGA: PROPUESTA FINAL (RESOLUCIÓN)
Eres el líder o árbitro. Presenta la versión final completa de la propuesta, incorporando las sugerencias aceptadas de los miembros.

NO incluyas cortesías, agradecimientos, ni resúmenes del proceso. Solo la propuesta final.`,
    priority: 1,
  },
];
```

**7.2 Inyectar segun output mode en el composer**

```typescript
// En composer.ts, despues de las 4 capas existentes
const outputMode = getOutputMode(agentDef, deployment);
const outputFragments = promptFragmentRegistry.listByCategory("output-format", workspaceDir);
const matchedOutput = outputFragments.find(f => f.key === `output-format.${outputMode}`);
if (matchedOutput) {
  composed += `\n\n${matchedOutput.content}`;
}
```

**7.3 Post-procesamiento: forzar estructura diff**

```typescript
// En response-parser.ts — nuevo post-processor
export function enforceDiffFormat(response: string, outputMode: OutputMode): string {
  if (outputMode !== "diff-suggestion") return response;

  // Stripear automaticamente cualquier cortesia/felicitacion inicial
  return response.replace(
    /^(excelente|perfecto|gracias|buen|muy buena|me gusta|estoy de acuerdo|coincido|de acuerdo|buena idea|me parece bien)[^.!?\n]*[.!?]?\s*/i,
    ""
  );
}

  return stripped;
}
```

**7.4 Aplicar en agent-prompt-runner.run()**

```typescript
// Al final de run(), antes de construir agentMsg
const outputMode = getOutputMode(member, channel);
parseResult.content = enforceDiffFormat(parseResult.content, outputMode);
```

**7.5 Ahorro estimado para canales multi-agente**

| Escenario | Sin protocolo | Con protocolo diff |
|---|---|---|
| Respuesta tipica de miembro especialista | ~500-1500 tokens (repite contexto + cortesia + sugiere) | ~50-200 tokens (solo diff) |
| Rounds hasta consenso (3 miembros + lider) | ~12-15 rounds x ~3000 tokens c/u = ~36K-45K tokens | ~8-10 rounds x ~1000 tokens c/u = ~8K-10K tokens |
| **Ahorro total en canal multi** | — | **~70-75% menos tokens** |

---

## Fase 8 — Output Protocol en Canales (No solo Laboratorio)

Las fases 7 aplican a TODOS los canales multi-agente, no solo al laboratorio. Pero requieren cambios especificos en el pipeline de canales general.

### Archivos

- `apps/server/src/core/prompts/fragments/output-format.ts` — Nuevo
- `apps/server/src/core/prompts/registry.ts` — Registrar nuevo tipo de fragmento
- `apps/server/src/core/prompts/composer.ts` — Inyectar capa output-format
- `apps/server/src/channels/agent-prompt-runner.ts` — getOutputMode(), enforceDiffFormat()
- `apps/server/src/channels/response-parser.ts` — enforceDiffFormat()
- `apps/server/src/channels/channel-orchestrator.ts` — Pasar channel a promptRunner.run()

### Cambios

**8.1 Nuevo modo de output en ChannelMember**

En `packages/shared/src/schemas.ts`, agregar campo opcional al schema de ChannelMember:

```typescript
outputMode: z.enum(["full-proposal", "diff-suggestion", "final-proposal"]).optional(),
```

**8.2 valor por defecto en getOutputMode()**

```typescript
export function getOutputMode(member: ChannelMember, channel?: Channel): OutputMode {
  // 1. Si el miembro tiene configuracion explicita, usarla
  if (member.outputMode) return member.outputMode;

  // 2. Si es lider o arbitro, propuesta completa
  if (member.role === "lead") return "full-proposal";

  // 3. Si hay negotiationProtocol y este agente es el arbitro
  if (channel?.negotiationProtocol?.arbiterAgentId === member.agentId) return "final-proposal";

  // 4. Por defecto: diff-suggestion para miembros
  return "diff-suggestion";
}
```

**8.3 UI en el modal de miembros del canal**

En `AgentDetailPanel`, anadir un selector de output mode al lado de replyMode:
- full-proposal (lider/arbitro)
- diff-suggestion (miembros especialistas)
- final-proposal (solo lider/arbitro al cerrar)

**8.4 Fragmentos de output-mode en el composer**

Registrar la nueva categoria `output-format` en `PromptFragmentRegistry` para que soporte overrides via `prompt-overrides.json` igual que las demas capas.

### Migracion

- Canales existentes sin `outputMode` → usan `getOutputMode()` con defaults (member → diff-suggestion, lead → full-proposal)
- Backward compatible: no rompe ningun canal existente
- Canales nuevos pueden configurarlo explicitamente

---

## Archivos Afectados (Resumen)

| Archivo | Fase | Cambio |
|---|---|---|
| `apps/server/src/laboratory/scoring.ts` | 1 | Normalizar por numAgents + log2 penalty |
| `apps/server/src/laboratory/experiment-runner.ts` | 1, 3 | Reutilizar AgentServer, effectiveRounds |
| `apps/server/src/core/prompts/system-instructions.ts` | 2 | LAB_APPEND_INSTRUCTIONS |
| `apps/server/src/core/prompts/prompt-assembly.ts` | 2, 4 | Modo experiment-member, cache |
| `apps/server/src/core/prompts/composer.ts` | 2, 7, 8 | Stripear innecesarias, inyectar output-format layer |
| `apps/server/src/core/prompts/registry.ts` | 7, 8 | Nueva categoria output-format en PromptFragmentRegistry |
| `apps/server/src/core/prompts/fragments/output-format.ts` | 7, 8 | **Nuevo**: fragmentos full-proposal, diff-suggestion, final-proposal |
| `apps/server/src/channels/agent-prompt-runner.ts` | 4, 5, 7, 8 | Cache, bypass silent, getOutputMode(), enforceDiffFormat() |
| `apps/server/src/channels/channel-orchestrator.ts` | 5, 7, 8 | No appendMessage si silent, pasar channel a promptRunner |
| `apps/server/src/channels/response-parser.ts` | 5, 7 | Early exit silent, enforceDiffFormat() |
| `apps/server/src/laboratory/divergence-detector.ts` | 6 | Fast check + recent window |
| `apps/server/src/channels/channel-negotiation-handler.ts` | 6 | Pasar solo ultimos mensajes |
| `apps/server/src/agents/agent-registry.ts` | 3 | Soporte reset de sesion |
| `packages/shared/src/schemas.ts` | 8 | outputMode opcional en ChannelMember |
