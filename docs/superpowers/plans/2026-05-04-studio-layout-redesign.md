# Studio Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the dockview-based Studio to match the Daikonic design prototype — activity rail, unified top bar, center workspace stack (Graph/Source/Inspector behind a pill switcher), right column (Code/Form tabs), bottom dock, and status bar.

**Architecture:** Keep dockview for panel management but reconfigure the factory layout to a new 3-column shape: explorer-only left column, center workspace stack with the graph (currently in column 1) moved here as the primary pane, and code+form right column. The paneswitch pill (already built) moves into the center stack header. Activity rail, top bar, and status bar are outside dockview. Layout version bumps from 2→3 to trigger migration for existing users.

**Tech Stack:** React 19, dockview-react, zustand 5, shadcn/ui (Radix), lucide-react, Tailwind CSS 4, @rune-langium/design-system tokens

**Spec:** `docs/superpowers/specs/2026-05-04-studio-layout-redesign.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/studio/src/shell/layout-types.ts` | Modify | New column types for redesigned layout |
| `apps/studio/src/shell/layout-factory.ts` | Modify | New factory shape: explorer \| center-stack \| right-col |
| `apps/studio/src/shell/DockShell.tsx` | Modify | Move paneswitch into center stack header, re-register panels |
| `apps/studio/src/shell/ActivityBar.tsx` | Modify | Icon-only rail with lucide icons + active pip |
| `apps/studio/src/shell/StatusBar.tsx` | Modify | Extended fields (encoding, spaces, version) + mono font |
| `apps/studio/src/pages/EditorPage.tsx` | Modify | Top bar redesign, Generate button, graph auto-orientation |
| `apps/studio/src/styles.css` | Modify | Panel rounded corners, rail styles, top bar styles, dot grid |
| `apps/studio/src/styles/daikonic.css` | Modify | Rail/top-bar Daikonic overrides |
| `packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx` | Modify | Colored letter glyphs, selected-row pip |
| `packages/visual-editor/src/components/panels/EditorFormPanel.tsx` | Modify | Tabbed subsections (Members/Conditions/Doc/Meta) |
| `apps/studio/test/shell/layout-factory.test.ts` | Modify | Remove SC-005/SC-006/FR-024 tests, update layout assertions |
| `apps/studio/test/shell/dockview-bridge.test.ts` | Modify | Remove FR-024 viewport test |
| `apps/studio/test/shell/viewport.test.tsx` | Modify | Remove "dominant slot" test |

---

### Task 1: Remove arbitrary viewport-specific tests

**Files:**
- Modify: `apps/studio/test/shell/layout-factory.test.ts`
- Modify: `apps/studio/test/shell/dockview-bridge.test.ts`
- Modify: `apps/studio/test/shell/viewport.test.tsx`

- [ ] **Step 1: Remove the `layout proportions at 1280×800` describe block**

In `apps/studio/test/shell/layout-factory.test.ts`, delete lines 70–109 (the entire `describe('layout proportions at 1280×800 (SC-005, SC-006)')` block containing the `editor column gets ≥70%` and `chrome vertical budget` tests).

- [ ] **Step 2: Remove the FR-024 collapsed test from layout-factory**

In `apps/studio/test/shell/layout-factory.test.ts`, delete the `it('bottom utilities start collapsed at viewport ≤ 1280px (FR-024)')` test (lines 47–56).

- [ ] **Step 3: Remove the FR-024 test from dockview-bridge**

In `apps/studio/test/shell/dockview-bridge.test.ts`, delete the `it('collapses the bottom utilities at viewport ≤ 1280px (FR-024)')` test (lines 155–161).

- [ ] **Step 4: Remove the "dominant slot" test from viewport.test.tsx**

In `apps/studio/test/shell/viewport.test.tsx`, delete the entire `describe('default layout vs viewport (T080)')` block (lines 15–35). Keep the `UnsupportedViewport` describe block.

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @rune-langium/studio test
```

Expected: All remaining tests pass. Count should drop by 5–6 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/test/shell/layout-factory.test.ts \
       apps/studio/test/shell/dockview-bridge.test.ts \
       apps/studio/test/shell/viewport.test.tsx
git commit -m "test(studio): remove arbitrary viewport-specific layout tests

Remove SC-005 (≥70% horizontal), SC-006 (≥85% vertical), FR-024
(viewport-specific collapse), and dominant-slot tests. These assert
rigid layout proportions that are changing with the redesign and
aren't meaningful behavioral guarantees."
```

