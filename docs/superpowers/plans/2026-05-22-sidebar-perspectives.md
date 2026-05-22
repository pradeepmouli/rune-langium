# Side-bar Perspectives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the studio's left rail into an Eclipse-style perspective switcher — clicking a rail icon swaps the whole main content region between five perspectives (Explore / Workspaces-Models / Git-Sync / Export-Packaging / Settings), showing file tabs only in Explore.

**Architecture:** A `zustand` `usePerspectiveStore` holds `activePerspective`. A `PerspectiveHost` renders the active perspective in the shell's content slot; **Explore (the `DockShell` workbench) stays mounted and is hidden with `display:none` when inactive** (keep-alive — preserves dockview layout, open files, unsaved edits, LSP worker), while the other four are bespoke tab-less screens composing existing components. The `ActivityBar` is rewritten to render from a registry and drive the store, and is hoisted so the shell chrome (header + rail + footer) wraps the host. No router.

**Tech Stack:** React 19, zustand 5, dockview-react, Tailwind 4, Radix/DS, Vitest 4. FSL-1.1-ALv2 (`apps/studio/`).

**Spec:** `docs/superpowers/specs/2026-05-22-sidebar-perspectives-design.md`

**Conventions:** New `apps/studio/src/` files start with `// SPDX-License-Identifier: FSL-1.1-ALv2` then `// Copyright (c) 2026 Pradeep Mouli`. ESM `.js` import extensions. Tests: `apps/studio/test/**/*.test.tsx`, `pnpm --filter @rune-langium/studio test`. Commit per task, `SKIP_SIMPLE_GIT_HOOKS=1`, no `--no-verify`. Branch `feat/sidebar-perspectives` (created off origin/master).

---

## Task 0 (read-only): map the workbench shell

No commit. Read so later tasks are exact:
- `apps/studio/src/pages/EditorPage.tsx` — the shell: `<header>` (topbar) ... `<div className="flex flex-1 min-h-0"><ActivityBar .../><div className="flex-1 min-h-0"><DockShell .../></div></div>` ... `<footer>` (statusbar). ActivityBar render is ~line 1995; DockShell ~2001. Note the props EditorPage receives (`models`, `files`, `onFilesChange`, `lspClient`, `workspaceId/Kind/Name`, `onClose`, `onSwitchWorkspace`, `onCreateWorkspace`, …) and the curated-models modal state (`showCuratedModels`, ~line 404).
- `apps/studio/src/App.tsx` — the `bootState` conditionals (~960-1040): start page (`FileLoader`+`WorkspaceSwitcher`+`ModelLoader`, ~968-993) vs two `EditorPage` renders (~996, ~1027). Note `handleSwitchWorkspace`, `handleCreateWorkspace`, `handleFilesLoaded`, `handleReset`.
- `apps/studio/src/shell/ActivityBar.tsx` — current props `{ onWorkspaceClick, onModelsClick, onSettingsClick }`, the stub buttons, `studio-rail` classes.
- `apps/studio/src/store/codegen-store.ts` — the zustand pattern to mirror (`create<State>((set) => ({...}))`).

---

## Task 1: perspective store + registry types

**Files:**
- Create: `apps/studio/src/shell/perspectives/perspective-types.ts`
- Create: `apps/studio/src/store/perspective-store.ts`
- Test: `apps/studio/test/store/perspective-store.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, beforeEach } from 'vitest';
import { usePerspectiveStore } from '../../src/store/perspective-store.js';

describe('usePerspectiveStore', () => {
  beforeEach(() => usePerspectiveStore.setState({ activePerspective: 'workspaces' }));

  it('defaults to workspaces (the launcher / start surface)', () => {
    expect(usePerspectiveStore.getState().activePerspective).toBe('workspaces');
  });
  it('setActivePerspective switches the active id', () => {
    usePerspectiveStore.getState().setActivePerspective('git');
    expect(usePerspectiveStore.getState().activePerspective).toBe('git');
  });
});
```

- [ ] **Step 2: Run → FAIL** `pnpm --filter @rune-langium/studio test -- perspective-store` (module missing).

