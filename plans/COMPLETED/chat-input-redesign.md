COMPLETED
# Chat Input Area Redesign - Implementation Plan

**Spec:** [docs/superpowers/specs/2026-03-07-chat-input-redesign-design.md](../docs/superpowers/specs/2026-03-07-chat-input-redesign-design.md)  
**Status:** Pending Implementation  
**Estimated effort:** 8-10 hours of agent work

---

## Goal

Transform the current fragmented chat input (2-row layout + full-screen modals) into a single unified floating card with inline popovers, icon-based controls, and smooth Framer Motion animations — matching the premium UX of ChatGPT and Claude.

---

## Phase 1: Base Components (Leaf nodes, no dependencies)

### Task 1.1: Create `SendStopButton.tsx`
**File:** `apps/client/src/components/chat/SendStopButton.tsx`

Circular button that morphs between send (arrow icon, `bg-primary`) and stop (square icon, `bg-destructive`) states.

**Props:**
```ts
interface SendStopButtonProps {
  streaming: boolean;
  disabled: boolean;
  onSend: () => void;
  onStop: () => void;
}
```

**Requirements:**
- Circular: `w-8 h-8 rounded-full`
- Send state: arrow-right icon, `bg-primary`, `text-background`
- Stop state: square icon, `bg-destructive`, `text-white`
- Framer Motion morph animation on state change: `scale` + `rotate` (300ms)
- Disabled state: `opacity-50 cursor-not-allowed`
- Hover: `scale-105`, active: `scale-95`
- `aria-label` changes based on state ("Send message" / "Stop generation")

**Verification:** Component renders in isolation with both states, animation is smooth.

---

### Task 1.2: Create `ContextIndicator.tsx`
**File:** `apps/client/src/components/chat/ContextIndicator.tsx`

Compact context usage indicator: abbreviated text + 2px progress line.

**Props:**
```ts
interface ContextIndicatorProps {
  contextUsage: { tokens: number | null; contextWindow: number | null; percent: number | null } | null;
}
```

**Requirements:**
- Text: abbreviated format "12k/128k" using `Intl.NumberFormat` with `notation: "compact"`
- Font: `text-xs font-mono text-text-secondary`
- Progress line: 2px height, integrated visually (rendered as a separate element below the toolbar)
- Color-coded: `bg-primary` (<70%), `bg-warning` (70-90%), `bg-destructive` (>90%)
- `transition-all duration-500` for width and color changes
- If data is null: render nothing
- `aria-label` with full numbers for screen readers

**Verification:** Renders correctly with various token values, color changes at thresholds.

---

### Task 1.3: Create `AttachmentPreview.tsx`
**File:** `apps/client/src/components/chat/AttachmentPreview.tsx`

Horizontal strip of attachment chips with remove buttons.

**Props:**
```ts
interface Attachment {
  id: string;
  file: File;
  type: "image" | "document";
  previewUrl?: string;
}

interface AttachmentPreviewProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}
```

**Requirements:**
- Container: `flex flex-wrap gap-2 p-2 border-b border-border/30`
- Image chips: thumbnail `w-8 h-8 object-cover rounded` + file name + size + remove button
- Document chips: DOC icon badge `w-8 h-8 rounded bg-primary/10` + file name + size + remove button
- Remove button: appears on hover, `w-4 h-4 rounded-full bg-destructive text-white`
- Framer Motion `layout` animation for smooth add/remove
- Max height: `max-h-32 overflow-y-auto`
- If no attachments: render nothing

**Verification:** Chips render correctly for images and documents, remove works, animations smooth.

---

### Task 1.4: Create `ChatTextarea.tsx`
**File:** `apps/client/src/components/chat/ChatTextarea.tsx`

Auto-expanding borderless textarea with autocomplete support.

**Props:**
```ts
interface ChatTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  disabled: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}
```