---

### Task 2: Restructure layout types and factory for 3-column design

**Files:**
- Modify: `apps/studio/src/shell/layout-types.ts`
- Modify: `apps/studio/src/shell/layout-factory.ts`
- Modify: `apps/studio/test/shell/layout-factory.test.ts`

- [ ] **Step 1: Update layout-types.ts**

The current `NavigationColumn` is a stacked pair (fileTree on top, visualPreview on bottom). The redesign makes column 1 explorer-only and moves the graph to the center stack. Add a new column type:

```typescript
// New: explorer-only column (single panel, no bottom stack)
export type ExplorerColumn = LayoutNode<'workspace.fileTree'>;

// New: center workspace stack — graph, source, inspector as switchable panes
export type CenterStackTabName =
  | 'workspace.visualPreview'
  | 'workspace.editor'
  | 'workspace.inspector';
export type CenterGroup = LayoutGroup<CenterStackTabName>;

// Update LayoutColumn to use the new shape
export type LayoutColumn = ExplorerColumn | CenterGroup | PreviewGroup;

// Update FactoryShape columns tuple
export interface FactoryShape {
  shape: 'factory';
  preset?: LayoutPreset;
  columns: [ExplorerColumn, CenterGroup, PreviewGroup];
  bottomGroup: BottomGroup;
}
```

Keep `NavigationColumn` exported for backwards compatibility in migration code but mark it with a `@deprecated` JSDoc tag.

- [ ] **Step 2: Update layout-factory.ts**

Rewrite `buildDefaultLayout` to produce the new 3-column shape:

```typescript
export const LAYOUT_SCHEMA_VERSION = 3;

export function buildDefaultLayout(input: BuildLayoutInput): PanelLayoutRecord {
  const preset = input.preset ?? 'edit';
  const explorerWidth = 248;
  const previewWidth = 360;

  const centerActive: CenterStackTabName =
    preset === 'navigate'
      ? 'workspace.visualPreview'
      : preset === 'preview'
        ? 'workspace.editor'
        : 'workspace.editor';

  const previewActive: PreviewTabName =
    preset === 'preview' ? 'workspace.codePreview' : 'workspace.formPreview';

  const dockview: FactoryShape = {
    shape: 'factory',
    preset,
    columns: [
      { component: 'workspace.fileTree', size: explorerWidth },
      {
        active: centerActive,
        weight: 3,
        tabs: [
          { component: 'workspace.visualPreview' },
          { component: 'workspace.editor' },
          { component: 'workspace.inspector' }
        ]
      },
      {
        active: previewActive,
        size: previewWidth,
        tabs: [
          { component: 'workspace.formPreview' },
          { component: 'workspace.codePreview' }
        ]
      }
    ],
    bottomGroup: {
      active: 'workspace.problems',
      collapsed: false,
      tabs: [
        { component: 'workspace.problems' },
        { component: 'workspace.output' }
      ]
    }
  };

  return { version: LAYOUT_SCHEMA_VERSION, writtenBy: input.studioVersion, dockview };
}
```

Update `getLayoutColumnComponents` to handle the new `ExplorerColumn` (single component, no `tabs` or `top/bottom`):

```typescript
export function getLayoutColumnComponents(column: LayoutColumn): PanelComponentName[] {
  if ('tabs' in column) return column.tabs.map((tab) => tab.component);
  if ('top' in column) return [column.top.component, column.bottom.component];
  return [column.component];
}
```

- [ ] **Step 3: Update layout-factory tests**

Update the surviving tests in `layout-factory.test.ts`:

- `emits all six locked component names` — should still pass (same 8 components, different arrangement)
- `groups Navigate, Edit, Preview, and Utilities surfaces by default` — update assertions for the new column shape:
  - Column 0 is now just `['workspace.fileTree']`
  - Column 1 is now `['workspace.visualPreview', 'workspace.editor', 'workspace.inspector']`
  - Column 2 is still `['workspace.formPreview', 'workspace.codePreview']`
