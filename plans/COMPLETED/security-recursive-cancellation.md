# Plan 2: Cancelación Recursiva BFS para Árbol de Subagentes

**Severidad:** Crítica  
**Prioridad:** Máxima (corrección inmediata)  
**Esfuerzo estimado:** 3-5 días  
**Riesgo:** Bajo (refactor interno sin cambio de API pública)  
**Área:** Infraestructura / Gestión de Sesiones

---

## Resumen

El sistema de cancelación de delegaciones actual (`delegation-registry.ts`) solo aborta los subagentes **hijos directos** de una sesión. Si un subagente a su vez spawnea otro subagente (nieto), éste queda huérfano y sigue ejecutándose tras la cancelación del padre. Esto consume tokens de LLM, recursos de CPU, y puede dejar escrituras parciales en el workspace sin dueño.

La app de producción necesita cancelación **transitiva real**: cuando se aborta una sesión padre, todo el árbol de subagentes descendientes debe cancelarse automáticamente.

---

## Análisis del Problema

### Archivos Afectados

| Archivo | Línea | Descripción |
|---|---|---|
| `apps/server/src/core/delegation-registry.ts` | 112-119 | `abortAll()` — solo cancela hijos directos |
| `apps/server/src/core/delegation-registry.ts` | 122-128 | `abortBySubagentSessionId()` — solo match exacto |
| `apps/server/src/core/tools/spawn-subagent-tool.ts` | 157-163 | Abort signal chaining (single-level) |
| `apps/server/src/core/tools/delegate-tool.ts` | 54-61 | Abort signal chaining (single-level) |
| `apps/server/src/ai/agent-session.ts` | 457-460 | `dispose()` no espera cancelación |
| `apps/server/src/session-manager.ts` | 96-112 | `destroySession()` no limpia hijos recursivamente |

### Código Actual (delegation-registry.ts) — El Bug

```typescript
abortAll(parentSessionId: string): void {
  for (const [toolCallId, active] of this.activePromises.entries()) {
    // ❌ Solo compara parentSessionId EXACTO — no encuentra nietos
    if (active.parentSessionId === parentSessionId) {
      active.abort();
    }
  }
}
```

**Escenario de fallo:**

```
Sesión A (padre)
├── sub_1 (parentSessionId = "A")     ← abortAll("A") cancela este ✅
│   └── sub_1_1 (parentSessionId = "sub_1")  ← NO se cancela ❌ (huérfano)
└── sub_2 (parentSessionId = "A")     ← abortAll("A") cancela este ✅
    └── sub_2_1 (parentSessionId = "sub_2")  ← NO se cancela ❌ (huérfano)
```

### Código Actual (spawn-subagent-tool.ts) — Signal Chaining Single-Level

```typescript
const onAbort = () => {
  subSession.abort();  // Solo aborta la sesión inmediata, no sus hijos
};
if (parentSignal) {
  parentSignal.addEventListener("abort", onAbort, { once: true });
}
```

Cuando `parentSignal` se dispara, `subSession.abort()` se llama. Pero `subSession` puede tener sus propios subagentes que no reciben el abort.

### Código Actual (session-manager.ts) — destroySession Sin Limpieza Recursiva

```typescript
async destroySession(username, sessionId): Promise<void> {
  const key = this.getSessionKey(username, sessionId);
  const entry = this.sessions.get(key);
  if (entry) {
    entry.unsubscribe();
    entry.session.dispose();
    this.sessions.delete(key);
  }
  // ❌ No se buscan ni eliminan sesiones hijas
  // ❌ No se cancelan delegaciones activas de esta sesión
  mcpRegistry.stopSessionMcpTools(username, sessionId);
  await memoryRegistry.shutdown(`session:${sessionId}`);
  if (existsSync(sessionDir)) rmSync(sessionDir, { recursive: true, force: true });
}
```

---

## Solución Propuesta

### Fase 1: BFS en DelegationRegistry

**Archivo:** `apps/server/src/core/delegation-registry.ts`

Reemplazar `abortAll()` con un algoritmo BFS que recorra todo el árbol:

```typescript
abortAllRecursive(rootSessionId: string): void {
  // Frontera: sesiones cuyos hijos debemos cancelar
  const pending = new Set<string>([rootSessionId]);
  // Sesiones ya canceladas (evita ciclos)
  const cancelled = new Set<string>();

  let found = true;
  while (found) {
    found = false;
    for (const [toolCallId, active] of this.activePromises.entries()) {
      if (cancelled.has(toolCallId)) continue;

      // ¿Esta delegación pertenece a alguna sesión en la frontera?
      const parentInPending = pending.has(active.parentSessionId);
      const subagentInPending = active.subagentSessionId &&
        pending.has(active.subagentSessionId);

      if (parentInPending || subagentInPending) {
        active.abort();
        cancelled.add(toolCallId);

        // La sesión del subagente entra en la frontera para la siguiente iteración
        if (active.subagentSessionId) {
          pending.add(active.subagentSessionId);
        }

        found = true;
      }
    }
  }
}
```

**Complejidad:** O(d · n) donde d = profundidad del árbol y n = número de delegaciones activas. Para árboles típicos (d < 5, n < 50), es negligible.

### Fase 2: AbortToken — Patrón de Cancelación en Cascada

**Archivo nuevo:** `apps/server/src/core/abort-token.ts`

Crear una abstracción para reemplazar el `addEventListener("abort", ...)` manual:

```typescript
export class AbortToken {
  private controllers: Array<{ abort: () => void; label: string }> = [];
  private parentListener?: () => void;
  aborted = false;

  constructor(parentSignal?: AbortSignal, label = "root") {
    if (parentSignal) {
      if (parentSignal.aborted) {
        this.abortAll();
        return;
      }
      this.parentListener = () => this.abortAll();
      parentSignal.addEventListener("abort", this.parentListener, { once: true });
    }
  }

  /** Registrar una función de limpieza */
  register(abort: () => void, label: string): void {
    if (this.aborted) {
      abort(); // Si ya fue abortado, ejecutar inmediatamente
      return;
    }
    this.controllers.push({ abort, label });
  }

  /** Cancelar todo el árbol (idempotente) */
  abortAll(): void {
    if (this.aborted) return;
    this.aborted = true;

    // Limpiar listener del padre
    if (this.parentListener && this._parentSignal) {
      this._parentSignal.removeEventListener("abort", this.parentListener);
      this.parentListener = undefined;
    }

    // Ejecutar todos los controladores en orden inverso (LIFO — hijos primero)
    for (const controller of this.controllers.reverse()) {
      try {
        controller.abort();
      } catch (err) {
        console.error(`[AbortToken] Error aborting "${controller.label}":`, err);
      }
    }
    this.controllers = [];
  }
}
```

### Fase 3: Integrar AbortToken en spawn-subagent-tool.ts

**Archivo:** `apps/server/src/core/tools/spawn-subagent-tool.ts`

```typescript
import { AbortToken } from "../abort-token";

// Reemplazar el signal chaining manual:
const childToken = new AbortToken(parentSignal, `spawn:${subagentSessionId}`);

// Registrar el abort de la sesión del subagente
childToken.register(
  () => {
    subSession.abort();
    delegationRegistry.abortAllRecursive(subagentSessionId);
  },
  `session:${subagentSessionId}`
);

// Pasar el token al subagente (para que sus hijos lo hereden)
// ... el token se almacena en metadata o en un Map global
```

### Fase 4: Limpieza Recursiva en destroySession

**Archivo:** `apps/server/src/session-manager.ts`

```typescript
async destroySession(username: string, sessionId: string): Promise<void> {
  // 1. Cancelar TODAS las delegaciones del árbol (BFS)
  delegationRegistry.abortAllRecursive(sessionId);

  // 2. Encontrar y destruir sesiones hijas recursivamente
  const children = this.findChildSessions(username, sessionId);
  for (const childId of children) {
    await this.destroySession(username, childId);
  }

  // 3. Destruir la sesión actual
  const key = this.getSessionKey(username, sessionId);
  const entry = this.sessions.get(key);
  if (entry) {
    entry.unsubscribe();
    await entry.session.dispose(); // Ahora con await (fix M3)
    this.sessions.delete(key);
  }

  mcpRegistry.stopSessionMcpTools(username, sessionId);
  await memoryRegistry.shutdown(`session:${sessionId}`);

  const sessionDir = this.getSessionDir(username, sessionId);
  if (existsSync(sessionDir)) {
    rmSync(sessionDir, { recursive: true, force: true });
  }
}

/** Encuentra sesiones hijas de una sesión padre */
private findChildSessions(username: string, parentSessionId: string): string[] {
  const children: string[] = [];
  const prefix = `${this.getSessionKey(username, "")}:`;

  for (const [key, entry] of this.sessions.entries()) {
    if (!key.startsWith(prefix)) continue;
    const metadata = this.metadataStore?.getSessionMetadata(username,
      key.replace(prefix, ""));
    if (metadata?.parentSessionId === parentSessionId) {
      children.push(metadata.sessionId);
    }
  }

  // También buscar en disco (sesiones no cargadas en memoria)
  const sessionsDir = this.getUserSessionsDir(username);
  if (existsSync(sessionsDir)) {
    for (const dir of readdirSync(sessionsDir)) {
      const metaPath = join(sessionsDir, dir, "metadata.json");
      if (existsSync(metaPath)) {
        try {
          const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
          if (meta.parentSessionId === parentSessionId) {
            children.push(dir);
          }
        } catch {}
      }
    }
  }

  return children;
}
```

