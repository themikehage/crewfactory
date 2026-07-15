# Plan 4: Sistema de Permisos Heredables para Subagentes

**Severidad:** Alta  
**Prioridad:** Alta (defensa en profundidad + funcionalidad)  
**Esfuerzo estimado:** 4-7 días  
**Riesgo:** Medio (cambio en el modelo de permisos, requiere migración de configuración)  
**Área:** Seguridad / Permisos / Configuración

---

## Resumen

Actualmente, las herramientas disponibles para subagentes están definidas en una **lista hardcodeada** en `spawn-subagent-tool.ts`. No hay herencia de restricciones de la sesión padre, no hay diferenciación por tipo de subagente, y no hay mecanismo para que el usuario configure qué herramientas puede usar cada subagente.

Se necesita un sistema de permisos heredables con:
1. **Herencia de restricciones**: si la sesión padre está en modo "Read-Only", los subagentes también deben estarlo
2. **Reglas por tipo de subagente**: un subagente "explorador" tiene herramientas distintas a uno "constructor"
3. **Last-match-wins**: reglas posteriores (sesión, usuario) sobreescriben las anteriores (agente, defaults)
4. **Persistencia**: las decisiones del usuario ("permitir siempre este patrón") sobreviven a reinicios

---

## Análisis del Problema

### Sistema Actual (Hardcodeado)

```typescript
// spawn-subagent-tool.ts — lista fija, sin herencia
subSession.setActiveToolsByName([
  "read", "write", "edit", "bash", "grep", "find", "ls",
  "request_approval", "ask_question", "render_images",
  "render_html", "render_chart", "share_file", "refresh_ui",
  "vision", "generate_image",
]);
```

**Problemas:**

1. **Bypass de Read-Only**: Si el usuario configura la sesión padre como "Read-Only" (solo `read, grep, find, ls`), el subagente igual recibe `write, edit, bash` — las restricciones del padre se ignoran.

2. **Sin diferenciación**: Todos los subagentes reciben las mismas herramientas, independientemente de su propósito. Un subagente de investigación debería tener herramientas diferentes a uno de ejecución.

3. **Sin control de usuario**: No hay UI para configurar qué herramientas puede usar un subagente. La lista es inmutable.

4. **Sin persistencia**: Las decisiones de permisos (allow/deny/ask) son efímeras. Si el usuario aprueba "siempre permitir git clone", esa decisión no sobrevive al reinicio.

---

## Solución Propuesta

### Fase 1: Modelo de Reglas de Permiso

**Archivo nuevo:** `apps/server/src/core/permissions/subagent-permission-model.ts`

```typescript
export interface ToolPermissionRule {
  /** Nombre de la herramienta (ej: "bash", "write", "spawn_subagent") */
  toolName: string;
  /** Patrón para matching de argumentos. "*" = todos. "git *" = solo comandos git. */
  pattern: string;
  /** Acción: permitir, denegar, o preguntar al usuario */
  action: "allow" | "deny" | "ask";
  /** Origen de la regla (para debugging y prioridad) */
  source: "agent-default" | "session-inherited" | "user-decision" | "system-deny";
}

export interface SubagentPermissionConfig {
  /** Reglas ordenadas. La última que hace match gana (last-match-wins). */
  rules: ToolPermissionRule[];
  /** Herramientas excluidas explícitamente (ni siquiera visibles al LLM) */
  excludedTools: string[];
  /** Profundidad máxima (delegado a Plan 3) */
  maxDepth: number;
}

/** Configuración por defecto para subagentes */
export const DEFAULT_SUBAGENT_PERMISSIONS: SubagentPermissionConfig = {
  rules: [
    // Hard denies del sistema (no sobreescribibles)
    { toolName: "spawn_subagent", pattern: "*", action: "deny", source: "system-deny" },
    { toolName: "delegate_task", pattern: "*", action: "deny", source: "system-deny" },
    { toolName: "manage_factory", pattern: "*", action: "deny", source: "system-deny" },
    { toolName: "manage_custom_tools", pattern: "*", action: "deny", source: "system-deny" },
    { toolName: "manage_pipelines", pattern: "*", action: "deny", source: "system-deny" },

    // Herramientas permitidas por defecto
    { toolName: "read", pattern: "*", action: "allow", source: "agent-default" },
    { toolName: "grep", pattern: "*", action: "allow", source: "agent-default" },
    { toolName: "find", pattern: "*", action: "allow", source: "agent-default" },
    { toolName: "ls", pattern: "*", action: "allow", source: "agent-default" },
    { toolName: "write", pattern: "*", action: "ask", source: "agent-default" },
    { toolName: "edit", pattern: "*", action: "ask", source: "agent-default" },
    { toolName: "bash", pattern: "*", action: "ask", source: "agent-default" },
    { toolName: "web_fetch", pattern: "*", action: "deny", source: "agent-default" },
    { toolName: "exa_search", pattern: "*", action: "deny", source: "agent-default" },
  ],
  excludedTools: [
    "spawn_subagent", "delegate_task", "decompose_tasks",
    "manage_factory", "manage_custom_tools", "manage_pipelines",
  ],
  maxDepth: 1,
};
```

