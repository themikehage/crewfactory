# Plan 3: Límite de Profundidad para Subagentes Anidados

**Severidad:** Alta  
**Prioridad:** Alta (defensa en profundidad)  
**Esfuerzo estimado:** 1-2 días  
**Riesgo:** Nulo (feature adicional, no modifica comportamiento existente)  
**Área:** Seguridad / Control de Recursos

---

## Resumen

Actualmente, la app de producción evita la recursión infinita de subagentes excluyendo las tools `spawn_subagent` y `delegate_task` del conjunto de herramientas activas del subagente. Esto previene **un nivel** de anidamiento, pero no proporciona un mecanismo configurable de límite de profundidad.

Si en el futuro se habilita `delegate_task` en subagentes (para delegación en cadena), o si un agente programático spawnea subagentes que a su vez spawnean más subagentes, no hay protección contra recursión infinita.

---

## Análisis del Problema

### Mecanismo Actual de Prevención

```typescript
// spawn-subagent-tool.ts — hardcodeado, sin control de profundidad
subSession.setActiveToolsByName([
  "read", "write", "edit", "bash", "grep", "find", "ls",
  // spawn_subagent NO está en la lista → prevención hardcodeada
]);
```

**Limitaciones de este enfoque:**

1. **Binario (on/off)**: O permites anidamiento o no. No hay punto intermedio ("permite 2 niveles").
2. **No configurable**: Si un usuario avanzado necesita subagentes de 2 niveles (ej: orquestador → especialista → worker), no puede.
3. **Frágil**: Si alguien añade `spawn_subagent` a la lista en el futuro, la protección desaparece sin advertencia.
4. **No aplica a delegate_task**: Si `delegate_task` apunta a un agente programático, ese agente PUEDE spawnear subagentes (tiene las tools en su configuración).

### Escenario de Riesgo

```
Usuario → Agente Principal
              │
              └── delegate_task → Agente Programático (tiene spawn_subagent)
                                       │
                                       └── spawn_subagent → Subagente Nivel 2
                                                                │
                                                                └── spawn_subagent → Subagente Nivel 3  ← podría seguir infinitamente
```

---

## Solución Propuesta

### Fase 1: Configuración Global de Profundidad

**Archivo:** `apps/server/src/config/app-config.ts` (nuevo)

```typescript
export interface SubagentConfig {
  /** Profundidad máxima de anidamiento de subagentes (default: 1).
   *  0 = sin subagentes, 1 = un nivel (subagentes directos),
   *  2+ = subagentes pueden spawnear más subagentes */
  maxDepth: number;
}

export const DEFAULT_SUBAGENT_CONFIG: SubagentConfig = {
  maxDepth: 1, // Por defecto: solo un nivel de anidamiento
};
```

**Variable de entorno para override:**

```bash
# .env
CREWFACTORY_SUBAGENT_MAX_DEPTH=2
```

### Fase 2: Contador de Profundidad en Metadata de Sesión

**Archivo:** `apps/server/src/core/tools/spawn-subagent-tool.ts`

Antes de crear un subagente, calcular y validar la profundidad:

```typescript
function getSubagentDepth(username: string, parentSessionId: string): number {
  let depth = 0;
  let currentId = parentSessionId;

  while (currentId) {
    const metadata = sessionManager.metadataStore?.getSessionMetadata(username, currentId);
    if (!metadata) break;

    currentId = metadata.parentSessionId ?? "";
    if (currentId) depth++;
  }

  return depth;
}
```

En el flujo de la tool:

```typescript
// Antes de crear el subagente (spawn-subagent-tool.ts)
const config = getAppConfig();
const currentDepth = getSubagentDepth(username, ctx.parentSessionId);

if (currentDepth >= config.subagent.maxDepth) {
  throw new Error(
    `Límite de profundidad de subagentes alcanzado (${config.subagent.maxDepth}). ` +
    `Profundidad actual: ${currentDepth}. No se pueden crear más subagentes anidados.`
  );
}

// Guardar la profundidad en metadata de la nueva sesión
await sessionManager.metadataStore.setSessionMetadata(username, subagentSessionId, {
  parentSessionId: ctx.parentSessionId,
  subagentDepth: currentDepth + 1,
  // ... resto de metadata
});
```

### Fase 3: Validación en delegate_task

**Archivo:** `apps/server/src/core/tools/delegate-tool.ts`

Mismo patrón para cada target de delegación:

