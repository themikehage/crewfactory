# Mobile Navigation Redesign - Implementation Plan

**Spec:** [docs/superpowers/specs/2026-03-07-mobile-navigation-redesign-design.md](../docs/superpowers/specs/2026-03-07-mobile-navigation-redesign-design.md)  
**Status:** Pending Implementation  
**Estimated effort:** 6-8 hours of agent work

---

## Goal

Transform mobile navigation from a hamburger overlay menu to a split-screen model (Slack iOS style). Sidebar becomes a full-screen independent view, content slides over it when a context is active.

---

## Phase 1: Mobile Detection and Navigation State

### Task 1.1: Create `useIsMobile` hook
**File:** `apps/client/src/hooks/useIsMobile.ts`

Custom hook to detect mobile breakpoint (< 768px).

**Requirements:**
```ts
interface UseIsMobileReturn {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}
```

- Uses `window.matchMedia` for breakpoint detection
- Breakpoints: mobile (< 768px), tablet (768px - 1024px), desktop (> 1024px)
- Listens to `resize` event and updates state
- Debounces resize events (150ms) to avoid excessive re-renders
- Returns boolean flags for each breakpoint

**Verification:** Hook returns correct values at different viewport sizes.

---

### Task 1.2: Create navigation stack state
**File:** `apps/client/src/hooks/useNavigationStack.ts`

Custom hook to manage navigation history stack.

**Requirements:**
```ts
interface NavigationStackItem {
  type: "home" | "context" | "admin";
  contextType?: "project" | "agent" | "channel";
  contextId?: string;
  contextName?: string;
  page?: string;
}

interface UseNavigationStackReturn {
  stack: NavigationStackItem[];
  current: NavigationStackItem;
  push: (item: NavigationStackItem) => void;
  pop: () => NavigationStackItem | null;
  canGoBack: boolean;
  clear: () => void;
}
```

- Maintains array of navigation states
- `push`: adds item to stack
- `pop`: removes and returns last item (for back navigation)
- `canGoBack`: true if stack has more than 1 item
- `clear`: resets stack to initial state
- Persists stack to localStorage (key: `nav-stack-mobile`)
- Loads initial state from localStorage on mount

**Verification:** Stack operations work correctly, persistence survives reload.

---

### Task 1.3: Integrate navigation hooks in `AppRouter.tsx`
**File:** `apps/client/src/components/layout/AppRouter.tsx`

**Changes:**
- Import `useIsMobile` and `useNavigationStack`
- Pass `isMobile` to `MainLayout`
- Pass navigation stack methods to `MainLayout`
- Update navigation stack when route changes
- Sync stack with localStorage

**Requirements:**
- On route change: push new state to stack
- On back navigation: pop from stack and navigate
- Reset stack when going to home

**Verification:** Navigation stack updates correctly on route changes.

---

## Phase 2: Topbar Redesign

### Task 2.1: Create `MobileTopbar` component
**File:** `apps/client/src/components/layout/MobileTopbar.tsx`

Responsive topbar that adapts to mobile/desktop.

**Props:**
```ts
interface MobileTopbarProps {
  isMobile: boolean;
  isHome: boolean;
  title: string;
  canGoBack: boolean;
  onBack: () => void;
  onMenuToggle: () => void;
  onNewSession: () => void;
  showNewSessionButton: boolean;
}
```

**Requirements:**

**Mobile layout (< 768px):**
```
┌──────────────────────────────────┐
│  [←]  Title    [+]  [≡]         │  ← if not home
│  [Logo]      Factory            │  ← if home
└──────────────────────────────────┘
```

**Desktop layout (≥ 768px):**
- Same as current (breadcrumbs + actions)

**Mobile specifications:**
- Height: 48px
- Back button: arrow-left icon (24px), touch target 48x48px
- Title: `text-base font-semibold truncate max-w-[200px]`
- Action buttons: 20px icons, touch target 44x44px
- Spacing: `px-3` horizontal padding

**Home state:**
- Logo (left) + "Factory" title (center)
- No back button, no actions

**Context state:**
- Back button (left) + title (center) + [+] and [≡] buttons (right)
- Back button calls `onBack`
- [+] button calls `onNewSession`
- [≡] button calls `onMenuToggle`

**Verification:** Topbar renders correctly in all states, buttons trigger callbacks.

---

### Task 2.2: Update `MainLayout.tsx` to use `MobileTopbar`
**File:** `apps/client/src/components/layout/MainLayout.tsx`

**Changes:**
- Replace current header with `MobileTopbar`
- Pass navigation callbacks
- Handle menu toggle state
- Handle new session creation

**Requirements:**
- Import `MobileTopbar`
- Pass `isMobile` from `useIsMobile` hook
- Determine `isHome` based on current route
- Determine `title` from active context (project/agent/channel name)
- Wire `onBack` to navigation stack pop
- Wire `onMenuToggle` to sidebar state
- Wire `onNewSession` to quick create logic

