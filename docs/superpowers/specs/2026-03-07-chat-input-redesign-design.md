# Chat Input Area Redesign - Design Spec

**Date:** 2026-03-07  
**Status:** Approved for Implementation  
**Scope:** InputArea, ModelSelector, SkillsSelector, ToolsSelector, ContextMeter  
**Out of scope:** WelcomeChatInput.tsx (no changes)

---

## 1. Overview

Redesign the chat input area to achieve a premium UX comparable to ChatGPT and Claude. Transform the current fragmented 2-row layout into a single unified floating card with integrated toolbar, inline popovers, and smooth animations.

### Design Goals
- **Unified card layout**: All controls in one cohesive component
- **Minimal visual noise**: Icon-based controls, no text buttons
- **Inline popovers**: Replace full-screen modals with contextual popovers
- **Smooth transitions**: Framer Motion animations for state changes
- **Responsive**: Mobile-first, adapts to 375px, 768px, 1280px+

### Reference Apps
- ChatGPT: Minimalist, unified card, icon-based controls
- Claude: Clean toolbar, subtle context indicators

---

## 2. Architecture

### Component Structure

```
ChatInput.tsx (orchestrator, ~150 lines)
  ├── InputCard.tsx (unified floating card)
  │     ├── AttachmentPreview.tsx (file chips)
  │     ├── ChatTextarea.tsx (auto-expanding textarea)
  │     └── InputToolbar.tsx (bottom toolbar)
  │           ├── AttachButton
  │           ├── ModelSelector.tsx (redesigned inline popover)
  │           ├── SkillsButton.tsx (badge + popover)
  │           ├── ToolsButton.tsx (badge + popover)
  │           ├── ContextIndicator.tsx (text + progress line)
  │           └── SendStopButton.tsx (circular, state-aware)
  └── AutocompletePopover.tsx (skills "/" and mentions "@")
```

### Key Changes
- **InputArea.tsx** decomposes into smaller single-responsibility components
- **SkillsSelector** and **ToolsSelector** switch from `Modal` to inline popovers
- **ContextMeter** absorbed as `ContextIndicator` inside toolbar
- **ModelSelector** redesigned to live inside toolbar (more compact popover)
- **WelcomeChatInput.tsx** remains unchanged

---

## 3. Visual Structure

### Card Layout

```
┌─────────────────────────────────────────────────┐
│  [attachment chip 1] [attachment chip 2]  [x]   │  ← only if attachments exist
├─────────────────────────────────────────────────┤
│                                                 │
│  Escribe tu mensaje aqui...                     │  ← borderless textarea
│                                                 │     subtle placeholder
│                                                 │
├─────────────────────────────────────────────────┤
│  📎  [Model ▾]  [Skills·3 ▾]  [Tools·7 ▾]  12k/128k    (▶)  │  ← toolbar
└─────────────────────────────────────────────────┘
```

### Visual Details

**Card Container:**
- `rounded-2xl`, `bg-card`, `border border-border`
- Subtle shadow: `shadow-lg`
- Max width: `max-w-3xl mx-auto`
- Padding: `px-4 py-3` (desktop), responsive scaling

**Textarea:**
- No internal borders, `bg-transparent`
- Placeholder: `text-text-secondary/50`
- Auto-expand up to `max-h-[200px]`
- Font: `font-mono text-sm`

**Attachment Chips:**
- Separate row with `border-b border-border/30`
- Rounded chips with thumbnail (images) or DOC icon (documents)
- Remove button (x) on hover
- File name + size displayed
- Max height: `max-h-32 overflow-y-auto`

**Toolbar:**
- `flex items-center justify-between`
- Padding: `px-3 py-2`
- Left side: attach button + selectors (model, skills, tools)
- Right side: context indicator + send/stop button

**Icons:**
- Size: 18px (desktop), 16px (mobile)
- Color: `text-text-secondary`, hover `text-text-primary`
- Transition: `transition-colors duration-150`

**Selector Buttons:**
- Small text: `text-xs`
- Badge with counter: "Skills · 3", "Tools · 7/13"
- Chevron icon with rotation animation on open
- Hover: `text-text-primary`

**Context Indicator:**
- Text: `text-xs font-mono text-text-secondary`
- Format: "12k/128k" (abbreviated numbers)
- Progress line: 2px integrated into card bottom border
- Color-coded: green (<70%), amber (70-90%), red (>90%)

**Send/Stop Button:**
- Circular: `w-8 h-8 rounded-full`
- Background: `bg-primary` (send), `bg-destructive` (stop)
- Icon: arrow-right (send), square (stop)
- Disabled state: `opacity-50 cursor-not-allowed`

