COMPLETED
# Plan: Modo de Ejecución "Autonomous" — Sin Confirmación

**Severidad:** Media
**Prioridad:** Media
**Esfuerzo estimado:** 2-3 días
**Riesgo:** Medio (bypassea confirmación humana para herramientas de modificación)
**Área:** Funcionalidad / Subagentes + Agentes Principales

---

## Resumen

Actualmente existen **dos** dimensiones separadas para controlar permisos:

### Subagentes (`spawn_subagent`)

| Tipo | write/edit/bash | Confirmación |
|------|-----------------|--------------|
| `explorer` | **deny** (solo lectura) | N/A |
| `builder` | **ask** (pide confirmación) | `request_approval` tool |

### Agentes principales

| Preset UI | write/edit/bash | Confirmación |
|-----------|-----------------|--------------|
| Solo Lectura | **deny** (vía tool filter) | N/A |
| Acceso Total | **allow** silencioso (dentro del workspace) | Solo para `rm -rf`, escritura fuera de workspace, `chmod -R` |

**El problema:** No existe el concepto de "autonomous" como modo unificado. Para subagentes, todo write/edit/bash pide confirmación. Para agentes principales, write/edit/bash es silencioso pero no hay un modo "standard con confirmación" ni un flag explícito de "autonomous".

**Propuesta:** Unificar los 3 modos de ejecución en un solo concepto que aplique tanto a subagentes como a agentes principales:

| Modo | Subagente (`subagentType`) | Agente principal (preset UI) | Comportamiento |
|------|---------------------------|------------------------------|----------------|
| **Read-Only** | `explorer` | Solo Lectura | write/edit/bash → deny |
| **Standard** | `builder` | *(nuevo preset)* Standard | write/edit/bash → ask (confirma con usuario) |
| **Autonomous** | *(nuevo)* `autonomous` | Acceso Total (renombrado) | write/edit/bash → allow (sin confirmación) |

---

## Análisis de lo Existente

### Cómo funcionan los agentes principales hoy

No existe un campo `accessMode` ni `executionMode` en la definición de agente (`AgentDefinitionSchema` en `packages/shared/src/schemas.ts:194-207`). El control de acceso se hace **exclusivamente por selección de herramientas**:

1. El usuario selecciona qué tools activar en `ToolsSelector` / `ToolsPopover`
2. La lista se persiste en `metadata.json` vía `POST /api/sessions/:id/tools`
3. El servidor aplica las tools activas con `session.setActiveToolsByName()`
4. "Full Access" y "Read-Only" son **labels derivados en el cliente** (simplemente verifican si ciertas tools están activas)

**Archivos relevantes:**
- `apps/client/src/components/chat/ToolsSelector.tsx:63-77` — derivación de `isReadOnly` / `isFullAccess`
- `apps/client/src/components/chat/InputToolbar.tsx:55-70` — misma lógica duplicada
- `apps/server/src/routes/sessions.ts:587-676` — persistencia de tools
- `apps/server/src/core/session/tool-activation-engine.ts:1-82` — resolución server-side

### Cómo funciona el PermissionEngine

`apps/server/src/core/sandbox/permission-engine.ts:126-161` — orden de evaluación:

1. **DENY_RULES** (estáticas, incondicionales): fork bombs, `rm -rf /`, acceso a `/etc/passwd`, `~/.ssh/`, `.env`, etc.
2. **Subagent dynamic rules** (solo si `isSubagent`): `buildSubagentRules()` + `evaluateSubagentRules()`
3. **ASK_RULES** (estáticas): cualquier `rm -rf`, write/edit fuera del workspace, `chmod -R`, `chown -R`
4. **Default allow**

Para agentes principales, solo aplican DENY_RULES → ASK_RULES → allow. Write/edit/bash dentro del workspace pasa directo (no hay regla que lo frene).

### Cómo funciona el beforeToolCallHook

`apps/server/src/core/session/before-tool-call-hook.ts` — hook que se ejecuta antes de cada tool call:
- Si `verdict.allow === false` → bloquea
- Si `verdict.allow === "ask"` → muestra approval request al usuario vía `approval-manager.ts`
- Si `verdict.allow === true` → permite

---

## Cambios Propuestos

### Fase 1: Subagente Autonomous

**Objetivo:** Añadir `"autonomous"` como tercer tipo de subagente.

#### 1a. `apps/server/src/core/tools/spawn-subagent-tool.ts`

```diff
- enum: ["explorer", "builder"],
+ enum: ["explorer", "builder", "autonomous"],
```

Actualizar descripción (línea 55).

#### 1b. `apps/server/src/core/sandbox/subagent-permissions.ts`

En `getBaseRulesForType()`:

```typescript
if (subagentType === "autonomous") {
  return defaults.map(rule => {
    if (["write", "edit", "bash"].includes(rule.toolName)) {
      return { ...rule, action: "allow" as const };
    }
    return rule;
  });
}
```

Mismo patrón que explorer pero al revés (allow en vez de deny).

#### 1c. Tests

`apps/server/src/__tests__/subagent-permission-inheritance.test.ts` — tests para autonomous.

### Fase 2: Modo de Ejecución Unificado para Agentes Principales

**Objetivo:** Extender el concepto de "modo de ejecución" a los agentes principales.

#### 2a. Nuevo campo `executionMode` en metadata de sesión