```typescript
// Antes de ejecutar la delegación
const config = getAppConfig();
const currentDepth = getSubagentDepth(username, parentSessionId);

// La delegación a un agente programático cuenta como un nivel adicional
// porque ese agente puede spawnear sus propios subagentes
const effectiveDepth = currentDepth + 1;

if (effectiveDepth > config.subagent.maxDepth) {
  throw new Error(
    `Límite de profundidad de delegación alcanzado (${config.subagent.maxDepth}). ` +
    `La delegación a este nivel excedería el límite configurado.`
  );
}
```

### Fase 4: UI de Configuración (Opcional, Fase 2)

**Archivo:** `apps/client/src/components/settings/SubagentSettings.tsx`

Añadir una sección en Settings → General para configurar el límite:

```
┌─────────────────────────────────────────────┐
│ Subagentes                                  │
│                                             │
│ Profundidad máxima de anidamiento           │
│ [---o--] 2                                  │
│ 0 = sin subagentes                          │
│ 1 = solo subagentes directos (recomendado)  │
│ 2+ = subagentes pueden delegar              │
│                                             │
│ ⚠️ Valores altos pueden causar consumo      │
│    exponencial de tokens                    │
└─────────────────────────────────────────────┘
```

---

## Diagrama de Control de Profundidad

```
Config: maxDepth = 2

Usuario → Sesión A (depth 0)
              │
              │ spawn_subagent permitido (0 < 2)
              ▼
          Subagente B (depth 1)
              │
              │ spawn_subagent permitido (1 < 2)
              ▼
          Subagente C (depth 2)
              │
              │ spawn_subagent BLOQUEADO (2 >= 2)
              │ "Límite de profundidad alcanzado"
              ✕
```

---

## Verificación

### Tests Automatizados

```typescript
describe("Subagent Depth Limit", () => {
  beforeEach(() => {
    setAppConfig({ subagent: { maxDepth: 1 } });
  });

  it("permite crear subagente desde sesión raíz (depth 0 → 1)", async () => {
    const depth = getSubagentDepth("user", "root-session"); // profundidad 0
    expect(depth).toBeLessThan(config.subagent.maxDepth);
  });

  it("bloquea creación de subagente desde subagente (depth 1 → 2)", async () => {
    // Simular: el padre de "sub-1" es "root-session" (depth 1)
    await expect(
      spawnSubagent("sub-1", "root-session")
    ).rejects.toThrow("Límite de profundidad");
  });

  it("respeta maxDepth = 2 (dos niveles permitidos)", async () => {
    setAppConfig({ subagent: { maxDepth: 2 } });
    const depth = getSubagentDepth("user", "sub-1"); // profundidad 1
    expect(depth).toBeLessThan(config.subagent.maxDepth); // true
  });

  it("el mensaje de error es descriptivo", async () => {
    await expect(
      spawnSubagent("sub-1", "root-session")
    ).rejects.toThrow(/Límite de profundidad.*alcanzado.*1/i);
  });
});
```

### Tests Manuales

1. **Configurar maxDepth=1:** spawnear subagente desde sesión principal → OK. Intentar spawnear desde el subagente → error descriptivo.
2. **Configurar maxDepth=2:** spawnear subagente → OK. Desde subagente, spawnear otro → OK. Desde nieto, spawnear → error.
3. **Configurar maxDepth=0:** intentar spawnear subagente → error inmediato.

---

## Consideraciones

| Aspecto | Decisión |
|---|---|
| ¿Delegate cuenta como un nivel? | Sí. `delegate_task` a agente programático crea una sesión capaz de spawnear. Contabiliza como nivel adicional. |
| ¿Canales multi-agente afectan el depth? | No. Los canales son espacios de colaboración, no árboles de delegación. No incrementan el contador. |
| ¿Laboratorio afecta el depth? | No. Los experimentos crean canales temporales. El depth se mide por sesión, no por experimento. |
| Valor por defecto | `1` — consistente con el comportamiento actual (un nivel). Los usuarios avanzados pueden aumentarlo. |

---

## Orden de Ejecución

1. Añadir `getSubagentDepth()` en `apps/server/src/core/session/session-depth.ts` (2 horas)
2. Integrar validación en `spawn-subagent-tool.ts` (1 hora)
3. Integrar validación en `delegate-tool.ts` (1 hora)
4. Añadir configuración `subagent.maxDepth` con env var (1 hora)
5. Tests automatizados (2 horas)
6. UI de configuración en Settings (opcional — 4 horas)