### Fase 2: Motor de Evaluación (Last-Match-Wins)

**Archivo nuevo:** `apps/server/src/core/permissions/subagent-permission-engine.ts`

```typescript
import { ToolPermissionRule } from "./subagent-permission-model";

/**
 * Evalúa si una herramienta está permitida para un subagente.
 *
 * Algoritmo: last-match-wins sobre la lista ordenada de reglas.
 * 1. Se mergean reglas del agente + reglas heredadas del padre + reglas del usuario
 * 2. findLast sobre la lista mergeada
 * 3. Si no hay match → "ask" (seguro por defecto)
 */
export function evaluateSubagentPermission(
  toolName: string,
  args: Record<string, unknown>,
  rules: ToolPermissionRule[],
): { action: "allow" | "deny" | "ask"; matchedRule?: ToolPermissionRule } {
  const flatRules = rules.flat();

  const matched = flatRules.findLast((rule) => {
    const toolMatch = matchWildcard(toolName, rule.toolName);
    const patternMatch = matchPattern(args, rule.pattern);
    return toolMatch && patternMatch;
  });

  if (matched) {
    return { action: matched.action, matchedRule: matched };
  }

  // Sin reglas que apliquen → preguntar (seguro por defecto)
  return { action: "ask" };
}

/** Construye las reglas efectivas para un subagente */
export function buildSubagentRules(
  subagentType: string,
  parentSessionRules: ToolPermissionRule[],
  userDecisions: ToolPermissionRule[],
): ToolPermissionRule[] {
  // 1. Defaults del sistema + del tipo de subagente
  const baseRules = getBaseRulesForType(subagentType);

  // 2. Heredar reglas DENY de la sesión padre (restricciones de techo)
  const parentDenies = parentSessionRules.filter((r) => r.action === "deny");
  const parentExternalDir = parentSessionRules.filter(
    (r) => r.toolName === "external_directory"
  );

  // 3. Decisiones del usuario (permitir/denegar patrones específicos)
  // Van al final → tienen prioridad máxima (last-match-wins)

  return [
    ...baseRules,
    ...parentDenies,
    ...parentExternalDir,
    ...userDecisions,
  ];
}

function getBaseRulesForType(type: string): ToolPermissionRule[] {
  switch (type) {
    case "explorer":
      return DEFAULT_SUBAGENT_PERMISSIONS.rules.filter(
        (r) => !["write", "edit", "bash"].includes(r.toolName)
      );
    case "builder":
      return DEFAULT_SUBAGENT_PERMISSIONS.rules;
    default:
      return DEFAULT_SUBAGENT_PERMISSIONS.rules;
  }
}

function matchWildcard(value: string, pattern: string): boolean {
  if (pattern === "*") return true;
  return value === pattern;
}

function matchPattern(
  args: Record<string, unknown>,
  pattern: string,
): boolean {
  if (pattern === "*") return true;
  // Para bash: matching contra el comando
  if (args.command && typeof args.command === "string") {
    return new RegExp(
      "^" + pattern.replace(/\*/g, ".*") + "$"
    ).test(args.command);
  }
  return true; // Sin patrón específico, match por defecto
}
```

### Fase 3: Extraer Restricciones de la Sesión Padre

**Archivo:** `apps/server/src/core/tools/spawn-subagent-tool.ts`

```typescript
import { buildSubagentRules, evaluateSubagentPermission } from "../permissions/subagent-permission-engine";

// Obtener reglas de la sesión padre
const parentSessionRules = getParentSessionRules(username, ctx.parentSessionId);
// Obtener decisiones previas del usuario
const userDecisions = getUserPermissionDecisions(username);

// Construir reglas efectivas
const effectiveRules = buildSubagentRules(
  subagentType,
  parentSessionRules,
  userDecisions,
);

// En lugar de setActiveToolsByName():
// 1. Filtrar herramientas excluidas
const visibleTools = allTools.filter(
  (t) => !effectiveRules
    .filter((r) => r.action === "deny" && r.pattern === "*")
    .some((r) => r.toolName === t)
);

// 2. Establecer herramientas visibles
subSession.setActiveToolsByName(visibleTools);

// 3. Guardar reglas en metadata para evaluación runtime
subSessionMetadata.permissionRules = effectiveRules;
```

### Fase 4: Hook de Evaluación Runtime (beforeToolCall)

Integrar con el Plan 1 (`beforeToolCall` para subagentes):

