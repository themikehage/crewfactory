COMPLETED
# Plan: Unificar creacion de sesiones de subagente con `getOrCreateSession`

**Severidad:** High
**Prioridad:** High (subagentes no reciben eventos en vivo en el Live Console)
**Esfuerzo estimado:** 2-3 dias
**Riesgo:** Bajo (cambios contenidos en server, sin migraciones, sin cambios de API)
**Area:** Arquitectura / Subagentes

---

## Resumen

Currently `spawn-subagent-tool.ts` crea la sesion del subagente con `createAgentSession()` directo, bypassando `sessionManager.getOrCreateSession()`. Esto produce dos instancias separadas de `AgentSession` para el mismo `sessionId`:

1. **Instancia #1** (la que corre): creada en `spawn-subagent-tool.ts`, nunca registrada en `SessionManager.sessions`
2. **Instancia #2** (la que ve el usuario): creada en `getOrCreateSession` cuando se abre el Live Console, lee mensajes de persistencia pero **no recibe eventos en vivo** porque es un objeto distinto con su propio `eventListeners` vacio

`delegate-tool.ts` ya usa `getOrCreateSession()` correctamente para targets `agent`, `project`, y `session`. Este plan unifica `spawn-subagent-tool.ts` al mismo patron.

## Diseno

### Decisiones de configuracion (definidas con el usuario)

| Aspecto | Subagente |
|---|---|
| Workspace | El del padre |
| Metadata | Si (parentSessionId, subagentType, depth) |
| Agent definition | Si, puede heredarla del padre |
| Skills | Las del padre (skill paths heredados) |
| Prompt builder | Subagent-spawn mode (executor instructions + env context) |
| VendoredSessionManager | Si, via `getOrCreateSession` |
| Tools | Las del padre, filtradas por sandbox |
| Resource loader | Si, parametrizado (`loadSkills: false`) |
| Tool filter (sandbox) | Si |
| MCP | Desactivado por defecto |
| Memory | Desactivado por defecto |
| Registro en `sessions` | Si (la razon de este plan) |

### Flujo propuesto

```
spawn-subagent-tool.ts
  1. Escribir metadata.json (parentSessionId, subagentType, task, depth...)
  2. Crear directorio subagents/{parentId}/sub_{toolCallId}
  3. Crear ResourceLoader parametrizado (loadSkills: false, append: subagent-spawn)
  4. sessionManager.getOrCreateSession(username, subSessionId, ..., overrides)
     └─ Resuelve sessionDir (resolveSubagentSessionDir ✓ ya funciona)
     └─ Crea VendoredSessionManager en el directorio correcto
     └─ Aplica sandbox tool filter (isSubagent ✓ ya funciona)
     └─ Registra en sessions map ← ESTO ES LO NUEVO
  5. Post-creacion: AbortToken, forwardSubagentEvents, delegationRegistry
  6. subSession.prompt(task).then(...) → completion report
```

### Que NO cambia

- `forwardSubagentEvents` sigue existiendo (padre recibe actualizaciones para DelegationsPanel)
- `AbortToken` chaining sigue en spawn-subagent-tool
- `delegationRegistry` sigue trackeando ciclo de vida
- `addDelegationResult()` sigue inyectando resultado al padre
- Cliente (`ChatArea`, `ToolCallRow`, `MessageList`) — sin cambios. El Live Console recibe eventos en vivo automaticamente porque la sesion ahora esta registrada.

---

## Plan de implementacion

### Fase 1: ResourceLoader parametrizable

**Archivo:** `apps/server/src/ai/resource-loader.ts`

Agregar flags `loadAgentsFiles` and `loadSkills` a `DefaultResourceLoaderOptions`:

```typescript
export interface DefaultResourceLoaderOptions {
  cwd: string;
  agentDir: string;
  additionalSkillPaths?: string[];
  appendSystemPrompt?: string[];
  loadAgentsFiles?: boolean;   // default true
  loadSkills?: boolean;         // default true
}
```

En `reload()`:
- Envolver carga de AGENTS.md (lineas 42-69) en `if (this.loadAgentsFiles !== false)`
- Envolver carga de skills (lineas 80-96) en `if (this.loadSkills !== false)`

**Breaking:** No. Los defaults mantienen comportamiento actual.

### Fase 2: Overrides en `getOrCreateSession`

**Archivo:** `apps/server/src/core/session-manager.ts`

Agregar tipo `SessionOverrides` y parametro opcional:

```typescript
export interface SessionOverrides {
  resourceLoader?: DefaultResourceLoader;
  skipMcpTools?: boolean;
  skipMemory?: boolean;
}
```

En `getOrCreateSession`:
- Si `overrides?.resourceLoader` existe, usarlo en vez de crear uno nuevo (saltea prompt builder + skill paths)
- Si `overrides?.skipMcpTools`, saltear carga async de MCP (lineas 409-425)
- Si `overrides?.skipMemory`, saltear `enrichSessionWithMemory` (linea 407)

**Breaking:** No. Parametro opcional sin valor default cambia.

### Fase 3: Prompt builder reconoce SUBAGENT

**Archivo:** `apps/server/src/core/session/prompt-builder.ts`

Agregar check para `SessionPrefix.SUBAGENT` (mismo patron que DELEGATE en lineas 36-48):

```typescript
if (sessionId.startsWith(SessionPrefix.SUBAGENT)) {
  appendPrompts.push(
    buildSubagentInstructions(
      /* task desde metadata? O se pasa como parametro */
    )
  );
}
```

Alternativa mas limpia: si `overrides?.resourceLoader` viene pre-configurado con `appendSystemPrompt`, el prompt builder ni se ejecuta (Fase 2 lo cubre).

**Decision:** La Fase 2 cubre este caso. Si el ResourceLoader ya tiene `appendSystemPrompt` seteado, no se llama al prompt builder. El subagente pasa su propio ResourceLoader con `assemblePromptAppends({ mode: "subagent-spawn" })`.

### Fase 4: Migrar `spawn-subagent-tool.ts`

**Archivo:** `apps/server/src/core/tools/spawn-subagent-tool.ts`

Reemplazar creacion manual (lineas 125-179) con `getOrCreateSession`:

```typescript
// ANTES (a eliminar):
const subSessionManager = VendoredSessionManager.create(subagentDir, subagentDir);
const subResourceLoader = new DefaultResourceLoader({...});
const { session: subSession } = await createAgentSession({...});

// DESPUES:
const subResourceLoader = new DefaultResourceLoader({
  cwd: workspaceDir,
  agentDir: userDir,
  loadSkills: false,
  appendSystemPrompt: assemblePromptAppends({
    mode: "subagent-spawn",
    workspaceDir,
    subagentTask: args.task,
    subagentRole: args.subagentRole,
  }),
});

const parentMeta = sessionManager.metadataStore.getSessionMetadata(username, parentSessionId);
const subSession = await sessionManager.getOrCreateSession(
  username,
  subagentSessionId,
  parentMeta?.projectName,
  undefined, // agentId — opcional, el padre podria pasar uno
  undefined, // channelId
  {
    resourceLoader: subResourceLoader,
    skipMcpTools: true,
    skipMemory: true,
  }
);

// ⚠️ La metadata DEBE existir antes de getOrCreateSession
// (ya se escribe en lineas 108-123, antes de esta migracion)
```

Los pasos 4-6 (AbortToken, forwardSubagentEvents, delegationRegistry.register, prompt) se mantienen igual.

**Breaking:** No. Comportamiento externo identico. Internamente la sesion ahora esta registrada.

### Fase 5: Verificacion

1. **Live Console con streaming en vivo**: Spawnear subagente, abrir Live Console ANTES de que termine. Verificar que los `ThinkingBlock` y `ToolCallRow` aparecen en tiempo real.
2. **Live Console con sesion completada**: Spawnear subagente, esperar a que termine, abrir Live Console. Verificar que mensajes historicos (thinking, tool calls) se renderizan.
3. **Cascade abort**: Abortar sesion padre, verificar que subagentes hijos y nietos se cancelan.
4. **Completion report**: Verificar que el `DelegationNotification` aparece en el chat del padre con status, summary, artifacts.
5. **DelegationsPanel**: Verificar que el panel muestra estado "running" → "success"/"error" en tiempo real.
6. **Navegacion**: Boton "Live Console" en ToolCallRow navega al subagente. Boton "back" en el banner del subagente vuelve al padre.
7. **Session listing**: Sub-agentes (`sub_*`) no aparecen en la lista de sesiones (ya filtrados en `session-lister.ts:43`).

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `apps/server/src/ai/resource-loader.ts` | +2 flags en options, condicionales en `reload()` |
| `apps/server/src/core/session-manager.ts` | +`SessionOverrides`, logica condicional |
| `apps/server/src/core/tools/spawn-subagent-tool.ts` | Reemplazar `createAgentSession` directo por `getOrCreateSession` |