**Requirements:**
- No borders: `bg-transparent border-none outline-none`
- Placeholder: `text-text-secondary/50`
- Font: `font-mono text-sm text-text-primary`
- Auto-expand: `useEffect` on value change, `Math.min(scrollHeight, 200)`
- `resize-none w-full`
- Disabled state: `opacity-50`
- Calls `onChange` with raw value
- Passes through `onKeyDown` for parent to handle autocomplete + send logic

**Verification:** Textarea expands as content grows, respects max height, disabled state works.

---

## Phase 2: Inline Popovers

### Task 2.1: Create `SkillsPopover.tsx`
**File:** `apps/client/src/components/chat/SkillsPopover.tsx`

Inline popover replacing the full-screen Modal in `SkillsSelector`.

**Props:**
```ts
interface SkillsPopoverProps {
  skills: SkillInfo[];
  loading: boolean;
  open: boolean;
  onClose: () => void;
  onSelectSkill: (skillName: string) => void;
  triggerRef: React.RefObject<HTMLButtonElement>;
}
```

**Requirements:**
- Popover: `w-80 max-h-96 overflow-y-auto bg-card border border-border rounded-xl shadow-xl`
- Position: `absolute bottom-full mb-2 right-0` (anchored above trigger)
- Search filter input at top: `w-full px-3 py-2 bg-surface border-b border-border text-sm`
- Skill list: name (`font-mono font-bold text-text-primary`) + description (truncated, `text-xs text-text-secondary`)
- Click on skill: calls `onSelectSkill` and closes popover
- Scope badge: "Proj" / "User" pill
- Empty state: "No active skills in this session"
- Framer Motion: `initial={{ opacity: 0, scale: 0.95, y: 10 }}` → `animate={{ opacity: 1, scale: 1, y: 0 }}`
- Click outside closes (use `useEffect` with mousedown listener)
- Escape closes
- Keyboard: Arrow up/down to navigate, Enter to select

**Verification:** Popover opens above button, search filters correctly, keyboard nav works.

---

### Task 2.2: Create `ToolsPopover.tsx`
**File:** `apps/client/src/components/chat/ToolsPopover.tsx`

Inline popover replacing the full-screen Modal in `ToolsSelector`.

**Props:**
```ts
interface ToolsPopoverProps {
  activeTools: string[];
  onChange: (tools: string[]) => void;
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement>;
}
```

**Requirements:**
- Popover: `w-80 max-h-96 overflow-y-auto bg-card border border-border rounded-xl shadow-xl`
- Position: `absolute bottom-full mb-2 right-0`
- Preset pills at top: "Full Access" and "Read-Only" buttons, highlighted when active
- Tool list: checkbox + name (`font-mono text-xs`) + description (`text-xs text-text-secondary`)
- Toggling checkbox calls `onChange` with updated array
- Framer Motion animation (same as SkillsPopover)
- Click outside / Escape closes
- Keyboard: Arrow up/down, Enter/Space to toggle

**Verification:** Presets apply correctly, individual toggles work, popover closes on outside click.

---

### Task 2.3: Redesign `ModelSelector.tsx` for Toolbar
**File:** `apps/client/src/components/chat/ModelSelector.tsx`

Refactor existing ModelSelector to be more compact and live inside the toolbar.

**Changes:**
- Trigger button: icon (chip) + truncated model name + chevron, `text-xs text-text-secondary`
- Popover: `w-72` (slightly narrower), same internal structure (providers → models)
- Position: `absolute bottom-full mb-2 left-0` (anchored above-left)
- Recent models section: compact, 1-line each with color dot + name + provider
- Provider list: compact rows with arrow indicator
- "Connect more providers" button at bottom
- Framer Motion animation
- All existing logic preserved (localStorage, session apply, fallback validation)
- New prop: `compact?: boolean` to control toolbar-specific styling

**Verification:** Model selection still works, popover opens above button, recent models show correctly.

---

## Phase 3: Composition

### Task 3.1: Create `InputToolbar.tsx`
**File:** `apps/client/src/components/chat/InputToolbar.tsx`

Bottom toolbar composing all controls.

