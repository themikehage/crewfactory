# Decompose SessionManager — Extract Sub-Modules, Unify Resolution, and Remove Boilerplate

**Status:** Pending
**Date:** 2026-07-12
**Scope:** Backend-only refactoring of `apps/server/src/core/session-manager.ts`

---

## Problem Statement

`getOrCreateSession()` at `session-manager.ts:278-691` is 414 lines long and contains 24+ distinct responsibilities: workspace resolution, agent definition loading, skill-path assembly, MCP tool enumeration, prompt building, resource-loader initialization, session recovery/creation, memory initialization, tool-factory invocation, `beforeToolCall` hook creation, active-tool resolution, memory prompt enrichment, MCP dynamic loading, and event-subscription wiring. This monolith is untestable, impossible to reason about as a whole, and has no clear internal boundaries.

Three duplicated patterns compound the problem. First, subagent session-directory resolution (scanning parent sessions for `sub_*` folders) is implemented identically at `session-manager.ts:295-308` and `metadata-store.ts:13-49` — a copy-paste that will drift. Second, the `resolveModelWithFallback` utility in `agent-utils.ts:113-129` exists but is ignored by `ChannelOrchestrator.runAgentPrompt` (lines 485-496) and `LabJudge.evaluateRuns` (lines 63-77), which each inline their own model-resolution logic. Third, `SessionManager` has 66 lines of pass-through delegation (L130-196) that forward calls to `userConfigManager` and `sessionMetadataStore` with no added value, forcing every consumer to call through `sessionManager` instead of accessing the target module directly.

The refactoring extracts `getOrCreateSession` into 6 focused sub-modules, unifies duplicated logic into a shared utility, eliminates inline model-resolution in favor of the existing helper, and removes the passthrough boilerplate by exposing sub-modules as public readonly properties. The goal is testability, single-responsibility modules, and ~300 fewer lines in `session-manager.ts` with zero behavioral change.

---

## Current Architecture

```
                         SessionManager.getOrCreateSession()
                                  (414 lines)
┌─────────────────────────────────────────────────────────────────────┐
│  L294-308   resolveSubagentSessionDir()                             │
│  L309-311   mkdirSync                                                │
│  L313-337   read/merge/write metadata.json                           │
│  L339       ensureWorkspaceStructure()                               │
│  L341-349   select workspaceDir (channel > agent > project > base)   │
│  L351-352   mkdirSync workspaceDir                                   │
│  L355-357   ensureWorkspaceSubdirs() for non-base workspaces         │
│  L359       getUserContext() → authStorage, modelRegistry            │
│  L361-382   resolveAgentDefinition (incl. lab-architect lazy reg)   │
│  L384-392   getResolvedSkillPaths + agent-specific skill dirs        │
│  L394-402   enumerate MCP tool names                                 │
│  L404-413   sessionPromptBuilder.buildSystemPrompts()                │
│  L415-421   DefaultResourceLoader + reload()                         │
│  L423-437   recover or create VendoredSessionManager                 │
│  L439-442   memoryRegistry.get()                                     │
│  L444-453   sessionToolFactory.createSessionTools()                  │
│  L455-514   createAgentSession({ beforeToolCall: ... })              │
│  L516-563   resolveActiveTools + setActiveToolsByName                │
│  L565-570   wrap session.prompt with memory enrichment               │
│  L572-588   async MCP dynamic tool loading                           │
│  L590-671   subscribe session events → EventBroker                   │
│  L673-686   wire unsubscribe, store entry, return session            │
└─────────────────────────────────────────────────────────────────────┘

        ┌──────────────────┐                  ┌──────────────────┐
        │ metadata-store.ts │                  │ agent-utils.ts    │
        │                   │                  │                  │
        │ L13-49: subagent  │                  │ L113-129:        │
        │ session dir       │                  │ resolveModel     │
        │ resolution        │                  │ WithFallback()   │
        │ (DUPLICATED from  │                  │ (UNUSED by 2 of  │
        │  session-manager) │                  │  3 callers)      │
        └──────────────────┘                  └──────────────────┘

SessionManager passthroughs (L130-196):
  userConfigManager ← 12 methods (ensureUserDir, getUserEnv, get/set user settings,
                    getUserContext, user password, etc.)
  sessionMetadataStore ← 4 methods (save/get metadata, persist/get tools)

Callers (80 references across 20 files):
  sessionManager.ensureUserDir()      (13 calls)
  sessionManager.getUserEnv()         (9 calls)
  sessionManager.getUserContext()     (13 calls)
  sessionManager.getSessionMetadata() (7 calls)
  sessionManager.saveSessionMetadata()(6 calls)
  ... and 8 more delegation methods
```

