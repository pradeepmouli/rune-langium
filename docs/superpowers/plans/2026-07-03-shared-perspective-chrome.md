# Shared Perspective Chrome (AppHeader) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shell-level `AppHeader` with registry-declared slots replaces Explore's private top bar, App's duplicate brand header, and the four screens' hand-rolled `<h1>`s.

**Architecture:** `Perspective` gains `title`/`centerSlot`/`actions` (retiring `showsFileTabs`); a new `AppHeader` mounts once in `App.tsx` and renders left brand+switcher (degradable), the active perspective's center slot or title, its actions slot, then the global utilities. Explore's bar contents move verbatim into slot components.

**Tech Stack:** React 19, zustand (`usePerspectiveStore`), Radix Popover, Tailwind 4 (existing `studio-topbar` classes — reuse, don't restyle), vitest + Testing Library, Playwright a11y flow.

**Spec (binding):** `docs/superpowers/specs/2026-07-03-shared-perspective-chrome-design.md`. Read it first.

## Global Constraints

- `apps/studio/` = FSL-1.1-ALv2 — SPDX header `// SPDX-License-Identifier: FSL-1.1-ALv2` on every NEW file there.
- Keep the existing `studio-topbar*` class names on the moved markup — theming and the Playwright/a11y flows depend on them. NO visual redesign; never introduce literal colors (Tailwind 4 + Radix tokens only).
- Explore's DockShell subtree, PerspectiveHost keep-alive, `UtilityTrayContext`/`CenterPanesContext`, and DockShell's own toolbar are UNTOUCHED.
- Settings (`requiresWorkspace: false`) must never throw — AppHeader reads workspace context via a null-tolerant variant, not the throwing hook.
- Commits: `SKIP_SIMPLE_GIT_HOOKS=1`; stage only changed files (never `git add -A`); footers:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01QBKeg1hukfnXfvCCkQnxb2`
- `pnpm exec oxfmt <changed files>` before each commit; format:check stays clean.
- After completion run the FULL studio suite AND the FULL visual-editor suite (shared-component rule) + whole-monorepo type-check. Playwright flows wait for visible UI readiness, never `networkidle`.

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/studio/src/shell/perspectives/perspective-types.ts` | Modify | `title?/centerSlot?/actions?` added; `showsFileTabs` removed |
| `apps/studio/src/shell/perspectives/perspective-registry.ts` | Modify | Explore declares `centerSlot`+`actions`; others declare `title` |
| `apps/studio/src/shell/AppHeader.tsx` | Create | The shared bar: left brand+switcher, center slot/title, actions, global utilities |
| `apps/studio/src/shell/perspectives/explore-chrome.tsx` | Create | `ExploreCenterSlot` (FileTabStrip wiring) + `ExploreActions` (Validate/Export Code/Share/Generate) — the code MOVED from ExplorePerspective |
| `apps/studio/src/shell/perspectives/workspace-actions-context.ts` | Modify | Add `useWorkspaceActionsOptional()` (returns null instead of throwing) |
| `apps/studio/src/App.tsx` | Modify | Mount `<AppHeader/>` above PerspectiveHost; DELETE the not-in-Explore brand header (~993–1007) |
| `apps/studio/src/shell/ExplorePerspective.tsx` | Modify | DELETE the private `<header class="studio-topbar">` block (~2029–2170) and now-unused imports/state |
| `apps/studio/src/shell/perspectives/screens/{GitSyncPerspective,ExportPerspective,SettingsPerspective}.tsx` | Modify | Remove in-page `<h1>` headers |
| `apps/studio/test/shell/app-header.test.tsx` | Create | The consistency contract tests |

---

### Task 1: Slot API on the registry

**Files:**
- Modify: `apps/studio/src/shell/perspectives/perspective-types.ts` (interface, :7–17)
- Modify: `apps/studio/src/shell/perspectives/perspective-registry.ts`
- Modify: whatever consumes `showsFileTabs` (find with `rg -n "showsFileTabs" apps/studio/src`) — remove the flag and its runtime checks; Task 3 replaces the behavior via `centerSlot`.

**Interfaces:**
- Produces: `Perspective` with `title?: string; centerSlot?: () => ReactNode; actions?: () => ReactNode;` (no `showsFileTabs`). `title` defaults to `label` at render time (AppHeader's concern, not the registry's).
- Registry entries: `workspaces` → `title: 'Workspaces / Models'`, `git` → `title: 'Git / Sync'`, `export` → `title: 'Export / Packaging'`, `settings` → `title: 'Settings'`. Explore's `centerSlot`/`actions` are wired in Task 3 (leave them undeclared in this task).

- [ ] **Step 1:** Write a failing type-level/unit test in `apps/studio/test/shell/app-header.test.tsx` (start the file now with SPDX header) asserting every non-explore registry entry has a `title` and no entry has `showsFileTabs`:

```tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
import { describe, it, expect } from 'vitest';
import { PERSPECTIVES } from '../../src/shell/perspectives/perspective-registry.js';

describe('perspective registry chrome contract', () => {
  it('every non-explore perspective declares a bar title', () => {
    for (const p of PERSPECTIVES.filter((p) => p.id !== 'explore')) {
      expect(p.title, `${p.id} needs a title`).toBeTruthy();
    }
  });
  it('showsFileTabs is retired', () => {
    for (const p of PERSPECTIVES) {
      expect('showsFileTabs' in p, `${p.id} still carries showsFileTabs`).toBe(false);
    }
  });
});
```

- [ ] **Step 2:** Run: `pnpm --filter rune-studio exec vitest run test/shell/app-header.test.tsx` (confirm the studio package name first with `rg '"name"' apps/studio/package.json`). Expected: FAIL.
- [ ] **Step 3:** Apply the type + registry changes. Remove `showsFileTabs` consumers (keep behavior identical for now — the FileTabStrip's existing runtime gate in ExplorePerspective still works until Task 3).
- [ ] **Step 4:** Test passes; `pnpm --filter rune-studio run type-check` clean.
- [ ] **Step 5:** Commit: `feat(studio): perspective chrome slot API — title/centerSlot/actions, retire showsFileTabs`

---

### Task 2: `useWorkspaceActionsOptional` + `AppHeader` skeleton mounted

**Files:**
- Modify: `apps/studio/src/shell/perspectives/workspace-actions-context.ts` — alongside the existing throwing hook:

```ts
/** Null-tolerant variant for shell chrome that must render without a workspace (Settings). */
export function useWorkspaceActionsOptional(): WorkspaceActions | null {
  return useContext(WorkspaceActionsContext);
}
```

(Match the real context/type names in the file — read it first; the throwing hook stays for all existing consumers.)

- Create: `apps/studio/src/shell/AppHeader.tsx` — structure (fill the left-side brand/switcher by MOVING the markup from ExplorePerspective.tsx ~2038–2117 in Task 3; in THIS task render brand + title + placeholder right cluster so it mounts):

```tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
import { usePerspectiveStore } from './perspectives/perspective-store.js'; // ← use the real store module name (rg "usePerspectiveStore" apps/studio/src)
import { PERSPECTIVES } from './perspectives/perspective-registry.js';

export function AppHeader() {
  const activeId = usePerspectiveStore((s) => s.activePerspective); // ← match real selector shape
  const perspective = PERSPECTIVES.find((p) => p.id === activeId)!;
  const center = perspective.centerSlot ? (
    <perspective.centerSlot />
  ) : (
    <div className="studio-topbar__title">{perspective.title ?? perspective.label}</div>
  );
  return (
    <header className="studio-topbar" data-testid="app-header">
      <div className="studio-topbar__left">{/* brand + switcher moved here in Task 3 */}</div>
      {center}
      <div className="studio-topbar__right">
        {perspective.actions ? <perspective.actions /> : null}
        {/* global utilities moved here in Task 3 */}
      </div>
    </header>
  );
}
```

NOTE: `<perspective.centerSlot />` requires the slot to be a component (capitalized when destructured: `const Center = perspective.centerSlot`). Use that form. If `studio-topbar__title` has no existing styles, add a minimal class using existing token utilities — check `rg "studio-topbar" apps/studio/src -l` for where the classes are defined.

- Modify: `apps/studio/src/App.tsx` — mount `<AppHeader />` once above `PerspectiveHost` (~978–1050 region); DELETE the not-in-Explore brand header block (~993–1007). Explore will briefly render TWO bars (its private one + AppHeader) until Task 3 — acceptable mid-branch, NOT at the end.

- [ ] Steps: failing test first (AppHeader renders the title for a non-explore perspective; exactly one `data-testid="app-header"`), implement, pass, commit: `feat(studio): shell-level AppHeader mounted; duplicate brand header removed`

---

### Task 3: Move Explore's bar into slots (the extraction)

**Files:**
- Create: `apps/studio/src/shell/perspectives/explore-chrome.tsx` — `ExploreCenterSlot` and `ExploreActions`, containing the code MOVED VERBATIM from ExplorePerspective.tsx: FileTabStrip usage (~2119 and its handlers) and the right-cluster model actions Validate / Export Code / Share / Generate (their buttons + handlers + any dialogs/state they own). Global utilities (cmdk stub, SyncStatusBadge, FontScaleButton, Avatar + account Popover) move into `AppHeader`'s right side instead (they are GLOBAL, spec decision 2). Brand + workspace-switcher Popover (~2038–2117) moves into `AppHeader`'s left side, wrapped in the degrade rule:

```tsx
const workspaceActions = useWorkspaceActionsOptional();
const showSwitcher = workspaceActions !== null && perspective.requiresWorkspace; // + workspace actually loaded — match the real "has workspace" signal used today (rg "workspaceName" apps/studio/src/shell/ExplorePerspective.tsx)
```

- Modify: `apps/studio/src/shell/perspectives/perspective-registry.ts` — Explore declares `centerSlot: ExploreCenterSlot, actions: ExploreActions`.
- Modify: `apps/studio/src/shell/ExplorePerspective.tsx` — DELETE the entire private `<header class="studio-topbar">` block and every import/state/handler that becomes unused (verify with type-check + `rg "studio-topbar" apps/studio/src/shell/ExplorePerspective.tsx` → zero hits).

**Hazards (from the audit — handle explicitly):**
- Hooks the moved code consumes (`useWorkspace`, `useLsp`, editor-store, `useWorkspaceActions`) are all provided by `StudioProviders` above the shell — verify by reading App.tsx's provider tree; if any provider turns out to be INSIDE ExplorePerspective, STOP and report rather than hoisting it silently.
- State shared between the bar and the rest of ExplorePerspective (e.g. a dialog open-state, generate progress) must be identified before moving: for each moved handler, find its `useState`/store source. State used ONLY by the bar moves with it; state shared with the body stays in a store/context — if any shared local state exists, lift it to the narrowest existing store, and record the decision in the report.
- FileTabStrip props: whatever ExplorePerspective passed it must come from hooks/stores inside `ExploreCenterSlot` now.

- [ ] Steps: extend app-header.test.tsx first (Explore: FileTabStrip rendered, actions present; non-Explore: absent; exactly ONE `.studio-topbar` in the DOM for BOTH explore and settings), verify RED where meaningful, move, pass, then run the FULL studio suite. Commit: `refactor(studio): Explore top bar moves into AppHeader slots`

---

### Task 4: Non-Explore screens drop their `<h1>`s + degrade coverage

**Files:**
- Modify: `apps/studio/src/shell/perspectives/screens/GitSyncPerspective.tsx` (~:78), `ExportPerspective.tsx` (~:150 header block), `SettingsPerspective.tsx` (~:20) — remove the in-page titles/headers (Export's `shrink-0 px-6 py-4 border-b` header div goes entirely if it held only the title; keep non-title content). WorkspacesPerspective's launcher layout is unchanged (it has no h1).
- Test: extend `app-header.test.tsx`:

```tsx
it('settings renders with NO workspace and does not throw; switcher hidden', async () => {
  // Render AppHeader with perspective=settings and no WorkspaceActionsContext provider.
  // Assert: bar renders, title 'Settings', no workspace-switcher trigger in the DOM.
});
it('git/export/settings screens no longer render their own h1', () => {
  // Render each screen (with required providers mocked per existing studio test patterns)
  // and assert no <h1> — the bar owns the title now.
});
```

(Complete these using the studio test suite's existing provider-mock helpers — find them via `rg -l "WorkspaceActionsContext.Provider|renderWithProviders" apps/studio/test` and follow that pattern exactly.)

- [ ] Steps: RED → implement → studio suite green → commit: `refactor(studio): perspective titles move to the AppHeader; in-page h1s removed`

---

### Task 5: Final gates

- [ ] `pnpm --filter rune-studio test` (full) — green
- [ ] `pnpm --filter @rune-langium/visual-editor test` (full; shared-component rule) — green
- [ ] `pnpm run type-check` (whole monorepo) — clean
- [ ] `pnpm run format:check` — clean
- [ ] Playwright a11y/smoke flows that exercise the top bar: run whatever exists (`rg -l "studio-topbar|topbar" apps/studio/test apps/studio/e2e 2>/dev/null`) — green; if a flow anchors on the topbar inside ExplorePerspective's DOM position, update the anchor, not the semantics.
- [ ] Ledger: `.superpowers/sdd/chrome-progress.md` one line per task.

## Self-Review (at authoring)

- Spec coverage: slot API→T1, AppHeader+degrade+optional hook→T2, decision-2 split & extraction & double-brand kill→T3, decision-3 h1 removal→T4, testing section→T3/T4/T5. StatusBar/dockview/widgets explicitly absent (out of scope). No gaps.
- Placeholders: T3/T4 direct the implementer to move EXISTING code at named locations and to follow named existing test patterns — the moved code's source of truth is the codebase itself; new-artifact code is given in full.
- Type consistency: `title`/`centerSlot`/`actions` names consistent across T1/T2/T3; `useWorkspaceActionsOptional` consistent T2/T3.
