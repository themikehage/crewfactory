# Extract Session Utilities — Shared Module

**Status:** Pending  
**Date:** 2026-07-12

## Problem Statement

Four independent-but-overlapping pieces of session utility logic are duplicated across 4 files:

### P9: POST /api/sessions body duplicated 4x
The same `{ name, projectName, agentId, channelId }` body with a ternary cascade appears in:
- `ChatArea.tsx:101-106`
- `useSessionResolver.ts:74-79`
- `SessionPopover.tsx:130-135`
- `ExperimentDetailPage.tsx:64-68` (variant: hardcoded `agentId: "lab-architect"`)

### P10: Session filtering cascade duplicated 3x
The 4-branch filter `activeChannel → activeAgent → activeProjectName → !all` appears in:
- `useSessionResolver.ts:39-48`
- `SessionPopover.tsx:101-111` (filteredSessions)
- `SessionPopover.tsx:159-164` (deleteSession)

### P11: Session path and name construction duplicated
- `getSessionPath(id)` — ChatArea:60-65, useSessionResolver:50-55
- `getSessionName(context, count?)` — ChatArea:71-74 (no count), useSessionResolver:63-69, SessionPopover:117-123

### P13: Virtual session detection scattered
- `sessionId.startsWith("exec_")` — ChatArea:190, SessionPopover:103/270
- `sessionId.startsWith("sub_")` and `sessionId.startsWith("del_")` — ChatArea:622/636
- Results: 9+ scattered `startsWith` checks across ChatArea and SessionPopover

**Total duplication:** ~16 inline occurrences across 4 files.

## Proposed Solution

Single module `apps/client/src/lib/session-utils.ts` with 5 exports.

### Module Interface

```typescript
export interface SessionContext {
  activeChannel?: { id: string; name: string } | null;
  activeAgent?: { id: string; name: string } | null;
  activeProjectName?: string | null;
  activeProjectFriendlyName?: string | null;
}

export interface CreateSessionBody {
  name: string;
  projectName?: string;
  agentId?: string;
  channelId?: string;
  experimentId?: string;
}

export function buildCreateSessionBody(
  sessionName: string,
  context: SessionContext,
  extra?: { experimentId?: string }
): CreateSessionBody;

export function getSessionContextPredicate(
  context: SessionContext
): (session: { projectName?: string; agentId?: string; channelId?: string }) => boolean;

export function getSessionPath(
  sessionId: string,
  context: SessionContext
): string;

export function getSessionName(
  context: SessionContext,
  count?: number
): string;

export interface SessionMeta {
  isReadOnly: boolean;
  isExecution: boolean;
  isSubagent: boolean;
  isDelegation: boolean;
  isLab: boolean;
}

export function getSessionMeta(sessionId: string | null): SessionMeta;
```

### Key Design Decisions

- `getSessionName` accepts optional `count` — when `undefined` it omits the counter suffix (ChatArea), when a number it appends ` ${count + 1}` (useSessionResolver, SessionPopover).
- `buildCreateSessionBody` accepts optional `extra` for ExperimentDetailPage's `experimentId` field.
- `getSessionMeta` returns `{ isReadOnly: false, ... }` when `sessionId` is `null` (defensive: ChatArea currently uses `?? false`).
- `activeProjectFriendlyName` is used in the name cascade (useSessionResolver, SessionPopover) but falls back to `activeProjectName` when absent.

## Before / After Examples

### 1. ChatArea: createSessionAndSend body

**Before** (lines 96-107):
```typescript
body: JSON.stringify({
  name: sessionName,
  projectName: activeAgent || activeChannel ? undefined : activeProjectName || undefined,
  agentId: activeChannel ? undefined : activeAgent ? activeAgent.id : undefined,
  channelId: activeChannel ? activeChannel.id : undefined,
}),
```

**After**:
```typescript
body: JSON.stringify(buildCreateSessionBody(sessionName, {
  activeChannel, activeAgent, activeProjectName,
})),
```

### 2. ChatArea: Session name

