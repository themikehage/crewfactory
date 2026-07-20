COMPLETED
# Fix TypeScript Type Errors

Resolver los 52 errores de tipo (21 client + 31 server) para lograr `tsc --noEmit` limpio en ambos proyectos.

## Categorias

### A. Client: Missing `react-router-dom` types (21 errores)

**Causa:** 21 archivos importan de `react-router-dom` pero tsc no resuelve sus tipos. `react-router-dom` v7 esta en `package.json` como dependencia y trae tipos propios, pero el `tsconfig.json` del cliente no los resuelve.

**Fix:** Revisar `apps/client/tsconfig.json`:
- Verificar que `compilerOptions.types` incluya o no excluya los tipos de node_modules
- Verificar `compilerOptions.typeRoots` apunte a `node_modules/@types`
- Alternativa: agregar `"moduleResolution": "bundler"` si usa nodenext
- Si react-router-dom v7 no exporta tipos: instalar `@types/react-router-dom` como devDependency

**Archivos afectados:** `App.tsx`, `ChannelChatArea.tsx`, `ChatArea.tsx`, `DelegationsPanel.tsx`, `ModelSelector.tsx`, `AppRouter.tsx`, `MainLayout.tsx`, `TeamChatArea.tsx`, `useWorkspaceContext.ts`, `ChannelDetailPage.tsx`, `PipelinesPage.tsx`, `PluginsPage.tsx`, `SessionsPage.tsx`, `TeamsPage.tsx`, `routes.tsx`, `AdministrativeLeaves.tsx`, `ContextLeaves.tsx`, `LaboratoryRoute.tsx`, `McpRedirectRoute.tsx`, `NotFoundRoute.tsx`, `useRoutePage.ts`

---

### B. Server: Test mocks incompletos (6 errores)

#### B.1 `agent-session.test.ts` (4 errores)
**Lineas:** 61, 76, 120, 135
**Error:** `Type '{}' is missing properties from type 'AuthStorage'`
**Fix:** Reemplazar `{} as AuthStorage` con `{ authPath: "", data: {}, load: async () => ({}), save: async () => {}, ... } as AuthStorage` o crear helper `createMockAuthStorage()` con todas las propiedades requeridas.

#### B.2 `primitives.test.ts:59`
**Error:** `Property 'quorumThreshold' is missing`
**Fix:** Agregar `quorumThreshold: 0.6` (o el valor por defecto) al objeto literal.

#### B.3 `subagent-permission-inheritance.test.ts:160`
**Error:** `This kind of expression is always falsy`
**Fix:** Revisar la condicion — probablemente comparacion contra un valor que la logica de tipos sabe que nunca va a coincidir. Corregir la expresion o agregar type assertion si es intencional.

---

### C. Server: Discriminated union narrowing (2 errores)

**Archivo:** `core/custom-tools/runtime.ts:53,56`
**Error:** `Property 'steps'/'onError' does not exist on type '{ type: "pipeline" } | { type: "ui" }'`
**Fix:** Hacer type narrowing antes de acceder:

```ts
if (definition.execute.type === "pipeline") {
  const result = await executePipeline(
    definition.execute.steps,  // TS sabe que existe
    params,
    runContext,
    definition.execute.onError, // TS sabe que existe
    signal,
    ...
  );
}
```

---

### D. Server: Property not in union type (1 error)

**Archivo:** `core/session/session-lister.ts:324`
**Error:** `Property 'isExecution' does not exist on type 'SessionListItem | { ... }'`
**Causa:** El tipo `SessionListItem` tiene `isExecution` pero el tipo alternativo en la union no. El filter deberia chequear contra `SessionListItem` primero.
**Fix:** Agregar type guard o castear: `filtered = filtered.filter((s): s is SessionListItem => 'isExecution' in s && !!s.isExecution === !!query.isExecution)`

O bien, si ambos lados de la union deberian tener `isExecution`, agregarlo al tipo alternativo.

---

### E. Server: Excess property en object literal (1 error)

**Archivo:** `core/tools/factory-tool.ts:525`
**Error:** `Object literal may only specify known properties, and 'id' does not exist in type`
**Causa:** `teamStore.createTeam()` acepta `CreateTeamParams` que no incluye `id`. El `id` se esta pasando en el body pero deberia ser parte del contrato.
**Fix:** Agregar `id` opcional a `CreateTeamParams` en `teams/team-store.ts`, o pasar `id` por separado al metodo `createTeam`.