---

## Proposed Architecture

```
                      SessionManager.getOrCreateSession()
                              (~120 lines)
┌──────────────────────────────────────────────────────────────────────┐
│  1. resolveSessionWorkspace() → { sessionDir, workspaceDir }         │
│  2. read/merge metadata.json                                         │
│  3. resolveAgentDefinition() → { agentDef, hasExaKey? }              │
│  4. skillPaths + MCP tool enumeration                                │
│  5. sessionPromptBuilder.buildSystemPrompts()                        │
│  6. DefaultResourceLoader + VendoredSessionManager                   │
│  7. memory + customTools via sessionToolFactory                      │
│  8. createAgentSession({ beforeToolCall: createBeforeToolCallHook() })│
│  9. resolveActiveTools() → setActiveToolsByName                      │
│ 10. enrichSessionWithMemory()                                        │
│ 11. MCP dynamic load (async, fire-and-forget)                        │
│ 12. subscribeSessionEvents() → unsubscribe                           │
│ 13. store entry, return session                                      │
└──────────────────────────────────────────────────────────────────────┘

    ┌────────────────────────┐    ┌──────────────────────────┐
    │ workspace-resolver.ts   │    │ tool-activation-engine.ts │
    │                        │    │                          │
    │ resolveSessionWorkspace│    │ resolveActiveTools()     │
    │  (shared w/ metadata-  │    │  → active tool names[]   │
    │   store)               │    │  (L516-563)              │
    │                        │    └──────────────────────────┘
    │ resolveSubagentSession │
    │   Dir()                │    ┌──────────────────────────┐
    └────────────────────────┘    │ session-event-publisher.ts│
                                  │                          │
    ┌────────────────────────┐    │ subscribeSessionEvents()  │
    │ before-tool-call-hook.ts│    │  → unsubscribe fn        │
    │                        │    │  (caches sessionName once)│
    │ createBeforeToolCall   │    └──────────────────────────┘
    │   Hook()               │
    │  → beforeToolCall cb   │    ┌──────────────────────────┐
    └────────────────────────┘    │ session-memory-enricher.ts│
                                  │                          │
    ┌────────────────────────┐    │ enrichSessionWithMemory() │
    │ agent-definition-      │    │  wraps session.prompt     │
    │   resolver.ts          │    └──────────────────────────┘
    │                        │
    │ resolveAgentDefinition │
    │  → { agentDef, hasExa }│
    └────────────────────────┘

     ┌──────────────────────────────────────────┐
     │              agent-utils.ts               │
     │                                          │
     │  resolveModelWithFallback()  (existing)   │
     │    ↑ now used by:                         │
     │    ├── ChannelOrchestrator.runAgentPrompt  │
     │    └── LabJudge.evaluateRuns              │
     └──────────────────────────────────────────┘

SessionManager now exposes as public readonly:
  sessionManager.userConfig    // userConfigManager
  sessionManager.metadataStore // sessionMetadataStore
  sessionManager.lister        // sessionLister

Callers migrate from:
  sessionManager.ensureUserDir(u)     → sessionManager.userConfig.ensureUserDir(u)
  sessionManager.getUserEnv(u)        → sessionManager.userConfig.getUserEnv(u)
  sessionManager.getSessionMetadata() → sessionManager.metadataStore.getSessionMetadata()
  ... etc.
```

---

## Implementation Steps

### Step 1: Create `workspace-resolver.ts` with unified subagent dir resolution

**File:** `apps/server/src/core/session/workspace-resolver.ts`

