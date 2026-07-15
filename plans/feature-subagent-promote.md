# Plan 6: Sistema `promote()` — Conversión Foreground ↔ Background para Subagentes

**Severidad:** Media  
**Prioridad:** Media (mejora funcional, no bloqueante)  
**Esfuerzo estimado:** 5-8 días  
**Riesgo:** Medio (cambia el modelo de ejecución, requiere manejo cuidadoso de estados)  
**Área:** Funcionalidad / Subagentes

---

## Resumen

Actualmente, la app de producción tiene dos modos implícitos para subagentes:
- **Foreground implícito**: El padre spawnea con `spawn_subagent` y el resultado se inyecta asíncronamente vía `steer()` + `continue()`. El padre no se bloquea, pero tampoco hay forma de esperar activamente.
- **Fire-and-forget puro**: `delegate_task` con algunos targets es verdaderamente asíncrono sin mecanismo de join.

La funcionalidad `promote()` permite transicionar un subagente entre modos **en tiempo de ejecución**:
- **Foreground → Background**: Si un subagente está tardando demasiado, el padre puede "promoverlo" a background y continuar con otras tareas. El resultado se notifica cuando termine.
- **Background → Foreground**: Si un subagente background produce resultados parciales prometedores, el padre puede "promoverlo" a foreground y esperar activamente su resultado.

---

## Análisis del Problema

### Escenarios donde `promote()` es Necesario

**Foreground → Background (timeout adaptativo):**
```
Padre spawnea subagente en foreground
  │
  │ ... 30 segundos después, el subagente sigue ejecutándose ...
  │ El padre necesita seguir con otras tareas
  │
  │ PROMOTE → el subagente sigue en background
  │ El padre continúa su bucle
  │
  │ ... 2 minutos después, el subagente termina
  │ NOTIFY → el resultado se inyecta en la sesión padre
```

**Background → Foreground (descubrimiento de dependencia):**
```
Padre spawnea subagente A en background
Padre spawnea subagente B en background
  │
  │ El padre completa su trabajo actual
  │ Subagente A aún no termina, pero su resultado es crítico
  │
  │ PROMOTE → subagente A pasa a foreground
  │ El padre espera activamente el resultado de A
  │
  │ A termina → el padre recibe el resultado inmediatamente
  │ y puede usarlo para informar su siguiente tarea
```

---

## Solución Propuesta

### Fase 1: Modelo de Estados del Subagente

**Archivo nuevo:** `apps/server/src/core/subagents/subagent-state.ts`

```typescript
export type SubagentMode = "foreground" | "background";

export type SubagentStatus =
  | { mode: "foreground"; status: "running" }
  | { mode: "foreground"; status: "waiting-for-promotion" }
  | { mode: "background"; status: "running" }
  | { mode: "background"; status: "completed" }
  | { mode: "background"; status: "error" };

export interface SubagentHandle {
  /** ID de la sesión del subagente */
  sessionId: string;
  /** ID del tool call que lo creó */
  toolCallId: string;
  /** Modo y estado actual */
  state: SubagentStatus;

  /** Esperar a que el subagente complete (bloquea hasta resultado o timeout) */
  wait(timeoutMs?: number): Promise<SubagentResult>;

  /** Promover a foreground (el padre esperará activamente) */
  promote(): Promise<void>;

  /** Degradar a background (el padre continúa, resultado vía notificación) */
  demote(): Promise<void>;

  /** Cancelar el subagente */
  cancel(): Promise<void>;
}

export interface SubagentResult {
  status: "success" | "partial" | "blocked" | "error" | "timeout";
  executiveSummary: string;
  artifacts: string[];
  risks: string;
  rawText: string;
}
```

### Fase 2: Implementación del SubagentHandle

**Archivo nuevo:** `apps/server/src/core/subagents/subagent-handle.ts`

