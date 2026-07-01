# Gentle AI — Prompt Patterns para Subdelegación de Agentes

**Fecha:** 2026-07-01
**Origen:** [github.com/Gentleman-Programming/gentle-ai](https://github.com/Gentleman-Programming/gentle-ai) — SDD framework con 9 sub-agentes especializados

## Resumen Ejecutivo

Gentle AI implementa **Spec-Driven Development (SDD)** con un orchestrator + 9 sub-agentes de fase. Su arquitectura de delegación es la más madura que hemos visto en código abierto. Este documento extrae los patrones transferibles a CrewFactory, mapeándolos a nuestra arquitectura de channels, agentes programáticos y sesiones.

---

## 1. Separación Orchestrator / Executor

### El Patrón

El orchestrator es un **coordinador**, no un ejecutor. Nunca ejecuta trabajo directamente — delega a sub-agentes especializados y sintetiza resultados.

```
Orchestrator:            Sub-agente:
- Mantiene hilo ligero   - Contexto fresco (sin memoria)
- Decide QUÉ hacer       - Ejecuta CÓMO hacerlo
- Recolecta resultados   - Salva artifacts antes de responder
- Valida outputs         - Devuelve envelope estructurado
```

### Prompt clave

```
You are a COORDINATOR, not an executor.
Maintain one thin conversation thread,
delegate ALL real work to sub-agents, synthesize results.
```

### Gate Anti-delegación en skills

Cada skill de fase tiene un **ORCHESTRATOR GATE** al inicio:

```
> **ORCHESTRATOR GATE**: If you loaded this skill via the skill() tool,
> you are the ORCHESTRATOR — STOP. Do NOT execute these instructions inline.
> Delegate to the dedicated `sdd-{phase}` sub-agent.
```

Y un **Executor Override** justo después:

```
If you ARE the `sdd-{phase}` sub-agent (NOT the orchestrator),
the gate above does NOT apply to you. Continue with the phase work below.
Do NOT delegate. Do NOT call the Skill tool. You are the executor — execute.
```

### Aplicación a CrewFactory

**En channels:** El `ChannelOrchestrator` es un orchestrator puro. Cada agente del canal es un executor. Actualmente ya es así, pero podemos reforzar:
- El system prompt del channel debería incluir un gate similar para que los agentes no intenten orquestrar entre ellos
- Los agentes reciben contexto fresco por dispatch (ya se hace con `agent.reset()`)

**En agentes programáticos:** El `AgentServer` actúa como executor. Si en futuro tenemos un meta-agent que delega a otros, usar este mismo patrón.

---

## 2. Tabla de Decisión de Delegación

### El Patrón

Reglas exactas de cuándo delegar vs. ejecutar inline:

| Acción | Inline | Delegar |
|--------|--------|---------|
| Leer para decidir/verificar (1-3 files) | ✅ | — |
| Leer para explorar/entender (4+ files) | — | ✅ |
| Leer como preparación para escribir | — | ✅ (junto con la escritura) |
| Escribir atómico (1 file, mecánico) | ✅ | — |
| Escribir con análisis (multi-file, lógica nueva) | — | ✅ |
| Bash para estado (git, gh) | ✅ | — |
| Bash para ejecución (test, build, install) | — | ✅ |

### Mandatory Delegation Triggers (hard gates)

1. **4-file rule**: Leer 4+ archivos → delegar exploración
2. **Multi-file write rule**: Tocar 2+ archivos no triviales → delegar implementación
3. **PR rule**: Antes de commit/push → run review lens
4. **Incident rule**: Error de cwd, merge recovery → run audit
5. **Long-session rule**: ~20 tool calls o 5 file reads sin delegación → pausar y delegar
6. **Fresh review rule**: Contexto fresco para revisión adversarial

### Aplicación a CrewFactory

Actualmente nuestro channel orchestrator NO tiene estas reglas. Podemos inyectarlas como system prompt en el channel:

```
## Delegation Protocol for Channel Agents

You are an executor, not an orchestrator. Do NOT delegate to other agents.
Do NOT ask other agents for help — focus on your assigned work.

When you receive a task:
- If it requires reading 4+ files → report "exploration needed: {scope}"
- If it requires writing 2+ files → do it, report progress per file
- Before git push → run review checklist
```

---

## 3. Result Contract (Envelope Estructurado)

### El Patrón

Cada sub-agente devuelve un envelope con campos fijos:

```yaml
status: success | partial | blocked
executive_summary: "1-3 sentence summary"
detailed_report: "(optional) full output"
artifacts: ["list of artifact keys/paths written"]
next_recommended: "next SDD phase or 'none'"
risks: "risks discovered, or 'None'"
skill_resolution: paths-injected | fallback-registry | fallback-path | none
```

### Regla crítica: Response Ordering

```
Your FINAL output MUST be text (the return envelope), NOT a tool call.
If you need to save artifacts (mem_save), do it BEFORE your final text response.
Do NOT call mem_session_summary — that's for top-level agents only.
```

**Razón:** Cuando un sub-agente termina con un tool call, el padre recibe solo el resultado del tool — el análisis real se pierde.

### Aplicación a CrewFactory

En channels, cada agente podría devolver un envelope estructurado en lugar de texto libre:

```typescript
interface AgentDispatchResult {
  status: "success" | "blocked" | "deferred";
  content: string;           // mensaje visible en el channel
  summary: string;           // 1-3 sentences para el orchestrator
  artifacts: string[];       // archivos creados/modificados
  requiresFollowUp: boolean; // si necesita otra ronda
}
```

Esto permitiría al `ChannelOrchestrator` tomar decisiones de ruteo basadas en estado, no en texto libre.

---

## 4. Dependency Graph con Read/Write Matrix

### El Patrón

Cada fase declara explícitamente qué lee y qué escribe:

```
proposal -> specs --> tasks -> apply -> verify -> archive
             ^
             |
           design
```

| Phase | Reads | Writes |
|-------|-------|--------|
| explore | nothing | explore |
| propose | exploration (optional) | proposal |
| spec | proposal (required) | spec |
| design | proposal (required) | design |
| tasks | spec + design (required) | tasks |
| apply | tasks + spec + design + apply-progress | apply-progress |
| verify | spec + tasks + apply-progress | verify-report |
| archive | all artifacts | archive-report |

### Aplicación a CrewFactory

**En canales:** no tenemos fases SDD, pero el concept de read/write matrix aplica al flujo de trabajo:

- Cuando un agente recibe un mensaje, debería declarar qué necesita leer y qué va a producir
- El orchestrator del canal puede usar esta info para decidir orden de dispatch
- Paralelizar agentes que solo leen vs serializar los que escriben

---

## 5. Gatekeeper Pattern (Validación Automática entre Fases)

### El Patrón

Entre cada fase, el orchestrator ejecuta un gatekeeper que verifica:

1. **Contract conformance**: status, artifacts devueltos
2. **Artifact existence**: el artifact declarado existe y es legible
3. **No hallucination**: file paths, symbols existen realmente
4. **No drift from inputs**: el output es consistente con los inputs requeridos
5. **Routing coherence**: `next_recommended` sigue el dependency graph

**Costo adaptativo:**
- Fases low-risk (explore, spec, tasks, archive): validación inline (el orchestrator lee el artifact)
- Fases high-risk (design, apply): delegar a sub-agente reviewer con contexto fresco

**On FAIL:** re-run misma fase 1 vez con feedback correctivo. Si falla otra vez → STOP.

### Aplicación a CrewFactory

**En channels:** después de que un agente responde, el channel orchestrator podría:
1. Verificar que la respuesta no es vacía ni `(silent)` incorrecto
2. Verificar que los archivos declarados existen
3. Si hay error, re-dispatch al mismo agente con feedback (máx 1 reintento)

**En task runner:** el supervisor loop (Phase 14) ya hace algo similar. Podemos reforzar con gatekeeper entre steps.

---

## 6. Context Protocol: Fresco por Defecto

### El Patrón

- **Sub-agentes**: contexto fresco, sin memoria
- **Orchestrator**: controla todo el acceso al contexto
- **Non-SDD**: orchestrator busca en Engram, pasa contexto en el prompt
- **SDD phases**: sub-agentes leen directamente del backend usando referencias de artifacts

### Skill Resolution Protocol

El orchestrator resuelve skills UNA vez por sesión y pasa paths exactos:

```
## Skills to load before work
Read these exact files before reading, writing, reviewing, testing, or creating artifacts:
- /absolute/path/to/skills/go-testing/SKILL.md
- /absolute/path/to/skills/typescript/SKILL.md
```

Feedback loop: el sub-agente devuelve `skill_resolution` y si fue `fallback-*`, el orchestrator relee el registro.

### Aplicación a CrewFactory

Esto ya se parece a nuestro sistema de `getResolvedSkillPaths(username)`. Podemos mejorar:
- Que el session-manager (orchestrator) resuelva skills UNA vez por sesión y pase paths absolutos
- Cada dispatch de agente recibe `## Skills to load before work` en su prompt
- El agente responde con `skill_resolution` para detectar si el cache se perdió

---

## 7. Review Lens Selection (4R Model)

### El Patrón

Cuatro tipos de review, seleccionados por perfil de riesgo:

| Señal de riesgo | Review lens |
|----------------|-------------|
| Naming, estructura, mantenibilidad | `review-readability` |
| Comportamiento, tests, determinismo | `review-reliability` |
| Shell, fallos parciales, recovery | `review-resilience` |
| Seguridad, permisos, data exposure | `review-risk` |
| PR grande, hot path, >400 líneas | Full 4R |

### Aplicación a CrewFactory

Los canales podrían tener un paso de "review" opcional después de implementación:
- El channel orchestrator, después de un dispatch de implementación, lanza un agente revisor
- El revisor se selecciona según el tipo de cambio detectado en el mensaje del agente
- Esto daría una dinámica de "pair programming" dentro del canal

---

## 8. Model Assignment Table

### El Patrón

Diferentes modelos para diferentes fases:

| Phase | Modelo | Razón |
|-------|--------|-------|
| explore | sonnet | Lee código, estructural |
| propose | opus | Decisiones arquitectónicas |
| spec | sonnet | Escritura estructurada |
| design | opus | Decisiones de arquitectura |
| tasks | sonnet | Desglose mecánico |
| apply | sonnet | Implementación |
| verify | sonnet | Validación contra spec |
| archive | haiku | Copiar y cerrar |

### Aplicación a CrewFactory

Ya tenemos `ModelSelector` y modelos por sesión. Podríamos añadir:
- Modelo por rol de agente en el canal (el agente de diseño usa Opus, el de implementación usa Sonnet)
- El `ChannelMember` schema podría incluir `preferredModel`
- El orchestrator asigna modelo según la tarea

---

## 9. Sub-Agent Launch Deduplication

### El Patrón

El orchestrator mantiene un log session-scoped de `(phase, task-fingerprint)` y nunca lanza el mismo par dos veces. Esto previene:
- Duplicados que causan "File has been modified since it was last read"
- Token waste

### Aplicación a CrewFactory

En channels paralelos (plan parallel-agent-dispatch), la `AgentWorkQueue` ya hace esto naturalmente — un agente no puede tener dos dispatch requests del mismo tipo en paralelo. Pero podemos añadir:
- El channel orchestrator mantiene un set de `(agentId, messageId)` para no re-dispatch el mismo mensaje al mismo agente
- Útil cuando hay propagación de rondas y el mismo mensaje podría llegar两次 al mismo agente por diferentes rutas

---

## 10. Review Workload Guard (400-line Budget)

### El Patrón

Antes de `apply`, el orchestrator revisa si el cambio estimado excede 400 líneas. Si es así:
- **ask-on-risk** (default): pregunta al usuario
- **auto-chain**: parte en PRs encadenados automáticamente
- **single-pr**: requiere `size:exception`
- **exception-ok**: registra excepción y sigue

### Aplicación a CrewFactory

No tenemos PRs nativos, pero el concepto aplica al **Task Runner**:
- Si un task tiene subtasks que suman >400 líneas de cambio, el runner podría sugerir partir en batches
- Cada batch se ejecuta y verifica independientemente antes del siguiente

---

## 11. Structured Status Contract (Machine-readable Schema)

### El Patrón

El estado de un cambio SDD se representa como schema versionado:

```yaml
schemaName: gentle-ai.sdd-status
schemaVersion: 1
changeName: "my-feature"
artifacts:
  proposal: done
  specs: done
  design: done
  tasks: partial
  applyProgress: missing
  verifyReport: missing
dependencies:
  apply: blocked
  verify: blocked
nextRecommended: tasks
blockedReasons: []
```

### Aplicación a CrewFactory

En channels, el estado de una ejecución podría tener un schema similar:
- `channel-orchestrator` emite estado estructurado después de cada ronda
- El frontend usa este schema para mostrar progreso
- Permite reanudar ejecuciones interrumpidas

---

## 12. Persistence Contract (Response Ordering)

### El Patrón

Reglas estrictas de persistencia:

```
1. Save artifacts FIRST (mem_save / file write)
2. THEN return text response
3. NEVER end with a tool call
4. NEVER call mem_session_summary (solo para top-level agents)
```

La razón es técnica: cuando un sub-agente termina con un tool call, el padre recibe solo el resultado del tool, perdiendo el análisis.

### Aplicación a CrewFactory

En channels con streaming, esto es relevante:
- El agente debe guardar cualquier resultado importante (memoria, archivo) ANTES de devolver el mensaje de texto
- Si el agente termina con un tool call, el último token de streaming puede perderse
- Podemos forzar esto en el system prompt del channel

---

## Resumen de Patrones Transferibles

| # | Patrón | Prioridad | Esfuerzo | Impacto |
|---|--------|-----------|----------|---------|
| 1 | Orchestrator/Executor separation | Alta | Bajo | Reforzar system prompts existentes |
| 2 | Delegation decision table | Media | Bajo | Inyectar en channel system prompt |
| 3 | Result contract (structured envelope) | Alta | Medio | Nuevo tipo de respuesta en channels |
| 4 | Dependency graph with read/write matrix | Media | Alto | Planificar orden de dispatch |
| 5 | Gatekeeper pattern | Alta | Medio | Post-dispatch validation en channels |
| 6 | Context protocol (fresh per sub-agent) | Alta | Bajo | Ya implementado parcialmente |
| 7 | Review lens (4R model) | Baja | Alto | Feature futura para channels |
| 8 | Model assignment table | Media | Bajo | Añadir preferredModel a ChannelMember |
| 9 | Launch deduplication | Media | Bajo | Set en channel-orchestrator |
| 10 | Review workload guard | Baja | Alto | Para task runner futuro |
| 11 | Structured status contract | Media | Medio | Estado de channel execution |
| 12 | Persistence contract (response ordering) | Alta | Bajo | System prompt tweak |

### Próximos Pasos Recomendados

1. **Corto plazo (1-2 sesiones):**
   - Añadir `ORCHESTRATOR GATE` y `Executor Override` a los system prompts de channel y agentes
   - Implementar `DispatchResult` envelope estructurado en channel-orchestrator
   - Añadir `skill_resolution` feedback loop en session-manager

2. **Medio plazo (3-5 sesiones):**
   - Gatekeeper pattern: validación post-dispatch con reintento
   - Model assignment per channel member role
   - Status contract para channel executions

3. **Largo plazo:**
   - Review lens system para channels (code review automatizado)
   - Review workload guard para task runner
   - Full SDD-like pipeline dentro de channels