**Props:**
```ts
interface InputToolbarProps {
  sessionId: string | null;
  streaming: boolean;
  disabled: boolean;
  activeTools: string[];
  onToolsChange: (tools: string[]) => void;
  skills: SkillInfo[];
  skillsLoading: boolean;
  onSelectSkill: (skillName: string) => void;
  contextUsage: { tokens: number | null; contextWindow: number | null; percent: number | null } | null;
  onFileClick: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  mentionTargets?: MentionTarget[];
}
```

**Requirements:**
- Layout: `flex items-center justify-between px-3 py-2`
- Left group: `flex items-center gap-2`
  - Attach button (paperclip icon, 18px)
  - ModelSelector (compact mode)
  - Skills button (book icon + badge "Skills · N") → opens SkillsPopover
  - Tools button (wrench icon + badge "Tools · N/13") → opens ToolsPopover
- Right group: `flex items-center gap-3`
  - ContextIndicator (text only, progress line rendered separately)
  - SendStopButton (passed as child or rendered here)
- Popovers managed via local state (`openSkills`, `openTools`)
- Badge counters update reactively
- Disabled state propagates to all children

**Verification:** All controls render in correct positions, popovers open/close, badges show correct counts.

---

### Task 3.2: Create `InputCard.tsx`
**File:** `apps/client/src/components/chat/InputCard.tsx`

The unified floating card container.

**Props:**
```ts
interface InputCardProps {
  streaming: boolean;
  disabled: boolean;
  focused: boolean;
  attachments: Attachment[];
  onRemoveAttachment: (id: string) => void;
  input: string;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  toolbar: React.ReactNode;
  contextLine: React.ReactNode;
}
```

**Requirements:**
- Container: `max-w-3xl mx-auto bg-card border border-border rounded-2xl shadow-lg overflow-hidden`
- Focus state: `border-primary ring-1 ring-primary/20 shadow-md` (conditional class)
- Streaming state: `border-primary/50`
- Disabled state: `opacity-50 pointer-events-none`
- Transitions: `transition-all duration-200`
- Structure:
  1. AttachmentPreview (conditional, only if attachments.length > 0)
  2. ChatTextarea (with padding `px-4 py-3`)
  3. InputToolbar (passed as `toolbar` prop)
  4. Context progress line (2px, color-coded, at very bottom)
- Framer Motion on mount: `initial={{ opacity: 0, y: 10 }}` → `animate={{ opacity: 1, y: 0 }}`

**Verification:** Card renders with all sections, focus state changes border/ring, streaming state changes border color.

---

### Task 3.3: Create `ChatInput.tsx` (Orchestrator)
**File:** `apps/client/src/components/chat/ChatInput.tsx`

Top-level orchestrator replacing `InputArea`. Manages all state and composes InputCard.

**Props:** Same as current `InputArea` props (backwards compatible).

**Requirements:**
- Manages all state: `input`, `activeTools`, `skills`, `skillsLoading`, `attachments`, `focused`
- Fetches tools from server on `sessionId` change (same logic as current InputArea)
- Fetches skills on `sessionId` change (same logic as current InputArea)
- Handles file attachment (same logic as current InputArea)
- Handles send (same logic as current InputArea, including image upload + document upload)
- Handles keyboard shortcuts (Enter=send/steer, Alt+Enter=follow_up, autocomplete nav)
- Handles autocomplete (skill "/" and mention "@" detection)
- Renders AutocompletePopover (skill and mention dropdowns)
- Composes InputCard with InputToolbar
- Passes correct placeholder based on state (streaming, runner active, idle)

**Verification:** Full send flow works (text, images, documents), autocomplete works, keyboard shortcuts work.

---

## Phase 4: Autocomplete

### Task 4.1: Create `AutocompletePopover.tsx`
**File:** `apps/client/src/components/chat/AutocompletePopover.tsx`

Unified popover for skill "/" and mention "@" autocomplete.

**Props:**
```ts
interface AutocompletePopoverProps {
  mode: "skill" | "mention" | null;
  items: Array<{ id: string; name: string; description?: string; initial?: string }>;
  selectedIndex: number;
  onSelect: (item: any) => void;
  onNavigate: (direction: "up" | "down") => void;
  onClose: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}
```