- `layout.version starts at 2` → change to expect 3
- `preview starts reachable above 1280px` — still valid, may need minor adjustment
- `writtenBy reflects the studio version` — unchanged

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @rune-langium/studio run type-check && pnpm --filter @rune-langium/studio test
```

Expected: Type check clean, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/shell/layout-types.ts \
       apps/studio/src/shell/layout-factory.ts \
       apps/studio/test/shell/layout-factory.test.ts
git commit -m "feat(studio): restructure layout factory for 3-column design

Column 1: explorer-only (fileTree)
Column 2: center stack (graph, source, inspector)
Column 3: right column (form, code)
Bottom: problems + output (never auto-collapsed)
Layout version bumps 2→3 to trigger migration."
```

---

### Task 3: Update dockview bridge for new layout shape

**Files:**
- Modify: `apps/studio/src/shell/dockview-bridge.ts`
- Modify: `apps/studio/test/shell/dockview-bridge.test.ts`
- Modify: `apps/studio/src/shell/layout-migrations.ts`
- Modify: `apps/studio/test/shell/layout-migrations.test.ts`

- [ ] **Step 1: Update `applyLayout` in dockview-bridge.ts**

The bridge translates factory shapes into `api.addPanel` calls. Column 0 is now an `ExplorerColumn` (single component, no `top`/`bottom` stack), not a `NavigationColumn`. Update the column-iteration logic to handle both shapes:

```typescript
// For a single-component column (ExplorerColumn)
if ('component' in column && !('tabs' in column)) {
  api.addPanel({ id: column.component, component: column.component, title: PANEL_TITLES[column.component], ... });
}
```

- [ ] **Step 2: Update dockview-bridge tests**

The `issues addPanel calls in column order` test needs updated expected panel order. The `collapses the bottom utilities at viewport ≤ 1280px` test was already removed in Task 1.

- [ ] **Step 3: Update layout-migrations.ts**

The sanitizer needs to handle v2→v3 upgrades. When it encounters a v2 layout with a `NavigationColumn` (top+bottom stack), rebuild from the new factory. The existing `rebuilds when the layout version is greater than current` test covers this — the sanitizer already rebuilds on version mismatch.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @rune-langium/studio test
```

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/shell/dockview-bridge.ts \
       apps/studio/test/shell/dockview-bridge.test.ts \
       apps/studio/src/shell/layout-migrations.ts \
       apps/studio/test/shell/layout-migrations.test.ts
git commit -m "feat(studio): update dockview bridge + migrations for v3 layout"
```

---

### Task 4: Activity rail with lucide icons

**Files:**
- Modify: `apps/studio/src/shell/ActivityBar.tsx`
- Modify: `apps/studio/src/styles.css`
- Modify: `apps/studio/test/shell/chrome.test.tsx`

- [ ] **Step 1: Rewrite ActivityBar with icon-only buttons**

Replace the text-label buttons with lucide icon buttons. Add active-state pip and brand mark at top:

```tsx
import { Files, Network, Search, Database, Settings, Bell } from 'lucide-react';

const RAIL_ITEMS = [
  { id: 'files', icon: Files, label: 'Explorer' },
  { id: 'graph', icon: Network, label: 'Graph' },
  { id: 'search', icon: Search, label: 'Search' },
  { id: 'models', icon: Database, label: 'Curated models' },
] as const;
```

Render as a vertical column with `gap-1`, each button 36×36px with the icon centered. Active state: accent pip on the left edge (absolute-positioned 2px-wide bar). Brand mark at top, Settings + Bell at bottom with a spacer.

- [ ] **Step 2: Add rail CSS to styles.css**

```css
.studio-app .studio-rail {
  width: 52px;
  background: var(--background);
  border-right: 0.5px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  gap: 4px;
}

.studio-app .studio-rail__btn {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: var(--radius);
  display: grid;
  place-items: center;
  color: var(--muted-foreground);
  transition: color 0.15s, background 0.15s;
}

.studio-app .studio-rail__btn:hover,
.studio-app .studio-rail__btn[aria-pressed='true'] {
  color: var(--foreground);
  background: var(--accent);
}

.studio-app .studio-rail__pip {
  position: absolute;
  left: -8px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background: var(--primary);
  border-radius: 2px;
}

.studio-app .studio-rail__spacer {
  flex: 1;
}
```

- [ ] **Step 3: Update chrome.test.tsx**

The test `renders three nav buttons and routes clicks to the right callback` needs updating — now 4 main items + 2 bottom items. Update the count assertion and button labels.

- [ ] **Step 4: Run tests + type-check**