---

### F. Server: Wrong type used (8 errores)

#### F.1 `channel-benchmark-runner.ts:97-102` (6 errores)
**Error:** `Property 'id'/'name'/'role'/'systemPrompt'/'model'/'skills' does not exist on type 'AgentEntry'`
**Causa:** `agentRegistry.get(m.agentId)` devuelve `AgentEntry` pero el codigo accede a propiedades de `AgentDefinition`. `AgentEntry` contiene una propiedad `server: AgentServer` que a su vez tiene `definition: AgentDefinition`.
**Fix:** Cambiar a `definition.server.definition.id` (etc.) o desestructurar: `const def = definition.server.definition;`

#### F.2 `channel-benchmark-runner.ts:202-204` (3 errores)
**Error:** `Type 'number | undefined' / 'boolean | undefined' is not assignable to type 'number' / 'boolean'`
**Causa:** `maxChainDepth`, `showThinking`, `showTools` pueden ser undefined pero el destino los requiere.
**Fix:** Agregar valores por defecto: `maxChainDepth: originalChannel.maxChainDepth ?? 10`, `showThinking: originalChannel.showThinking ?? true`, `showTools: originalChannel.showTools ?? true`

---

### G. Server: Implicit any (2 errores)

**Archivo:** `routes/files.ts:200`
**Error:** `Parameter 'val'/'key' implicitly has an 'any' type`
**Causa:** `c.res.headers.forEach((val, key) => ...)` — Hono tipa `c.res.headers` como `Headers` pero el callback no tiene tipos.
**Fix:** Tipar explicitamente: `c.res.headers.forEach((val: string, key: string) => {` o agregar `"noImplicitAny": false` en tsconfig (no recomendado). Alternativa: usar `for (const [key, val] of c.res.headers.entries())`.

---

### H. Server: Unintentional comparison + missing property (3 errores)

#### H.1 `team-orchestrator.ts:172`
**Error:** `This comparison appears to be unintentional because the types '"Negotiation"' and '"Orchestration"' have no overlap`
**Causa:** El tipo de `team.teamType` ya esta estrechado a `"Negotiation"` antes de la comparacion (por un early return o guard anterior), haciendo que `=== "Orchestration"` sea siempre falsa.
**Fix:** Revisar la logica del flujo anterior. Si hay un early return que filtra `"Orchestration"`, removerlo. Si `runLoopPromise` solo se ejecuta para `"Negotiation"`, eliminar el check condicional y llamar directamente a `runStatelessDebateLoop`.

#### H.2 `team-orchestrator.ts:260`
**Error:** `Property 'replyMode' is missing in type '{ agentId, role, outputMode }[]' but required in type`
**Causa:** `team.members` no tiene `replyMode` pero `buildAgentNameMap` espera `TeamMember[]` que requiere `replyMode`.
**Fix:** Mapear miembros para incluir `replyMode`: `team.members.map(m => ({ ...m, replyMode: "broadcast" }))` o ajustar el tipo `buildAgentNameMap` para que `replyMode` sea opcional.

#### H.3 `team-prompt-runner.ts:222`
**Error:** `Property 'context' does not exist on type`
**Causa:** La definicion del Team sin `context` — probablemente el tipo no incluye `context`.
**Fix:** Agregar `context?: ChannelContextItem[]` al tipo del Team, o castear `(team as any).context`.

---

## Priorizacion

| Prioridad | Categoria | Errores | Esfuerzo |
|-----------|-----------|---------|----------|
| P0 | A. Client react-router-dom types | 21 | Bajo (config) |
| P0 | C. Discriminated union narrowing | 2 | Bajo |
| P0 | D. Property in union type | 1 | Bajo |
| P0 | F1. channel-benchmark AgentEntry | 6 | Bajo |
| P0 | H1. team-orchestrator comparison | 1 | Medio |
| P1 | B. Test mocks | 6 | Bajo |
| P1 | E. Excess property factory-tool | 1 | Bajo |
| P1 | F2. undefined defaults | 3 | Bajo |
| P1 | G. Implicit any | 2 | Bajo |
| P1 | H2/H3. Missing properties | 2 | Bajo |

## Verificacion

```bash
cd apps/client && npx tsc --noEmit && echo "CLIENT OK"
cd apps/server && npx tsc --noEmit && echo "SERVER OK"
```
