COMPLETED
# Análisis del Sistema de Prompting por Capas

**Fecha:** 2026-07-13
**Alcance:** Evaluación completa de robustez, coherencia y gaps del sistema de prompting en capas, sistema de roles y sistema de targeting/replyMode en canales multi-agente.

---

## 1. El Sistema Actual: Resumen Ejecutivo

El sistema de prompting tiene **4 capas** (identidad, rol, instancia, protocolo) compuestas por 9 fragmentos, ensamblados según el `DeploymentContext`. Los roles (`lead`, `senior`, `member`, `observer`) y los modos de respuesta (`user-only`, `broadcast`, `targeted`, `mention-only`) operan de forma **completamente independiente**: sin validación cruzada, 16 combinaciones posibles, y solo `lead` tiene efecto funcional real en los prompts.

### Hallazgos clave

| Aspecto | Estado | Severidad |
|---------|--------|-----------|
| Rol `lead` vs replyMode | Sin vinculación | **Alta** |
| Múltiples leaders | Ambos son árbitros, caos potencial | **Alta** |
| `senior` / `observer` | Solo efecto visual, idénticos a `member` en prompts | **Media** |
| `mention-only` + `lead` | Líder que solo habla si lo mencionan (contradictorio) | **Alta** |
| `user-only` + `lead` | Líder que no recibe mensajes del equipo | **Alta** |
| Canales sin leader | No hay coordinador pero modo sigue siendo `broadcast` | **Media** |
| Validación cruzada | Inexistente en backend y frontend | **Media** |

---

## 2. Matriz Completa de Combinaciones

### 2.1 Combinaciones por Composición de Agentes

Se analizan **8 configuraciones canónicas** que cubren todas las topologías posibles:

| # | Configuración | Agentes | Roles | Escenario típico |
|---|--------------|---------|-------|-----------------|
| **C1** | Solo (1 agente) | 1 | Cualquiera | Agente único en laboratorio (baseline) |
| **C2** | Broadcast sin líder | 2+ | Todos `member` | Debate horizontal (lab multiNoLeader) |
| **C3** | Jerárquico canónico | 3+ | 1 `lead` + N `member` | Equipo con líder (lab multiWithLeader) |
| **C4** | Múltiples líderes | 3+ | 2+ `lead` + resto `member` | Co-liderazgo, sin coordinador único |
| **C5** | Miembros con targeting hub | 2+ | 1 `lead` + N `member`, targeted al líder | Jerárquico con hub de comunicación |
| **C6** | Solo observadores | 2+ | Todos `observer` | Canal de monitoreo/supervisión |
| **C7** | Mixto sin líder | 3+ | `senior` + `member` + `observer` | Equipo plano con seniority visual |
| **C8** | Mention-only general | 2+ | Cualquiera con `replyMode: "mention-only"` | Agentes pasivos, solo bajo demanda |

### 2.2 Análisis Prompt por Configuración

#### C1: Solo (1 agente)

**Prompt resultante:**
- Layer 1: `identity.agent_core` — Identidad del agente
- Layer 2: *(omitida, modo solo)*
- Layer 3: `instance.solo` — "Estás operando de forma autónoma"
- Layer 4: *(omitida, sin negotiationProtocol)*

**Evaluación:** Robusto. El agente recibe instrucciones claras de autonomía. Sin ambigüedades.

**Gaps:** Ninguno.

---

#### C2: Broadcast sin líder (todos `member`, `replyMode: "broadcast"`)

**DeploymentContext:**
- `mode`: `"broadcast"` (porque al menos un miembro tiene replyMode broadcast)
- `agentRole`: `"member"` (para todos)
- `isArbiter`: `false` (para todos, nadie es lead)

**Prompt resultante para cada agente:**
- Layer 1: `identity.agent_core`
- Layer 2: `role.member.communication` — Protocolo de colaboración con silent mode
- Layer 3: `instance.channel.roster` + `instance.channel.broadcast` — "Todos ven todo, sin coordinador central"
- Layer 4: *(omitida, sin negotiationProtocol)*

**Evaluación:** Robusto para el caso de uso. Sin embargo:

**Gaps:**
- Sin `negotiationProtocol` habilitado, no hay detección de acuerdo/rechazo. La orquestación depende solo de silent equilibrium (2 rondas silenciosas) y maxChainDepth.
- Si se habilita `negotiationProtocol`, todos los agentes recibirían `protocol.negotiation` (porque ninguno es árbitro), y la escalación no tendría destinatario (no hay leader/arbiterAgentId).
- **Riesgo:** Sin árbitro, un deadlock de negociación no se puede resolver automáticamente.

---

#### C3: Jerárquico canónico (1 `lead` + N `member`, `replyMode: "targeted"`)

**DeploymentContext:**
- `mode`: `"targeted"` (porque hay leader)
- Líder: `agentRole: "lead"`, `isArbiter: true`
- Miembros: `agentRole: "member"`, `isArbiter: false`

**Prompt del líder:**
- Layer 1: `identity.agent_core`
- Layer 2: `role.leader.delegation` + `role.leader.communication`
- Layer 3: `instance.channel.roster` + `instance.channel.targeted` — "El líder coordina, responde si eres mencionado"
- Layer 4: `protocol.arbitration` (si negotiationProtocol habilitado)

**Prompt de miembros:**
- Layer 1: `identity.agent_core`
- Layer 2: `role.member.communication`
- Layer 3: `instance.channel.roster` + `instance.channel.targeted` — "Si no eres el líder, responde cuando seas mencionado"
- Layer 4: `protocol.negotiation` (si negotiationProtocol habilitado)

**Evaluación:** Robusto. Es la configuración mejor soportada. El líder coordina, los miembros colaboran bajo demanda, y hay arbitraje para deadlocks.

**Gaps:**
- Si el líder tiene `replyMode: "user-only"`, nunca recibe mensajes del equipo → no puede coordinar. Las capas 2 y 3 le dicen que coordine, pero `resolveRecipients()` nunca le entrega mensajes de otros agentes.
- Si un miembro tiene `replyMode: "user-only"`, el líder le asigna tareas pero el miembro nunca las recibe (solo ve mensajes del usuario).

---

#### C4: Múltiples líderes (2+ `lead`, resto `member`)

**DeploymentContext:**
- `mode`: `"targeted"` (porque hay al menos un leader)
- Ambos líderes: `agentRole: "lead"`, `isArbiter: true`
- Miembros: `agentRole: "member"`, `isArbiter: false`

**Prompt de cada líder:**
- Layer 2: `role.leader.delegation` — "Eres el LÍDER de esta tripulación. Tu responsabilidad principal es coordinar..."
- Layer 4: `protocol.arbitration` — "Actúas como árbitro en caso de bloqueo. Emite una decisión final y vinculante."

**Problema:** Ambos líderes reciben instrucciones de ser "EL líder" (singular) y "EL árbitro". No hay directriz sobre co-liderazgo:
- ¿Quién delega a quién?
- ¿Qué pasa si los dos líderes dan instrucciones contradictorias a un miembro?
- Si ambos emiten veredictos vinculantes, ¿cuál prevalece?
- Los miembros reciben `role.member.communication` que solo contempla un líder implícito.

**Evaluación:** **No robusto.** El sistema no contempla co-liderazgo. Las capas 2 y 4 asumen un único líder.

---

#### C5: Miembros con targeting hub (1 `lead`, N `member` con `targetAgentIds: [leaderId]`)

**DeploymentContext:** Igual que C3.

**Comportamiento en `resolveRecipients()`:**
- Los miembros solo reciben mensajes del líder (targeted al leaderId).
- El líder recibe mensajes de todos (targeted a `__user__` + todos los agentes).

**Evaluación:** Robusto si se configura correctamente. Es una mejora sobre C3 porque previene que los miembros se interrumpan entre sí.

**Gaps:**
- La UI no guía al usuario hacia esta configuración. No hay preset "Jerárquico con hub".
- Si el líder cambia de `agentId` (poco probable pero posible), todos los `targetAgentIds` quedan rotos.

---

#### C6: Solo observadores (todos `observer`, cualquier replyMode)

**DeploymentContext:**
- `agentRole`: `"observer"` (se resuelve como `"member"` en el composer)
- `isArbiter`: `false`

**Prompt resultante:** Idéntico a C2 (todos `member`), solo cambia lo visual.