```bash
pnpm --filter @rune-langium/studio run type-check && pnpm --filter @rune-langium/studio test
```

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/shell/ActivityBar.tsx \
       apps/studio/src/styles.css \
       apps/studio/test/shell/chrome.test.tsx
git commit -m "feat(studio): icon-only activity rail with lucide icons + active pip"
```

---

### Task 5: Top bar redesign

**Files:**
- Modify: `apps/studio/src/pages/EditorPage.tsx`
- Modify: `apps/studio/src/styles.css`

- [ ] **Step 1: Restructure the header in EditorPage.tsx**

Replace the current simple header with:
- Left: brand mark + wordmark + divider + workspace switcher button
- Center: file tabs strip (read from `files` array, show non-readOnly files)
- Right: ⌘K trigger + divider + icon buttons (Validate, Export, Share) + Generate button + divider + avatar

Use lucide icons: `Check`, `Download`, `Share2`, `Zap`, `Search`, `Plus`, `ChevronDown`.

The Generate button calls `requestGeneration(target)` on the codegen worker (same as the existing code preview flow).

File tabs: map over `files.filter(f => !f.readOnly)`, show `name`, dirty dot (from `f.dirty`), and navigate to file on click via `openFileInSource(f.path)`. Active tab matches `activeEditorFile`.

- [ ] **Step 2: Add top bar CSS**

Port the following patterns from the design's `styles.css` into studio's `styles.css` under `@layer components`:

- `.studio-topbar` — flex row, 44px height, border-bottom
- `.studio-topbar__ws-btn` — workspace switcher button (bordered, rounded, chevron)
- `.studio-topbar__tabs` — file tab strip (flex, gap-1, overflow-hidden)
- `.studio-topbar__tab` — individual tab (28px height, rounded, hover bg)
- `.studio-topbar__tab-dot` — dirty indicator dot
- `.studio-topbar__tab-badge` — error/warning badge
- `.studio-topbar__cmdk` — ⌘K search trigger (bordered input look)
- `.studio-topbar__generate` — Generate button (primary accent fill)
- `.studio-topbar__avatar` — circle with gradient bg + initials

- [ ] **Step 3: Run tests + type-check**

```bash
pnpm --filter @rune-langium/studio run type-check && pnpm --filter @rune-langium/studio test
```

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/pages/EditorPage.tsx apps/studio/src/styles.css
git commit -m "feat(studio): top bar redesign — workspace switcher, file tabs, Generate button"
```

---

### Task 6: Move paneswitch pill into center workspace stack

**Files:**
- Modify: `apps/studio/src/shell/DockShell.tsx`
- Modify: `apps/studio/src/pages/EditorPage.tsx`
- Modify: `apps/studio/src/styles.css`

- [ ] **Step 1: Move the paneswitch from the DockShell toolbar into the center workspace stack header**

Currently the paneswitch pill lives in `DockShell.tsx` above the dockview surface. Move it into the center stack panel's header instead. The center stack is the `workspace.visualPreview` / `workspace.editor` / `workspace.inspector` tab group — the pill replaces dockview's built-in tab strip for this group.

In `DockShell.tsx`, remove the `studio-paneswitch` from the layout-presets toolbar. In `EditorPage.tsx`, render the paneswitch pill inside the graph panel's header area (the `workspace.visualPreview` panel component), left-aligned, with utility actions (Fit View, Re-layout, Focus, Filter) at the right.

- [ ] **Step 2: Update paneswitch font**

In `styles.css`, the `.studio-paneswitch__seg` font-family is already corrected to `var(--font-sans)` (done in spec update). Verify it doesn't reference Outfit.

- [ ] **Step 3: Hide dockview's built-in tab strip for the center group**

Add a CSS rule to hide the dockview tab-strip on the center column group, since the paneswitch pill replaces it:

```css
/* Hide dockview tab strip for the center workspace stack —
   the paneswitch pill replaces it. Selector targets the
   second column group (center stack). */
.studio-app .dv-group:nth-child(2) .dv-tabs-container {
  display: none;
}
```

Note: This is fragile (depends on DOM order). A better approach is to set a `data-panel-group="center"` attribute on the group and target that. Check if dockview exposes a way to pass custom attributes to groups.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @rune-langium/studio run type-check && pnpm --filter @rune-langium/studio test
```

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/shell/DockShell.tsx \
       apps/studio/src/pages/EditorPage.tsx \
       apps/studio/src/styles.css
git commit -m "feat(studio): move paneswitch pill into center workspace stack header"
```

