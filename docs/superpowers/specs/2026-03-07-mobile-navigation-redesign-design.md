# Mobile Navigation Redesign - Split Screen Experience

**Date:** 2026-03-07  
**Status:** Approved for Implementation  
**Scope:** MainLayout, SessionSidebar, Topbar, ContextTabs, Navigation state  
**Out of scope:** Chat input redesign (separate spec), desktop layout changes

---

## 1. Overview

Transform the mobile navigation experience from a hamburger overlay menu to a split-screen model inspired by Slack iOS. The sidebar becomes a full-screen independent view, and content slides over it when a context is active.

### Design Goals
- **Split screen model**: Sidebar is a full-screen view, content slides over it
- **Simplified topbar**: Back button + title + actions (no breadcrumbs)
- **Touch-optimized**: 48px touch targets, larger fonts, better spacing
- **Smooth transitions**: 300ms slide animations between states
- **No gestures**: All navigation via taps (back button, menu button)

### Reference Apps
- **Slack iOS**: Full-screen sidebar, content slides over
- **WhatsApp**: Simple header, back navigation
- **iOS Settings**: Hierarchical drill-down navigation

---

## 2. Architecture

### Navigation Model

**Three states:**

1. **Home/Global (no context)**
   - Sidebar occupies 100% of screen
   - Topbar: logo + "Factory"
   - No back button, no actions

2. **Context active (project/agent/channel)**
   - Content occupies 100% of screen
   - Topbar: back button + context name + actions ([+] new session, [≡] menu)
   - Sub-header: context tabs (Chat | Files | Preview)

3. **Menu open (sidebar overlay)**
   - Sidebar slides over content from left
   - Content visible behind with dark overlay (bg-black/50)
   - Topbar of content visible behind

### Component Structure

```
MainLayout.tsx (orchestrator)
  ├── Topbar (responsive)
  │     ├── Desktop: logo + breadcrumbs + actions
  │     └── Mobile: back + title + actions
  ├── SessionSidebar (responsive)
  │     ├── Desktop: fixed left sidebar (280px)
  │     └── Mobile: full-screen or overlay
  ├── ContextTabs (sub-header)
  │     └── Chat | Files | Preview tabs
  └── Content area
        └── ChatArea / WorkspacePanel / PreviewPanel / Admin pages
```

### Breakpoints

| Breakpoint | Behavior |
|------------|----------|
| < 768px | Split screen (sidebar overlay) |
| 768px - 1024px | Sidebar collapsible (tablet) |
| > 1024px | Sidebar fixed (desktop) |

**Note:** This spec focuses on mobile (< 768px). Desktop and tablet layouts remain unchanged.

---

## 3. Topbar Design

### Mobile Topbar (3 states)

**State 1: Home/Global (no context)**
```
┌──────────────────────────────────┐
│  [Logo]      Factory            │
└──────────────────────────────────┘
```
- No back button
- Title: "Factory"
- No additional actions

**State 2: Context active (project/agent/channel)**
```
┌──────────────────────────────────┐
│  [←]  my-web-app    [+]  [≡]   │
└──────────────────────────────────┘
```
- Back button: returns to previous state
  - If previous context exists: returns to that context
  - If no previous context: returns to home (sidebar full-screen)
- Title: context name (truncated if long, max 20 chars)
- [+] button: quick create new session
- [≡] button: opens sidebar overlay

**State 3: Admin pages (Settings, Skills, Logs, MCPs)**
```
┌──────────────────────────────────┐
│  [←]  Settings                  │
└──────────────────────────────────┘
```
- Back button: returns to previous screen
- Title: page name
- No additional actions

### Topbar Specifications

**Height:** 48px (mobile), 48px (desktop, unchanged)

**Layout:**
- Left: back button (if not home) + logo (if home)
- Center: title (flex-grow, truncated)
- Right: action buttons

**Back button:**
- Icon: arrow-left (24px)
- Touch target: 48x48px
- Color: `text-text-primary`
- Hover: `text-text-primary/80`

**Title:**
- Font: `text-base font-semibold`
- Color: `text-text-primary`
- Truncation: `truncate max-w-[200px]`

**Action buttons:**
- Icon size: 20px
- Touch target: 44x44px
- Color: `text-text-secondary`
- Hover: `text-text-primary`

---

## 4. Transitions and Animations

### State Transitions

**Home → Context (tap on sidebar item):**
1. Sidebar slides to left (off-screen)
2. Content slides in from right
3. Topbar changes: logo → back + title + actions
4. Duration: 300ms, easing: `ease-out`

**Context → Menu (tap on [≡]):**
1. Sidebar slides in from left (on-screen)
2. Content stays in place
3. Dark overlay fades in (bg-black/50, opacity 0 → 0.5)
4. Duration: 300ms, easing: `ease-out`