**Problema:** El rol `observer` se diseñó para "observar sin intervenir", pero:
- El prompt (`role.member.communication`) les dice que colaboren y produzcan entregables.
- `resolveRecipients()` les entrega mensajes igual que a un `member`.
- Solo se diferencian en el `ROLE_THEME` visual (borde dashed, opacidad).

**Evaluación:** **El rol `observer` no tiene efecto funcional.** Es puramente cosmético.

---

#### C7: Mixto sin líder (`senior` + `member` + `observer`, sin `lead`)

**DeploymentContext:**
- `mode`: `"broadcast"` (porque no hay leader → el ternario cae a broadcast)
- `agentRole`: cada uno con su string (`"senior"`, `"member"`, `"observer"`)
- Todos reciben Layer 2: `role.member.communication`

**Problema:** El rol `senior` no tiene fragmento de prompt propio ni comportamiento diferenciado. Es indistinguible de `member` a nivel funcional. La intención del usuario al marcar un agente como `senior` es darle más peso/ autoridad, pero el sistema lo trata igual.

**Evaluación:** **Rol `senior` y `observer` son decorativos.** No cumplen su propósito semántico.

---

#### C8: Mention-only general (agentes con `replyMode: "mention-only"`)

**DeploymentContext:** Depende de los roles. El replyMode `mention-only` no afecta el `mode` del DeploymentContext (que se determina por presencia de `broadcast` y/o `lead`).

**Prompt:** El agente recibe fragments según su rol (leader/member) sin ninguna indicación de que está en modo "solo si me mencionan". Las capas 3 y 4 no mencionan el replyMode del agente individual.

**Problema:** Un agente en `mention-only` recibe el mismo prompt que uno en `broadcast`. El prompt le dice "colabora y coordina", pero `resolveRecipients()` nunca le entrega mensajes a menos que lo mencionen. Hay una **discrepancia semántica** entre lo que el prompt instruye y lo que el sistema permite.

**Evaluación:** **Incoherencia prompt-comportamiento.** Las capas no reflejan el replyMode individual.

---

## 3. Análisis de la Relación Rol ↔ Targeting

### 3.1 Estado actual: Desacople total

```
┌──────────┐          ┌──────────────┐
│   ROL    │          │  REPLY MODE  │
│          │          │              │
│ lead     │   ???    │ user-only    │
│ senior   │──────────│ broadcast    │
│ member   │   sin    │ targeted     │
│ observer │ conexión │ mention-only │
└──────────┘          └──────────────┘

         │                    │
         ▼                    ▼
   Prompt Fragments    resolveRecipients()
   (qué PIENSA)        (a quién RECIBE)
```

**Consecuencia:** Un agente puede "pensar" que es líder (recibe fragments de líder) pero "actuar" como observador pasivo (replyMode `mention-only`). O viceversa: "pensar" que es miembro pero recibir todos los mensajes (`broadcast`).

### 3.2 ¿Deberían estar vinculados?

**Argumentos a favor de la vinculación:**

1. **Coherencia semántica:** Si un agente es `lead`, debe poder recibir mensajes del equipo para coordinar. ReplyMode `user-only` o `mention-only` contradicen su rol.

2. **Reducción de configuraciones inválidas:** 16 combinaciones posibles, pero ~8 son incoherentes. Vincular reduce la superficie de error del usuario.

3. **Prompts más precisos:** Si el replyMode informa al prompt, el agente sabe exactamente cuándo y cómo responder. Ej: "Eres líder, coordinas al equipo. Recibirás todos los mensajes de los miembros."

4. **Defaults inteligentes:** Al asignar `role: "lead"`, el replyMode podría ser automáticamente `broadcast` (o `targeted` con todos los miembros en targetAgentIds).

**Argumentos en contra de una vinculación rígida:**

1. **Flexibilidad:** Un usuario avanzado podría querer un líder que solo interviene cuando se le menciona (para no microgestionar).

2. **Casos de borde válidos:** Un `observer` con `broadcast` podría ser útil para un agente que monitorea todo pero no interviene (aunque necesitaría un fragmento de prompt específico).

### 3.3 Recomendación: Vinculación semántica con escape hatch

| Rol | ReplyMode sugerido por defecto | Fragmento de prompt específico |
|-----|-------------------------------|-------------------------------|
| `lead` | `broadcast` (o `targeted` con todos) | `role.leader` existente |
| `senior` | `broadcast` | **NUEVO:** `role.senior` con autoridad intermedia |
| `member` | `targeted` (al líder, si existe) | `role.member` existente |
| `observer` | `mention-only` | **NUEVO:** `role.observer` con instrucciones de no intervenir |