**Verification:** Topbar shows correct content based on state, all buttons work.

---

## Phase 3: Sidebar Mobile Optimization

### Task 3.1: Add mobile styles to `SessionSidebar.tsx`
**File:** `apps/client/src/components/sidebar/SessionSidebar.tsx`

**Changes:**
- Add `isMobile` prop
- Apply mobile-optimized styles when `isMobile` is true

**Requirements:**

**Touch targets:**
- Sidebar items: `h-12` (48px) on mobile, `h-8` (32px) on desktop
- Action buttons: `w-11 h-11` (44px) on mobile
- Accordion headers: `h-12` on mobile

**Font sizes:**
- Items: `text-base` (16px) on mobile, `text-sm` (14px) on desktop
- Accordion headers: `text-sm` on mobile, `text-xs` on desktop

**Spacing:**
- Items: `py-3` on mobile, `py-1` on desktop
- Between items: `space-y-2` on mobile, `space-y-0.5` on desktop

**Icons:**
- Size: `w-5 h-5` (20px) on mobile, `w-3.5 h-3.5` (14px) on desktop

**Conditional classes:**
```tsx
className={cn(
  "w-full flex items-center gap-2 rounded-lg transition-colors",
  isMobile ? "h-12 px-4 text-base" : "h-8 px-3 text-sm"
)}
```

**Verification:** Sidebar renders with correct sizes on mobile, all items are tappable.

---

### Task 3.2: Make sidebar full-screen on mobile
**File:** `apps/client/src/components/layout/MainLayout.tsx`

**Changes:**
- When `isMobile` is true and sidebar is open:
  - Sidebar occupies 100% width
  - No overlay (sidebar is the view)
- When `isMobile` is true and menu is open (overlay mode):
  - Sidebar slides over content
  - Dark overlay behind

**Requirements:**

**State 1: Home (no context)**
- Sidebar is always visible (full-screen)
- No overlay

**State 2: Context active, menu closed**
- Content is visible
- Sidebar is off-screen (`translateX(-100%)`)

**State 3: Context active, menu open**
- Sidebar slides in from left
- Dark overlay: `bg-black/50`
- Content visible behind

**Implementation:**
```tsx
<aside className={cn(
  "h-full border-r border-border bg-background",
  isMobile
    ? cn(
        "fixed inset-0 z-50 w-full",
        menuOpen ? "translate-x-0" : "-translate-x-full"
      )
    : "relative w-64"
)} />
```

**Verification:** Sidebar behavior changes correctly based on state.

---

## Phase 4: Transitions and Animations

### Task 4.1: Add Framer Motion animations to sidebar
**File:** `apps/client/src/components/layout/MainLayout.tsx`

**Requirements:**

**Sidebar slide animations:**
```tsx
<motion.aside
  initial={false}
  animate={{ x: menuOpen ? 0 : "-100%" }}
  transition={{ duration: 0.3, ease: menuOpen ? "easeOut" : "easeIn" }}
/>
```

**Overlay fade animation:**
```tsx
<AnimatePresence>
  {menuOpen && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.5 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 bg-black z-40"
    />
  )}
</AnimatePresence>
```

**Content slide (when transitioning from home to context):**
- Only on mobile
- Content slides in from right when context is selected
- Duration: 300ms

**Verification:** Animations run smoothly at 60fps, no jank.

---

### Task 4.2: Add transition for home → context
**File:** `apps/client/src/components/layout/MainLayout.tsx`

**Requirements:**

When user selects a context from home:
1. Sidebar slides to left (off-screen)
2. Content slides in from right
3. Topbar updates

**Implementation:**
- Use Framer Motion `AnimatePresence` for content area
- Detect transition from `isHome` to `!isHome`
- Apply slide animation only on mobile

```tsx
<AnimatePresence mode="wait">
  {isHome ? (
    <motion.div key="home" initial={{ x: 0 }} animate={{ x: 0 }} exit={{ x: "-100%" }}>
      <SessionSidebar />
    </motion.div>
  ) : (
    <motion.div key="content" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}>
      {children}
    </motion.div>
  )}
</AnimatePresence>
```

**Verification:** Smooth transition between home and content states.

---

## Phase 5: Integration and Logic

### Task 5.1: Wire back button logic
**File:** `apps/client/src/components/layout/MainLayout.tsx`

**Requirements:**

**Back button behavior:**
- If `canGoBack` is true: pop from navigation stack and navigate
- If `canGoBack` is false: navigate to home (`/`)

**Implementation:**
```tsx
const handleBack = () => {
  if (navigationStack.canGoBack) {
    const prev = navigationStack.pop();
    if (prev) {
      // Navigate to previous state
      if (prev.type === "home") {
        onNavigate("/");
      } else if (prev.contextId) {
        onNavigate(`/${prev.contextType}s/${prev.contextId}/chat`);
      }
    }
  } else {
    onNavigate("/");
  }
};
```