**Before** (lines 71-74):
```typescript
let sessionName = "Global Session";
if (activeChannel) sessionName = `#${activeChannel.name} - Session`;
else if (activeAgent) sessionName = `${activeAgent.name} - Session`;
else if (activeProjectName) sessionName = `${activeProjectName} - Session`;
```

**After**:
```typescript
const sessionName = getSessionName({ activeChannel, activeAgent, activeProjectName });
```

### 3. ChatArea: Session path

**Before** (lines 60-65):
```typescript
const getSessionPath = useCallback((id: string) => {
  if (activeChannel) return `/channels/${activeChannel.id}/session/${id}`;
  if (activeAgent) return `/agents/${activeAgent.id}/session/${id}`;
  if (activeProjectName) return `/projects/${activeProjectName}/session/${id}`;
  return `/session/${id}`;
}, [activeChannel, activeAgent, activeProjectName]);
```

**After**:
```typescript
import { getSessionPath } from "@/lib/session-utils";
// remove inline useCallback, use getSessionPath(sessionId, context) directly
```

### 4. ChatArea: Read-only execution check

**Before** (line 190):
```typescript
const isReadOnlyExecution = sessionId?.startsWith("exec_") ?? false;
```

**After**:
```typescript
const { isReadOnly: isReadOnlyExecution } = getSessionMeta(sessionId);
```

### 5. ChatArea: Subagent/delegation banner

**Before** (lines 622/636):
```typescript
{(sessionId.startsWith("sub_") || sessionId.startsWith("del_")) && (
  ...
  {sessionId.startsWith("sub_") ? "Subagent Session" : "Delegated Session"}
)}
```

**After**:
```typescript
const sessionMeta = getSessionMeta(sessionId);
{(sessionMeta.isSubagent || sessionMeta.isDelegation) && (
  ...
  {sessionMeta.isSubagent ? "Subagent Session" : "Delegated Session"}
)}
```

### 6. useSessionResolver: Filter + create

**Before** (lines 39-79):
```typescript
const filtered = all.filter((s) => {
  if (activeChannel) return s.channelId === activeChannel.id;
  if (activeAgent) return s.agentId === activeAgent.id && !s.channelId;
  if (activeProjectName) return s.projectName === activeProjectName && !s.agentId && !s.channelId;
  return !s.projectName && !s.agentId && !s.channelId;
});
// ... getSessionPath, getSessionName, body cascade (all inline)
```

**After**:
```typescript
const filtered = all.filter(getSessionContextPredicate({
  activeChannel, activeAgent, activeProjectName,
}));
const sessionName = getSessionName(
  { activeChannel, activeAgent, activeProjectName, activeProjectFriendlyName },
  filtered.length
);
const createRes = await apiFetch("/api/sessions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(buildCreateSessionBody(sessionName, {
    activeChannel, activeAgent, activeProjectName,
  })),
});
```

### 7. SessionPopover: Filter + delete

**Before** (lines 101-111, 159-164):
```typescript
// filteredSessions useMemo — inline filter
// deleteSession — same inline filter duplicated
```

**After** — both replaced by `getSessionContextPredicate(context)`.

### 8. ExperimentDetailPage: Lab session body

**Before** (lines 64-68):
```typescript
body: JSON.stringify({
  name: sessionName,
  agentId: "lab-architect",
  experimentId,
}),
```

**After**:
```typescript
body: JSON.stringify(buildCreateSessionBody(sessionName, {}, { experimentId })),
```

## Implementation Steps

1. **Create `apps/client/src/lib/session-utils.ts`** with all 5 exports:
   - `buildCreateSessionBody(sessionName, context, extra?)`
   - `getSessionContextPredicate(context)`
   - `getSessionPath(sessionId, context)`
   - `getSessionName(context, count?)`
   - `getSessionMeta(sessionId)`

2. **Create `apps/client/src/lib/session-utils.test.ts`** with unit tests covering:
   - Each function with all context combinations (global, project, agent, channel)
   - Null/undefined edge cases (getSessionMeta with null sessionId)
   - Count undefined vs count=0 for getSessionName
   - Lab experimentId in buildCreateSessionBody extra
   - All is* flags in getSessionMeta

3. **Update `ChatArea.tsx`:**
   - Remove inline `getSessionPath` useCallback
   - Replace inline sessionName construction with `getSessionName()`
   - Replace inline POST body with `buildCreateSessionBody()`
   - Replace `isReadOnlyExecution` with `getSessionMeta()`
   - Replace `startsWith("sub_")`/`startsWith("del_")` checks with `getSessionMeta()`
   - Replace `sessionId.includes("_channel_")` with appropriate meta check if applicable

4. **Update `useSessionResolver.ts`:**
   - Replace inline filter with `getSessionContextPredicate()`
   - Replace inline `getSessionPath` with `getSessionPath()`
   - Replace inline sessionName with `getSessionName()`
   - Replace inline POST body with `buildCreateSessionBody()`

5. **Update `SessionPopover.tsx`:**
   - Replace `filteredSessions` useMemo inline filter with `getSessionContextPredicate()`
   - Replace `deleteSession` filter cascade with `getSessionContextPredicate()`
   - Replace inline sessionName with `getSessionName()`
   - Replace inline POST body with `buildCreateSessionBody()`
   - Replace inline `isExec` checks with `getSessionMeta()`

6. **Update `ExperimentDetailPage.tsx`:**
   - Replace inline POST body with `buildCreateSessionBody(sessionName, {}, { experimentId })`

7. **Verify** `cd apps/client && bun run build` (includes `tsc -b`) succeeds with zero errors.

## Affected Files

| File | Change |
|------|--------|
| `apps/client/src/lib/session-utils.ts` | **NEW** — Utility module |
| `apps/client/src/lib/session-utils.test.ts` | **NEW** — Unit tests |
| `apps/client/src/components/chat/ChatArea.tsx` | Replace inline helpers with module imports |
| `apps/client/src/hooks/useSessionResolver.ts` | Replace inline helpers with module imports |
| `apps/client/src/components/sidebar/SessionPopover.tsx` | Replace inline helpers with module imports |
| `apps/client/src/pages/ExperimentDetailPage.tsx` | Replace inline body with buildCreateSessionBody |

## Verification Criteria

- [x] `cd apps/client && bun run build` succeeds (TypeScript strict + Vite)
- [x] Run `bun test apps/client/src/lib/session-utils.test.ts` — all tests pass
- [ ] Creating a global session works (no activeChannel/activeAgent/activeProjectName)
- [ ] Creating a project session works
- [ ] Creating an agent session works
- [ ] Creating a channel session works
- [ ] Creating a lab session works (ExperimentDetailPage)
- [ ] Session filtering in popover shows correct sessions per context
- [ ] Session navigation URLs are correct across all contexts
- [ ] Virtual execution sessions show read-only UI
- [ ] Subagent/delegation sessions show correct banners
- [ ] Delete session re-filters remaining sessions correctly
- [ ] TypeScript strict mode: zero errors

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| `SessionContext` interface mismatch with existing prop shapes | Derive interface from existing prop types across all 4 files; match nullability exactly |
| `getSessionName` count behavior divergence (undefined vs number) | ChatArea passes no count (name simpl), resolver/popover pass `filtered.length` (numbered); test both paths |
| `ExperimentDetailPage` passes `agentId: "lab-architect"` directly — does not follow the cascade | `buildCreateSessionBody` accepts empty `context` with `extra: { experimentId }`; caller handles agentId separately |
| `sessionId.includes("_channel_")` in ChatArea:726 doesn't map cleanly to prefix-based meta | Leave as-is or add `isChannelExecution` to SessionMeta; evaluate during implementation |
| ChatArea uses `useCallback` for getSessionPath — removing it changes dependency array | Call `getSessionPath(sessionId, context)` inline; memoization unnecessary for a pure string function |
| Session meta now computed from `sessionId` alone, but `(s as any).isExecution` fallback exists in SessionPopover | The `isExecution` property was a server-side flag; if still used, incorporate into meta or keep as secondary check |