**Regla de validación sugerida:**
- `lead` + `user-only` → advertir (el líder no recibirá mensajes del equipo)
- `lead` + `mention-only` → advertir (el líder solo hablará si lo mencionan)
- `observer` + `broadcast` → advertir pero permitir (monitor activo)
- Sin `lead` + sin `broadcast` → el canal no tiene coordinador ni visibilidad compartida

---

## 4. Gaps Detectados por Capa

### Capa 1: Identity
**Estado:** Robusta.
**Gaps:** Ninguno significativo. La identidad se resuelve del `agentDef` correctamente.

### Capa 2: Role
**Estado:** Funcional para `lead` y `member`, **incompleta para `senior` y `observer`**.

**Gaps:**
- **G2.1:** `senior` y `observer` no tienen fragmentos de prompt propios. Usan `role.member` que es inapropiado (les dice que colaboren como pares cuando deberían tener comportamiento diferenciado).
- **G2.2:** El fragmento `role.leader` asume líder único ("Eres EL líder"). No contempla co-liderazgo.
- **G2.3:** Ningún fragmento de rol menciona el replyMode del agente. El agente no sabe si está en modo broadcast, targeted, o mention-only.

### Capa 3: Instance
**Estado:** Robusta para los modos base.

**Gaps:**
- **G3.1:** `instance.channel.targeted` dice "El líder del canal coordina" incluso si el agente actual NO es el líder. Sería más preciso: "El líder ({{leaderName}}) coordina. Como {{yourRole}}, responde cuando seas mencionado."
- **G3.2:** El roster no incluye el replyMode de cada miembro. Sería útil: `@Alice (lead, broadcast), @Bob (member, mention-only)`.
- **G3.3:** No hay fragmento para `mention-only` como modo de canal. Si todos los agentes son `mention-only`, el roster es el mismo pero el comportamiento esperado es radicalmente distinto.

### Capa 4: Protocol
**Estado:** Robusta para `lead` como árbitro único.

**Gaps:**
- **G4.1:** Sin líder, no hay árbitro. Si se habilita `negotiationProtocol` en un canal sin líder, los deadlocks no tienen resolución.
- **G4.2:** Con múltiples líderes, ambos son árbitros. No hay protocolo de arbitraje colegiado ni tie-breaking.
- **G4.3:** El `arbiterAgentId` del `NegotiationProtocol` y el `role: "lead"` son fuentes de verdad separadas para "quién es el árbitro". Pueden divergir.

### Capa Transversal: DeploymentContext
**Gaps:**
- **G5.1:** `buildDeploymentContext()` en `deployment-context.ts` determina `mode` como `"targeted"` si hay leader, pero no verifica que el leader tenga un replyMode que le permita recibir mensajes del equipo.
- **G5.2:** `isArbiter = selfMember?.role === "lead"` — ignora `arbiterAgentId` del negotiationProtocol.

---

## 5. Gaps por Configuración (Matriz de Riesgo)

| Configuración | Prompt Coherente | Targeting Coherente | Resolución Deadlocks | Riesgo |
|---------------|:---:|:---:|:---:|:---:|
| **C1** Solo | ✅ | N/A | N/A | Bajo |
| **C2** Broadcast sin líder | ✅ | ✅ | ❌ Sin árbitro | Medio |
| **C3** Jerárquico canónico | ✅ | ⚠️ Según replyMode | ✅ Vía líder | Bajo |
| **C4** Múltiples líderes | ❌ Singular vs plural | ⚠️ | ❌ Árbitros múltiples | **Alto** |
| **C5** Hub con targeting | ✅ | ✅ | ✅ | Bajo |
| **C6** Solo observadores | ❌ Prompt de member | ✅ | ❌ Sin árbitro | Medio |
| **C7** Mixto sin líder | ❌ senior = member | ✅ | ❌ Sin árbitro | Medio |
| **C8** Mention-only | ❌ Prompt no refleja modo | ✅ | N/A | Medio |

---

## 6. Recomendaciones

### Prioridad Alta (Producción)