**Menu → Context (tap on sidebar item):**
1. Sidebar slides to left (off-screen)
2. Content changes to new context
3. Topbar updates title
4. Overlay fades out
5. Duration: 300ms, easing: `ease-in`

**Context → Home (tap on back with no previous context):**
1. Content slides to right (off-screen)
2. Sidebar slides in from left
3. Topbar changes: back + title → logo + "Factory"
4. Duration: 300ms, easing: `ease-in`

### Animation Specifications

**Slide animations:**
- Transform: `translateX(-100%)` → `translateX(0)` (slide in from left)
- Transform: `translateX(0)` → `translateX(-100%)` (slide out to left)
- Transform: `translateX(0)` → `translateX(100%)` (slide out to right)

**Overlay:**
- Background: `bg-black`
- Opacity: 0 → 0.5 (fade in)
- Opacity: 0.5 → 0 (fade out)

**Easing:**
- Slide in (entering view): `ease-out` (fast start, slow end)
- Slide out (leaving view): `ease-in` (slow start, fast end)

**Framer Motion:**
```tsx
// Sidebar slide in
initial={{ x: "-100%" }}
animate={{ x: 0 }}
transition={{ duration: 0.3, ease: "easeOut" }}

// Content slide out
initial={{ x: 0 }}
animate={{ x: "-100%" }}
transition={{ duration: 0.3, ease: "easeIn" }}

// Overlay fade
initial={{ opacity: 0 }}
animate={{ opacity: 0.5 }}
transition={{ duration: 0.3 }}
```

---

## 5. Sidebar Mobile Optimizations

### Touch Targets

All interactive elements must meet mobile accessibility standards:

| Element | Desktop | Mobile |
|---------|---------|--------|
| Sidebar items | 32px height | 48px height |
| Action buttons | 32x32px | 44x44px |
| Accordion headers | 32px height | 48px height |
| Icon size | 16px | 20px |
| Font size | 14px | 16px |
| Spacing between items | 4px | 8px |

### Visual Feedback

**Tap state:**
- Immediate highlight: `bg-surface-hover`
- Duration: 100ms
- No delay (instant feedback)

**Active state:**
- Left border: `border-l-2 border-primary`
- Background: `bg-card-hover`
- Text: `text-text-primary font-medium`

**Accordion expansion:**
- Animation: height transition (200ms)
- Icon rotation: chevron rotates 90deg
- Easing: `ease-in-out`

### Scroll Behavior

- Sidebar has independent scroll if content is long
- Smooth scrolling with momentum (iOS-style)
- No horizontal scroll (all content fits width)
- Scrollbar: hidden on mobile (use native scroll indicators)

### Sidebar Structure (Mobile)

```
┌──────────────────────────────────┐
│  [Logo]      Factory            │  ← topbar (always visible)
├──────────────────────────────────┤
│                                  │
│  [⚡ Factory]                    │  ← home button (always visible)
│                                  │
│  ▾ Proyectos (3)                 │  ← accordion (48px height)
│    ├─ my-web-app                 │  ← item (48px height)
│    ├─ api-server                 │
│    └─ landing-page               │
│                                  │
│  ▾ Agentes (5)                   │
│    ├─ Research Assistant         │
│    ├─ Code Reviewer              │
│    └─ ...                        │
│                                  │
│  ▾ Canales (2)                   │
│    ├─ #general                   │
│    └─ #dev-team                  │
│                                  │
│  ▾ Experimentos (1)              │
│    └─ A/B Test                   │
│                                  │
│  ──────────────────────────────  │  ← divider
│  ⚙ Settings                      │  ← admin section
│  📊 Logs                         │
│  🔌 MCPs                         │
│                                  │
└──────────────────────────────────┘
```

---

## 6. Content Area Behavior

### Layout (with context active)

```
┌──────────────────────────────────┐
│  [←]  my-web-app    [+]  [≡]   │  ← topbar (48px)
├──────────────────────────────────┤
│  Chat  |  Files  |  Preview     │  ← sub-header tabs (40px)
├──────────────────────────────────┤
│                                  │
│  [Content area]                  │  ← flex-grow (100% remaining)
│                                  │
│  [Chat input]                    │  ← sticky bottom
└──────────────────────────────────┘
```

**Content area:**
- Height: `calc(100dvh - 48px - 40px)` (topbar + sub-header)
- Overflow: auto (scrollable if content is long)
- Padding: responsive (16px mobile, 24px desktop)

### Special Cases

**1. Initial state (no context selected):**
- Sidebar occupies 100% of screen
- No sub-header tabs
- Topbar: logo + "Factory"
- User must select a context from sidebar

**2. Empty context (project/agent/channel with no sessions):**
- Content shows `WelcomeChatInput` (welcome screen)
- Sub-header tabs visible (Chat/Files/Preview)
- [+] button in topbar creates new session

