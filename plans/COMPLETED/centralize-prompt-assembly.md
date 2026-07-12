COMPLETED
# Centralize Prompt Assembly

**Status:** Completed
**Date:** 2026-07-12

## Problem Statement

System prompt append assembly (`appendSystemPrompt` array) is duplicated across 4 files, each manually constructing
the same list of instruction blocks. This leads to:
- Inconsistent ordering of instruction blocks across call sites
- Bug at `create-agent-server.ts:81` that bypasses `PromptComposer` and injects raw `definition.systemPrompt`,
  losing the identity wrapper layer (`"Eres {name}, con el rol de {role}..."`)
- `getEnvironmentContext()` prefix `\n\nRuntime Environment:\n{envContext}` duplicated 4 times
- The 5 constants (`HTML_PREVIEW_INSTRUCTIONS`, `AG_UI_INSTRUCTIONS`, `PERSISTENT_MEMORY_INSTRUCTIONS`,
  `SUBAGENT_DELEGATION_INSTRUCTIONS`, `TASK_DELEGATION_INSTRUCTIONS`) are imported and manually assembled in
  3 of 4 places

## Current Architecture: 4 Duplication Points

### Duplication 1: `session/prompt-builder.ts` L39-46

```typescript
const envContext = getEnvironmentContext(workspaceDir);
const appendPrompts = [
  `\n\nRuntime Environment:\n${envContext}`,
  HTML_PREVIEW_INSTRUCTIONS,
  AG_UI_INSTRUCTIONS,
  PERSISTENT_MEMORY_INSTRUCTIONS,
  SUBAGENT_DELEGATION_INSTRUCTIONS,
  TASK_DELEGATION_INSTRUCTIONS,
];
// ... then conditionally adds: delegate mode, MCP tools, agentDef composed prompt,
// lab architect experiment context, task plan
```

Order: `[env, 5_instructions]` + optional extras.

### Duplication 2: `channels/channel-orchestrator.ts` L582-591

```typescript
const envContext = getEnvironmentContext(workspaceDir);
const appendSystemPrompts = [
  `\n\nRuntime Environment:\n${envContext}`,
  layered.composed,              // <-- PromptComposer result (correct)
  HTML_PREVIEW_INSTRUCTIONS,
  AG_UI_INSTRUCTIONS,
  PERSISTENT_MEMORY_INSTRUCTIONS,
  SUBAGENT_DELEGATION_INSTRUCTIONS,
  TASK_DELEGATION_INSTRUCTIONS,
];
```

Order: `[env, layered.composed, 5_instructions]`. Note: `layered.composed` comes BEFORE the 5 instructions,
unlike prompt-builder which appends it after.

### Duplication 3: `agents/create-agent-server.ts` L79-87 (BUG)

```typescript
const envContext = getEnvironmentContext(workspaceDir);
appendSystemPrompt: [
  `\n\nRuntime Environment:\n${envContext}`,
  `\n\n${definition.systemPrompt}`,   // <-- RAW, no PromptComposer identity wrapper
  HTML_PREVIEW_INSTRUCTIONS,
  AG_UI_INSTRUCTIONS,
  PERSISTENT_MEMORY_INSTRUCTIONS,
  SUBAGENT_DELEGATION_INSTRUCTIONS,
  TASK_DELEGATION_INSTRUCTIONS,
],
```

BUG: Uses raw `definition.systemPrompt` instead of `promptComposer.compose()`. The `PromptComposer.compose()` wraps
the system prompt with the identity fragment:
```
Eres {name}, con el rol de {role}.
{systemPrompt}
```
This wrapper is present for channel-orchestrator and session-prompt-builder agent invocations, but missing for
standalone agent servers.

### Duplication 4: `core/tools/spawn-subagent-tool.ts` L149-152

```typescript
const envContext = getEnvironmentContext(workspaceDir);
appendSystemPrompt: [
  subagentInstructions,             // <-- Custom subagent contract, not the 5 standard blocks
  `\n\nRuntime Environment:\n${envContext}`
],
```

Order: `[subagentInstructions, env]`. Completely different structure - no standard instructions, only the
subagent executor contract + environment.

## Proposed Architecture: Central PromptAssemblyFactory

Create a single `PromptAssemblyFactory` module that accepts a discriminator and returns the complete
`appendSystemPrompt` array. The 4 call sites delegate to the factory instead of constructing their own arrays.

### New File: `apps/server/src/core/prompts/prompt-assembly.ts`

### Key Types

```typescript
type PromptAssemblyMode =
  | "standard-session"    // Global/project chat sessions
  | "channel-member"      // Channel orchestrator agent invocations
  | "agent-startup"       // Standalone agent server bootstrap
  | "subagent-spawn";     // Spawned subagent executor

interface PromptAssemblyContext {
  mode: PromptAssemblyMode;
  workspaceDir: string;
  agentDef?: { name: string; role: string; systemPrompt: string };
  deployment?: DeploymentContext;
  subagentTask?: string;
  subagentRole?: string;
}
```

### Functions