1. **Vincular rol y replyMode con defaults inteligentes:**
   - Al asignar `role: "lead"`, auto-configurar `replyMode: "broadcast"` y `targetAgentIds` a todos los miembros.
   - Validar en backend y advertir en frontend combinaciones incoherentes.
   - Archivo: `apps/server/src/routes/channels.ts` + `apps/client/src/components/channels/ChannelMembersModal.tsx`

2. **Fragmentos de prompt para `senior` y `observer`:**
   - `role.senior.*`: Protocolo de autoridad intermedia (puede revisar, aprobar, sugerir pero no tiene decisión final).
   - `role.observer.*`: Protocolo de solo-lectura (monitorear, reportar anomalías, no intervenir).
   - Archivos: `apps/server/src/core/prompts/fragments/role-senior.ts`, `role-observer.ts`

3. **Resolver el problema de múltiples líderes:**
   - Opción A (simple): Prevenir en validación — máximo 1 `lead` por canal.
   - Opción B (flexible): Si hay múltiples líderes, designar uno como `primary` en la UI y usar `arbiterAgentId` para arbitraje.
   - Recomiendo Opción A inicialmente, B como mejora futura.

4. **Inyectar replyMode en los fragments de prompt:**
   - `instance.channel.targeted` debe saber si el agente actual es el líder o un miembro.
   - Agregar variable `{{replyMode}}` a los templates de instance para que el agente sepa su modo de recepción.

### Prioridad Media (Calidad)

5. **Roster enriquecido con replyMode:**
   - `instance.channel.roster`: Incluir replyMode de cada miembro en el roster.
   - Ej: `@Alice (lead, broadcast), @Bob (member, mention-only)`

6. **Validación de coherencia replyMode en DeploymentContext:**
   - `buildDeploymentContext()` debe advertir si el líder tiene replyMode que limita su capacidad de coordinar.

7. **Arbitraje sin líder:**
   - Si `negotiationProtocol` está habilitado pero no hay `lead` ni `arbiterAgentId`, asignar un árbitro por round-robin o usar un algoritmo de consenso simple.

8. **Soporte para co-liderazgo (futuro):**
   - Fragmento `role.co-lead.*`: Protocolo de coordinación entre líderes.
   - Round-robin de arbitraje entre co-líderes.

---

## 7. Plan de Acción Propuesto

### Fase 1: Roles funcionales (senior, observer)
- Crear `role-senior.ts` y `role-observer.ts`
- Actualizar `registry.ts` y `composer.ts` para mapear los nuevos roles
- Los fragments existentes de `role.member` quedan para `member` exclusivamente

### Fase 2: Vinculación rol ↔ replyMode
- Backend: Validación en `POST/PATCH /api/channels/:id/members`
- Frontend: Auto-selección de replyMode al cambiar rol en dropdowns
- Frontend: Warning visual en combinaciones incoherentes

### Fase 3: Mejora de fragments con contexto dinámico
- Templates con variables: `{{replyMode}}`, `{{leaderName}}`, `{{yourRole}}`
- Roster enriquecido con replyMode
- Fragmentos condicionales según replyMode individual

### Fase 4: Restricción de líder único
- Backend: `max 1 lead per channel` en validación
- Frontend: Deshabilitar opción `lead` si ya existe uno
- UI: Indicador visual de "líder del canal"

### Fase 5: Robustez de arbitraje
- Validar que `arbiterAgentId` existe en members al guardar
- Fallback: si no hay árbitro pero hay negotiationProtocol, usar round-robin
- Unificar `arbiterAgentId` con `role: "lead"` como fuente única de verdad

---

## 8. Conclusión

El sistema de prompting por capas es **sólido en su arquitectura** pero **incompleto en su implementación**. La separación en 4 capas es correcta y escalable. Los problemas están en:

1. **Roles `senior` y `observer` sin efecto funcional** — existen en el schema y la UI pero no en los prompts.
2. **Desacople total entre rol y targeting** — permite configuraciones incoherentes que degradan la experiencia.
3. **Asunciones de líder único** — las capas 2 y 4 no contemplan múltiples líderes ni ausencia de líder.

Con las 5 fases propuestas, el sistema alcanzaría un nivel de robustez profesional adecuado para producción, eliminando las 16 combinaciones inválidas y dando propósito funcional a cada rol.
