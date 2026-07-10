COMPLETED
# Channel Agent Validation Plan

## Problem

When an agent is deleted, its `agentId` remains in channel `members[]` arrays permanently. This causes:
- Ghost members shown in channel UI (raw ID as name, "agent" as role)
- Potential dispatch errors when orchestrator tries to route to non-existent agents
- Confusing UX: no visual distinction between live and deleted agents

## Root Cause

`DELETE /api/agents/:id` (`apps/server/src/routes/agents.ts:72-91`) cascades to sessions but NOT to channels. The `agentRegistry.stop()` method removes the agent from the in-memory registry and disk, but no code iterates channels to clean up membership references.

## Solution: Two-Layer Fix

### Layer 1 — Server: Cascade cleanup on agent delete

**File:** `apps/server/src/routes/agents.ts`

In the `DELETE /:id` handler, after `agentRegistry.stop(id)`:
1. Call `channelStore.listChannels(username)` to get all user channels
2. For each channel, check if `channel.members` contains the deleted `agentId`
3. If found, filter it out and call `channelStore.updateMembers(username, channelId, cleanedMembers)`
4. Also clean `targetAgentIds` references in remaining members (if a member had `targetAgentIds: [deletedId]`, remove that ID from the array)

```
agent deleted -> iterate channels -> remove from members[] -> clean targetAgentIds[] -> persist
```

### Layer 2 — Server: Filter ghost members on channel read

**File:** `apps/server/src/routes/channels.ts`

In `GET /:id` and `GET /` handlers, after loading channel data:
1. Get the set of valid agent IDs via `agentRegistry.list(username)`
2. Filter `channel.members` to only include members whose `agentId` exists in the registry
3. Also filter `targetAgentIds` within each member to only reference existing agents
4. Return the cleaned channel data

This ensures the client never receives ghost members, even if the filesystem has stale data.

### Layer 3 — Client: Visual indicator for orphaned members (defense in depth)

**Files:** 
- `apps/client/src/components/channels/MembersPanel.tsx`
- `apps/client/src/components/channels/ChannelMembersModal.tsx`
- `apps/client/src/components/channels/ChannelOrgTab.tsx`

When `getAgentInfo(agentId)` returns `undefined` (agent not in `registeredAgents`):
1. Show a visual warning indicator (e.g. amber dot + "Agent not found" tooltip)
2. Style the member card with a dashed border or reduced opacity
3. Add a "Remove" button prominently to clean up the ghost entry

This is defense-in-depth: if Layer 2 ever has a race condition or the data gets stale between fetches, the UI still handles it gracefully.

## Implementation Order

1. **Layer 1** (server cascade) — fixes the root cause, prevents new ghosts
2. **Layer 2** (server filter on read) — cleans existing stale data transparently
3. **Layer 3** (client indicators) — UX safety net

## Files Changed

| File | Change |
|------|--------|
| `apps/server/src/routes/agents.ts` | Add channel cleanup in DELETE handler |
| `apps/server/src/routes/channels.ts` | Filter ghost members in GET handlers |
| `apps/client/src/components/channels/MembersPanel.tsx` | Visual indicator for missing agents |
| `apps/client/src/components/channels/ChannelMembersModal.tsx` | Visual indicator for missing agents |
| `apps/client/src/components/channels/ChannelOrgTab.tsx` | Visual indicator for missing agents |
| `apps/client/src/pages/ChannelDetailPage.literals.ts` | Add literals for "Agent not found" |
| `apps/client/src/components/channels/MembersPanel.literals.ts` | Add literals for orphan state |
| `apps/client/src/components/channels/ChannelMembersModal.literals.ts` | Add literals for orphan state |

## Edge Cases

- **Agent re-registered with same ID:** Layer 1 removes the membership permanently. If the user re-registers an agent with the same ID, they'd need to re-add it to channels. This is acceptable — the old agent is a different entity.
- **Race condition (delete while dispatching):** The orchestrator already checks `agentRegistry.get()` before dispatching. Layer 2 ensures the channel data is clean, reducing the window.
- **targetAgentIds cleanup:** Both Layer 1 and Layer 2 must clean `targetAgentIds` references, not just top-level `members[]`.