```typescript
const STANDARD_APPEND_INSTRUCTIONS = [
  HTML_PREVIEW_INSTRUCTIONS,
  AG_UI_INSTRUCTIONS,
  PERSISTENT_MEMORY_INSTRUCTIONS,
  SUBAGENT_DELEGATION_INSTRUCTIONS,
  TASK_DELEGATION_INSTRUCTIONS,
];

function formatEnvironmentContext(workspaceDir: string): string {
  const envContext = getEnvironmentContext(workspaceDir);
  return `\n\nRuntime Environment:\n${envContext}`;
}

function assemblePromptAppends(ctx: PromptAssemblyContext): string[] {
  switch (ctx.mode) {
    case "standard-session":
      return [formatEnvironmentContext(ctx.workspaceDir), ...STANDARD_APPEND_INSTRUCTIONS];
    case "channel-member":
    case "agent-startup": {
      const deployment = ctx.deployment || { mode: "solo" };
      const layered = promptComposer.compose(ctx.agentDef!, deployment, ctx.workspaceDir);
      return [
        formatEnvironmentContext(ctx.workspaceDir),
        layered.composed,
        ...STANDARD_APPEND_INSTRUCTIONS,
      ];
    }
    case "subagent-spawn": {
      const instructions = buildSubagentInstructions(ctx.subagentTask!, ctx.subagentRole);
      return [instructions, formatEnvironmentContext(ctx.workspaceDir)];
    }
  }
}
```

### Factory Logic Per Mode

| Mode | Output Array |
|------|-------------|
| `standard-session` | `[env, 5_instructions]` — caller extends with MCP, delegate, agentDef, lab, task plan |
| `channel-member` | `[env, layered.composed, 5_instructions]` |
| `agent-startup` | `[env, layered.composed, 5_instructions]` — uses `promptComposer.compose()` (fixes bug) |
| `subagent-spawn` | `[subagentInstructions, env]` |

## Implementation Steps

### Step 1: Create `apps/server/src/core/prompts/prompt-assembly.ts`

- Define `STANDARD_APPEND_INSTRUCTIONS` constant array (re-exports the 5 existing constants)
- Implement `buildSubagentInstructions(task, role?)` helper (extracted from spawn-subagent-tool.ts L125-142)
- Implement `formatEnvironmentContext(workspaceDir)` helper
- Implement `assemblePromptAppends(ctx)` factory function

### Step 2: Refactor `session/prompt-builder.ts`

- Replace L38-46 with `assemblePromptAppends({ mode: "standard-session", workspaceDir })`
- Keep all existing post-processing logic (delegate mode, MCP tools, agentDef composed prompt,
  lab architect experiment context, task plan) — these extend the base array returned by the factory
- Remove direct imports of the 5 instruction constants (now handled by the factory)

### Step 3: Refactor `channels/channel-orchestrator.ts`

- Replace L582-591 with `assemblePromptAppends({ mode: "channel-member", workspaceDir, agentDef, deployment })`
- Remove direct imports of the 5 instruction constants
- Remove manual `getEnvironmentContext()` call and `\n\nRuntime Environment:\n` prefix

### Step 4: Fix `agents/create-agent-server.ts`

- Replace L79-87 with `assemblePromptAppends({ mode: "agent-startup", workspaceDir, agentDef: definition })`
- This fixes the bug: `definition.systemPrompt` raw injection is replaced by `promptComposer.compose()`
  which adds the identity wrapper
- Remove direct imports of the 5 instruction constants

### Step 5: Refactor `core/tools/spawn-subagent-tool.ts`

- Replace L144-152 with `assemblePromptAppends({ mode: "subagent-spawn", workspaceDir, subagentTask: args.task, subagentRole: args.subagentRole })`
- Remove manual `subagentInstructions` array construction (moved to factory)
- Remove manual `getEnvironmentContext()` call

### Step 6: Verify Build

- `cd apps/server && bun run build` succeeds
- No TypeScript errors
- No new circular dependencies

## Affected Files

| File | Change Type |
|------|------------|
| `apps/server/src/core/prompts/prompt-assembly.ts` | **NEW** — factory module |
| `apps/server/src/core/session/prompt-builder.ts` | Refactor — delegate base assembly to factory |
| `apps/server/src/channels/channel-orchestrator.ts` | Refactor — replace inline array |
| `apps/server/src/agents/create-agent-server.ts` | **Fix** — use PromptComposer + delegate to factory |
| `apps/server/src/core/tools/spawn-subagent-tool.ts` | Refactor — replace inline array |

No changes needed in `system-instructions.ts` or `composer.ts` — they keep their existing exports.

## Verification Criteria

- [ ] `bun run build` from apps/server succeeds with no errors
- [ ] Global/project session prompts are unchanged (same runtime behavior)
- [ ] Channel member prompts are unchanged (same instructions in same order)
- [ ] Agent server prompts now include the identity wrapper via PromptComposer (previously missing)
- [ ] Subagent executor prompts are unchanged (same instructions, same order)
- [ ] Lab experiment prompts are unchanged (prompt-builder post-processing is preserved)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `create-agent-server.ts` identity wrapper insertion changes agent behavior | Agents that relied on receiving raw `systemPrompt` without the identity prefix will now see `"Eres {name}, con el rol de {role}.\n{systemPrompt}"`. This may subtly affect output style or tone. | This is technically a bug fix — the identity wrapper was already present for session-based agent invocations. Agent creators should see no regression; the additional identity prefix is purely contextual. Test with a representative agent definition after deployment. |
| Order change in `prompt-builder.ts` | Currently `env + 5_instructions + layered.composed`. Factory returns `env + layered.composed + 5_instructions` (same order as channel-orchestrator). | The difference is cosmetic since all entries are appended at the same level. If semantic ordering matters, the standard-session mode can still return `env + 5_instructions` as it does now, and the caller appends `layered.composed` separately. This is the chosen approach (standard-session mode returns minimal base, caller extends). |
| `subagentInstructions` extraction to factory | The subagent instruction block construction moves from spawn-subagent-tool to prompt-assembly. | This is a pure extraction — same string, same builder logic, same output. |
| Circular dependency | `prompt-assembly.ts` imports from `system-instructions.ts` and `composer.ts` and `env-check.ts`. Callers import from `prompt-assembly.ts`. No cycles. | Verify with `bun run build`. |