---

## 4. States and Transitions

### Card States

**1. Idle (empty, no focus):**
- Border: `border-border`
- Shadow: `shadow-sm`
- Placeholder: `text-text-secondary/50`
- Send button: `opacity-50 cursor-not-allowed`

**2. Focused (textarea active):**
- Transition: `transition-all duration-200`
- Border: `border-primary`
- Shadow: `shadow-md` + `ring-1 ring-primary/20`
- Placeholder: `text-text-secondary/70`

**3. With content (typing):**
- Maintains focused state
- Send button: `opacity-100 cursor-pointer`, hover `bg-primary/90`
- Toolbar fully visible

**4. Streaming (agent responding):**
- Border: `border-primary/50` (subtle activity indicator)
- Send button morphs to stop button:
  - Icon: arrow → square
  - Color: `bg-primary` → `bg-destructive`
  - Animation: `scale` + `rotate` with Framer Motion (300ms)
- Attach button: `opacity-50 pointer-events-none`
- Model selector: `opacity-50 pointer-events-none` (no model change during streaming)
- Skills/Tools: enabled (can adjust permissions while agent works)

**5. Disabled (task runner active):**
- Entire card: `opacity-50 pointer-events-none`
- Subtle overlay `bg-card/50` on textarea
- Placeholder: "Task runner is active..."

### Animations (Framer Motion)

**Card mount:**
```tsx
initial={{ opacity: 0, y: 10 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.2 }}
```

**Popovers:**
```tsx
initial={{ opacity: 0, scale: 0.95, y: 10 }}
animate={{ opacity: 1, scale: 1, y: 0 }}
transition={{ duration: 0.15 }}
```

**Send/Stop morph:**
```tsx
animate={{ scale: [1, 0.9, 1], rotate: [0, 180, 360] }}
transition={{ duration: 0.3 }}
```

**Attachment chips:**
- `layout` animation for smooth reordering on add/remove

**Context line:**
- `transition-all duration-500` for width and color changes

### Micro-interactions

**Icon hover:**
- `scale-110` + color change `text-text-secondary` → `text-text-primary`

**Button click:**
- `scale-95` tactile feedback

**Textarea auto-expand:**
- `transition-height duration-150` when growing

**Autocomplete dropdown:**
```tsx
initial={{ opacity: 0, y: -5 }}
animate={{ opacity: 1, y: 0 }}
```

---

## 5. Popovers (Skills, Tools, Model)

### Problem
- Current `SkillsSelector` and `ToolsSelector` open full-screen `Modal` that blocks chat view
- `ModelSelector` is disconnected from input (lives in separate row)
- All compete for visual attention and break writing flow

### Solution: Inline Popovers

**SkillsButton + SkillsPopover:**
- Icon: book + badge with counter ("Skills · 3")
- Popover: anchored top-right of button (not centered)
- Size: `w-80 max-h-96 overflow-y-auto`
- Content: list of skills with name + truncated description
- Each skill has checkbox to enable/disable (not just view)
- Search filter at top of popover
- Animation: fade-in + slide-up (Framer Motion)
- Click outside or Escape closes popover

**ToolsButton + ToolsPopover:**
- Icon: wrench + badge with counter ("Tools · 7/13")
- Popover: similar to Skills, `w-80 max-h-96`
- Quick presets at top: "Full Access" and "Read-Only" as pills
- List of tools with checkbox + short description
- Badge color changes by preset: green = Full, amber = Read-Only, gray = Custom
- Animation: fade-in + slide-up

**ModelSelector (redesigned):**
- Icon: chip + current model name truncated ("GPT-4o")
- Popover: anchored top-left of button
- Structure: providers → models (current logic maintained, more compact)
- "Recent" section at top with color dots
- Provider list with arrow → click expands models
- "Connect more providers" button at bottom
- Animation: fade-in + slide-up

**Popover Positioning:**
- All anchored **above** button (not below, to avoid covering textarea)
- `absolute bottom-full mb-2` with `origin-bottom` for animation
- Auto-flip to below if insufficient space above (small viewport)
- Z-index: `z-50` to overlay chat content
- Optional backdrop: subtle overlay `bg-black/10` behind popover for visual focus

**Keyboard Navigation:**
- Tab navigates between toolbar buttons
- Enter/Space opens popover
- Arrow up/down navigates within popover
- Escape closes popover and returns focus to button
- Click outside closes

---

## 6. Responsive Design