- [ ] **Step 3: Create `perspective-types.ts`**
```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type { LucideIcon } from 'lucide-react';

export type PerspectiveId = 'explore' | 'workspaces' | 'git' | 'export' | 'settings';

export interface Perspective {
  id: PerspectiveId;
  label: string;
  icon: LucideIcon;
  /** Rail placement: 'main' (top group) or 'bottom' (settings group). */
  group: 'main' | 'bottom';
  /** Only Explore shows the dockview file tabs. */
  showsFileTabs: boolean;
  /** Explore/Git/Export need a loaded workspace; rail button disabled otherwise. */
  requiresWorkspace: boolean;
}
```

- [ ] **Step 4: Create `perspective-store.ts`**
```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { create } from 'zustand';
import type { PerspectiveId } from '../shell/perspectives/perspective-types.js';

interface PerspectiveState {
  activePerspective: PerspectiveId;
  setActivePerspective: (id: PerspectiveId) => void;
}

export const usePerspectiveStore = create<PerspectiveState>((set) => ({
  // Default to the launcher; App swaps to 'explore' once a workspace loads (Task 8).
  activePerspective: 'workspaces',
  setActivePerspective: (id) => set({ activePerspective: id })
}));
```

- [ ] **Step 5: Run → PASS** `pnpm --filter @rune-langium/studio test -- perspective-store`
- [ ] **Step 6: type-check + commit**
```bash
pnpm --filter @rune-langium/studio run type-check
git add apps/studio/src/shell/perspectives/perspective-types.ts apps/studio/src/store/perspective-store.ts apps/studio/test/store/perspective-store.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(studio): perspective store + types (zustand activePerspective)"
```

---

## Task 2: perspective registry (the 5 descriptors)

**Files:**
- Create: `apps/studio/src/shell/perspectives/perspective-registry.ts`
- Test: `apps/studio/test/shell/perspective-registry.test.ts`

- [ ] **Step 1: Failing test**
```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { PERSPECTIVES } from '../../src/shell/perspectives/perspective-registry.js';

describe('PERSPECTIVES registry', () => {
  it('has the five perspectives in rail order', () => {
    expect(PERSPECTIVES.map((p) => p.id)).toEqual(['explore', 'workspaces', 'git', 'export', 'settings']);
  });
  it('only Explore shows file tabs', () => {
    expect(PERSPECTIVES.filter((p) => p.showsFileTabs).map((p) => p.id)).toEqual(['explore']);
  });
  it('explore/git/export require a workspace; workspaces/settings do not', () => {
    const req = PERSPECTIVES.filter((p) => p.requiresWorkspace).map((p) => p.id).sort();
    expect(req).toEqual(['explore', 'export', 'git']);
  });
  it('settings is in the bottom group', () => {
    expect(PERSPECTIVES.find((p) => p.id === 'settings')!.group).toBe('bottom');
  });
});
```

- [ ] **Step 2: Run → FAIL** `pnpm --filter @rune-langium/studio test -- perspective-registry`

- [ ] **Step 3: Create `perspective-registry.ts`**
```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { Layers, FolderOpen, GitBranch, Package, Settings } from 'lucide-react';
import type { Perspective } from './perspective-types.js';

/** Rail order, top group first; settings pinned to the bottom group. */
export const PERSPECTIVES: readonly Perspective[] = [
  { id: 'explore', label: 'Explore', icon: Layers, group: 'main', showsFileTabs: true, requiresWorkspace: true },
  { id: 'workspaces', label: 'Workspaces / Models', icon: FolderOpen, group: 'main', showsFileTabs: false, requiresWorkspace: false },
  { id: 'git', label: 'Git / Sync', icon: GitBranch, group: 'main', showsFileTabs: false, requiresWorkspace: true },
  { id: 'export', label: 'Export / Packaging', icon: Package, group: 'main', showsFileTabs: false, requiresWorkspace: true },
  { id: 'settings', label: 'Settings', icon: Settings, group: 'bottom', showsFileTabs: false, requiresWorkspace: false }
];
```

- [ ] **Step 4: Run → PASS** + commit
```bash
pnpm --filter @rune-langium/studio run type-check
git add apps/studio/src/shell/perspectives/perspective-registry.ts apps/studio/test/shell/perspective-registry.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(studio): perspective registry (5 descriptors)"
```

---

## Task 3: rewrite ActivityBar to render from the registry + drive the store