```typescript
export class SubagentHandleImpl implements SubagentHandle {
  sessionId: string;
  toolCallId: string;
  state: SubagentStatus;

  private completionDeferred: {
    resolve: (result: SubagentResult) => void;
    reject: (err: Error) => void;
  } | null = null;

  private promotionDeferred: {
    resolve: () => void;
  } | null = null;

  private subSession: AgentSession;
  private delegationRegistry: DelegationRegistry;

  constructor(
    sessionId: string,
    toolCallId: string,
    subSession: AgentSession,
    delegationRegistry: DelegationRegistry,
    initialMode: SubagentMode = "foreground",
  ) {
    this.sessionId = sessionId;
    this.toolCallId = toolCallId;
    this.subSession = subSession;
    this.delegationRegistry = delegationRegistry;
    this.state = { mode: initialMode, status: "running" };
  }

  /**
   * El padre espera activamente el resultado.
   * En foreground: espera directa.
   * En background: espera con timeout, devuelve "timeout" si no completa a tiempo.
   */
  async wait(timeoutMs?: number): Promise<SubagentResult> {
    if (this.state.status !== "running") {
      // Ya completó — devolver resultado cacheado
      // ...
    }

    return new Promise((resolve, reject) => {
      this.completionDeferred = { resolve, reject };

      if (timeoutMs) {
        setTimeout(() => {
          if (this.completionDeferred) {
            // Timeout — el subagente sigue en background
            this.state = { mode: "background", status: "running" };
            this.completionDeferred.resolve({
              status: "timeout",
              executiveSummary: `Subagente aún ejecutándose en background (sessionId: ${this.sessionId})`,
              artifacts: [],
              risks: "",
              rawText: "",
            });
            this.completionDeferred = null;
          }
        }, timeoutMs);
      }
    });
  }

  /**
   * Promover a foreground: si alguien está esperando con wait(),
   * o si la promoción viene como comando explícito.
   */
  async promote(): Promise<void> {
    if (this.state.mode === "foreground") {
      return; // Ya está en foreground
    }

    this.state = { mode: "foreground", status: "running" };

    // Notificar a cualquier waiter que estaba bloqueado por promoción
    if (this.promotionDeferred) {
      this.promotionDeferred.resolve();
      this.promotionDeferred = null;
    }
  }

  /**
   * Degradar a background: el padre deja de esperar, el subagente sigue.
   */
  async demote(): Promise<void> {
    if (this.state.mode === "background") {
      return; // Ya está en background
    }

    this.state = { mode: "background", status: "running" };
  }

  async cancel(): Promise<void> {
    this.subSession.abort();
    this.delegationRegistry.abortAllRecursive(this.sessionId);
    this.state = { mode: "background", status: "error" };
  }

  /**
   * Llamado internamente cuando el subagente completa su ejecución.
   */
  complete(result: SubagentResult): void {
    this.state = {
      mode: this.state.mode,
      status: result.status === "error" ? "error" : "completed",
    };

    if (this.completionDeferred) {
      this.completionDeferred.resolve(result);
      this.completionDeferred = null;
    }
  }
}
```

### Fase 3: Integración en spawn_subagent

**Archivo:** `apps/server/src/core/tools/spawn-subagent-tool.ts`

Reemplazar el fire-and-forget actual con el modelo de Handle:

```typescript
// En lugar de:
// subSession.prompt(args.task).then(...).catch(...).finally(...)
// return { terminate: true }

// Crear handle
const handle = new SubagentHandleImpl(
  subagentSessionId,
  toolCallId,
  subSession,
  delegationRegistry,
  "foreground", // Modo inicial
);

// Registrar en el registry
delegationRegistry.registerHandle(username, parentSessionId, toolCallId, handle);

// Iniciar ejecución en background (no bloquea el retorno de la tool)
handle.startExecution(args.task);

// Retornar inmediatamente — el padre puede hacer wait/promote/demote después
return {
  content: [{
    type: "text",
    text: `Subagente iniciado en modo foreground.\n` +
      `Session ID: ${subagentSessionId}\n` +
      `Usa wait_for_subagent para esperar el resultado.\n` +
      `Usa promote_subagent para cambiar a foreground.\n` +
      `Usa demote_subagent para cambiar a background.`,
  }],
  metadata: {
    subagentSessionId,
    toolCallId,
    handleAvailable: true,
  },
};
```

### Fase 4: Nuevas Tools para el Agente Padre

**Archivos nuevos:**

1. **`wait_for_subagent`** — `apps/server/src/core/tools/wait-subagent-tool.ts`
2. **`promote_subagent`** — `apps/server/src/core/tools/promote-subagent-tool.ts`
3. **`demote_subagent`** — `apps/server/src/core/tools/demote-subagent-tool.ts`

