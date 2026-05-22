# Side-bar perspectives — design

Status: **APPROVED design (brainstorm output)** · 2026-05-22

## 1. Problem

The studio's left rail (`ActivityBar`) is mostly non-functional today: `Explorer`
opens the type explorer, `Curated`/`Settings` open dialogs, and `Graph`/`Search`/
`Notifications` are disabled stubs. There is no concept of the rail *swapping the
main content*. Workspace switching lives in a **topbar** `WorkspaceSwitcher`
dialog, which the user wants moved to the **side bar**. More broadly, the studio
has several distinct activities (editing, loading workspaces, version control,
codegen review, settings) that today are scattered across dialogs, the topbar,
and the start page.

## 2. Goal / Non-goals

**Goal:** Turn the left rail into an **Eclipse-style perspective switcher**.
Clicking a rail icon swaps the **entire main content region** to that perspective
(and shows file tabs only where they belong). Deliver a fixed built-in set of
five perspectives, reusing existing surfaces.

**Non-goals**
- Multi-user / shared / collaborative workspace registries. Workspaces are
  single-user: **local (browser-only/folder) + git-backed + curated**.
- User-definable / saved custom perspectives (deferred; the architecture must
  not preclude adding them later).
- A router / URL-addressable views (see §3 — rejected).
- Changing the Explore workbench itself (dockview layout, panes) — untouched.

## 3. Decisions (from brainstorming)

| Axis | Decision |
|---|---|
| Model | Eclipse-style **perspectives**: rail click swaps all main content + toggles file tabs |
| Approach | **A — top-level perspective screens.** Explore = the existing `DockShell` workbench; the other four = bespoke tab-less screens composing existing components |
| Set | **Explore** (baseline), **Workspaces/Models**, **Git/Sync**, **Export/Packaging**, **Settings** |
| Workspaces/Models scope | **local + git + curated** (single-user launcher; no backend/identity) |
| Switching mechanism | **zustand `activePerspective` value + `display:none` keep-alive** for Explore. No router. |
| Perspective set kind | **Fixed built-in**, structured so user-defined perspectives can layer on later |
| Start page | **Workspaces/Models subsumes it** — default perspective when no workspace is loaded |