```typescript
const beforeToolCall = createBeforeToolCallHook({
  sessionId: subagentSessionId,
  isSubagent: true,
  permissionRules: effectiveRules, // ← reglas heredables
});
```

### Fase 5: Persistencia de Decisiones del Usuario

**Archivo nuevo:** `apps/server/src/core/permissions/user-permission-store.ts`

```typescript
export class UserPermissionStore {
  private cache: Map<string, ToolPermissionRule[]> = new Map();

  /** Guardar una decisión del usuario */
  saveDecision(
    username: string,
    toolName: string,
    pattern: string,
    action: "allow" | "deny",
  ): void {
    const rules = this.getDecisions(username);
    // Remover decisión previa para el mismo tool+pattern
    const filtered = rules.filter(
      (r) => !(r.toolName === toolName && r.pattern === pattern)
    );
    filtered.push({
      toolName,
      pattern,
      action,
      source: "user-decision",
    });
    this.cache.set(username, filtered);
    this.persistToDisk(username, filtered);
  }

  /** Cargar decisiones previas */
  getDecisions(username: string): ToolPermissionRule[] {
    if (this.cache.has(username)) return this.cache.get(username)!;
    const rules = this.loadFromDisk(username);
    this.cache.set(username, rules);
    return rules;
  }

  private getFilePath(username: string): string {
    return join("/tmp/crewfactory", username, "permission-decisions.json");
  }

  private persistToDisk(username: string, rules: ToolPermissionRule[]): void {
    const path = this.getFilePath(username);
    const tmpPath = path + ".tmp";
    writeFileSync(tmpPath, JSON.stringify(rules, null, 2), "utf-8");
    renameSync(tmpPath, path); // Escritura atómica
  }

  private loadFromDisk(username: string): ToolPermissionRule[] {
    const path = this.getFilePath(username);
    if (!existsSync(path)) return [];
    try {
      return JSON.parse(readFileSync(path, "utf-8"));
    } catch {
      return [];
    }
  }
}

export const userPermissionStore = new UserPermissionStore();
```

---

## Ejemplo de Flujo: Read-Only Padre → Subagente Restringido

```
1. Usuario configura sesión principal como "Read-Only"
   → parentSessionRules = [
       { toolName: "write", pattern: "*", action: "deny", source: "session-inherited" },
       { toolName: "edit", pattern: "*", action: "deny", source: "session-inherited" },
       { toolName: "bash", pattern: "*", action: "deny", source: "session-inherited" },
     ]

2. Agente principal spawn_ subagente tipo "builder"

3. buildSubagentRules():
   baseRules (allow write/edit/bash) + parentDenies (deny write/edit/bash)
   → effectiveRules = [..., deny write, deny edit, deny bash]
   → last-match-wins: deny gana

4. Subagente hereda restricciones:
   ✅ read, grep, find, ls → permitido
   ❌ write, edit, bash → denegado (heredado del padre)
```

---

## Verificación

### Tests Automatizados

```typescript
describe("Subagent Permission Inheritance", () => {
  it("hereda reglas DENY de la sesión padre", () => {
    const parentRules = [
      { toolName: "bash", pattern: "*", action: "deny", source: "session-inherited" },
    ];
    const rules = buildSubagentRules("builder", parentRules, []);
    const result = evaluateSubagentPermission("bash", { command: "ls" }, rules);
    expect(result.action).toBe("deny");
  });

  it("last-match-wins: decisión del usuario sobreescribe default", () => {
    const userDecisions = [
      { toolName: "bash", pattern: "git *", action: "allow", source: "user-decision" },
    ];
    // baseRules tiene bash:ask, pero userDecision (última) permite git
    const rules = buildSubagentRules("builder", [], userDecisions);
    const result = evaluateSubagentPermission("bash", { command: "git status" }, rules);
    expect(result.action).toBe("allow");
  });

  it("explorer no recibe write/edit/bash", () => {
    const rules = buildSubagentRules("explorer", [], []);
    const writeResult = evaluateSubagentPermission("write", {}, rules);
    expect(writeResult.action).toBe("deny");
    const readResult = evaluateSubagentPermission("read", {}, rules);
    expect(readResult.action).toBe("allow");
  });
});
```

---

## Orden de Ejecución

1. Definir `ToolPermissionRule` y modelo de datos (medio día)
2. Implementar `evaluateSubagentPermission()` con last-match-wins (1 día)
3. Implementar `buildSubagentRules()` con herencia del padre (1 día)
4. Reemplazar `setActiveToolsByName()` hardcodeado en spawn y delegate (1 día)
5. Implementar `UserPermissionStore` con persistencia atómica (1 día)
6. Integrar con `beforeToolCall` del Plan 1 (medio día)
7. Tests automatizados (1 día)
8. UI de configuración de permisos por tipo de subagente (opcional — 2 días)