```typescript
// wait_for_subagent
export function createWaitForSubagentTool(registry: DelegationRegistry) {
  return {
    name: "wait_for_subagent",
    description: "Espera activamente el resultado de un subagente. " +
      "Úsalo cuando necesites el resultado antes de continuar. " +
      "Si el subagente está en background, esta llamada lo promueve a foreground automáticamente.",
    parameters: {
      type: "object",
      properties: {
        tool_call_id: {
          type: "string",
          description: "El tool_call_id del spawn_subagent original",
        },
        timeout_seconds: {
          type: "number",
          description: "Timeout máximo en segundos (default: 300). " +
            "Si se excede, el subagente vuelve a background.",
        },
      },
      required: ["tool_call_id"],
    },
    execute: async (_tcId, params) => {
      const handle = registry.getHandle(params.tool_call_id);
      if (!handle) {
        return { content: [{ type: "text", text: "Error: delegación no encontrada." }] };
      }

      const timeoutMs = (params.timeout_seconds ?? 300) * 1000;
      const result = await handle.wait(timeoutMs);

      if (result.status === "timeout") {
        return { content: [{ type: "text", text: result.executiveSummary }] };
      }

      return {
        content: [{
          type: "text",
          text: formatSubagentResult(result),
        }],
      };
    },
  };
}

// promote_subagent
export function createPromoteSubagentTool(registry: DelegationRegistry) {
  return {
    name: "promote_subagent",
    description: "Promueve un subagente de background a foreground. " +
      "El padre esperará activamente su resultado.",
    parameters: {
      type: "object",
      properties: {
        tool_call_id: {
          type: "string",
          description: "El tool_call_id del spawn_subagent original",
        },
      },
      required: ["tool_call_id"],
    },
    execute: async (_tcId, params) => {
      const handle = registry.getHandle(params.tool_call_id);
      if (!handle) {
        return { content: [{ type: "text", text: "Error: delegación no encontrada." }] };
      }

      await handle.promote();

      return {
        content: [{
          type: "text",
          text: `Subagente ${handle.sessionId} promovido a foreground. ` +
            `Usa wait_for_subagent para esperar su resultado.`,
        }],
      };
    },
  };
}

// demote_subagent
export function createDemoteSubagentTool(registry: DelegationRegistry) {
  return {
    name: "demote_subagent",
    description: "Degrada un subagente de foreground a background. " +
      "El padre continúa su ejecución y recibirá el resultado vía notificación cuando el subagente termine.",
    parameters: {
      type: "object",
      properties: {
        tool_call_id: {
          type: "string",
          description: "El tool_call_id del spawn_subagent original",
        },
      },
      required: ["tool_call_id"],
    },
    execute: async (_tcId, params) => {
      const handle = registry.getHandle(params.tool_call_id);
      if (!handle) {
        return { content: [{ type: "text", text: "Error: delegación no encontrada." }] };
      }

      await handle.demote();

      return {
        content: [{
          type: "text",
          text: `Subagente ${handle.sessionId} degradado a background. ` +
            `El resultado se notificará cuando termine.`,
        }],
      };
    },
  };
}
```

### Fase 5: Frontend — Indicador de Modo y Controles

**Archivo:** `apps/client/src/components/chat/tools/ToolCallRow.tsx`

```
┌──────────────────────────────────────────────────────────┐
│ 🔵 FOREGROUND — Arreglando bug en auth.ts                │
│ [■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■□□□□□□□] 78%           │
│                                                          │
│ [⏸️ Degradar a Background]  [⏹️ Cancelar]                │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ 🟡 BACKGROUND — Analizando dependencias                  │
│ En ejecución desde hace 2m 30s                           │
│                                                          │
│ [▶️ Promover a Foreground]  [⏹️ Cancelar]                │
└──────────────────────────────────────────────────────────┘
```

---

## Diagrama de Transiciones de Estado