`apps/server/src/core/session/metadata-store.ts` — añadir `executionMode` al metadata:

```typescript
interface SessionMetadata {
  // ... existente
  executionMode?: "readonly" | "standard" | "autonomous";
}
```

- Para **subagentes**: se deriva automáticamente del `subagentType` (explorer→readonly, builder→standard, autonomous→autonomous)
- Para **agentes principales**: se setea desde el cliente al seleccionar el preset

#### 2b. `PermissionEngine` lee `executionMode`

`apps/server/src/core/sandbox/permission-engine.ts` — en `evaluate()`, si `executionMode === "autonomous"`, saltar las ASK_RULES:

```typescript
if (executionMode !== "autonomous") {
  // evaluar ASK_RULES normalmente
}
```

Las DENY_RULES **siempre** aplican, sin importar el modo. Autonomous no puede bypassear fork bombs ni acceso a .env.

#### 2c. Nuevo preset "Standard" en el cliente

`apps/client/src/components/chat/ToolsSelector.tsx`:
- Añadir preset `"standard"` que active write/edit/bash pero mantenga `request_approval` activa
- El preset "autonomous" (actual "Acceso Total") activa todas las tools incluido write/edit/bash, y setea `executionMode: "autonomous"` en la sesión

#### 2d. UI — Badge de modo en el header del chat

Mostrar el modo activo (readonly/standard/autonomous) en algún lugar visible del chat (similar al badge que agregamos en el acordeón de subagentes).

### Fase 3: Migración y Backward Compatibility

- Si una sesión no tiene `executionMode`, el `PermissionEngine` asume comportamiento actual:
  - Agentes principales: efectivamente "autonomous" (sin ASK para write/edit/bash en workspace)
  - Subagentes: según el `subagentType` en metadata
- El preset "Acceso Total" existente se renombra a "Autonomous" en la UI
- Se agrega el nuevo preset "Standard" entre "Read-Only" y "Autonomous"

---

## Archivos Afectados

| Archivo | Cambio |
|---------|--------|
| `apps/server/src/core/tools/spawn-subagent-tool.ts` | Añadir `"autonomous"` al enum + actualizar descripción |
| `apps/server/src/core/sandbox/subagent-permissions.ts` | Rama `autonomous` en `getBaseRulesForType()` |
| `apps/server/src/core/sandbox/permission-engine.ts` | Leer `executionMode` de metadata, saltar ASK_RULES si autonomous |
| `apps/server/src/core/session/before-tool-call-hook.ts` | Pasar `executionMode` al PermissionEngine |
| `apps/server/src/core/session/metadata-store.ts` | Tipar `executionMode` en SessionMetadata |
| `apps/server/src/routes/sessions.ts` | Aceptar `executionMode` en POST /tools |
| `apps/client/src/components/chat/ToolsSelector.tsx` | Añadir preset "standard", renombrar "Acceso Total" → "Autonomous" |
| `apps/client/src/components/chat/ToolsPopover.tsx` | Misma lógica de presets |
| `apps/client/src/components/chat/InputToolbar.tsx` | Misma lógica de derivación de modo |
| `apps/client/src/components/chat/ChatInput.tsx` | Enviar `executionMode` al setear tools |
| `apps/client/src/components/chat/tools/ToolCallRow.tsx` | Badge de tipo en header ya implementado |
| `apps/server/src/__tests__/subagent-permission-inheritance.test.ts` | Tests para autonomous |

---

## Riesgos y Mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Subagente autonomous modifica archivos sin supervisión | `PermissionEngine` DENY_RULES son incondicionales; herencia de restricciones del padre |
| Usuario no sabe que lanzó un agente autonomous | Badge visual en header del acordeón + preset claramente etiquetado |
| Autonomous no debe permitir nested spawns | `spawn_subagent` y `delegate_task` siguen con `action: "deny"` en defaults |
| Cambio de comportamiento para agentes principales existentes | Backward compatible: sin `executionMode` = mismo comportamiento actual |
| Subagente autonomous accede a internet sin control | `web_fetch` y `exa_search` permanecen `deny` |
| Confusión entre "Acceso Total" actual y "Autonomous" nuevo | Renombrar preset en UI; "Acceso Total" pasa a ser "Autonomous" |

---

## Plan de Implementación

1. **Fase 1** (1 día): Subagente autonomous — enum + reglas + tests
2. **Fase 2** (1-2 días): Modo unificado para agentes principales — `executionMode` en metadata, PermissionEngine, presets cliente
3. **Fase 3** (medio día): UI cleanup — badges, literales, migración de labels

---

## Preguntas Abiertas

1. **El preset "Standard" para agentes principales es nuevo** — hoy no existe un modo que pida confirmación para write/edit/bash en agentes principales. ¿Lo queremos incluir en este plan o lo dejamos para después?

2. **¿El modo autonomous debería permitir `rm -rf` sin confirmación?** Actualmente las ASK_RULES del PermissionEngine piden confirmación para cualquier `rm -rf`. En modo autonomous, ¿se saltean TODAS las ASK_RULES o solo las de write/edit/bash?

3. **¿Renombrar "Acceso Total" → "Autonomous" en la UI?** El preset actual se llama "Full Access" / "Acceso Total". Si lo renombramos a "Autonomous", necesitamos actualizar literales y posiblemente migrar configuraciones de usuario.