**Why no router (react-router etc.):** the studio has no router today and is
state-driven (`App.tsx` renders start-page vs editor from `restoredWorkspace`
state). react-router's unmount-on-navigate **fights the keep-alive crux** (Explore
must stay mounted to preserve dockview layout, open files, unsaved edits, and the
LSP worker) — you'd have to render Explore outside the router outlet or add
`react-activation`, i.e. extra machinery to defeat the router's purpose. URL
addressability buys little because *workspace* context lives in OPFS/IDB, not the
URL, so a shared `/git` link can't reconstruct state. And every route widens the
`/rune-studio/` SPA-fallback surface (#204). `zustand` already backs the
editor/model/codegen stores, so `activePerspective` is a natural, dependency-free
fit. If URL-addressable perspectives ever become a real requirement, react-router
can be added later with Explore mounted outside the outlet.

## 4. The five perspectives

| # | id | Label | Group | File tabs | Composes (reuse) |
|---|---|---|---|---|---|
| 1 | `explore` | Explore | main | **shown** | The existing `DockShell` workbench (type explorer + Graph/Structure/Source/Inspector + utilities) — unchanged |
| 2 | `workspaces` | Workspaces / Models | main | hidden | `WorkspaceSwitcher` (recents) + `FileLoader` (new/open/folder/GitHub) + curated-models browser |
| 3 | `git` | Git / Sync | main | hidden | git-sync-engine surfaces: `SyncStatusBadge`, diff/changes, commit/push |
| 4 | `export` | Export / Packaging | main | hidden | Code-preview + `/api/codegen` review + Export/download |
| 5 | `settings` | Settings | bottom | hidden | Settings content (lifted out of its current dialog) |

`explore`/`git`/`export` require a loaded workspace; their rail buttons are
disabled until one is loaded. `workspaces` and `settings` are always available.

## 5. Architecture

```
ActivityBar  ──renders from──▶ perspectiveRegistry (5 descriptors)
     │ click → setActivePerspective(id)
     ▼
usePerspectiveStore (zustand): { activePerspective, setActivePerspective }
     │
     ▼
PerspectiveHost
   • Explore: ALWAYS mounted, hidden via `display:none` when inactive (keep-alive)
   • workspaces/git/export/settings: mounted on demand when active, unmounted otherwise
```

**`Perspective` descriptor** (`perspective-registry.ts`):
```ts
interface Perspective {
  id: 'explore' | 'workspaces' | 'git' | 'export' | 'settings';
  label: string;
  icon: LucideIcon;
  group: 'main' | 'bottom';
  showsFileTabs: boolean;        // only `explore` is true
  requiresWorkspace: boolean;    // explore/git/export → true
  render: () => React.ReactNode; // not used for `explore` (kept-alive separately)
}
```

**`usePerspectiveStore`** — a small zustand store mirroring the existing studio
stores: `{ activePerspective: PerspectiveId; setActivePerspective(id) }`. Default
`workspaces` when no workspace loaded, else `explore` (see §6).

**`PerspectiveHost`** — renders the Explore workbench always (wrapped so it can be
`display:none` when `activePerspective !== 'explore'`), and renders exactly one of
the other four screens when active. This is the single seam that makes "swap all
content + hide file tabs" work without remounting the editor.

**`ActivityBar`** — rewritten to map over `perspectiveRegistry` (main group on
top, bottom group at the base), rendering a button per perspective; active state +
`aria-pressed` from `activePerspective`; disabled when `requiresWorkspace` and none
loaded. Replaces the current hard-coded stub buttons.

## 6. State, persistence & workspace flow

- `activePerspective` is session UI-state in `usePerspectiveStore`.
- **No workspace loaded → `workspaces` perspective** (this *is* the new start
  page; today's `FileLoader`/`WorkspaceSwitcher` live here). Loading/selecting a
  workspace runs the existing workspace-manager flow and calls
  `setActivePerspective('explore')`.
- **Optional (nice-to-have):** persist last-active perspective per workspace via
  the existing layout/settings IDB so reopening a workspace restores its
  perspective. Not required for v1.
- Explore's dockview layout persists exactly as today (untouched).

## 7. Edge cases

| Situation | Behavior |
|---|---|
| Switch away from Explore with unsaved edits / live LSP | Preserved — keep-alive (`display:none`), no remount, no reparse, worker stays connected |
| `requiresWorkspace` perspective with no workspace | Rail button disabled; not selectable |
| Workspace closed while in Explore | Auto-switch to `workspaces` |
| Load a workspace from the `workspaces` perspective | Existing manager flow, then auto-switch to `explore` |
| Rapid perspective switching | Cheap — only the lightweight screen mounts/unmounts; Explore just toggles visibility |

## 8. Testing

- `perspective-registry` shape: 5 entries, correct `group`/`showsFileTabs`/`requiresWorkspace`.
- `ActivityBar` renders a button per registry entry; click calls `setActivePerspective`; `requiresWorkspace` buttons disabled with no workspace.
- `PerspectiveHost`: renders the active screen; **Explore is NOT remounted across a switch** (keep-alive — assert the Explore subtree node identity / a mount-count spy survives a switch to `git` and back).
- File tabs present only when `activePerspective === 'explore'`.
- No-workspace default = `workspaces`; loading a workspace → `explore`.
- Each of the four screens renders its composed surfaces (Workspaces shows the switcher + loader + curated; Git shows sync status; Export shows the code preview; Settings shows settings).

## 9. Build sequence (for the plan)

1. `usePerspectiveStore` (zustand) + `Perspective`/registry types + the 5 descriptors.
2. `PerspectiveHost` with Explore keep-alive (`display:none`) + on-demand mounting of the other screens; default-perspective logic (no-workspace → workspaces).
3. Rewrite `ActivityBar` to render from the registry + drive the store (+ disabled-until-workspace).
4. `SettingsPerspective` (lift the settings dialog content into a screen).
5. `WorkspacesPerspective` (compose `WorkspaceSwitcher` + `FileLoader` + curated browser; wire load → `explore`).
6. `GitSyncPerspective` (compose the git-sync-engine surfaces).
7. `ExportPerspective` (compose Code-preview + codegen review + Export).
8. Wire `PerspectiveHost` into `App.tsx` in place of the current start-page-vs-editor conditional; remove the topbar workspace-menu dialog (now in the Workspaces perspective) and the Settings dialog trigger (now a perspective).
9. Tests per §8.

## 10. Open questions / deferred

- **User-defined perspectives** (save current dockview arrangement as a named rail
  perspective) — deferred; registry + host are structured to allow adding dynamic
  entries later.
- **Per-workspace last-active perspective persistence** — nice-to-have (§6).
- **Search/Notifications** — the old stubs are dropped from the rail for v1; can
  return as perspectives later if needed.