---

### Task 7: Graph dot grid + auto-orientation by viewport aspect

**Files:**
- Modify: `apps/studio/src/pages/EditorPage.tsx`
- Modify: `apps/studio/src/styles.css`
- Modify: `packages/visual-editor/src/store/editor-store.ts`

- [ ] **Step 1: Add dot grid CSS background to graph pane**

```css
.studio-app .graph-dot-grid {
  background:
    radial-gradient(ellipse at 50% 30%, var(--card), var(--background)),
    radial-gradient(circle, rgba(255, 255, 255, 0.04) 1px, transparent 1.5px);
  background-size: 100% 100%, 22px 22px;
}
```

Apply this class to the graph container div in EditorPage's graph panel.

- [ ] **Step 2: Auto-orientation via ResizeObserver**

Replace the current `focusMode`-based `LR`/`TB` toggle with a `ResizeObserver` on the graph container. When width > height → `LR`, when height > width → `TB`.

In EditorPage.tsx, add a ref to the graph container div and a `useEffect` with `ResizeObserver`:

```tsx
const graphContainerRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const el = graphContainerRef.current;
  if (!el) return;
  const observer = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    const direction = width >= height ? 'LR' : 'TB';
    graphRef.current?.relayout({ direction });
  });
  observer.observe(el);
  return () => observer.disconnect();
}, []);
```

Remove the `focusMode ? 'LR' : 'TB'` direction logic from the config prop — it's now driven by the observer.

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @rune-langium/studio run type-check && pnpm --filter @rune-langium/studio test
```

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/pages/EditorPage.tsx \
       apps/studio/src/styles.css \
       packages/visual-editor/src/store/editor-store.ts
git commit -m "feat(studio): graph dot grid background + auto-orientation by viewport aspect"
```

---

### Task 8: Explorer type row — colored letter glyphs

**Files:**
- Modify: `packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx`
- Modify: `apps/studio/src/styles.css`

- [ ] **Step 1: Add kind-to-letter map and kind-to-color map**

In `NamespaceExplorerPanel.tsx`, add:

```typescript
const KIND_LETTER: Record<TypeKind, string> = {
  data: 'D', choice: 'C', enum: 'E', func: 'F',
  record: 'R', typeAlias: 'A', basicType: 'B', annotation: 'A',
};

const KIND_COLOR_VAR: Record<TypeKind, string> = {
  data: 'var(--color-data)', choice: 'var(--color-choice)',
  enum: 'var(--color-enum)', func: 'var(--color-func)',
  record: 'var(--color-data)', typeAlias: 'var(--color-data)',
  basicType: 'var(--muted-foreground)', annotation: 'var(--color-enum)',
};
```

- [ ] **Step 2: Replace the lucide icon with the colored letter glyph in TypeItemRow**

Replace:
```tsx
<KindIcon className="size-3.5 shrink-0 text-muted-foreground" />
```

With:
```tsx
<span
  className="studio-type-glyph"
  style={{
    color: KIND_COLOR_VAR[row.typeKind],
    background: `color-mix(in oklch, ${KIND_COLOR_VAR[row.typeKind]}, transparent 82%)`,
    borderColor: `color-mix(in oklch, ${KIND_COLOR_VAR[row.typeKind]}, transparent 60%)`,
  }}
>
  {KIND_LETTER[row.typeKind]}
</span>
```

- [ ] **Step 3: Add selected-row accent pip**

When `isSelected` is true, render:
```tsx
{isSelected && <span className="studio-type-pip" />}
```

The pip is a 2px-wide absolute-positioned bar on the left edge with `background: var(--primary)`.

- [ ] **Step 4: Add CSS for glyph and pip**

```css
.studio-app .studio-type-glyph {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  display: grid;
  place-items: center;
  font-size: 10px;
  font-weight: 700;
  font-family: var(--font-mono);
  border: 0.5px solid;
  flex-shrink: 0;
}

.studio-app .studio-type-pip {
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 2px;
  background: var(--primary);
  border-radius: 2px;
}
```

- [ ] **Step 5: Remove the unused KindIcon import + map (if no other usage)**