```
                    ┌─────────────────┐
                    │   FOREGROUND    │
                    │    (running)    │
                    └───┬───────┬─────┘
            complete()  │       │  demote()
                        │       │
                        ▼       ▼
              ┌──────────┐  ┌─────────────────┐
              │  DONE    │  │   BACKGROUND    │
              │(completed│  │    (running)    │
              │ / error) │  └───┬───────┬─────┘
              └──────────┘      │       │  promote()
                  ▲       cancel()     │
                  │         │          ▼
                  │         ▼    ┌─────────────────┐
                  │    ┌──────────┐   FOREGROUND    │
                  │    │  ERROR   │   (running)     │
                  │    │(cancelled│   ← padre espera │
                  │    └──────────┘   activamente    │
                  │                    └───────┬──────┘
                  └────────────────────────────┘
                                    complete()
```

---

## Verificación

### Tests Automatizados

```typescript
describe("SubagentHandle — Promote/Demote", () => {
  it("wait() en foreground resuelve cuando el subagente completa", async () => {
    const handle = createHandle("sub_1", "tc_1", mockSession, registry, "foreground");
    const resultPromise = handle.wait();

    // Simular completitud
    handle.complete({
      status: "success", executiveSummary: "Done", artifacts: [], risks: "", rawText: "ok",
    });

    const result = await resultPromise;
    expect(result.status).toBe("success");
  });

  it("wait() con timeout en background devuelve timeout sin cancelar subagente", async () => {
    const handle = createHandle("sub_1", "tc_1", mockSession, registry, "background");
    const result = await handle.wait(100); // 100ms timeout

    expect(result.status).toBe("timeout");
    expect(handle.state.mode).toBe("background"); // Sigue en background
  });

  it("promote() despierta a wait() que estaba bloqueado", async () => {
    const handle = createHandle("sub_1", "tc_1", mockSession, registry, "background");

    // Iniciar wait en background (se bloqueará hasta que alguien promueva)
    const waitPromise = handle.wait();
    // wait() está bloqueado...

    // Promover
    await handle.promote();

    // Completar subagente
    handle.complete({
      status: "success", executiveSummary: "Done", artifacts: [], risks: "", rawText: "ok",
    });

    const result = await waitPromise;
    expect(result.status).toBe("success");
    expect(handle.state.mode).toBe("foreground");
  });

  it("demote() cambia a background sin cancelar", async () => {
    const handle = createHandle("sub_1", "tc_1", mockSession, registry, "foreground");
    await handle.demote();

    expect(handle.state.mode).toBe("background");
    expect(handle.state.status).toBe("running");
  });
});
```

### Tests Manuales

1. **Flujo foreground → background**: Spawnear subagente en foreground. A los 5s, llamar `demote_subagent`. Verificar que el padre continúa. El resultado debe llegar vía notificación.
2. **Flujo background → foreground**: Spawnear subagente en background. A los 5s, llamar `promote_subagent` + `wait_for_subagent`. Verificar que el padre espera y recibe el resultado.
3. **Timeout en wait_for_subagent**: Subagente muy largo (300s). `wait_for_subagent` con timeout 5s → recibe timeout, subagente sigue en background.
4. **Cancelación durante wait**: `wait_for_subagent` activo. Cancelar el subagente desde UI → wait rechaza con error.

---

## Consideraciones

| Aspecto | Decisión |
|---|---|
| Timeout por defecto | 300 segundos (5 minutos). Configurable por herramienta. |
| Subagentes foreground máximos | Ilimitado (cada uno tiene su propio AgentSession). |
| Promoción durante streaming | Si el subagente está streameando respuesta, la promoción se encola hasta que termine el turno actual. |
| Degradación automática por timeout | Si el padre no llama a `wait_for_subagent` en N segundos, el subagente se degrada automáticamente a background. |

---

## Orden de Ejecución

1. Definir `SubagentHandle` y `SubagentStatus` (medio día)
2. Implementar `SubagentHandleImpl` con wait/promote/demote/cancel (1.5 días)
3. Refactorizar `spawn-subagent-tool.ts` para usar Handle en lugar de fire-and-forget (1 día)
4. Crear tools `wait_for_subagent`, `promote_subagent`, `demote_subagent` (1 día)
5. Integrar tools en el sistema de tools del agente (medio día)
6. Actualizar `DelegationRegistry` con soporte para Handles (medio día)
7. Frontend: indicadores de modo + botones promote/demote (1 día)
8. Tests automatizados (1 día)
9. Tests manuales (medio día)