**Sub-tasks:**
1. Extract the subagent session-directory resolution into `resolveSubagentSessionDir(username, sessionId): string | null`
   - Signature: given a username and a `sub_*` sessionId, scans `{userDir}/sessions/*/subagents/{sessionId}` and returns the found directory path or null
   - Consolidate the 17-line block from `session-manager.ts:295-308` and the identical blocks from `metadata-store.ts:13-29` and `metadata-store.ts:33-49`
   - Use `import { getUserDir } from "shared"` and `readdirSync`, `existsSync`, `join` from Node
2. Create `resolveSessionWorkspace(username, sessionId, projectName?, agentId?, channelId?): { sessionDir: string; workspaceDir: string }`
   - Calls `resolveSubagentSessionDir` for the sessionDir resolution
   - Falls back to `getSessionDir(username, sessionId)` if not a subagent or not found
   - Calls `ensureWorkspaceStructure(username)` (or decouple this, see note below)
   - Selects workspaceDir: channel > agent > project > base
   - Calls `ensureWorkspaceSubdirs(workspaceDir)` for non-base workspaces
   - Creates `workspaceDir` via `mkdirSync({ recursive: true })` if missing
3. Update `metadata-store.ts` to import and use `resolveSubagentSessionDir` from `workspace-resolver.ts`
   - Replace `getMetadataPath` (L11-30) and `ensureSessionDir` (L32-54) subagent-resolution blocks with the shared function
   - `getMetadataPath` becomes: `let sessionDir = resolveSubagentSessionDir(username, sessionId) ?? getSessionDir(username, sessionId); return join(sessionDir, "metadata.json")`
   - `ensureSessionDir` similarly uses the shared resolver + the mkdir fallback

**Note on `ensureWorkspaceStructure`:** Currently `getOrCreateSession` calls `ensureWorkspaceStructure(username)` at L339 which creates AGENTS.md, default skills, project dirs, etc. This is a heavy side effect. For this refactoring, `resolveSessionWorkspace` will call `ensureWorkspaceStructure` internally to preserve exact behavior. A future plan can extract this into a lazy-initialization pattern.

### Step 2: Create `tool-activation-engine.ts`

**File:** `apps/server/src/core/session/tool-activation-engine.ts`

**Sub-tasks:**
1. Export `resolveActiveTools(params): string[]` where params = `{ username, sessionId, systemTools, customTools, hasExaKey, memoryEnabled, resolvedAgentId }`
2. Absorb L516-563 from `session-manager.ts`:
   - Determine `activeTools = persistedTools || systemTools`
   - Filter out `exa_search` if `!hasExaKey`
   - Compute `alwaysOnTools` list (conditional on `resolvedAgentId`)
   - Build `definedToolNames` set from systemTools + bash + exa_search + alwaysOnTools + memory tools
   - Union + filter: `combinedTools` = unique(activeTools + alwaysOnTools + memoryTools) filtered by definedToolNames
3. This module is a pure function — no side effects, fully testable

### Step 3: Create `session-event-publisher.ts`

**File:** `apps/server/src/core/session/session-event-publisher.ts`

**Sub-tasks:**
1. Export `subscribeSessionEvents(params): () => void` where params = `{ session, username, sessionId, getSessionMeta(): Record<string,any>|null }`
2. Absorb L590-671 from `session-manager.ts`:
   - Subscribe to session events
   - On `agent_start`, `agent_end`, `tool_start`, `tool_end`, `agent_error`: save metadata `updatedAt`
   - On all events: publish via `eventBroker.publishEvent()`
   - Handle `message_update` → `text_delta` and `thinking_delta` separately
