# Shared Perspective Chrome (AppHeader) — Design

**User direction (2026-07-03):** make the non-Explore perspectives (Workspaces/Models, Git/Sync, Export/Packaging, Settings) consistent with the Explore perspective — reuse the same top bar and shell chrome. (Replaces the retired P7 token-consolidation task: that work is already done — `@theme` is the token SSoT.)

## Current state (ground-truth audit 2026-07-03)

- Explore's top bar is 100% PRIVATE to `apps/studio/src/shell/ExplorePerspective.tsx` (~2029–2170): brand + workspace-switcher Popover (left), `FileTabStrip` (center, gated at runtime on `activePerspective === 'explore'`), then search/cmdk stub, `SyncStatusBadge`, `FontScaleButton`, Validate, Export Code, Share, Generate, `Avatar` (right).
- `App.tsx` (~993–1007) renders a SECOND, different brand header only when NOT in Explore — the double-brand seam.
- Git/Export/Settings each hand-roll an in-page `<h1>`; Workspaces renders a bare centered launcher. No shared chrome abstraction exists.
- `StatusBar.tsx` exists but is mounted nowhere (out of scope here; recorded follow-up).
- `Perspective` type (`perspective-types.ts:7–17`): `{ id, label, icon, group, showsFileTabs, requiresWorkspace }`.

## Decisions (user-selected)

1. **Shell-level bar + slots** — one `AppHeader` mounted once in `App.tsx` above `PerspectiveHost`, always visible. Consistency by construction; new perspectives get chrome for free. The private Explore bar AND App's not-in-Explore brand header are both deleted.
2. **Utility globals, model actions per-perspective** — global right-side chrome: search/cmdk, `SyncStatusBadge` (self-gated to git-backed workspaces), `FontScaleButton`, `Avatar`. Per-perspective actions slot: Validate / Export Code / Share / Generate belong to Explore's slot; other perspectives may declare their own later.
3. **Perspective title in the bar** — non-Explore perspectives declare `title` in the registry, rendered center-left; their in-page `<h1>`s are REMOVED.

## Slot API

`Perspective` (perspective-types.ts) gains declarative chrome; `showsFileTabs` RETIRES:

```ts
interface Perspective {
  id: PerspectiveId;
  label: string;
  icon: LucideIcon;
  group: 'main' | 'bottom';
  requiresWorkspace: boolean;
  /** Bar title, center-left, for perspectives without a centerSlot. Defaults to `label`. */
  title?: string;
  /** Center of the bar (Explore: FileTabStrip). Wins over `title`. */
  centerSlot?: () => ReactNode;
  /** Per-perspective action cluster, rendered LEFT of the global utilities. */
  actions?: () => ReactNode;
}
```

- Slot renderers are components (hook rules apply): Explore's `actions` consumes `useWorkspace`/`useLsp`/editor-store — all provided by `StudioProviders`, which already wraps the shell, so hoisting is safe.
- Explore's `centerSlot` declares the `FileTabStrip`, replacing the runtime perspective check (Seam B: gate at the type level).

## AppHeader composition

```
<header class="studio-topbar">           ← SAME class names as today (theming/a11y contracts carry over)
  left:   brand · divider · WorkspaceSwitcher (degradable)
  center: activePerspective.centerSlot?.() ?? <title>
  right:  activePerspective.actions?.() · cmdk · SyncStatusBadge · divider · FontScale · divider · Avatar
</header>
```

## Degrade rules

- No workspace loaded OR `requiresWorkspace: false` (Settings): workspace switcher HIDDEN; brand + title + global utilities remain.
- Context safety: `AppHeader` reads workspace state through null-tolerant reads — Settings must NEVER throw on `useWorkspaceActions` (today's hook throws when context is null; add/use an optional variant for the header's reads).
- `SyncStatusBadge` keeps its own workspace-kind gating (no change).

## Explicitly unchanged

- `UtilityTrayContext`/`CenterPanesContext` stay inside DockShell (Explore-internal).
- PerspectiveHost keep-alive for Explore — only the header MOVES; the DockShell subtree is untouched.
- DockShell's own toolbar (layout presets) stays where it is.
- ActivityBar, providers, routing.

## Out of scope

- Mounting `StatusBar` (follow-up candidate, not this effort).
- dockview → DockLayout (queued separately, task #3).
- Center widgets beyond title (the slot API admits them later).
- Any visual redesign — this is chrome UNIFICATION; the bar keeps today's Explore look (Tailwind 4 + Radix tokens; never copy literal colors).

## Testing

- Studio suite: bar renders in ALL FIVE perspectives with correct title/center/actions; Settings renders with NO workspace and no throw; FileTabStrip present only in Explore; exactly ONE brand element in the DOM in every perspective (kills the double-brand seam and guards its return).
- In-page `<h1>` removal asserted for Git/Export/Settings (title now in bar).
- Existing Explore Playwright/a11y flows stay green (`studio-topbar` class names preserved).
- Run the FULL studio suite + VE suite (shared-component change rule) + whole-monorepo type-check.

## Licensing

`apps/studio/` = FSL-1.1-ALv2 — SPDX headers on all new files there.
