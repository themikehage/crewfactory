# Plan 1: Sandbox de Seguridad para Subagentes — `beforeToolCall`

**Severidad:** Crítica  
**Prioridad:** Máxima (corrección inmediata)  
**Esfuerzo estimado:** 2-4 horas  
**Riesgo:** Nulo (cambio puntual, sin modificación de interfaces públicas)  
**Área:** Seguridad / Permisos

---

## Resumen

Los subagentes creados mediante `spawn_subagent` y `delegate_task` ejecutan todas sus herramientas (incluyendo `bash`, `write`, `edit`) **sin pasar por el motor de permisos** (`PermissionEngine`). La app de producción documenta un sistema de seguridad "deny-first, then-ask, then-allow" con sandbox de comandos peligrosos, pero este sistema nunca se aplica a sesiones de subagentes.

El `beforeToolCall` hook — que implementa el `PermissionEngine` — se pasa a `createAgentSession()` en sesiones principales, pero **se omite completamente** en la creación de subagentes.

---

## Análisis del Problema

### Archivos Afectados

| Archivo | Línea | Descripción |
|---|---|---|
| `apps/server/src/core/tools/spawn-subagent-tool.ts` | 134-141 | `createAgentSession()` para subagentes SIN `beforeToolCall` |
| `apps/server/src/core/tools/delegate-tool.ts` | ~80-90 | `createAgentSession()` para delegación SIN `beforeToolCall` |
| `apps/server/src/core/sandbox/permission-engine.ts` | todo | El motor existe pero nunca se invoca desde subagentes |

### Código Actual (spawn-subagent-tool.ts)

```typescript
// Linea 134-141 — Nótese la AUSENCIA de beforeToolCall
const { session: subSession } = await createAgentSession({
  cwd: workspaceDir,
  sessionManager: subSessionManager,
  authStorage,
  modelRegistry,
  resourceLoader: subResourceLoader,
  customTools: [customBashTool as any, ...uiTools as any],
  // ❌ beforeToolCall NUNCA se pasa
});
```

Comparar con la creación de sesiones principales (`session-manager.ts`):

```typescript
// Sesión principal — beforeToolCall SÍ está presente
const beforeToolCall = createBeforeToolCallHook({ sessionId });
const { session } = await createAgentSession({
  // ...
  beforeToolCall,   // ✅ Presente
});
```

### Impacto en Seguridad

Un subagente puede ejecutar cualquier comando sin pasar por:
- **DENY_RULES**: fork bombs, `rm -rf /etc`, `curl | bash`, acceso a credenciales
- **ASK_RULES**: escrituras fuera del workspace, operaciones recursivas peligrosas
- **Registro de auditoría**: las operaciones del subagente no quedan registradas

Esto afecta a **todos** los subagentes creados por:
1. `spawn_subagent` tool (delegación interna del agente)
2. `delegate_task` tool con cualquier target (agent, project, channel, session)
3. Canales multi-agente con agentes programáticos
4. Experimentos de laboratorio que usan canales

---

## Solución Propuesta

### Fase 1: Corrección Inmediata (spawn-subagent-tool.ts)

**Archivo:** `apps/server/src/core/tools/spawn-subagent-tool.ts`

Añadir `beforeToolCall` a la creación del subagente:

```typescript
// Importar el hook
import { createBeforeToolCallHook } from "../sandbox/permission-engine";

// Dentro de la tool spawn_subagent, antes de createAgentSession():
const beforeToolCall = createBeforeToolCallHook({
  sessionId: subagentSessionId,
  isSubagent: true,  // ← nuevo flag para modo subagente
});

const { session: subSession } = await createAgentSession({
  cwd: workspaceDir,
  sessionManager: subSessionManager,
  authStorage,
  modelRegistry,
  resourceLoader: subResourceLoader,
  customTools: [customBashTool as any, ...uiTools as any],
  beforeToolCall,  // ✅ AHORA PRESENTE
});
```

### Fase 2: Corrección en delegate-tool.ts

**Archivo:** `apps/server/src/core/tools/delegate-tool.ts`

Mismo patrón para cada target de delegación:

```typescript
const beforeToolCall = createBeforeToolCallHook({
  sessionId: delegateSessionId,
  isSubagent: true,
});

const { session } = await createAgentSession({
  // ... opciones existentes
  beforeToolCall,  // ✅ Añadir
});
```

### Fase 3: Adaptación de PermissionEngine para Subagentes

**Archivo:** `apps/server/src/core/sandbox/permission-engine.ts`

Añadir soporte para el flag `isSubagent` en `createBeforeToolCallHook`. Los subagentes tienen restricciones adicionales:

```typescript
export function createBeforeToolCallHook(options: {
  sessionId: string;
  isSubagent?: boolean;
}) {
  const engine = new PermissionEngine();

  return async (toolName: string, args: Record<string, unknown>) => {
    // Para subagentes: aplicar DENY_RULES más restrictivas
    const rules = options.isSubagent
      ? [...DENY_RULES, ...SUBAGENT_DENY_RULES]
      : DENY_RULES;

    const verdict = engine.evaluate(toolName, args, rules);
    // ...
  };
}

// Nuevas reglas específicas para subagentes
const SUBAGENT_DENY_RULES = [
  {
    toolName: "bash",
    pattern: /rm\s+-rf\s+\/(etc|var|usr|home|tmp\/crewfactory)/,
    reason: "Subagente: borrado de directorios del sistema bloqueado",
  },
  {
    toolName: "bash",
    pattern: /curl.*\|.*(bash|sh)/,
    reason: "Subagente: pipe a shell desde red bloqueado",
  },
  {
    toolName: "write",
    pattern: /\.env$/,
    reason: "Subagente: modificación de archivos .env bloqueada",
  },
];
```

---

## Verificación

### Tests Manuales

1. **Spawnear subagente y verificar que bash peligroso se bloquea:**
   - Padre: "spawn_subagent con task: ejecuta rm -rf /etc"
   - Esperado: subagente recibe DENY del PermissionEngine

2. **Spawnear subagente y verificar que operaciones legítimas pasan:**
   - Padre: "spawn_subagent con task: crea un archivo test.txt en /tmp/crewfactory/{user}/workspace/"
   - Esperado: subagente ejecuta write sin bloqueo

3. **Delegar a agente programático y verificar sandbox:**
   - Padre: "delegate_task al agente X con task: lee credenciales de .env"
   - Esperado: agente recibe DENY al intentar leer .env

### Tests Automatizados

```typescript
// Nuevo archivo: apps/server/src/core/sandbox/__tests__/subagent-permissions.test.ts

describe("Subagent PermissionEngine", () => {
  it("bloquea rm -rf en subagentes", async () => {
    const hook = createBeforeToolCallHook({ sessionId: "test", isSubagent: true });
    await expect(hook("bash", { command: "rm -rf /etc" })).rejects.toThrow();
  });

  it("permite git clone en subagentes", async () => {
    const hook = createBeforeToolCallHook({ sessionId: "test", isSubagent: true });
    await expect(hook("bash", { command: "git clone https://..." })).resolves.not.toThrow();
  });

  it("hereda DENY_RULES de la sesión padre", async () => {
    // Si el padre tiene bash denegado, el subagente también
  });
});
```

---

## Riesgos y Consideraciones

| Riesgo | Mitigación |
|---|---|
| Subagentes legítimos bloqueados por reglas muy restrictivas | Las reglas específicas de subagente se limitan a patrones de ataque conocidos. El motor permite `ask` (aprobación del usuario) para casos ambiguos. |
| Regresión en rendimiento | `PermissionEngine.evaluate()` es O(rules) con regex simple. Impacto negligible (~microsegundos por tool call). |
| Subagentes de laboratorio afectados | El flag `isSubagent` permite ajustar granularidad. Se puede omitir para experimentos controlados. |

---

## Orden de Ejecución

1. Añadir `beforeToolCall` en `spawn-subagent-tool.ts` (30 min)
2. Añadir `beforeToolCall` en `delegate-tool.ts` para los 4 targets (1 hora)
3. Añadir `SUBAGENT_DENY_RULES` en `permission-engine.ts` (1 hora)
4. Tests manuales de verificación (30 min)
5. Tests automatizados (1 hora)
6. Actualizar documentación del sandbox en about.md
