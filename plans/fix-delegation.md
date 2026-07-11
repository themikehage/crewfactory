# Delegation Fixes

Auditoria completa de la implementacion de delegacion (spawn + delegate + registry + frontend).

---

## CRITICAL

### C1 — Delegation result usa `role: "user"` en vez de `role: "toolResult"`

**File:** `apps/server/src/ai/agent-utils.ts:157`

**Problem:** `formatDelegationResultMessage()` retorna `role: "user"`. Cuando el vendor loop procesa este mensaje via `getSteeringMessages()`, el LLM lo ve como un mensaje de usuario normal, no como el resultado de su propia tool call. El LLM puede ignorarlo o malinterpretarlo.

**Fix:**
```typescript
return {
  role: "toolResult",
  toolCallId: `delegation_${toolCallId}`,
  toolName: toolName,
  content: [{ type: "text", text: envelopeStr }],
  isError: envelope.status === "error" || envelope.status === "blocked",
  timestamp: Date.now(),
};
```

Esto requiere que el vendor loop soporte mensajes con `role: "toolResult"`. Verificar que `getSteeringMessages()` los incluya en el contexto (ya deberia hacerlo porque el loop de pi usa tool roles).

---

## HIGH

### H1 — Sin proteccion contra doble delegacion del mismo toolCallId

**File:** `apps/server/src/core/delegation-registry.ts:191-207`

**Problem:** Si el LLM ejecuta dos veces la misma tool call con el mismo `toolCallId`, `register()` sobrescribe el JSON en disco y el Map `activePromises`. El subagente original sigue corriendo pero nadie puede abortarlo.

**Fix:** En `DelegationRegistry.register()`, checkear si `toolCallId` ya existe:
```typescript
if (this.activePromises.has(toolCallId)) {
  console.warn(`[DelegationRegistry] toolCallId ${toolCallId} already registered — aborting previous`);
  this.activePromises.get(toolCallId)!.abort();
}
```

### H2 — forwardSubagentEvents sin fallback si subscribe falla

**File:** `apps/server/src/core/tools/agent-utils.ts:59-76`, llamada en `delegate-tool.ts:99,126,172`

**Problem:** Si `forwardSubagentEvents()` no puede subscribirse (e.g., sesion padre desconectada), el `catch` interno loggea el error pero `unsub` queda `undefined`. El `finally` block en delegate-tool.ts llama `unsub()` sin guard.

**Fix:** En `forwardSubagentEvents()`, retornar no-op si falla:
```typescript
try {
  unsub = subSession.subscribe(handler);
} catch (err) {
  console.error("[forwardSubagentEvents] Subscribe failed:", err);
  unsub = () => {};  // no-op fallback
}
```

En `delegate-tool.ts`, agregar guard en los `finally` blocks:
```typescript
finally {
  unsub?.();
}
```

### H3 — Parent session not found se maneja silenciosamente

**File:** `apps/server/src/core/tools/spawn-subagent-tool.ts:237,279`

**Problem:** Si `sessionManager.getSession(username, parentSessionId)` retorna `null`, el codigo simplemente no envia el resultado. Sin logging, parece que la delegacion funciona pero el resultado se pierde.

**Fix:**
```typescript
if (!parent) {
  console.warn(`[Subagent] Parent session ${parentSessionId} not found for toolCallId ${toolCallId} — delegation result discarded`);
  return;
}
```

---

## MEDIUM

### M1 — Logica de wakeMessage duplicada entre formatDelegationResultMessage y delegate-tool.ts

**File:** `apps/server/src/core/tools/delegate-tool.ts:217-256`

**Problem:** `delegate-tool.ts` llama a `formatDelegationResultMessage()` pero luego construye otro `wakeMessage` manualmente si `includeFullHistory` es true. La logica de formateo del resultado esta duplicada.

**Fix:** Unificar: que `addDelegationResult()` reciba opciones de formato y se encargue de todo. O eliminar `includeFullHistory` y siempre usar el formato simple.

### M2 — includeFullHistory puede generar mensajes de miles de tokens sin truncar

**File:** `apps/server/src/core/tools/delegate-tool.ts:236`

**Problem:** Si `includeFullHistory` es true, el contenido del tool result se llena con el historial completo de la sesion delegada, potencialmente miles de tokens sin limite.

**Fix:** Truncar a max 4000 chars, o mejor, reemplazar el historial inline con un link a la sesion delegada:
```typescript
const historyStr = includeFullHistory
  ? JSON.stringify(subSessionMessages.slice(-50)).slice(0, 4000) + "..."
  : "";
```

### M3 — FloatingDelegations no se renderiza en ChatArea

**File:** `apps/client/src/components/chat/ChatArea.tsx:596-618`

**Problem:** El componente `FloatingDelegations` existe pero no se renderiza en `ChatArea.tsx`. Solo se usa en `DelegationsPanel.tsx`. El usuario no ve delegaciones activas en el chat principal.

**Fix:** Importar y renderizar `FloatingDelegations` en `ChatArea.tsx`, similar a `FloatingTasks`:
```typescript
import { FloatingDelegations } from "./FloatingDelegations";
// En el JSX:
<FloatingDelegations delegations={delegations} />
```

### M4 — DelegationsPanel no recibe eventos delegation_started/delegation_completed

**File:** `apps/client/src/components/chat/DelegationsPanel.tsx:23`

**Problem:** `DelegationsPanel` usa `useWebSocket(sessionId)`, pero los eventos `delegation_started/completed` se emiten via `broadcastToUser`, no `broadcastToSession`. El panel podria no actualizarse en tiempo real.

**Fix:** Usar el WebSocket global (sin sessionId) o subscribirse al broadcast de usuario directamente:
```typescript
const { subscribe } = useWebSocket();  // sin sessionId
// o escuchar en el nivel de Layout en vez del panel
```

---

## LOW

### L1 — catch(err) sin type guard en delegation-registry.ts

**File:** `apps/server/src/core/delegation-registry.ts:58`

**Problem:** `console.error(err)` imprime `undefined` si el error no es `Error`.

**Fix:**
```typescript
catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err ?? "Unknown error");
  console.error(`[DelegationRegistry] Failed to complete delegation file:`, msg);
}
```

### L2 — toolCallId no sanitizado para URL en ToolCallRow

**File:** `apps/client/src/components/chat/tools/ToolCallRow.tsx:464`

**Problem:** `onOpenSubagentConsole(toolCallId)` construye la ruta como `sub_${toolCallId}`. Si `toolCallId` contiene caracteres no seguros para URL, la navegacion falla.

**Fix:** Sanitizar con `encodeURIComponent()`:
```typescript
onClick={() => onOpenSubagentConsole(encodeURIComponent(toolCallId || ""))}
```

---

## Execution Order

1. **C1** — Cambiar `role: "user"` a `role: "toolResult"` — 1 linea, impacto critico en como el LLM interpreta resultados
2. **H1** — Proteccion contra doble toolCallId — 3 lineas, previene subagentes huerfanos
3. **H2** — forwardSubagentEvents con fallback no-op + guard en finally — 4 lineas, previene crash
4. **H3** — Warning log cuando parent no existe — 2 lineas, debuggabilidad
5. **M1** — Unificar wakeMessage — refactor mediano, revisar ambos callers
6. **M3** — Renderizar FloatingDelegations en ChatArea — agregar import + JSX
7. **M4** — DelegationsPanel con WS global — cambiar useWebSocket()
8. **M2** — Truncar includeFullHistory — 1 linea
9. **L1 + L2** — type guard + sanitize — batch de 2 cambios triviales