Clean up `KIND_ICON_MAP` and the lucide icon imports it referenced (`CircleDot`, `FunctionSquare`, `ArrowRightLeft`, etc.) if they're only used in `TypeItemRow`.

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @rune-langium/visual-editor run type-check && \
pnpm --filter @rune-langium/visual-editor test && \
pnpm --filter @rune-langium/studio test
```

- [ ] **Step 7: Commit**

```bash
git add packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx \
       apps/studio/src/styles.css
git commit -m "feat(studio): colored letter glyphs + accent pip in explorer type rows"
```

---

### Task 9: Panel group rounded corners

**Files:**
- Modify: `apps/studio/src/styles.css`

- [ ] **Step 1: Add rounded-corner overrides for dockview groups**

```css
.studio-app .dockview-theme-abyss .dv-group-panel {
  border-radius: var(--radius);
  border: 0.5px solid var(--border);
  overflow: hidden;
}

.studio-app .dockview-theme-abyss .dv-group-panel .dv-tabs-container {
  border-radius: var(--radius) var(--radius) 0 0;
}
```

- [ ] **Step 2: Run tests (visual check — unit tests won't catch CSS)**

```bash
pnpm --filter @rune-langium/studio run type-check && pnpm --filter @rune-langium/studio test
```

- [ ] **Step 3: Commit**

```bash
git add apps/studio/src/styles.css
git commit -m "feat(studio): rounded corners on dockview panel groups"
```

---

### Task 10: Status bar enhancements

**Files:**
- Modify: `apps/studio/src/shell/StatusBar.tsx`
- Modify: `apps/studio/src/styles.css`

- [ ] **Step 1: Add extra status fields**

Extend the `StatusBar` props with optional encoding, indentation, and language version. Render them in the right section:

```tsx
<footer className="studio-statusbar" ...>
  <div className="studio-statusbar__left">
    <span>⟢ {workspaceName}</span>
    <span className="studio-statusbar__sep" />
    {gitState && <><span>{SYNC_LABEL[gitState]}</span><span className="studio-statusbar__sep" /></>}
    <span className="studio-statusbar__lsp">
      <span className={`studio-statusbar__dot ${lspState === 'connected' ? 'is-ok' : ''}`} />
      lsp · {lspState}
    </span>
  </div>
  <div className="studio-statusbar__right">
    <span>utf-8</span>
    <span>spaces: 2</span>
    <span>rosetta</span>
    <span className="studio-statusbar__sep" />
    <Button ... onClick={onToggleTelemetry}>
      {telemetryEnabled ? '◉' : '○'} diagnostics
    </Button>
  </div>
</footer>
```

- [ ] **Step 2: Add statusbar CSS**

```css
.studio-app .studio-statusbar {
  font-family: var(--font-mono);
  font-size: 11px;
}

.studio-app .studio-statusbar__sep {
  width: 1px;
  height: 11px;
  background: var(--border);
}

.studio-app .studio-statusbar__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted-foreground);
}

.studio-app .studio-statusbar__dot.is-ok {
  background: var(--color-success, var(--color-data));
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--color-data), transparent 82%);
}
```

- [ ] **Step 3: Update chrome.test.tsx if it asserts on StatusBar structure**

The `renders workspace name + LSP state` test should still pass (those fields remain).

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @rune-langium/studio test
```

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/shell/StatusBar.tsx apps/studio/src/styles.css
git commit -m "feat(studio): enhanced status bar with encoding, format, language version"
```

---

### Task 11: Inspector tabbed subsections

**Files:**
- Modify: `packages/visual-editor/src/components/panels/EditorFormPanel.tsx`

- [ ] **Step 1: Add shadcn Tabs wrapping the form sections**

Import `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `@rune-langium/design-system/ui/tabs`. Wrap the form dispatch in `EditorFormPanel.tsx`:

For `DataTypeForm` (kind='data'), the current inline sections (attributes → conditions → annotations → metadata) become:

```tsx
<Tabs defaultValue="members" className="flex-1 flex flex-col min-h-0">
  <TabsList className="studio-insp-tabs">
    <TabsTrigger value="members">Members</TabsTrigger>
    <TabsTrigger value="conditions">Conditions</TabsTrigger>
    <TabsTrigger value="doc">Doc</TabsTrigger>
    <TabsTrigger value="meta">Meta</TabsTrigger>
  </TabsList>
  <TabsContent value="members" className="flex-1 overflow-y-auto p-3">
    {/* existing attribute rows + inherited members */}
  </TabsContent>
  <TabsContent value="conditions" className="flex-1 overflow-y-auto p-3">
    <ConditionSection ... />
  </TabsContent>
  <TabsContent value="doc" className="flex-1 overflow-y-auto p-3">
    <MetadataSection ... />
  </TabsContent>
  <TabsContent value="meta" className="flex-1 overflow-y-auto p-3">
    <AnnotationSection ... />
    {/* read-only metadata grid */}
  </TabsContent>
</Tabs>
```

