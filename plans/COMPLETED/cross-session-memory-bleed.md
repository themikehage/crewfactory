COMPLETED
# Plan: Corregir bleed de memoria entre sesiones en canales

## Problema

Cuando un usuario inicia una nueva sesión en un canal, los agentes reciben memorias de sesiones anteriores a través de `buildContext()`, lo que causa que continúen tareas previas no solicitadas.

El caso concreto:
1. Usuario pide revisión de código en sesión N
2. Los agentes procesan, delegan, y almacenan memorias
3. Usuario dice "para" (no aborta completamente)
4. En sesión N+1, usuario dice "hola"
5. `buildContext("hola")` recupera memorias de la sesión N vía FTS5
6. Las memorias se inyectan en el prompt → agente continúa el juicio

## Causas raíz

### 1. Memory injection sin filtro de sesión
`agent-prompt-runner.ts:170-173` — `buildContext()` hace recall semántico sin filtrar por sesión:
```
agentEntry.server.memory.buildContext(incomingMsg.content)
channelMemory.buildContext(incomingMsg.content)
```

### 2. Auto-store crea feedback loop
`agent-prompt-runner.ts:347-353` — cada respuesta del agente se guarda automáticamente como memoria episódica, alimentando el ciclo.

### 3. Abort incompleto
`channel-orchestrator.ts` — `abortDispatch()` no propaga el abort a todas las delegaciones en curso.

### 4. Sin umbral de sustancia
`buildContext` se llama incluso para mensajes triviales ("hola", "para") donde no tiene sentido inyectar memorias.

## Solución propuesta

### 1. Memory injection consciente de sesión (HIGH)

Añadir un campo `sessionId` a las memorias y filtrar por contexto:

**Server changes:**
- `local-provider.ts`: Añadir `sessionId` opcional al schema de `memories`
- `agent-prompt-runner.ts`: Pasar `sessionId` a `buildContext` y filtrar por sesión actual O solo memorias sin sesión (memorias "globales" del agente)
- Alternativa más simple: en `buildContext`, excluir memorias etiquetadas con sesiones diferentes a la actual

**Schema change (`local-provider.ts`):**
```sql
ALTER TABLE memories ADD COLUMN session_id TEXT;
```

### 2. Gate de sustancia para memory injection (HIGH)

No inyectar memorias cuando el mensaje es trivial:

**Server change (`agent-prompt-runner.ts`):**
```ts
function isSubstantiveMessage(content: string): boolean {
  const trivial = /^(hola|para|ok|si|no|gracias|dale|listo|\.\.\.)$/i;
  return content.trim().length > 10 && !trivial.test(content.trim());
}
```

Solo ejecutar `buildContext` si `isSubstantiveMessage(incomingMsg.content)`.

### 3. Etiquetar memorias inyectadas como históricas (MEDIUM)

En lugar de `"--- Relevant Memories ---"`, usar `"--- Memories from previous sessions (for context only) ---"` para que el agente entienda que son históricas, no parte de la conversación actual.

**Server change (`local-provider.ts:134`):**
```ts
return `--- Memories from previous sessions (for context only) ---\n${lines}`;
```

### 4. Fix abort propagation (MEDIUM)

Asegurar que `abortDispatch` cancele todas las delegaciones hijas:

**Server change (`channel-orchestrator.ts`):**
- Propagar abort a `agentWorkQueue`
- Cancelar señales de delegaciones activas
- Limpiar streams activos

### 5. Reset opcional de memoria (LOW)

Añadir en el `ChannelMemoriesModal` un botón para limpiar TODAS las memorias del canal (no solo verlas). Y un botón en la toolbar para "Resetear contexto del agente".

## Prioridades

| # | Acción | Esfuerzo | Impacto |
|---|---|---|---|
| 1 | Gate de sustancia en `buildContext` | ~30 min | Alto — corta el bleed inmediato |
| 2 | Etiquetar memorias como históricas | ~15 min | Alto — agente no confunde memoria con contexto actual |
| 3 | Fix abort propagation | ~2-3h | Alto — permite cortar ejecución en curso |
| 4 | Session-scoped memory filter | ~3-4h | Medio — solución completa pero más compleja |
| 5 | Botón "reset memory" en UI | ~2h | Medio — da control al usuario |

## Implementación recomendada

**Fase 1 (emergencia, ~1h):**
- Gate de sustancia (impid que "hola" gatille memorias)
- Etiquetar memorias como históricas
- Fix abort propagation básico

**Fase 2 (completo, ~4h):**
- Session-scoped memory filter
- Botón "reset memory" en UI
- Botón "reset context" en toolbar del canal

## Archivos a modificar

- `apps/server/src/channels/agent-prompt-runner.ts` — gate de sustancia, etiquetado histórico, pasar sessionId
- `apps/server/src/core/memory/local-provider.ts` — schema opcional de sessionId, etiquetado histórico
- `apps/server/src/channels/channel-orchestrator.ts` — fix abort propagation
- `apps/client/src/components/channels/ChannelMemoriesModal.tsx` — botón de limpiar memorias
- `apps/client/src/components/channels/ChannelChatArea.tsx` — botón de reset contexto