3. **Critical optimization:** Cache `getSessionName` result once at subscription time instead of recomputing on every event (currently called 7 times per event). Move the `getSessionName()` closure to be computed once before the subscribe callback.
4. Returns the unsubscribe function (not wired into the session manager's compound unsubscribe yet — that happens in Step 7)

### Step 4: Create `before-tool-call-hook.ts`

**File:** `apps/server/src/core/session/before-tool-call-hook.ts`

**Sub-tasks:**
1. Export `createBeforeToolCallHook(params): beforeToolCallCallback` where params = `{ sessionId }`
2. Absorb L462-513 from `session-manager.ts`:
   - Evaluate tool via `permissionEngine.evaluate()`
   - Block if `allow === false`
   - If `allow === "ask"`: register approval, abortsignal listener, dynamic import `../ws/handler` to broadcast, await approvalPromise, handle deny
   - Return `undefined` if allowed
3. The dynamic import of `../ws/handler` (L487) must be preserved exactly — this is intentional to avoid a circular dependency at module load time

### Step 5: Create `session-memory-enricher.ts`

**File:** `apps/server/src/core/session/session-memory-enricher.ts`

**Sub-tasks:**
1. Export `enrichSessionWithMemory(session: AgentSession, memory): void`
2. Absorb L565-570:
   - Save `session.prompt` original binding
   - Replace `session.prompt` with a wrapper that calls `memory.buildContext(message)` prepends result to message, then calls original
3. This is a thin wrapper, but extracting it gives the memory enrichment a name and testable boundary

### Step 6: Create `agent-definition-resolver.ts`

**File:** `apps/server/src/core/session/agent-definition-resolver.ts`

**Sub-tasks:**
1. Export `resolveAgentDefinition(params): { agentDef?, hasExaKey? }` where params = `{ username, resolvedAgentId, userConfigManager }`
2. Absorb L361-382:
   - If `resolvedAgentId` is `lab-architect`, lazy-register it if not already registered
   - Look up agent in `agentRegistry.get(resolvedAgentId)`
   - Return `{ agentDef: entry?.server.definition }`
3. Note: `hasExaKey` is currently determined in `sessionToolFactory.createSessionTools()` (L444-453), not in L361-382. The plan context mentions it but per the current code, `hasExaKey` comes from the tool factory. So the return type should be just `{ agentDef }` unless we want to move Exa key detection. **Decision:** Keep `hasExaKey` in the tool factory where it belongs. The module returns `{ agentDef }`.

### Step 7: Refactor `getOrCreateSession` to orchestrate the 6 sub-modules

**File:** `apps/server/src/core/session-manager.ts`

**Sub-tasks:**
1. Import all 6 new sub-modules
2. Remove all extracted code blocks (L294-308, L339-357, L361-382, L455-514, L516-563, L565-570, L590-671)
3. Replace with orchestrated calls:
   ```typescript
   const { sessionDir, workspaceDir } = resolveSessionWorkspace(username, sessionId, resolvedProjectName, resolvedAgentId, resolvedChannelId);
   // ... metadata handling stays inline (~20 lines, acceptable) ...
   const { agentDef } = resolveAgentDefinition({ username, resolvedAgentId, userConfigManager });
   // ... skill paths, MCP tools, prompt builder, resource loader, session manager ...
   // ... tool factory (customTools, hasExaKey) ...
   const beforeToolCall = createBeforeToolCallHook({ sessionId });
   const { session } = await createAgentSession({ ..., beforeToolCall });
   const combinedTools = resolveActiveTools({ username, sessionId, systemTools, customTools, hasExaKey, memoryEnabled, resolvedAgentId });
   session.setActiveToolsByName(combinedTools);
   enrichSessionWithMemory(session, memory);
   // ... MCP dynamic load (stays inline, fire-and-forget IIFE) ...
   const eventsUnsub = subscribeSessionEvents({ session, username, sessionId, getSessionMeta: () => this.metadataStore.getSessionMetadata(username, sessionId) });
   ```
4. The final `getOrCreateSession` should be ~120 lines (down from 414)
5. The extract functions `ensureWorkspaceSubdirs`, `ensureWorkspaceStructure`, and `getResolvedSkillPaths` stay in `session-manager.ts` as top-level exports (they're used elsewhere and are fine)

### Step 8: Unify model resolution with `resolveModelWithFallback`

**File:** `apps/server/src/channels/channel-orchestrator.ts` (L485-496)

Replace:
```typescript
if (!agentEntry.server.session.model) {
  const { modelRegistry } = sessionManager.getUserContext(username);
  modelRegistry.refresh();
  const available = modelRegistry.getAvailable();
  if (available.length > 0) {
    try {
      await agentEntry.server.session.setModel(available[0]);
    } catch (e) {
      console.error(...);
    }
  }
}
```
With:
```typescript
if (!agentEntry.server.session.model) {
  const { modelRegistry } = sessionManager.getUserContext(username);
  modelRegistry.refresh();
  const resolved = resolveModelWithFallback(undefined, modelRegistry);
  if (resolved) {
    try {
      await agentEntry.server.session.setModel(resolved);
    } catch (e) {
      console.error(...);
    }
  }
}
```
Note: `resolveModelWithFallback(undefined, modelRegistry)` returns `provider/id` format string when models are available. Need to verify that `session.setModel()` accepts `string` in addition to `Model` objects — if not, adjust accordingly.

**File:** `apps/server/src/laboratory/judge.ts` (L63-77)

Replace:
```typescript
if (judgeModel) {
  const { modelRegistry } = sessionManager.getUserContext(username);
  let provider = judgeModel;
  let modelId = judgeModel;
  if (judgeModel.includes("/")) {
    const parts = judgeModel.split("/");
    provider = parts[0];
    modelId = parts.slice(1).join("/");
  }
  const model = modelRegistry.find(provider, modelId) ||
                modelRegistry.getAvailable().find(m => m.id === judgeModel || `${m.provider}/${m.id}` === judgeModel);
  if (model) {
    await session.setModel(model);
  }
}
```
With:
```typescript
if (judgeModel) {
  const { modelRegistry } = sessionManager.getUserContext(username);
  const resolved = resolveModelWithFallback(judgeModel, modelRegistry);
  if (resolved) {
    const model = modelRegistry.getAvailable().find(
      m => m.id === resolved || `${m.provider}/${m.id}` === resolved
    );
    if (model) {
      await session.setModel(model);
    }
  }
}
```
Note: `resolveModelWithFallback` returns a string in `provider/id` or `id` format. The judge currently uses `modelRegistry.find(provider, modelId)` which is different from `modelRegistry.getAvailable().find(...)`. We need to double-check which API is correct at implementation time. The `resolveModelWithFallback` returns the string representation — the judge may need to also parse that back or use a different lookup approach.

### Step 9: Remove SessionManager passthrough boilerplate

**Sub-tasks:**
1. Add public readonly properties to `SessionManager`:
   ```typescript
   readonly userConfig = userConfigManager;
   readonly metadataStore = sessionMetadataStore;
   readonly lister = sessionLister;
   ```
2. Delete all 12 passthrough methods (L130-196):
   - `ensureUserDir` (L134-136) → `sessionManager.userConfig.ensureUserDir(username)`
   - `getUserEnv` (L138-139) → `sessionManager.userConfig.getUserEnv(username)`
   - `setUserEnv` (L142-143) → `sessionManager.userConfig.setUserEnv(username, key, value)`
   - `setUserEnvMap` (L146-148) → `sessionManager.userConfig.setUserEnvMap(username, env)`
   - `deleteUserEnv` (L150-152) → `sessionManager.userConfig.deleteUserEnv(username, key)`
   - `getUserSettings` (L154-156) → `sessionManager.userConfig.getUserSettings(username)`
   - `saveUserSettings` (L158-160) → `sessionManager.userConfig.saveUserSettings(username, settings)`
   - `getUserContext` (L162-164) → `sessionManager.userConfig.getUserContext(username)`
   - `clearUserContext` (L166-168) → `sessionManager.userConfig.clearUserContext(username)`
   - `getUserDefaultModel` (L170-172) → `sessionManager.userConfig.getUserDefaultModel(username)`
   - `saveSessionMetadata` (L174-176) → `sessionManager.metadataStore.saveSessionMetadata(username, sessionId, data)`
   - `getSessionMetadata` (L178-180) → `sessionManager.metadataStore.getSessionMetadata(username, sessionId)`
   - `persistSessionTools` (L182-184) → `sessionManager.metadataStore.persistSessionTools(username, sessionId, tools)`
   - `getSessionTools` (L186-188) → `sessionManager.metadataStore.getSessionTools(username, sessionId)`
   - `getUserPasswordHash` (L190-192) → `sessionManager.userConfig.getUserPasswordHash(username)`
   - `setUserPasswordHash` (L194-196) → `sessionManager.userConfig.setUserPasswordHash(username, hashB64)`

3. Update all callers across 20 files (see Affected Files). The `sessionManager.getUserContext()` call is the most common — all 13+ sites change to `sessionManager.userConfig.getUserContext(username)`.

4. Keep the following methods on `SessionManager` (they have actual session-map logic, not simple delegation):
   - `getSession(key)` — reads from internal Map
   - `subscribeToSession(...)` — reads from internal Map + subscribes
   - `subscribeOnce(...)` — reads from internal Map + one-shot sub
   - `destroySession(...)` — internal Map mutation + MCP/memory cleanup
   - `destroyAllSessions(...)` — loops internal Map
   - `listSessions(...)` — composes internal state with lister
   - `getOrCreateSession(...)` — main orchestrator (refactored in Step 7)

### Step 10: Verification

1. Run `cd apps/server && bun run build`
2. Run existing dev server and smoke-test:
   - Create a global session → confirm agent starts and responds
   - Create a project session → confirm workspace is project-specific
   - Create an agent session → confirm agent definition is loaded and tools are correct
   - Create a channel session → confirm model resolution works
   - Run a lab evaluation → confirm judge model resolution works
   - Spawn a subagent → confirm subagent session dir is found correctly
   - Verify metadata persistence across session restarts
   - Verify EventBroker publications still fire (agent_start, text_delta, tool_start, etc.)

---

## Affected Files

### New files (6):
| File | Purpose |
|---|---|
| `apps/server/src/core/session/workspace-resolver.ts` | Unified subagent dir resolution + workspace selection |
| `apps/server/src/core/session/tool-activation-engine.ts` | Pure function: resolve active tool names |
| `apps/server/src/core/session/session-event-publisher.ts` | Subscribe session events → EventBroker |
| `apps/server/src/core/session/before-tool-call-hook.ts` | Create the beforeToolCall callback |
| `apps/server/src/core/session/session-memory-enricher.ts` | Wrap session.prompt with memory context |
| `apps/server/src/core/session/agent-definition-resolver.ts` | Load agent definition (with lazy lab-architect) |

### Modified files (16):
| File | Change |
|---|---|
| `apps/server/src/core/session-manager.ts` | Major refactor: ~300 lines removed, 6 sub-module calls added, passthrough methods deleted, public properties added |
| `apps/server/src/core/session/metadata-store.ts` | Replace duplicated subagent dir resolution with shared `resolveSubagentSessionDir` |
| `apps/server/src/channels/channel-orchestrator.ts` | Use `resolveModelWithFallback` for model assignment |
| `apps/server/src/laboratory/judge.ts` | Use `resolveModelWithFallback` for judge model resolution |
| `apps/server/src/routes/auth.ts` | `sessionManager.getUserPasswordHash` → `sessionManager.userConfig.getUserPasswordHash` |
| `apps/server/src/routes/backup.ts` | `sessionManager.clearUserContext` → `sessionManager.userConfig.clearUserContext` |
| `apps/server/src/routes/env.ts` | 4 delegation call updates |
| `apps/server/src/routes/experiments.ts` | `getUserDefaultModel`/`ensureUserDir` → `userConfig` |
| `apps/server/src/routes/models.ts` | `getUserContext`/`getUserEnv` → `userConfig` |
| `apps/server/src/routes/providers.ts` | 5 `getUserContext` calls → `userConfig` |
| `apps/server/src/routes/sessions.ts` | 12+ delegation call updates (metadata, userDir, tools, env) |
| `apps/server/src/routes/settings.ts` | 4 delegation call updates |
| `apps/server/src/ws/handler.ts` | `getUserContext` → `userConfig` |
| `apps/server/src/core/tools/decompose-tool.ts` | `ensureUserDir` → `userConfig` |
| `apps/server/src/core/tools/delegate-tool.ts` | `saveSessionMetadata` → `metadataStore` |
| `apps/server/src/core/tools/exa-search-tool.ts` | `getUserEnv` → `userConfig` |
| `apps/server/src/core/tools/factory-tool.ts` | 5 delegation call updates |
| `apps/server/src/core/tools/image-gen-tool.ts` | `getUserEnv`/`getUserContext`/`getUserSettings` → `userConfig` |
| `apps/server/src/core/tools/spawn-subagent-tool.ts` | 4 delegation call updates |
| `apps/server/src/core/tools/update-task-tool.ts` | 2 `ensureUserDir` → `userConfig` |
| `apps/server/src/core/tools/vision-tool.ts` | `getUserContext`/`getUserSettings` → `userConfig` |
| `apps/server/src/core/delegation-registry.ts` | `ensureUserDir` → `userConfig` |
| `apps/server/src/core/session/prompt-builder.ts` | `getSessionMetadata` → `metadataStore` |
| `apps/server/src/laboratory/create-experiment-tool.ts` | 3 delegation call updates |
| `apps/server/src/laboratory/experiment-runner.ts` | 5 delegation call updates |
| `apps/server/src/laboratory/experiment-store.ts` | `getUserDefaultModel` → `userConfig` |

---

## Verification Criteria

1. `bun run build` in `apps/server/` succeeds with no TypeScript errors
2. Session creation for all 5 contexts (global, project, agent, channel, lab) produces identical behavior to current
3. Tool availability for each session type matches current (exa_search conditional, memory tools conditional, agent-specific alwaysOnTools)
4. Subagent sessions find their parent session directory correctly (both in `session-manager` and `metadata-store` paths)
5. Channel orchestrator model resolution produces the same model assignment as current
6. Lab judge model resolution produces the same model assignment as current
7. EventBroker publishes the same events at the same times (agent_start, text_delta, thinking_delta, tool_start, tool_end, error)
8. Session metadata reads/writes work identically (updatedAt, name, tools, etc.)
9. All UI/API flows that depend on sessionManager methods continue working (auth, env management, settings, session listing, experiment CRUD)
10. No circular dependency issues (particularly `before-tool-call-hook` → `../ws/handler` dynamic import)

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Extracted sub-modules introduce subtle behavioral differences | Medium | High | Extract one module at a time, diff the behavior by running the same session creation flows before and after each extraction. Keep original code in git for comparison. |
| `resolveModelWithFallback` returns `provider/id` string but callers need `Model` objects | Medium | Medium | At Step 8 implementation time, verify what types `session.setModel()` accepts. If it only accepts `Model`, keep the lookup after `resolveModelWithFallback` returns the string. The benefit is still unified fallback logic. |
| Dynamic import in `before-tool-call-hook.ts` breaks when moved to a different module path | Low | High | The `../ws/handler` path is relative to `session-manager.ts` in `core/`. The new module will be in `core/session/`, so the relative import becomes `../../ws/handler`. Verify at build time. |
| Passthrough method migration touches 20+ files and may miss a caller | Low | Medium | Use `grep` to find all callers before starting. After removing passthrough methods, TypeScript compilation will catch any missed callers. |
| `ensureWorkspaceStructure` side-effect inside `resolveSessionWorkspace` is too heavy | Low | Low | It's already called once per session creation. Moving it into the resolver preserves the exact same call count and timing. A future plan can optimize workspace initialization. |
| Metadata store's `dirname` helper (L107-109) is fragile | Low | Low | Not touched by this refactoring, but noted. It uses `require("node:path").sep` in an ESM context which works due to Bun's CJS/ESM interop. |

---

## Estimated Effort

- Steps 1-6 (create sub-modules): 3 hours
- Step 7 (refactor getOrCreateSession): 1 hour
- Step 8 (unify model resolution): 0.5 hours
- Step 9 (remove passthroughs + update callers): 2 hours
- Step 10 (verification + fixes): 1.5 hours
- **Total: ~8 hours**