---

## Diagrama de Cancelación Recursiva

```
Usuario cancela Sesión A
        │
        ▼
abortAllRecursive("A")
        │
        │ BFS Nivel 0: pending = {"A"}
        ├── sub_1 (parentSessionId === "A") → cancelado ✅
        │   pending += {"sub_1"}
        └── sub_2 (parentSessionId === "A") → cancelado ✅
            pending += {"sub_2"}
        │
        │ BFS Nivel 1: pending = {"A", "sub_1", "sub_2"}
        ├── sub_1_1 (parentSessionId === "sub_1") → cancelado ✅
        │   pending += {"sub_1_1"}
        └── sub_2_1 (parentSessionId === "sub_2") → cancelado ✅
            pending += {"sub_2_1"}
        │
        │ BFS Nivel 2: pending = {..., "sub_1_1", "sub_2_1"}
        └── (no más coincidencias) → fin
```

---

## Verificación

### Tests Automatizados

```typescript
describe("DelegationRegistry — Cancelación Recursiva", () => {
  it("cancela subagentes de 3 niveles de profundidad", async () => {
    // Crear árbol: A → sub_1 → sub_1_1 → sub_1_1_1
    const registry = new DelegationRegistry();

    // Nivel 1
    registry.register("user", "A", "tc_1", { subagentSessionId: "sub_1" }, () => {});
    // Nivel 2
    registry.register("user", "sub_1", "tc_2", { subagentSessionId: "sub_1_1" }, () => {});
    // Nivel 3
    registry.register("user", "sub_1_1", "tc_3", { subagentSessionId: "sub_1_1_1" }, () => {});

    // Cancelar desde la raíz
    registry.abortAllRecursive("A");

    // Verificar que todos fueron cancelados
    expect(registry.isCancelled("tc_1")).toBe(true);
    expect(registry.isCancelled("tc_2")).toBe(true);
    expect(registry.isCancelled("tc_3")).toBe(true);
  });

  it("no cancela subagentes de otra rama", async () => {
    // Árbol: A → sub_1, B → sub_2
    registry.register("user", "A", "tc_a1", { subagentSessionId: "sub_1" }, () => {});
    registry.register("user", "B", "tc_b1", { subagentSessionId: "sub_2" }, () => {});

    registry.abortAllRecursive("A");

    expect(registry.isCancelled("tc_a1")).toBe(true);
    expect(registry.isCancelled("tc_b1")).toBe(false); // Rama B intacta
  });

  it("es idempotente: múltiples llamadas no causan error", () => {
    registry.register("user", "A", "tc_1", {}, () => {});
    registry.abortAllRecursive("A");
    expect(() => registry.abortAllRecursive("A")).not.toThrow();
  });
});
```

---

## Riesgos y Consideraciones

| Riesgo | Mitigación |
|---|---|
| BFS itera sobre todas las delegaciones activas en cada nivel | Con <50 delegaciones activas típicas, el coste es negligible. Si escala, añadir índice `parentSessionId → Set<toolCallId>`. |
| `findChildSessions` escanea directorio en cada `destroySession` | Cachear el árbol de sesiones en memoria. Para la primera iteración, el escaneo de disco es aceptable. |
| Sesiones en disco pero no en memoria (tras crash) | El escaneo de `metadata.json` en `findChildSessions` cubre este caso. |

---

## Orden de Ejecución

1. Implementar `abortAllRecursive()` en `delegation-registry.ts` (1 día)
2. Crear `AbortToken` en `apps/server/src/core/abort-token.ts` (1 día)
3. Integrar `AbortToken` en `spawn-subagent-tool.ts` (medio día)
4. Integrar `AbortToken` en `delegate-tool.ts` (medio día)
5. Añadir `findChildSessions` y limpieza recursiva en `session-manager.ts` (1 día)
6. Tests automatizados (1 día)
7. Tests manuales de verificación con árboles de 2-3 niveles (medio día)