**Verification:** Back button returns to correct previous state.

---

### Task 5.2: Wire menu toggle logic
**File:** `apps/client/src/components/layout/MainLayout.tsx`

**Requirements:**

**Menu button behavior:**
- Toggle `menuOpen` state
- When open: sidebar slides in with overlay
- When closed: sidebar slides out, overlay fades

**Implementation:**
```tsx
const [menuOpen, setMenuOpen] = useState(false);

const handleMenuToggle = () => {
  setMenuOpen((prev) => !prev);
};

// Close menu when navigating
const handleNavigate = (path: string) => {
  setMenuOpen(false);
  onNavigate(path);
};
```

**Verification:** Menu opens/closes smoothly, closes on navigation.

---

### Task 5.3: Wire new session button
**File:** `apps/client/src/components/layout/MainLayout.tsx`

**Requirements:**

**New session button behavior:**
- Only visible when context is active (not home)
- Calls quick create logic (same as current)
- Navigates to new session

**Implementation:**
- Reuse existing `handleQuickCreate` logic
- Show button only when `!isHome`

**Verification:** New session button creates session and navigates correctly.

---

## Phase 6: Responsive Behavior

### Task 6.1: Ensure desktop layout unchanged
**Files:** All modified files

**Requirements:**
- All changes must be wrapped in `isMobile` conditionals
- Desktop (> 1024px) must work exactly as before
- Tablet (768px - 1024px) must work exactly as before
- No breaking changes to desktop experience

**Verification:**
- Test at 1280px width: desktop layout unchanged
- Test at 1024px width: tablet layout unchanged
- Test at 768px width: tablet layout unchanged
- Test at 375px width: mobile layout works

---

### Task 6.2: Test all breakpoints
**Manual testing checklist:**

| Breakpoint | Expected Behavior |
|------------|-------------------|
| 375px (mobile) | Split screen, sidebar full-screen, simplified topbar |
| 768px (tablet) | Desktop layout (sidebar fixed) |
| 1024px (desktop) | Desktop layout (sidebar fixed) |
| 1280px (desktop) | Desktop layout (sidebar fixed) |

**Verification:** All breakpoints work correctly.

---

## Phase 7: Verification

### Task 7.1: TypeScript typecheck
```bash
cd apps/client && bunx tsc --noEmit
```
**Expected:** Exit 0, no errors.

### Task 7.2: Client build
```bash
cd apps/client && bun run build
```
**Expected:** Build succeeds, no warnings about missing imports.

### Task 7.3: Visual smoke test
- Open app in browser at mobile width (375px)
- Verify sidebar is full-screen on home
- Tap on project → content slides in, topbar updates
- Tap menu button → sidebar slides over content
- Tap sidebar item → sidebar closes, content changes
- Tap back button → returns to previous state
- Resize to desktop width → desktop layout unchanged
- Test in dark mode

### Task 7.4: Update documentation
- Update `about.md` with mobile navigation architecture
- Update `steps.md` with Phase 69 tasks marked complete

---

## Execution Order

```
Phase 1 (parallel):
  1.1 useIsMobile hook
  1.2 useNavigationStack hook
  1.3 Integrate in AppRouter (depends on 1.1, 1.2)

Phase 2 (parallel, after Phase 1):
  2.1 MobileTopbar component
  2.2 Update MainLayout to use MobileTopbar (depends on 2.1)

Phase 3 (parallel with Phase 2):
  3.1 Add mobile styles to SessionSidebar
  3.2 Make sidebar full-screen on mobile (depends on 3.1)

Phase 4 (after Phase 2 and 3):
  4.1 Add Framer Motion animations
  4.2 Add home → context transition (depends on 4.1)

Phase 5 (after Phase 4):
  5.1 Wire back button logic
  5.2 Wire menu toggle logic
  5.3 Wire new session button

Phase 6 (after Phase 5):
  6.1 Ensure desktop unchanged
  6.2 Test all breakpoints

Phase 7 (after Phase 6):
  7.1 TypeScript typecheck
  7.2 Client build
  7.3 Visual smoke test
  7.4 Update documentation
```

---

## Risk Mitigation

- **Backwards compatibility:** All changes wrapped in `isMobile` conditionals
- **No new dependencies:** Framer Motion already installed
- **Isolated changes:** Mobile-specific logic separated from desktop
- **Gradual testing:** Can test each phase independently

---

## Files Modified Summary

**New files:**
- `apps/client/src/hooks/useIsMobile.ts`
- `apps/client/src/hooks/useNavigationStack.ts`
- `apps/client/src/components/layout/MobileTopbar.tsx`

**Modified files:**
- `apps/client/src/components/layout/AppRouter.tsx`
- `apps/client/src/components/layout/MainLayout.tsx`
- `apps/client/src/components/sidebar/SessionSidebar.tsx`

**Unchanged files:**
- All desktop-specific components
- Chat input components (separate spec)
- All backend code