**Files:**
- Modify: `apps/studio/src/shell/ActivityBar.tsx`
- Test: `apps/studio/test/shell/ActivityBar.test.tsx`

The new ActivityBar takes `hasWorkspace: boolean` and reads/writes `usePerspectiveStore` itself (no per-button handler props). It keeps the `studio-rail` markup. Existing callers (`EditorPage`) will be updated in Task 8.

- [ ] **Step 1: Failing test**
```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityBar } from '../../src/shell/ActivityBar.js';
import { usePerspectiveStore } from '../../src/store/perspective-store.js';

describe('ActivityBar (perspective rail)', () => {
  beforeEach(() => usePerspectiveStore.setState({ activePerspective: 'workspaces' }));

  it('renders a button per perspective', () => {
    render(<ActivityBar hasWorkspace />);
    for (const label of ['Explore', 'Workspaces / Models', 'Git / Sync', 'Export / Packaging', 'Settings']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });
  it('clicking a perspective sets it active', () => {
    render(<ActivityBar hasWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Git / Sync' }));
    expect(usePerspectiveStore.getState().activePerspective).toBe('git');
  });
  it('marks the active perspective aria-pressed', () => {
    usePerspectiveStore.setState({ activePerspective: 'git' });
    render(<ActivityBar hasWorkspace />);
    expect(screen.getByRole('button', { name: 'Git / Sync' }).getAttribute('aria-pressed')).toBe('true');
  });
  it('disables requiresWorkspace perspectives when no workspace', () => {
    render(<ActivityBar hasWorkspace={false} />);
    expect((screen.getByRole('button', { name: 'Explore' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Workspaces / Models' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Rewrite `ActivityBar.tsx`**
```tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
/**
 * ActivityBar — always-visible left rail. Renders one button per registered
 * perspective and drives `usePerspectiveStore`. Lives outside the dockview
 * group so user layouts can't hide it. requiresWorkspace perspectives are
 * disabled until a workspace is loaded.
 */
import type React from 'react';
import { PERSPECTIVES } from './perspectives/perspective-registry.js';
import type { Perspective } from './perspectives/perspective-types.js';
import { usePerspectiveStore } from '../store/perspective-store.js';

interface Props {
  hasWorkspace: boolean;
}