**3. Active session with streaming:**
- Input changes to "stop" mode (red button)
- Sub-header tabs remain visible
- Topbar does not change during streaming

**4. Admin pages (Settings, Skills, Logs, MCPs):**
- No sub-header tabs
- Topbar: back + page title
- Content occupies 100% of space

**5. Laboratory (special page):**
- No sub-header tabs on mobile
- Topbar: back + "Laboratorio"
- Content shows IA generator or experiment detail

### Back Button Logic

**Navigation stack:**
```
[Home] → [Project A] → [Chat] → [Files]
```

- Tap back on Files → returns to Chat
- Tap back on Chat → returns to Project A (sidebar)
- Tap back on Project A → returns to Home (sidebar full-screen)

**Implementation:**
- Maintain navigation stack in state
- Each navigation action pushes to stack
- Back button pops from stack
- If stack is empty, back button goes to home

### State Persistence

- Active context saved in localStorage
- If user reloads page on mobile: returns to last context
- If user reloads on home: sidebar full-screen
- Accordion states (expanded/collapsed) saved in localStorage

---

## 7. Responsive Behavior

### Mobile (< 768px)

**Sidebar:**
- Full-screen overlay
- Slides in/out from left
- Touch-optimized (48px targets, 16px fonts)

**Topbar:**
- Simplified: back + title + actions
- No breadcrumbs
- Height: 48px

**Content:**
- 100% width
- Sub-header tabs visible (if context active)
- Input sticky to bottom

### Tablet (768px - 1024px)

**Sidebar:**
- Collapsible (can be hidden/shown)
- Width: 280px
- Same as desktop but can be toggled

**Topbar:**
- Same as desktop (breadcrumbs visible)

**Content:**
- Same as desktop

### Desktop (> 1024px)

**Sidebar:**
- Fixed left sidebar (always visible)
- Width: 280px

**Topbar:**
- Full breadcrumbs
- All actions visible

**Content:**
- Same as current

---

## 8. Implementation Notes

### Files to Modify

**Core navigation:**
- `apps/client/src/components/layout/MainLayout.tsx`
  - Detect mobile breakpoint
  - Manage sidebar state (full-screen vs overlay)
  - Handle navigation stack
  - Simplify topbar on mobile

**Sidebar:**
- `apps/client/src/components/sidebar/SessionSidebar.tsx`
  - Add mobile-optimized styles
  - Increase touch targets (48px)
  - Larger fonts (16px)
  - Better spacing (8px)

**Router:**
- `apps/client/src/hooks/useRouter.ts`
  - Maintain navigation stack
  - Handle back navigation correctly

**Content areas:**
- `apps/client/src/components/chat/ChatArea.tsx`
  - Ensure 100% height on mobile
  - Sticky input at bottom
- `apps/client/src/components/workspace/WorkspacePanel.tsx`
  - Responsive padding
- `apps/client/src/components/preview/PreviewPanel.tsx`
  - Responsive layout

### New Components (if needed)

- `MobileTopbar.tsx` (optional, can be inline in MainLayout)
- `NavigationStack.tsx` (optional, can be managed in state)

### Dependencies

- Framer Motion (already installed)
- Tailwind CSS v4 (already configured)
- No new dependencies required

### Backwards Compatibility

- Desktop layout remains unchanged
- Tablet layout remains unchanged
- Only mobile (< 768px) behavior changes
- No breaking changes to existing components

---

## 9. Testing Checklist

- [ ] Mobile sidebar opens as full-screen
- [ ] Content slides over sidebar smoothly
- [ ] Topbar shows back + title + actions on mobile
- [ ] Back button returns to previous state correctly
- [ ] Menu button opens sidebar overlay
- [ ] Tap on sidebar item closes overlay and shows content
- [ ] Touch targets are 48px minimum
- [ ] Fonts are 16px on mobile
- [ ] Animations run at 60fps (no jank)
- [ ] State persists on page reload
- [ ] Works in dark and light mode
- [ ] No TypeScript errors
- [ ] Build passes
- [ ] Desktop layout unchanged
- [ ] Tablet layout unchanged

---

## 10. Success Metrics

- **Visual**: Matches Slack iOS navigation pattern
- **Performance**: Animations run at 60fps
- **Usability**: Touch targets meet accessibility standards (48px)
- **Responsiveness**: Works flawlessly on mobile (< 768px)
- **Maintainability**: Minimal changes to existing code, mobile-specific logic isolated

---

## 11. Future Enhancements (Out of Scope)

- Swipe gestures (swipe from edge to go back)
- Haptic feedback on interactions
- Offline indicators
- Pull-to-refresh
- Bottom tab bar (alternative navigation model)
- Tablet-specific optimizations
