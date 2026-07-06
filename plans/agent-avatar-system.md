# Agent Avatar System

## Goal
Ensure agent profile photos are displayed consistently across ALL views where agents appear, and provide a default avatar gallery so users can pick an avatar without uploading their own photo.

## Current State

### Data Model (already in place)
- `AgentDefinition.avatarUrl` (optional string) in `packages/shared/src/schemas.ts:190`
- `AgentInfo.avatarUrl` (optional string) in `packages/shared/src/schemas.ts:208`
- Server stores uploaded avatars at `/tmp/crewfactory/{username}/agents/{id}/avatar.{ext}`
- `POST /api/agents/:id/avatar` uploads, `DELETE /api/agents/:id/avatar` removes
- `agentRegistry.setAvatarUrl()` persists the URL to `definition.json`

### Places Where Agents Are Displayed

| # | Location | File | Current Avatar | Status |
|---|----------|------|----------------|--------|
| 1 | Agent Card (grid) | `AgentsPage.tsx:95-100` | `avatarUrl` or initials | DONE |
| 2 | Register/Edit Modal | `AgentsPage.tsx:296-328` | Upload + preview | DONE |
| 3 | Sidebar agent list | `SessionSidebar.tsx:392-420` | Generic person SVG | NEEDS FIX |
| 4 | Chat agent turn | `MessageList.tsx:325-330` | Generic terminal SVG | NEEDS FIX |
| 5 | Channel messages | `ChannelMessages.tsx:40-43` | Generic "A" circle | NEEDS FIX |
| 6 | Channel members panel | `MembersPanel.tsx:60-62` | Colored dot only | NEEDS FIX |
| 7 | Add member modal (select) | `AddMemberModal.tsx:87-91` | Plain `<select>` text | NEEDS FIX |
| 8 | Breadcrumbs | `MainLayout.tsx:209-213` | Text only | OPTIONAL |
| 9 | Target agents list | `AddMemberModal.tsx:139-149` | Plain checkbox list | NEEDS FIX |

## Plan

### Phase 1: Create `AgentAvatar` shared component

Create `apps/client/src/components/shared/AgentAvatar.tsx`:

```tsx
interface AgentAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}
```

**Behavior:**
- If `avatarUrl` is set, render `<img>` with the URL (authenticated fetch if `/api/` path)
- If no `avatarUrl`, pick a default avatar from the gallery based on a hash of `name` (deterministic)
- Fallback: render initials (current behavior) in a colored circle

**Size mapping:**
- `xs`: 16px (sidebar, channel messages)
- `sm`: 24px (member cards, inline)
- `md`: 32px (agent cards, chat turns)
- `lg`: 40px (modals, detail views)

### Phase 2: Default Avatar Gallery

Create `apps/client/src/lib/defaultAvatars.ts`:

A curated set of 12-16 SVG avatar identifiers (robots, animals, geometric patterns, abstract shapes). Each avatar is a simple inline SVG or a named reference to a bundled SVG component.

**Approach:** Inline SVG components (no external files needed). Each has a unique name like `robot-01`, `fox-02`, `geo-03`, etc. The agent's name is hashed (simple char-sum mod count) to deterministically assign one.

**Categories:**
- 4 robot/AI faces
- 4 animals (fox, owl, cat, wolf)
- 4 geometric/abstract patterns
- 4 gradient circles with symbols

### Phase 3: Avatar Picker in Register/Edit Modal

Update `AgentsPage.tsx` `RegisterModal`:

- Add an "Avatar Gallery" section below the file upload
- Show the default avatar grid (selectable)
- If user selects a default avatar, store the avatar identifier in `avatarUrl` (e.g. `default:robot-01`)
- If user uploads a file, use the upload endpoint as before
- Add a "Remove avatar" button that clears back to auto-assigned default

**Server change:** When `avatarUrl` starts with `default:`, no file is stored; the client renders the default avatar locally.

### Phase 4: Apply `AgentAvatar` to all locations

#### 4a. SessionSidebar (`SessionSidebar.tsx:392-420`)
- Replace the generic person SVG with `<AgentAvatar>` (size `xs`)
- Need to add `avatarUrl` to the `AgentItem` interface in the sidebar

#### 4b. MessageList AgentTurn (`MessageList.tsx:325-330`)
- Replace the terminal SVG with `<AgentAvatar>` (size `sm`)
- Need to pass `activeAgent` avatar info down from `ChatArea` -> `MessageList` -> `AgentTurn`

#### 4c. ChannelMessages (`ChannelMessages.tsx:40-43, 72-75`)
- Replace the "A" circle with `<AgentAvatar>` (size `xs`)
- Need to pass agent avatar data alongside `agentName`/`agentId`

#### 4d. MembersPanel (`MembersPanel.tsx:60-62`)
- Replace the colored dot with `<AgentAvatar>` (size `sm`)
- `AgentInfo` already has `avatarUrl` available via `getAgentInfo()`

#### 4e. AddMemberModal (`AddMemberModal.tsx:80-92`)
- Replace the `<select>` with a custom agent picker showing avatars
- Or enhance the select with avatar thumbnails next to each option

#### 4f. Target agents checkboxes (`AddMemberModal.tsx:139-149`)
- Add `<AgentAvatar>` (size `xs`) next to each checkbox label

### Phase 5: Data flow fixes

#### Sidebar `AgentItem` interface
Add `avatarUrl?: string` to the local interface in `SessionSidebar.tsx:15-21`. The API already returns it via `agentRegistry.list()`.

#### ChatArea -> MessageList -> AgentTurn
- `ChatArea` already has `activeAgent` but only `{ id, name }`. Need to extend to include `avatarUrl`.
- Pass through `MessageList` props to `AgentTurn`.

#### ChannelMessages agent data
- `useChannel` hook needs to resolve agent avatars from the registered agents list.
- Pass avatar data to `ChannelMessages` via a map or enriched message type.

## Implementation Order

1. Create `defaultAvatars.ts` (gallery definitions)
2. Create `AgentAvatar.tsx` shared component
3. Update `SessionSidebar.tsx` (add `avatarUrl` to interface, use component)
4. Update `MessageList.tsx` + `ChatArea.tsx` (pass avatar through)
5. Update `ChannelMessages.tsx` + `useChannel` hook
6. Update `MembersPanel.tsx`
7. Update `AddMemberModal.tsx` (picker + target list)
8. Update `AgentsPage.tsx` RegisterModal (add gallery picker)
9. Test all views end-to-end

## Files to Create
- `apps/client/src/lib/defaultAvatars.ts`
- `apps/client/src/components/shared/AgentAvatar.tsx`

## Files to Modify
- `apps/client/src/components/sidebar/SessionSidebar.tsx`
- `apps/client/src/components/chat/MessageList.tsx`
- `apps/client/src/components/chat/ChatArea.tsx`
- `apps/client/src/components/channels/ChannelMessages.tsx`
- `apps/client/src/components/channels/MembersPanel.tsx`
- `apps/client/src/components/channels/AddMemberModal.tsx`
- `apps/client/src/pages/AgentsPage.tsx`
- `apps/client/src/hooks/useChannel.ts`