**Requirements:**
- Position: `absolute bottom-full left-0 mb-2`
- Size: `w-64 max-h-48 overflow-y-auto bg-card border border-border rounded-xl shadow-xl`
- Skill items: name (`font-mono font-bold`) + description (truncated)
- Mention items: avatar circle (initial letter) + `@name`
- Selected item: `bg-primary/15 text-primary`
- Framer Motion: `initial={{ opacity: 0, y: -5 }}` → `animate={{ opacity: 1, y: 0 }}`
- Header: "Mention" or "Skills" label at top
- Click outside closes

**Verification:** Both modes render correctly, selected item highlights, click selects.

---

## Phase 5: Integration

### Task 5.1: Update `ChatArea.tsx` to use `ChatInput`
**File:** `apps/client/src/components/chat/ChatArea.tsx`

**Changes:**
- Replace `import { InputArea } from "./InputArea"` with `import { ChatInput } from "./ChatInput"`
- Replace `<InputArea ... />` with `<ChatInput ... />` (same props)
- Remove `ContextMeter` import and usage (now integrated into ChatInput)
- Verify all props pass through correctly

**Verification:** Chat renders correctly, send/steer/follow-up work, streaming state updates UI.

---

### Task 5.2: Delete old components
**Files to delete:**
- `apps/client/src/components/chat/InputArea.tsx`
- `apps/client/src/components/chat/ContextMeter.tsx`

**Files to keep (but may be unused):**
- `apps/client/src/components/chat/SkillsSelector.tsx` (check if used elsewhere)
- `apps/client/src/components/chat/ToolsSelector.tsx` (check if used elsewhere)

**Verification:** Grep for imports of deleted files, ensure no broken references.

---

## Phase 6: Verification

### Task 6.1: TypeScript typecheck
```bash
cd apps/client && bunx tsc --noEmit
```
**Expected:** Exit 0, no errors.

### Task 6.2: Client build
```bash
cd apps/client && bun run build
```
**Expected:** Build succeeds, no warnings about missing imports.

### Task 6.3: Visual smoke test
- Open app in browser
- Verify card renders in idle state
- Click textarea, verify focus state (border + ring)
- Type text, verify button activates
- Send message, verify streaming state (stop button appears)
- Click model selector, verify popover opens above
- Click skills button, verify popover opens with search
- Click tools button, verify popover opens with presets
- Verify context indicator shows token usage
- Resize to mobile width, verify responsive layout
- Verify dark mode rendering

### Task 6.4: Update documentation
- Update `about.md` with new component architecture
- Update `steps.md` with Phase 68 tasks marked complete

---

## Execution Order

```
Phase 1 (parallel):
  1.1 SendStopButton
  1.2 ContextIndicator
  1.3 AttachmentPreview
  1.4 ChatTextarea

Phase 2 (parallel, after Phase 1):
  2.1 SkillsPopover
  2.2 ToolsPopover
  2.3 ModelSelector redesign

Phase 3 (sequential, after Phase 2):
  3.1 InputToolbar (depends on 2.1, 2.2, 2.3, 1.1, 1.2)
  3.2 InputCard (depends on 1.3, 1.4, 3.1)
  3.3 ChatInput (depends on 3.2, 4.1)

Phase 4 (parallel with Phase 3):
  4.1 AutocompletePopover

Phase 5 (after Phase 3):
  5.1 Update ChatArea
  5.2 Delete old components

Phase 6 (after Phase 5):
  6.1 TypeScript typecheck
  6.2 Client build
  6.3 Visual smoke test
  6.4 Update documentation
```

---

## Risk Mitigation

- **Backwards compatibility:** ChatInput accepts same props as InputArea, so ChatArea changes are minimal
- **Gradual migration:** Can keep old InputArea.tsx until new ChatInput is verified
- **No new dependencies:** All required libraries (Framer Motion, Tailwind) already installed
- **Isolated components:** Each component can be tested in isolation before integration