The tab bar sits at the top of the inspector panel. The active tab's content fills the remaining space with scroll. Each tab lazy-renders via `TabsContent` (Radix default: mount on first activation, unmount on switch).

Note: This change is inside `DataTypeForm.tsx`, not `EditorFormPanel.tsx`. The dispatch in EditorFormPanel stays the same — it's the individual form components that gain tabs. Apply similarly to `EnumForm`, `FunctionForm`, etc. where applicable (some have fewer sections — that's fine, they get fewer tabs).

- [ ] **Step 2: Add tab bar CSS**

```css
.studio-app .studio-insp-tabs {
  height: 34px;
  border-bottom: 0.5px solid var(--border);
  background: transparent;
  border-radius: 0;
  padding: 0 8px;
  gap: 2px;
}

.studio-app .studio-insp-tabs [data-slot='trigger'] {
  border-radius: 6px 6px 0 0;
  font-size: 12px;
  height: 28px;
  position: relative;
}

.studio-app .studio-insp-tabs [data-slot='trigger'][data-state='active']::after {
  content: '';
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: -0.5px;
  height: 1.5px;
  background: var(--primary);
  border-radius: 1.5px;
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @rune-langium/visual-editor run type-check && \
pnpm --filter @rune-langium/visual-editor test && \
pnpm --filter @rune-langium/studio test
```

- [ ] **Step 4: Commit**

```bash
git add packages/visual-editor/src/components/panels/EditorFormPanel.tsx \
       packages/visual-editor/src/components/editors/DataTypeForm.tsx \
       apps/studio/src/styles.css
git commit -m "feat(studio): tabbed subsections in inspector (Members/Conditions/Doc/Meta)"
```

---

### Task 12: File tabs in the top bar

**Files:**
- Modify: `apps/studio/src/pages/EditorPage.tsx`

- [ ] **Step 1: Add a file tab strip component**

Since `files`, `activeEditorFile`, and `openFileInSource` already exist in EditorPage, the tab strip is pure UI:

```tsx
function FileTabStrip({
  files,
  activeFile,
  onSelectFile,
}: {
  files: WorkspaceFile[];
  activeFile: string | undefined;
  onSelectFile: (path: string) => void;
}) {
  const userFiles = files.filter((f) => !f.readOnly);
  if (userFiles.length === 0) return null;

  return (
    <div className="studio-topbar__tabs">
      {userFiles.map((f) => (
        <button
          key={f.path}
          className={`studio-topbar__tab ${f.path === activeFile ? 'is-active' : ''}`}
          onClick={() => onSelectFile(f.path)}
          title={f.path}
        >
          <span className={`studio-topbar__tab-dot ${f.dirty ? 'is-dirty' : ''}`} />
          <span className="studio-topbar__tab-name">{f.name}</span>
        </button>
      ))}
    </div>
  );
}
```

Render it in the top bar center section between the workspace switcher and the ⌘K trigger.

- [ ] **Step 2: Run tests**

```bash
pnpm --filter @rune-langium/studio run type-check && pnpm --filter @rune-langium/studio test
```

- [ ] **Step 3: Commit**

```bash
git add apps/studio/src/pages/EditorPage.tsx
git commit -m "feat(studio): file tab strip in the top bar"
```

---

## Execution Order

Tasks 1–3 are foundational (tests + layout shape + bridge). Tasks 4–12 are independent UI changes that can be done in any order after 1–3. Recommended sequence:

1. **Task 1** — Remove tests (unblocks layout changes)
2. **Task 2** — Layout factory (the structural core)
3. **Task 3** — Bridge + migrations (makes the new layout render)
4. **Task 4** — Activity rail
5. **Task 5** — Top bar
6. **Task 6** — Paneswitch into center stack
7. **Task 7** — Graph dot grid + auto-orientation
8. **Task 8** — Explorer glyphs
9. **Task 9** — Panel rounded corners
10. **Task 10** — Status bar
11. **Task 11** — Inspector tabs
12. **Task 12** — File tabs