### Mobile (375px)
- Card: reduced padding `px-2 py-2`
- Toolbar: smaller icons (16px), selector text hidden (icons + badges only)
- Popovers: `w-full` (full screen width), anchored above input
- Attachment chips: horizontal scroll if many
- ContextIndicator: text hidden, only progress line visible

### Tablet (768px)
- Card: medium padding `px-3 py-2.5`
- Toolbar: 18px icons, selector text visible
- Popovers: `w-80` (320px)
- Attachment chips: 2-column grid

### Desktop (1280px+)
- Card: generous padding `px-4 py-3`
- Toolbar: 20px icons, full text
- Popovers: `w-96` (384px)
- Attachment chips: 3-column grid

---

## 7. Accessibility (a11y)

### ARIA Labels
- Textarea: `aria-label="Message input"`
- Toolbar buttons: `aria-label="Attach files"`, `aria-label="Select model"`, etc.
- Popovers: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to trigger button
- Badges: `aria-label="3 skills active"`

### Keyboard Navigation
- Tab order: attach → model → skills → tools → send
- Enter/Space on toolbar buttons opens popovers
- Arrow up/down navigates within popovers
- Escape closes popovers and returns focus to trigger button
- Shift+Tab moves backward in order

### Focus Visible
- All buttons: `focus-visible:ring-2 ring-primary ring-offset-2`
- Textarea: `focus-visible:ring-2 ring-primary`

### Screen Readers
- Streaming state: `aria-live="polite"` announcing "Agent is responding"
- Context usage: `aria-label="Context usage: 12,450 of 128,000 tokens, 9 percent"`

---

## 8. Error Handling

### Attachments
- Upload failure: error toast "Failed to upload file", chip auto-removes
- File too large (>10MB): toast "File too large", file not added
- Unsupported type: toast "File type not supported"

### Model Selector
- Provider fetch failure: popover shows "Failed to load models" + retry button
- Selected model no longer exists: red badge on button, popover suggests fallback

### Skills/Tools
- Fetch failure: popover shows "Failed to load" + retry button
- Save failure: toast "Failed to save changes", changes revert

### ContextMeter
- Context fetch failure: text "—" instead of numbers, tooltip "Context data unavailable"

---

## 9. Implementation Notes

### Files to Modify
- `apps/client/src/components/chat/InputArea.tsx` → decompose into new components
- `apps/client/src/components/chat/ModelSelector.tsx` → redesign for inline popover
- `apps/client/src/components/chat/SkillsSelector.tsx` → convert Modal to popover
- `apps/client/src/components/chat/ToolsSelector.tsx` → convert Modal to popover
- `apps/client/src/components/chat/ContextMeter.tsx` → absorb into ContextIndicator

### New Files
- `apps/client/src/components/chat/ChatInput.tsx` (orchestrator)
- `apps/client/src/components/chat/InputCard.tsx`
- `apps/client/src/components/chat/AttachmentPreview.tsx`
- `apps/client/src/components/chat/ChatTextarea.tsx`
- `apps/client/src/components/chat/InputToolbar.tsx`
- `apps/client/src/components/chat/SkillsPopover.tsx`
- `apps/client/src/components/chat/ToolsPopover.tsx`
- `apps/client/src/components/chat/ContextIndicator.tsx`
- `apps/client/src/components/chat/SendStopButton.tsx`

### Dependencies
- Framer Motion (already installed)
- Tailwind CSS v4 (already configured)
- No new dependencies required

### Backwards Compatibility
- All existing props and callbacks maintained
- No breaking changes to parent components (ChatArea.tsx)
- Gradual migration possible (can keep old InputArea during transition)

---

## 10. Testing Checklist

- [ ] Card renders correctly in all 3 responsive breakpoints
- [ ] All 5 card states work (idle, focused, with content, streaming, disabled)
- [ ] Popovers open/close with click, keyboard, and click-outside
- [ ] Send/Stop button morphs smoothly during streaming state change
- [ ] Attachments display correctly (images with thumbnails, documents with icons)
- [ ] Context indicator updates in real-time as tokens are consumed
- [ ] Keyboard navigation works (Tab, Enter, Escape, Arrows)
- [ ] ARIA labels present and correct
- [ ] Error toasts display on failures
- [ ] Animations perform smoothly (no jank)
- [ ] Works in dark and light mode
- [ ] No TypeScript errors
- [ ] Build passes

---

## 11. Success Metrics

- **Visual**: Matches premium UX of ChatGPT/Claude
- **Performance**: Animations run at 60fps
- **Accessibility**: Full keyboard navigation, screen reader compatible
- **Responsiveness**: Works flawlessly on mobile, tablet, desktop
- **Maintainability**: Components are small, focused, and testable