export function ActivityBar({ hasWorkspace }: Props): React.ReactElement {
  const active = usePerspectiveStore((s) => s.activePerspective);
  const setActive = usePerspectiveStore((s) => s.setActivePerspective);

  const renderButton = (p: Perspective) => {
    const Icon = p.icon;
    const disabled = p.requiresWorkspace && !hasWorkspace;
    const isActive = active === p.id;
    return (
      <button
        key={p.id}
        type="button"
        className="studio-rail__btn"
        aria-label={p.label}
        aria-pressed={isActive}
        disabled={disabled}
        data-testid={`rail-${p.id}`}
        onClick={() => setActive(p.id)}
      >
        {isActive && <span className="studio-rail__pip" />}
        <Icon className="size-4" />
      </button>
    );
  };

  return (
    <nav aria-label="Studio activity bar" data-testid="activity-bar" className="studio-rail">
      <div className="studio-rail__group">{PERSPECTIVES.filter((p) => p.group === 'main').map(renderButton)}</div>
      <div className="studio-rail__spacer" />
      <div className="studio-rail__group">{PERSPECTIVES.filter((p) => p.group === 'bottom').map(renderButton)}</div>
    </nav>
  );
}
```

- [ ] **Step 4: Run → PASS** + type-check (NOTE: EditorPage still passes the old props → type error expected; it's fixed in Task 8. If you need green type-check between tasks, temporarily keep EditorPage compiling by passing `hasWorkspace` and dropping old props now — but the full rewire is Task 8. Prefer to land Task 3 + Task 8 before pushing.) Commit:
```bash
git add apps/studio/src/shell/ActivityBar.tsx apps/studio/test/shell/ActivityBar.test.tsx
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(studio): ActivityBar renders from perspective registry + drives store"
```

---

## Task 4: SettingsPerspective (simplest screen — lift the dialog content)

**Files:**
- Create: `apps/studio/src/shell/perspectives/screens/SettingsPerspective.tsx`
- Test: `apps/studio/test/shell/SettingsPerspective.test.tsx`
- Read first: find the current settings dialog content (`git grep -n "Settings" apps/studio/src --glob '!*.test.*'` → the dialog body component). Lift its body into the screen; keep the dialog component until Task 8 removes its trigger.

- [ ] **Step 1: Failing test** — render `<SettingsPerspective />`, assert a stable testid + a known settings control is present (adapt the assertion to the real settings content you find).
```tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingsPerspective } from '../../src/shell/perspectives/screens/SettingsPerspective.js';
describe('SettingsPerspective', () => {
  it('renders the settings screen', () => {
    render(<SettingsPerspective />);
    expect(screen.getByTestId('settings-perspective')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement** a full-height screen wrapping the existing settings body (a `<section data-testid="settings-perspective" className="h-full overflow-auto p-6">`). Reuse the dialog's body component/markup verbatim; do not duplicate logic.
- [ ] **Step 4: Run → PASS** + type-check + commit (`feat(studio): SettingsPerspective screen`).

---

## Task 5: PerspectiveHost (the keep-alive seam) + wire into the EditorPage shell

**Files:**
- Create: `apps/studio/src/shell/perspectives/PerspectiveHost.tsx`
- Modify: `apps/studio/src/pages/EditorPage.tsx` (content slot ~2000-2008)
- Test: `apps/studio/test/shell/PerspectiveHost.test.tsx`

`PerspectiveHost` takes the Explore content as a prop/child (so EditorPage stays the owner of DockShell + its props), and renders the other screens. **Explore is always rendered, hidden via `display:none` when inactive.**

- [ ] **Step 1: Failing test (keep-alive is the key assertion)**
```tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { PerspectiveHost } from '../../src/shell/perspectives/PerspectiveHost.js';
import { usePerspectiveStore } from '../../src/store/perspective-store.js';

let exploreMounts = 0;
function Explore() {
  // count mounts to prove keep-alive (no remount across a switch)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return <div data-testid="explore-content" ref={() => { exploreMounts += 1; }} />;
}

describe('PerspectiveHost', () => {
  beforeEach(() => { exploreMounts = 0; usePerspectiveStore.setState({ activePerspective: 'explore' }); });

  it('keeps Explore mounted (display:none) when switching away and back', () => {
    render(<PerspectiveHost explore={<Explore />} hasWorkspace />);
    const explore = screen.getByTestId('explore-content');
    expect(explore.closest('[data-perspective-slot="explore"]')!.getAttribute('hidden')).toBeNull();

    act(() => usePerspectiveStore.getState().setActivePerspective('settings'));
    // Explore node still in the DOM, just hidden — NOT removed/remounted
    expect(screen.getByTestId('explore-content')).toBe(explore);
    expect(explore.closest('[data-perspective-slot="explore"]')!.getAttribute('hidden')).not.toBeNull();
    expect(screen.getByTestId('settings-perspective')).toBeTruthy();

    act(() => usePerspectiveStore.getState().setActivePerspective('explore'));
    expect(screen.getByTestId('explore-content')).toBe(explore); // same node identity
  });
});
```
(Use a real `ref` mount counter or `vi.fn` in an effect; the essential assertion is **same node identity + not removed** across the switch.)

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement `PerspectiveHost.tsx`**
```tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
/**
 * PerspectiveHost — renders the active perspective in the shell content slot.
 * Explore (the DockShell workbench, passed in as `explore`) is ALWAYS mounted
 * and hidden via `display:none` when inactive — keep-alive preserves the
 * dockview layout, open files, unsaved edits, and the LSP worker. The other
 * four screens mount on demand.
 */
import type React from 'react';
import { usePerspectiveStore } from '../../store/perspective-store.js';
import { SettingsPerspective } from './screens/SettingsPerspective.js';
import { WorkspacesPerspective } from './screens/WorkspacesPerspective.js';
import { GitSyncPerspective } from './screens/GitSyncPerspective.js';
import { ExportPerspective } from './screens/ExportPerspective.js';

interface Props {
  explore: React.ReactNode;
  hasWorkspace: boolean;
}

export function PerspectiveHost({ explore, hasWorkspace }: Props): React.ReactElement {
  const active = usePerspectiveStore((s) => s.activePerspective);
  return (
    <div className="flex-1 min-h-0 relative">
      {/* Explore: kept alive; hidden (not unmounted) when inactive. */}
      <div
        data-perspective-slot="explore"
        hidden={active !== 'explore'}
        className="absolute inset-0"
        style={{ display: active === 'explore' ? undefined : 'none' }}
      >
        {explore}
      </div>
      {active === 'workspaces' && <WorkspacesPerspective />}
      {active === 'git' && hasWorkspace && <GitSyncPerspective />}
      {active === 'export' && hasWorkspace && <ExportPerspective />}
      {active === 'settings' && <SettingsPerspective />}
    </div>
  );
}
```
(For this task, stub `WorkspacesPerspective`/`GitSyncPerspective`/`ExportPerspective` as minimal `data-testid` placeholders if not yet built, so the host compiles; Tasks 6-7 flesh them out. Or reorder to build screens first — implementer's choice, but the host's keep-alive is the deliverable here.)

- [ ] **Step 4: Wire into EditorPage** — replace the content `<div className="flex-1 min-h-0"><DockShell …/></div>` (~2000-2008) with `<PerspectiveHost hasWorkspace explore={<DockShell …/>} />`, and change `<ActivityBar .../>` to `<ActivityBar hasWorkspace />`. (Full App-level rewire is Task 8; this step makes Explore render through the host.)
- [ ] **Step 5: Run → PASS** + type-check + commit (`feat(studio): PerspectiveHost with Explore keep-alive`).

---

## Task 6: WorkspacesPerspective (launcher — subsumes the start page)

**Files:**
- Create: `apps/studio/src/shell/perspectives/screens/WorkspacesPerspective.tsx`
- Test: `apps/studio/test/shell/WorkspacesPerspective.test.tsx`
- Read first: `App.tsx` start-page block (~968-993) — it composes `FileLoader` + `WorkspaceSwitcher` + `ModelLoader` with handlers (`handleFilesLoaded`, `handleSwitchWorkspace`, `handleCreateWorkspace`, `handleDeleteWorkspace`, `handleCreateGitBackedWorkspace`, `handleGitHubWorkspaceCreated`). These handlers live in App; the screen needs them via props or a context.

- [ ] **Step 1: Failing test** — render with stub handlers; assert it shows the workspace switcher + loader + curated (ModelLoader) regions (testids). Assert selecting a workspace calls `onSwitchWorkspace`.
- [ ] **Step 2-3: Implement** — `WorkspacesPerspective` takes the same handler props the start page uses and composes `FileLoader` + `WorkspaceSwitcher` + `ModelLoader` in a full-height scroll screen (`data-testid="workspaces-perspective"`). It does NOT own workspace logic — App passes handlers (Task 8). After a successful load, App flips `activePerspective` to `explore` (Task 8 wires this in `handleFilesLoaded`/`handleSwitchWorkspace`).
- [ ] **Step 4: Run → PASS** + type-check + commit (`feat(studio): WorkspacesPerspective (launcher; subsumes start page)`).

---

## Task 7: GitSyncPerspective + ExportPerspective

**Files:**
- Create: `apps/studio/src/shell/perspectives/screens/GitSyncPerspective.tsx`, `screens/ExportPerspective.tsx`
- Test: `apps/studio/test/shell/GitSyncPerspective.test.tsx`, `ExportPerspective.test.tsx`
- Read first: `git grep -rn "SyncStatusBadge\|git-sync" apps/studio/src` (Git surfaces); the Code-preview panel + `/api/codegen` Export wiring (`git grep -rn "CodePreviewPanel\|Export code\|api/codegen\|downloadTargetViaRouter" apps/studio/src`).

- [ ] **GitSyncPerspective** — full-height screen composing the git-sync-engine surfaces (sync status, changed-files/diff list, commit/push controls) for the active workspace. If the workspace isn't git-backed, show an empty state ("This workspace isn't git-backed — connect a GitHub repo"). Test: renders status for a git-backed workspace; empty state otherwise.
- [ ] **ExportPerspective** — full-height screen composing the existing Code-preview + codegen target selector + Export/download action (review before export). Test: renders the preview + an Export action; reuses the existing codegen service, no new codegen logic.
- [ ] type-check + commit each (`feat(studio): GitSyncPerspective`, `feat(studio): ExportPerspective`).

> If wiring either screen to the live services proves heavier than a screen-composition (e.g. they need props/context only `EditorPage` has), report DONE_WITH_CONCERNS and propose the smallest prop/context seam rather than duplicating service logic.

---

## Task 8: wire the shell into App.tsx; collapse the start-page conditional; remove dialogs/topbar menu

**Files:**
- Modify: `apps/studio/src/App.tsx` (bootState conditionals ~960-1040), `apps/studio/src/pages/EditorPage.tsx` (topbar workspace menu + curated/settings dialog triggers)

This is the integration task — do it carefully with the structure read in Task 0.

- [ ] **Step 1:** Lift the shell so the rail is always present. The studio always renders the shell chrome (header + `ActivityBar` + `PerspectiveHost` + footer). When no workspace is loaded, `PerspectiveHost` shows Workspaces (default store value); Explore/Git/Export rail buttons are disabled (`hasWorkspace=false`). When a workspace loads, App calls `usePerspectiveStore.getState().setActivePerspective('explore')`.
  - Concretely: keep `EditorPage` as the **Explore content** (header/footer may stay in EditorPage, OR extract header+footer into the shell — choose the smaller diff after reading; the spec allows either as long as the rail+host wrap the content). The lowest-risk path: render `EditorPage` (which already contains header+rail+host via Task 5) ALWAYS once `bootState` is past boot, passing `hasWorkspace` + the workspace handlers; drop the separate start-page block (its content now lives in WorkspacesPerspective via the handlers).
- [ ] **Step 2:** Pass the workspace handlers (`handleFilesLoaded`, `handleSwitchWorkspace`, `handleCreateWorkspace`, `handleDeleteWorkspace`, `handleCreateGitBackedWorkspace`, `handleGitHubWorkspaceCreated`) down to `WorkspacesPerspective` (via props through EditorPage, or a small `WorkspaceActionsContext`). On successful load/switch, set `activePerspective='explore'`. On `handleReset`/close, set `activePerspective='workspaces'`.
- [ ] **Step 3:** Remove the now-duplicated entry points: the topbar **workspace menu** dialog and the **Settings** dialog trigger (Settings is now a perspective; curated models is folded into Workspaces). Leave the curated modal component if Export/others still use it, but drop the rail/topbar trigger that's now redundant.
- [ ] **Step 4:** `pnpm --filter @rune-langium/studio run type-check` (exit 0) + `pnpm --filter @rune-langium/studio test` (fix fallout — e.g. tests asserting the old start page or ActivityBar props). Update those tests to the perspective model; don't weaken them.
- [ ] **Step 5: commit** (`feat(studio): drive the studio shell via perspectives; Workspaces subsumes start page`).

---

## Task 9: integration tests + final verification

**Files:**
- Test: `apps/studio/test/shell/perspectives-integration.test.tsx`

- [ ] Render the shell with no workspace → Workspaces perspective active, Explore/Git/Export disabled.
- [ ] Simulate a workspace load → `activePerspective` becomes `explore`, file tabs present.
- [ ] Switch Explore → Git → Explore: assert the DockShell/Explore subtree is the **same node** across the round trip (keep-alive), and file tabs are absent while Git is active.
- [ ] `pnpm --filter @rune-langium/studio test` (full suite green), `pnpm --filter @rune-langium/studio run type-check`, `pnpm run lint` (0 errors).
- [ ] commit (`test(studio): perspective shell integration + keep-alive`).

## Final
- [ ] Full review over the branch; then **superpowers:finishing-a-development-branch** → push + PR (do NOT merge to master locally). Manually verify in the browser: rail switches all five; Explore keeps its layout/open files across switches; Workspaces loads a workspace → Explore; Git/Export disabled with no workspace.

## Notes / risks
- **Keep-alive is the crux** (Task 5) — Explore must never remount on a perspective switch. The integration test (Task 9) is the lock.
- **EditorPage is large + owns DockShell's props.** Keep DockShell owned by EditorPage and pass it into the host as `explore` content (don't relocate DockShell into the host). Header/footer extraction is optional — pick the smaller diff.
- **Screens compose, don't duplicate.** Each screen wraps existing components/services; if a screen needs data only EditorPage/App has, add a minimal prop/context seam, not a copy.
- **`display:none` + dockview:** dockview measures on show; verify the Explore canvas re-fits when returning (it should, since the node persists — if not, call the existing fitView on perspective→explore).
