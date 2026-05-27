# Radix → Base UI Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all 16 Radix-backed primitive wrappers in `packages/design-system/src/ui/` with Base UI equivalents, preserving every exported component API so the 139 consumer files need no changes — except migrating the `asChild` call sites to Base UI's `render` prop as each component's wave ships.

**Architecture:** Both libraries coexist during migration; each wrapper is rewritten behind its exact existing exported API (consumers see no change). Floating components (Tooltip, Popover, DropdownMenu, Select) absorb Base UI's new `Positioner` element internally so exported `*Content` / `*Popup` names stay stable. The `asChild`→`render` migration is co-located with each component's wave — the wrapper removes `asChild` and forwards Base UI's `render` prop, and every consumer call site that used `asChild` is updated in the same PR so the wrapper and its consumers ship green together. `StudioToastProvider`/`useStudioToast` are reworked inside Toast's task while preserving the `showToast({title,description,variant,duration})` signature so all callers remain untouched.

**Tech Stack:** `@base-ui-components/react` (to be added), TypeScript 5.9+ (strict ESM), React 19, Tailwind CSS 4, `class-variance-authority`, `lucide-react`, Vitest 4. `apps/studio/` is FSL-1.1-ALv2 (SPDX header required on all new files there); `packages/` is MIT.

**Reference:** `docs/superpowers/specs/2026-05-26-radix-to-baseui-migration-design.md`

**Conventions:** Commits use `SKIP_SIMPLE_GIT_HOOKS=1 git commit` (NOT `--no-verify`). Run design-system tests with `pnpm --filter @rune-langium/design-system test`; run the full studio suite with `pnpm --filter @rune-langium/studio test`; type-check with `pnpm run type-check`; lint with `pnpm run lint`. Do not push or merge. **Invariant (repeat this at every task):** the exported component API of each migrated wrapper must be byte-for-byte identical to what it was before — consumers must compile and pass tests without any change except the co-located `asChild`→`render` call sites.

---

### Task 0: Survey — add `@base-ui-components/react` and enumerate all 16 wrapper APIs

This task is mostly read-only. No component code changes. One `package.json` edit to add the dependency.

**Files:**
- Edit: `packages/design-system/package.json` (add `@base-ui-components/react`)
- Read (no edit): every file in `packages/design-system/src/ui/` that is in scope

- [ ] **Step 1: Add the dependency**

  In `packages/design-system/package.json`, add `@base-ui-components/react` to `dependencies` at the version that covers all 16 targets. At time of writing the latest stable release is `^1.0.0`; confirm the exact version that ships `Toast`, `ScrollArea`, `Avatar`, `Separator`, `Collapsible`, `RadioGroup`, `CheckBox`, `Tabs`, `Tooltip`, `Popover`, `Menu`, `Dialog`, `Select`, and `Field` (for the Label fallback) before committing.

  Run: `pnpm install` from the repo root.

- [ ] **Step 2: Verify all 16 components are present in the installed package**

  Run:
  ```bash
  node -e "
    const pkg = require('./node_modules/@base-ui-components/react/package.json');
    console.log('version:', pkg.version);
  "
  # Then spot-check each target:
  node -e "
    const {
      Separator, Avatar, Collapsible, ScrollArea,
      Button, Checkbox, RadioGroup, Tabs,
      Tooltip, Popover, Menu,
      Dialog, Select, Toast
    } = require('@base-ui-components/react');
    // Field / Field.Label for the label fallback:
    const { Field } = require('@base-ui-components/react');
    console.log('all present');
  "
  ```
  Confirm `Toast`, `ScrollArea`, `Avatar` are present — the spec flags these as the ones most likely to be missing in older minor versions (§9 step 0).

- [ ] **Step 3: Enumerate exported APIs and `data-state` CSS rules for all 16 wrappers**

  For each file listed below, read it fully and note:
  1. Every exported symbol name (the exact `export { … }` statement — this is the **contract that must be preserved**).
  2. Every Tailwind class that keys on a `data-[state=…]`, `data-[side=…]`, `data-[orientation=…]`, `data-[placeholder]`, or `data-[disabled]` selector — these are the attributes that differ between Radix and Base UI and must be re-pointed per task.

  Files to read (check against the full directory listing):
  ```
  packages/design-system/src/ui/separator.tsx
  packages/design-system/src/ui/avatar.tsx
  packages/design-system/src/ui/label.tsx
  packages/design-system/src/ui/collapsible.tsx
  packages/design-system/src/ui/scroll-area.tsx
  packages/design-system/src/ui/button.tsx
  packages/design-system/src/ui/alert.tsx
  packages/design-system/src/ui/checkbox.tsx
  packages/design-system/src/ui/radio-group.tsx
  packages/design-system/src/ui/tabs.tsx
  packages/design-system/src/ui/tooltip.tsx
  packages/design-system/src/ui/popover.tsx
  packages/design-system/src/ui/dropdown-menu.tsx
  packages/design-system/src/ui/dialog.tsx
  packages/design-system/src/ui/select.tsx
  packages/design-system/src/ui/toast.tsx
  ```

  Cross-reference the Base UI documentation or source for the matching `data-*` attribute names Base UI uses (e.g., `data-[state=open]` in Radix becomes `data-open` in Base UI; `data-[state=checked]` becomes `data-checked`; `data-[state=active]` on Tabs.Trigger becomes `data-selected`). Build a per-component cheat-sheet — you will need it in every subsequent task.

- [ ] **Step 4: Run `rg -n "asChild" apps/studio/src packages` to confirm the full call-site list**

  The call sites found during plan authorship are enumerated per wave below, but run the search now to catch any that were added after the plan was written. Record the full current list.

  At time of plan authorship the known consumer `asChild` call sites are:

  | File | Line | Component | Wave |
  |---|---|---|---|
  | `apps/studio/src/shell/ExplorePerspective.tsx` | 1879 | `<Avatar asChild …>` | Wave 1 |
  | `apps/studio/src/components/CuratedLoadErrorPanel.tsx` | 76 | `<AlertTitle asChild>` | Wave 2 |
  | `apps/studio/src/components/DownloadConfigModal.tsx` | 348 | `<TooltipTrigger asChild>` | Wave 3 |
  | `packages/visual-editor/src/components/panels/ToolbarPanel.tsx` | 46, 56 | `<TooltipTrigger asChild>` | Wave 3 |
  | `packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx` | 244, 259, 552 | `<TooltipTrigger asChild>` | Wave 3 |
  | `apps/studio/src/shell/ExplorePerspective.tsx` | 1767 | `<PopoverTrigger asChild>` | Wave 3 |
  | `apps/studio/src/components/GraphFilterMenu.tsx` | 81 | `<PopoverTrigger asChild>` | Wave 3 |
  | `apps/studio/src/components/DiagnosticsPanel.tsx` | 303, 352 | `<PopoverTrigger asChild>` | Wave 3 |
  | `packages/visual-editor/src/components/editors/expression-builder/OperatorPalette.tsx` | 76 | `<PopoverTrigger asChild>` | Wave 3 |
  | `packages/visual-editor/src/components/editors/expression-builder/ReferencePicker.tsx` | 58 | `<PopoverTrigger asChild>` | Wave 3 |
  | `packages/visual-editor/src/components/GraphContextMenu.tsx` | 103 | `<DropdownMenuTrigger asChild>` | Wave 3 |

  Internal `asChild` usages inside wrappers (migrated as part of their task):
  - `button.tsx` — `asChild` prop using `Slot` (Wave 2)
  - `alert.tsx` — `AlertTitle` `asChild` prop using `Slot` (Wave 2)
  - `select.tsx` — `SelectPrimitive.Icon asChild` (Wave 4)

- [ ] **Step 5: Commit the dependency addition only**

  ```bash
  git add packages/design-system/package.json pnpm-lock.yaml
  SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "chore(design-system): add @base-ui-components/react

  Coexists with @radix-ui/* during incremental migration (spec §5).
  No wrapper code changed yet.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

## Wave 1: Trivial renames — separator, avatar, label, collapsible, scroll-area

These five have near-zero blast-radius. They prove the mechanical rename pattern before touching anything with animation or asChild consumers.

---

### Task 1: Migrate `separator.tsx`

Radix: `@radix-ui/react-separator` → Base UI: `Separator`

**Sub-part renames:** `SeparatorPrimitive.Root` → `Separator.Root`. No `data-state` changes; `data-[orientation=horizontal]` and `data-[orientation=vertical]` are preserved by Base UI.

**Exported API preserved:** `{ Separator }`

**File:** `packages/design-system/src/ui/separator.tsx`

- [ ] **Step 1: Read the current wrapper**

  Read `packages/design-system/src/ui/separator.tsx` in full. Confirm the `data-[orientation=…]` CSS classes and the exported symbol `Separator`. Note the `decorative` and `orientation` props — Base UI `Separator` accepts `orientation` and an `aria-hidden` or similar for decorative behavior; verify the exact prop mapping before rewriting.

- [ ] **Step 2: Rewrite the wrapper on Base UI**

  Replace the `import * as SeparatorPrimitive from '@radix-ui/react-separator'` import with `import { Separator as SeparatorPrimitive } from '@base-ui-components/react'`. Re-express the component using `SeparatorPrimitive.Root` (or the correct Base UI sub-part name — confirm from Step 1 and Base UI docs). Preserve:
  - `data-slot="separator"`
  - `decorative` prop behavior (map to the Base UI equivalent, e.g. `aria-hidden` or `role`)
  - `orientation` prop and its `data-[orientation=…]` CSS styling
  - `className` passthrough and the `cn(…)` merge
  - The exact `export { Separator }` statement

- [ ] **Step 3: Type-check the file**

  ```bash
  pnpm --filter @rune-langium/design-system run type-check
  ```
  Expected: no new errors.

- [ ] **Step 4: Run tests**

  ```bash
  pnpm --filter @rune-langium/design-system test
  pnpm --filter @rune-langium/studio test
  pnpm run lint
  ```
  All green.

- [ ] **Step 5: Remove `@radix-ui/react-separator` from `packages/design-system/package.json` and reinstall**

  The separator wrapper is now fully migrated and is the only consumer of this Radix package. Remove it:
  ```bash
  # Edit packages/design-system/package.json: delete the "@radix-ui/react-separator" entry
  pnpm install
  pnpm --filter @rune-langium/design-system run type-check
  pnpm --filter @rune-langium/studio test
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add packages/design-system/src/ui/separator.tsx packages/design-system/package.json pnpm-lock.yaml
  SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(design-system): migrate separator to Base UI

  Replaces @radix-ui/react-separator with @base-ui-components/react Separator.
  Exported API unchanged; data-[orientation] CSS preserved.
  Removes @radix-ui/react-separator dependency.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

### Task 2: Migrate `avatar.tsx`

Radix: `@radix-ui/react-avatar` → Base UI: `Avatar`

**Sub-part renames:** `Root` → `Avatar.Root`, `Image` → `Avatar.Image`, `Fallback` → `Avatar.Fallback`. No `data-state` CSS changes in the wrappers themselves.

**Consumer `asChild` site (migrate in this task):**
- `apps/studio/src/shell/ExplorePerspective.tsx:1879` — `<Avatar asChild className="size-7 cursor-pointer">`

**Exported API preserved:** `{ Avatar, AvatarFallback, AvatarImage }`

**Files:**
- Rewrite: `packages/design-system/src/ui/avatar.tsx`
- Migrate consumer: `apps/studio/src/shell/ExplorePerspective.tsx`

- [ ] **Step 1: Read current wrapper and consumer**

  Read `packages/design-system/src/ui/avatar.tsx` in full. Confirm the exported props interface — in particular whether `AvatarRoot` (the exported `Avatar`) accepts any `asChild`-style prop today or whether it simply passes through `React.ComponentProps<typeof AvatarPrimitive.Root>`. Then read lines ~1870–1890 of `apps/studio/src/shell/ExplorePerspective.tsx` to understand what element the `asChild` Avatar is rendering-as and what props are on it.

- [ ] **Step 2: Rewrite the wrapper on Base UI**

  Replace `import * as AvatarPrimitive from '@radix-ui/react-avatar'` with the Base UI equivalent. Preserve:
  - `data-slot="avatar"`, `data-slot="avatar-image"`, `data-slot="avatar-fallback"`
  - All existing `className` / `cn(…)` styling (gradient fallback, `overflow-hidden rounded-full`, etc.)
  - The exact `export { Avatar, AvatarFallback, AvatarImage }` statement

  Base UI's `Avatar.Root` accepts a `render` prop (not `asChild`). Expose it so the consumer call site can pass its render element.

- [ ] **Step 3: Migrate the consumer `asChild` → `render`**

  In `apps/studio/src/shell/ExplorePerspective.tsx` at the call site identified in Step 1, convert:
  ```tsx
  // before
  <Avatar asChild className="size-7 cursor-pointer">
    <SomeElement … />
  </Avatar>

  // after
  <Avatar render={<SomeElement … />} className="size-7 cursor-pointer" />
  ```
  The exact child element and its props must be preserved exactly. Confirm the surrounding context does not rely on the `asChild` child being a DOM sub-element.

- [ ] **Step 4: Type-check and run tests**

  ```bash
  pnpm --filter @rune-langium/design-system run type-check
  pnpm run type-check
  pnpm --filter @rune-langium/design-system test
  pnpm --filter @rune-langium/studio test
  pnpm run lint
  ```
  All green.

- [ ] **Step 5: Remove `@radix-ui/react-avatar` from `packages/design-system/package.json` and reinstall**

  ```bash
  pnpm install
  pnpm --filter @rune-langium/design-system run type-check
  pnpm --filter @rune-langium/studio test
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add packages/design-system/src/ui/avatar.tsx \
          apps/studio/src/shell/ExplorePerspective.tsx \
          packages/design-system/package.json pnpm-lock.yaml
  SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(design-system): migrate avatar to Base UI; asChild→render at ExplorePerspective

  Replaces @radix-ui/react-avatar with @base-ui-components/react Avatar.
  Migrates ExplorePerspective.tsx:1879 <Avatar asChild> → <Avatar render={…}>.
  Exported API unchanged. Removes @radix-ui/react-avatar dependency.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

### Task 3: Migrate `label.tsx`

Radix: `@radix-ui/react-label` → native `<label>` (no Base UI Label primitive; folds into `Field.Label` only if `Field` adoption grows — see spec §10).

**Sub-part renames:** `LabelPrimitive.Root` → native `<label>`. No `data-state` CSS.

**Exported API preserved:** `{ Label }`

**File:** `packages/design-system/src/ui/label.tsx`

- [ ] **Step 1: Read the current wrapper**

  Read `packages/design-system/src/ui/label.tsx` in full. Confirm:
  - The only Radix usage is `LabelPrimitive.Root` (a thin wrapper over `<label>`)
  - The `React.ComponentProps<typeof LabelPrimitive.Root>` resolves to `React.ComponentPropsWithoutRef<'label'>` — the native `<label>` props
  - No `data-state` CSS

- [ ] **Step 2: Rewrite using native `<label>`**

  Remove `import * as LabelPrimitive from '@radix-ui/react-label'` entirely. Change the component to:
  ```tsx
  function Label({ className, ...props }: React.ComponentProps<'label'>) {
    return (
      <label
        data-slot="label"
        className={cn(
          'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
          className
        )}
        {...props}
      />
    );
  }
  ```
  (Read the current class string from Step 1 first — preserve it exactly.)

  Preserve the exact `export { Label }` statement. Drop the `'use client'` directive only if no other component in the file needs it (label.tsx currently has `'use client'` at line 5 — verify it's safe to remove for an ESM/browser-only bundle).

- [ ] **Step 3: Type-check and run tests**

  ```bash
  pnpm --filter @rune-langium/design-system run type-check
  pnpm run type-check
  pnpm --filter @rune-langium/design-system test
  pnpm --filter @rune-langium/studio test
  pnpm run lint
  ```

- [ ] **Step 4: Remove `@radix-ui/react-label` from `packages/design-system/package.json` and reinstall**

  ```bash
  pnpm install
  pnpm --filter @rune-langium/design-system run type-check
  pnpm --filter @rune-langium/studio test
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add packages/design-system/src/ui/label.tsx packages/design-system/package.json pnpm-lock.yaml
  SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(design-system): migrate label to native <label>

  Base UI has no standalone Label primitive (folds into Field.Label).
  Replace @radix-ui/react-label with a plain <label> wrapper — same props,
  same exported API, same Tailwind classes. Removes @radix-ui/react-label.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

### Task 4: Migrate `collapsible.tsx`

Radix: `@radix-ui/react-collapsible` → Base UI: `Collapsible`

**Sub-part renames:** `CollapsiblePrimitive.Root` → `Collapsible.Root`, `CollapsiblePrimitive.Trigger` → `Collapsible.Trigger`, `CollapsiblePrimitive.Content` → `Collapsible.Panel`.

**`data-state` CSS audit:** Radix emits `data-[state=open]` / `data-[state=closed]` on Content for animate-in/out. Base UI emits `data-open` (boolean attribute) on the panel. Re-point any animation utility classes keyed on `data-[state=open/closed]` → `data-open` / `:not([data-open])` (confirm exact Base UI attribute by reading its docs or source during this step).

**Exported API preserved:** `{ Collapsible, CollapsibleContent, CollapsibleTrigger }`

**File:** `packages/design-system/src/ui/collapsible.tsx`

- [ ] **Step 1: Read current wrapper and audit `data-state` CSS**

  Read `packages/design-system/src/ui/collapsible.tsx` in full. List every Tailwind class that includes `data-[state=…]` — these are the ones to re-point.

  Then run:
  ```bash
  rg -n "collapsible" packages/design-system/src/ apps/studio/src/ --include="*.tsx" --include="*.css"
  ```
  to find any consumer-side CSS that keys on collapsible's state attributes (unlikely but verify).

- [ ] **Step 2: Rewrite the wrapper on Base UI**

  Replace imports. Remap sub-parts:
  - `CollapsiblePrimitive.Root` → `Collapsible.Root` (props: `open`, `onOpenChange`, `defaultOpen` — confirm these are identical or equivalent)
  - `CollapsiblePrimitive.Trigger` → `Collapsible.Trigger`
  - `CollapsiblePrimitive.Content` (exported as `CollapsibleContent`) → `Collapsible.Panel`

  Re-point any `data-[state=open/closed]` classes on the Panel to Base UI's state attribute. Preserve `data-slot` attributes.

- [ ] **Step 3: Type-check and run tests**

  ```bash
  pnpm --filter @rune-langium/design-system run type-check
  pnpm run type-check
  pnpm --filter @rune-langium/design-system test
  pnpm --filter @rune-langium/studio test
  pnpm run lint
  ```

- [ ] **Step 4: Remove `@radix-ui/react-collapsible` from `packages/design-system/package.json` and reinstall**

  ```bash
  pnpm install
  pnpm --filter @rune-langium/design-system run type-check
  pnpm --filter @rune-langium/studio test
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add packages/design-system/src/ui/collapsible.tsx packages/design-system/package.json pnpm-lock.yaml
  SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(design-system): migrate collapsible to Base UI (Content→Panel)

  Replaces @radix-ui/react-collapsible with @base-ui-components/react Collapsible.
  Content→Panel rename is internal; exported API unchanged.
  Re-pointed data-state CSS to Base UI state attributes.
  Removes @radix-ui/react-collapsible dependency.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

### Task 5: Migrate `scroll-area.tsx`

Radix: `@radix-ui/react-scroll-area` → Base UI: `ScrollArea`

**Sub-part renames:** `Root` → `ScrollArea.Root`, `Viewport` → `ScrollArea.Viewport`, `Scrollbar` → `ScrollArea.Scrollbar`, `Thumb` → `ScrollArea.Thumb`. Check whether Base UI exposes a `Corner` sub-part (Radix has `ScrollArea.Corner`) — if not, drop it or substitute.

**`data-state` CSS audit:** The `ScrollBar` wrapper likely has `data-[orientation=…]` classes — these may map cleanly to `data-orientation` on Base UI's Scrollbar. Verify during implementation.

**Exported API preserved:** `{ ScrollArea, ScrollBar }`

**File:** `packages/design-system/src/ui/scroll-area.tsx`

- [ ] **Step 1: Read current wrapper**

  Read `packages/design-system/src/ui/scroll-area.tsx` in full. Note the `Corner` usage (if any), how children are composed inside `Viewport`, and any animation/transition classes.

- [ ] **Step 2: Rewrite the wrapper on Base UI**

  Replace imports. Remap sub-parts. The `ScrollArea` exported component composes Root + Viewport internally (as the current wrapper does). The `ScrollBar` exported component wraps `ScrollArea.Scrollbar` + `ScrollArea.Thumb`. Preserve `data-slot` attributes. Handle the Corner: if Base UI omits it, simply drop `<ScrollArea.Corner>` (pure visual; no functional impact).

- [ ] **Step 3: Type-check and run tests**

  ```bash
  pnpm --filter @rune-langium/design-system run type-check
  pnpm run type-check
  pnpm --filter @rune-langium/design-system test
  pnpm --filter @rune-langium/studio test
  pnpm run lint
  ```

- [ ] **Step 4: Remove `@radix-ui/react-scroll-area` from `packages/design-system/package.json` and reinstall**

  ```bash
  pnpm install
  pnpm --filter @rune-langium/design-system run type-check
  pnpm --filter @rune-langium/studio test
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add packages/design-system/src/ui/scroll-area.tsx packages/design-system/package.json pnpm-lock.yaml
  SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(design-system): migrate scroll-area to Base UI

  Replaces @radix-ui/react-scroll-area with @base-ui-components/react ScrollArea.
  Viewport/Scrollbar/Thumb map cleanly; Corner dropped (visual only).
  Exported API unchanged. Removes @radix-ui/react-scroll-area dependency.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

## Wave 2: Slot → render on simple components — button, alert, checkbox, radio-group, tabs

Wave 2 establishes the `asChild`→`render` pattern on the simplest cases before applying it to floating components. `button` and `alert` currently use `@radix-ui/react-slot`'s `Slot` to implement their `asChild` prop; they migrate to Base UI's `render` prop / `useRender` hook. `checkbox`, `radio-group`, and `tabs` have no asChild; they are straightforward primitive renames.

---

### Task 6: Migrate `button.tsx`

Radix: `@radix-ui/react-slot` (`Slot`) → Base UI: `render` prop (via `useRender` or direct render-prop delegation)

**Sub-part renames:** Internal `Slot` usage removed; `asChild` prop replaced with `render` prop that accepts a React element. Base UI's component model: pass `render={<a href="…">…</a>}` instead of `<Button asChild><a>…</a></Button>`.

**`data-state` CSS:** None on button itself (`data-variant`, `data-size` are custom attributes that stay unchanged).

**Exported API preserved:** `{ Button, buttonVariants }`. The `asChild` prop is **removed** from Button's public type; `render` prop is added (type: `React.ReactElement | undefined`).

> **Read first:** Read `packages/design-system/src/ui/button.tsx` in full before proceeding. There are no consumer files in `apps/studio/src` or `packages/visual-editor/src` currently using `<Button asChild>` (verified via `rg -n "asChild" apps/studio/src packages/visual-editor/src` — only the internal `asChild = false` default). If any new consumers appear after plan authorship, migrate them in this task.

**File:** `packages/design-system/src/ui/button.tsx`

- [ ] **Step 1: Read the current wrapper and verify no consumer `asChild` call sites**

  Read `packages/design-system/src/ui/button.tsx` in full. Then run:
  ```bash
  rg -n "Button.*asChild\|asChild.*Button" apps/studio/src packages/visual-editor/src
  ```
  If call sites exist, list them and add them to the migration steps below.

- [ ] **Step 2: Rewrite the wrapper — replace `Slot` with `render` prop**

  Remove `import { Slot } from '@radix-ui/react-slot'`. Change the Button component to:
  - Remove `asChild?: boolean` from the props type
  - Add `render?: React.ReactElement` to the props type
  - Instead of `const Comp = asChild ? Slot : 'button'`, use Base UI's `useRender` hook (import from `@base-ui-components/react`) to merge the `render` prop with the `'button'` default. If `useRender` is not the correct Base UI API, use the `render` prop pattern directly: when `render` is provided, clone it with the merged props; otherwise render a `<button>`. Confirm the exact Base UI API by reading their `Button` or render-prop docs before writing.

  All existing `buttonVariants`, `data-slot`, `data-variant`, `data-size`, `className`, and CVA logic stay unchanged.

- [ ] **Step 3: Type-check and run tests**

  ```bash
  pnpm --filter @rune-langium/design-system run type-check
  pnpm run type-check
  pnpm --filter @rune-langium/design-system test
  pnpm --filter @rune-langium/studio test
  pnpm run lint
  ```

- [ ] **Step 4: Check if `@radix-ui/react-slot` can be removed yet**

  `button.tsx` and `alert.tsx` both import `Slot` from `@radix-ui/react-slot`. Do NOT remove the dependency yet — `alert.tsx` still uses it. It will be removed after Task 7.

- [ ] **Step 5: Commit**

  ```bash
  git add packages/design-system/src/ui/button.tsx
  SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(design-system): migrate button Slot→render prop (Base UI render pattern)

  Removes asChild prop and @radix-ui/react-slot dependency from button.tsx.
  Consumers that previously used <Button asChild> must switch to <Button render={…}>;
  no such consumers exist in the current codebase.
  Exported API: Button (asChild removed, render added), buttonVariants unchanged.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

### Task 7: Migrate `alert.tsx`

Radix: `@radix-ui/react-slot` (`Slot`) → Base UI: `render` prop (same pattern as Task 6)

**Sub-part renames:** `AlertTitle`'s internal `Slot` usage replaced with `render` prop. `Alert` and `AlertDescription` do not use Slot.

**Consumer `asChild` site (migrate in this task):**
- `apps/studio/src/components/CuratedLoadErrorPanel.tsx:76` — `<AlertTitle asChild>`

**Exported API preserved:** `{ Alert, AlertDescription, AlertTitle, alertVariants }`. `AlertTitle`'s `asChild` prop is removed; `render` prop is added.

**Files:**
- Rewrite: `packages/design-system/src/ui/alert.tsx`
- Migrate consumer: `apps/studio/src/components/CuratedLoadErrorPanel.tsx`

- [ ] **Step 1: Read current wrapper and consumer**

  Read `packages/design-system/src/ui/alert.tsx` in full. Confirm that `asChild` is only on `AlertTitle` (lines ~52-57), not on `Alert` root or `AlertDescription`. Then read lines ~70-90 of `apps/studio/src/components/CuratedLoadErrorPanel.tsx` to see what element the `<AlertTitle asChild>` is rendering-as and its props.

- [ ] **Step 2: Rewrite `AlertTitle` — remove `Slot`, add `render` prop**

  Follow the same pattern as Task 6: remove `import { Slot } from '@radix-ui/react-slot'`, replace `asChild`/`Slot` with a `render` prop using Base UI's render-prop pattern. `Alert` and `AlertDescription` do not change at all (they use plain `<div>` — no Slot). Preserve all existing CVA classes and `data-slot` attributes.

- [ ] **Step 3: Migrate consumer `asChild` → `render`**

  In `apps/studio/src/components/CuratedLoadErrorPanel.tsx` at line 76, convert:
  ```tsx
  // before
  <AlertTitle asChild>
    <SomeElement …>…</SomeElement>
  </AlertTitle>

  // after
  <AlertTitle render={<SomeElement …>…</SomeElement>} />
  ```
  Read the actual child element from the file (Step 1) and convert it exactly.

- [ ] **Step 4: Type-check and run tests**

  ```bash
  pnpm --filter @rune-langium/design-system run type-check
  pnpm run type-check
  pnpm --filter @rune-langium/design-system test
  pnpm --filter @rune-langium/studio test
  pnpm run lint
  ```

- [ ] **Step 5: Remove `@radix-ui/react-slot` from `packages/design-system/package.json` and reinstall**

  Both `button.tsx` and `alert.tsx` are now migrated off Slot. Confirm no other file in `packages/design-system/src/` imports from `@radix-ui/react-slot`:
  ```bash
  rg -n "react-slot" packages/design-system/src/
  ```
  If clean, remove the dependency:
  ```bash
  # Edit packages/design-system/package.json: delete "@radix-ui/react-slot"
  pnpm install
  pnpm --filter @rune-langium/design-system run type-check
  pnpm --filter @rune-langium/studio test
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add packages/design-system/src/ui/alert.tsx \
          apps/studio/src/components/CuratedLoadErrorPanel.tsx \
          packages/design-system/package.json pnpm-lock.yaml
  SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(design-system): migrate alert Slot→render; asChild→render at CuratedLoadErrorPanel

  Removes asChild from AlertTitle; adds render prop (Base UI pattern).
  Migrates CuratedLoadErrorPanel.tsx:76 <AlertTitle asChild> → <AlertTitle render={…}>.
  Removes @radix-ui/react-slot dependency (button + alert both migrated).

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

### Task 8: Migrate `checkbox.tsx`

Radix: `@radix-ui/react-checkbox` → Base UI: `Checkbox`

**Sub-part renames:** `CheckboxPrimitive.Root` → `Checkbox.Root`, `CheckboxPrimitive.Indicator` → `Checkbox.Indicator`.

**`data-state` CSS audit:** `data-[state=checked]` → Base UI emits `data-checked` (boolean). Re-point:
- `data-[state=checked]:border-primary` → `data-checked:border-primary`
- `data-[state=checked]:bg-primary` → `data-checked:bg-primary`
- `data-[state=checked]:text-primary-foreground` → `data-checked:text-primary-foreground`

(Confirm exact attribute by checking Base UI Checkbox docs — the attribute name should be `data-checked` but verify before rewriting.)

**Exported API preserved:** `{ Checkbox }`

**File:** `packages/design-system/src/ui/checkbox.tsx`

- [ ] **Step 1: Read current wrapper**

  Read `packages/design-system/src/ui/checkbox.tsx` in full. List every `data-[state=…]` class.

- [ ] **Step 2: Rewrite the wrapper on Base UI**

  Replace imports. Remap sub-parts. Re-point `data-[state=checked]` → Base UI's attribute. Preserve `data-slot`, `className`, the `Check` icon, and the exact `export { Checkbox }` statement.

- [ ] **Step 3: Type-check and run tests**

  ```bash
  pnpm --filter @rune-langium/design-system run type-check
  pnpm run type-check
  pnpm --filter @rune-langium/design-system test
  pnpm --filter @rune-langium/studio test
  pnpm run lint
  ```

- [ ] **Step 4: Remove `@radix-ui/react-checkbox` and reinstall**

  ```bash
  pnpm install
  pnpm --filter @rune-langium/design-system run type-check
  pnpm --filter @rune-langium/studio test
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add packages/design-system/src/ui/checkbox.tsx packages/design-system/package.json pnpm-lock.yaml
  SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(design-system): migrate checkbox to Base UI (data-[state=checked]→data-checked)

  Replaces @radix-ui/react-checkbox with @base-ui-components/react Checkbox.
  Re-pointed data-state CSS. Exported API unchanged.
  Removes @radix-ui/react-checkbox dependency.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

### Task 9: Migrate `radio-group.tsx`

Radix: `@radix-ui/react-radio-group` → Base UI: `RadioGroup` + `Radio`

**Sub-part renames:** `RadioGroupPrimitive.Root` → `RadioGroup.Root`, `RadioGroupPrimitive.Item` → `Radio.Root` (a nested `Radio` sub-component), `RadioGroupPrimitive.Indicator` → `Radio.Indicator`.

**`data-state` CSS audit:** Read the current wrapper — any `data-[state=checked]` on the Item maps to `data-checked` on `Radio.Root`. Any `data-[state=…]` on focus-visible classes may stay as ARIA-based CSS.

**Exported API preserved:** `{ RadioGroup, RadioGroupItem }` — `RadioGroupItem` still renders a single radio button; the Base UI `Radio.Root` + `Radio.Indicator` is composed internally.

**File:** `packages/design-system/src/ui/radio-group.tsx`

- [ ] **Step 1: Read current wrapper**

  Read `packages/design-system/src/ui/radio-group.tsx` in full. List any `data-[state=…]` classes.

- [ ] **Step 2: Rewrite the wrapper on Base UI**

  Replace imports. Compose `RadioGroupItem` using `Radio.Root` + `Radio.Indicator` internally. Preserve `data-slot` attributes, the `Circle` icon, and the exact `export { RadioGroup, RadioGroupItem }` statement. Re-point any `data-[state=…]` CSS.

- [ ] **Step 3: Type-check and run tests**

  ```bash
  pnpm --filter @rune-langium/design-system run type-check
  pnpm run type-check
  pnpm --filter @rune-langium/design-system test
  pnpm --filter @rune-langium/studio test
  pnpm run lint
  ```

- [ ] **Step 4: Remove `@radix-ui/react-radio-group` and reinstall**

  ```bash
  pnpm install
  pnpm --filter @rune-langium/design-system run type-check
  pnpm --filter @rune-langium/studio test
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add packages/design-system/src/ui/radio-group.tsx packages/design-system/package.json pnpm-lock.yaml
  SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(design-system): migrate radio-group to Base UI (Item→Radio.Root+Indicator)

  Replaces @radix-ui/react-radio-group with @base-ui-components/react RadioGroup+Radio.
  RadioGroupItem composes Radio.Root+Radio.Indicator internally.
  Exported API unchanged. Removes @radix-ui/react-radio-group dependency.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

### Task 10: Migrate `tabs.tsx`

Radix: `@radix-ui/react-tabs` → Base UI: `Tabs`

**Sub-part renames:** `TabsPrimitive.Root` → `Tabs.Root`, `TabsPrimitive.List` → `Tabs.List`, `TabsPrimitive.Trigger` → `Tabs.Tab` (exported still as `TabsTrigger`), `TabsPrimitive.Content` → `Tabs.Panel` (exported still as `TabsContent`).

**`data-state` CSS audit:** `data-[state=active]` on `TabsTrigger` → Base UI uses `data-selected` (boolean). Re-point:
- `data-[state=active]:bg-background` → `data-selected:bg-background`
- `data-[state=active]:text-foreground` → `data-selected:text-foreground`
- `data-[state=active]:shadow-sm` → `data-selected:shadow-sm`

(Confirm the exact attribute name from Base UI Tabs docs before rewriting.)

**Exported API preserved:** `{ Tabs, TabsList, TabsTrigger, TabsContent }` — names are unchanged even though the underlying sub-parts rename to Tab/Panel internally.

**File:** `packages/design-system/src/ui/tabs.tsx`

- [ ] **Step 1: Read current wrapper and audit `data-state` CSS**

  Read `packages/design-system/src/ui/tabs.tsx` in full. List every `data-[state=…]` class. Run:
  ```bash
  rg -n "data-\[state=active\]\|TabsTrigger\|TabsContent" apps/studio/src packages/visual-editor/src --include="*.tsx" --include="*.css"
  ```
  to see if any consumers also key CSS on these attributes directly.

- [ ] **Step 2: Rewrite the wrapper on Base UI**

  Replace imports. Map `TabsTrigger` → renders `Tabs.Tab` internally; `TabsContent` → renders `Tabs.Panel` internally. Re-point `data-[state=active]` → Base UI's attribute. Preserve all `className`/`cn(…)` styling and `data-slot` attributes.

- [ ] **Step 3: Type-check and run tests**

  ```bash
  pnpm --filter @rune-langium/design-system run type-check
  pnpm run type-check
  pnpm --filter @rune-langium/design-system test
  pnpm --filter @rune-langium/studio test
  pnpm run lint
  ```

- [ ] **Step 4: Remove `@radix-ui/react-tabs` and reinstall**

  ```bash
  pnpm install
  pnpm --filter @rune-langium/design-system run type-check
  pnpm --filter @rune-langium/studio test
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add packages/design-system/src/ui/tabs.tsx packages/design-system/package.json pnpm-lock.yaml
  SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(design-system): migrate tabs to Base UI (Trigger→Tab, Content→Panel internally)

  Replaces @radix-ui/react-tabs with @base-ui-components/react Tabs.
  Exported names TabsTrigger/TabsContent unchanged; internal parts renamed.
  Re-pointed data-[state=active] → data-selected.
  Removes @radix-ui/react-tabs dependency.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

## Wave 3: Floating components + Positioner + asChild→render consumer migrations

Wave 3 is the most cross-cutting. Each PR rewrites one floating wrapper, absorbs Base UI's new `Positioner` element internally, and migrates every consumer `asChild` call site for that component to Base UI's `render` prop. The patterns from Wave 2 (render prop delegation) are now well-understood.

**Key architectural note for all three tasks:** Base UI floating components (`Tooltip`, `Popover`, `Menu`) introduce `Positioner` between trigger and popup. The wrapper absorbs this: consumers keep calling `<TooltipContent>` / `<PopoverContent>` / `<DropdownMenuContent>` with the same props; the wrapper renders `<Tooltip.Positioner><Tooltip.Popup>…</Tooltip.Popup></Tooltip.Positioner>` internally. Positioning props (`sideOffset`, `align`, etc.) are forwarded to `Positioner`; visual/content props are forwarded to `Popup`.

---

### Task 11: Migrate `tooltip.tsx`

Radix: `@radix-ui/react-tooltip` → Base UI: `Tooltip`

**Sub-part renames:**
- `TooltipPrimitive.Provider` → `Tooltip.Provider` (Provider model differs — read Base UI docs for the prop mapping before rewriting)
- `TooltipPrimitive.Root` → `Tooltip.Root`
- `TooltipPrimitive.Trigger` → `Tooltip.Trigger` (supports `render` prop instead of `asChild`)
- `TooltipPrimitive.Portal` → removed (Tooltip.Positioner handles portaling)
- `TooltipPrimitive.Content` → `Tooltip.Positioner` (wrapping) + `Tooltip.Popup` (inner)

**`data-state` CSS audit:**
- On `TooltipContent` (now `Tooltip.Popup`): `data-[state=open/closed]` → Base UI emits `data-open` / `data-instant-open`; closed state uses `:not([data-open])` or `data-starting-style`. Also `data-[side=bottom/left/right/top]` → Base UI emits `data-side` (same attribute name, confirm value casing).
- The full class list in `tooltip.tsx` includes `animate-in fade-in-0 zoom-in-95`, `data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95`, and `data-[side=…]:slide-in-from-*`. Re-point all of these.

**Consumer `asChild` sites migrated in this task (TooltipTrigger):**
- `apps/studio/src/components/DownloadConfigModal.tsx:348`
- `packages/visual-editor/src/components/panels/ToolbarPanel.tsx:46`
- `packages/visual-editor/src/components/panels/ToolbarPanel.tsx:56`
- `packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:244`
- `packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:259`
- `packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:552`

Run `rg -n "TooltipTrigger.*asChild\|asChild.*TooltipTrigger" apps/studio/src packages` before starting to confirm the full list at migration time.

**Exported API preserved:** `{ TooltipProvider, Tooltip, TooltipTrigger, TooltipContent }`

**Files:**
- Rewrite: `packages/design-system/src/ui/tooltip.tsx`
- Migrate consumers: `apps/studio/src/components/DownloadConfigModal.tsx`, `packages/visual-editor/src/components/panels/ToolbarPanel.tsx`, `packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx`

- [ ] **Step 1: Read current wrapper, Base UI Tooltip docs, and all six consumer call sites**

  Read `packages/design-system/src/ui/tooltip.tsx` in full. Then read lines ~340–360 of `DownloadConfigModal.tsx`, lines ~40–65 of `ToolbarPanel.tsx`, and lines ~238–265 + ~545–560 of `NamespaceExplorerPanel.tsx`. For each call site, note what element is being rendered via `asChild` (it's typically a `<Button>` or similar) and what props it carries. Note whether the trigger is a single child element (required by Base UI's `render` prop pattern).

  Then read Base UI Tooltip docs/source for: `Tooltip.Provider` prop differences vs Radix (`delayDuration` → Base UI equivalent), `Tooltip.Trigger`'s `render` prop signature, and whether `Tooltip.Popup` or `Tooltip.Positioner` accepts `sideOffset`.

- [ ] **Step 2: Rewrite `tooltip.tsx` on Base UI**

  Compose `TooltipContent` as `<Tooltip.Positioner sideOffset={sideOffset} …><Tooltip.Popup className={cn(…)} …>{children}</Tooltip.Popup></Tooltip.Positioner>`. Forward positioning props (`sideOffset`, `align`, `side`) to `Positioner`; forward content props and `className` to `Popup`. Re-map `TooltipProvider`'s `delayDuration` to Base UI's equivalent prop. Expose `render` prop on `TooltipTrigger` (drop `asChild`). Preserve all `data-slot` attributes and re-point all `data-[state=…]` / `data-[side=…]` CSS.

- [ ] **Step 3: Migrate all six consumer `asChild` → `render` call sites**

  For each call site, convert from:
  ```tsx
  <TooltipTrigger asChild>
    <Button …>…</Button>
  </TooltipTrigger>
  ```
  to:
  ```tsx
  <TooltipTrigger render={<Button …>…</Button>} />
  ```
  Read each call site carefully — some have multi-line children. The `render` prop receives the element; Base UI merges the trigger's event handlers and aria attributes onto the rendered element. Preserve all props on the inner element exactly.

- [ ] **Step 4: Type-check and run tests**

  ```bash
  pnpm --filter @rune-langium/design-system run type-check
  pnpm run type-check
  pnpm --filter @rune-langium/design-system test
  pnpm --filter @rune-langium/studio test
  pnpm run lint
  ```

- [ ] **Step 5: Spot-check open/close animation**

  The tooltip animation classes were re-pointed in Step 2. Do a quick visual check that the tooltip opens and closes with the expected fade+zoom — the `data-[state=…]` → `data-open`/`data-starting-style` re-mapping is the highest-risk item. If animation is broken, re-check the Base UI state attribute docs and adjust the Tailwind classes.

- [ ] **Step 6: Remove `@radix-ui/react-tooltip` and reinstall**

  ```bash
  pnpm install
  pnpm --filter @rune-langium/design-system run type-check
  pnpm --filter @rune-langium/studio test
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add packages/design-system/src/ui/tooltip.tsx \
          apps/studio/src/components/DownloadConfigModal.tsx \
          packages/visual-editor/src/components/panels/ToolbarPanel.tsx \
          packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx \
          packages/design-system/package.json pnpm-lock.yaml
  SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(design-system): migrate tooltip to Base UI; asChild→render at 6 call sites

  Replaces @radix-ui/react-tooltip with @base-ui-components/react Tooltip.
  Adds Positioner internally (consumers keep TooltipContent unchanged).
  Migrates TooltipTrigger asChild → render at:
    DownloadConfigModal.tsx:348, ToolbarPanel.tsx:46+56,
    NamespaceExplorerPanel.tsx:244+259+552.
  Re-pointed data-state/data-side CSS. Removes @radix-ui/react-tooltip.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

### Task 12: Migrate `popover.tsx`

Radix: `@radix-ui/react-popover` → Base UI: `Popover`

**Sub-part renames:**
- `PopoverPrimitive.Root` → `Popover.Root`
- `PopoverPrimitive.Trigger` → `Popover.Trigger` (supports `render` prop)
- `PopoverPrimitive.Anchor` → `Popover.Anchor`
- `PopoverPrimitive.Portal` → removed (handled by `Popover.Positioner`)
- `PopoverPrimitive.Content` → `Popover.Positioner` (wrapping) + `Popover.Popup` (inner)

**`data-state` CSS audit:** Same pattern as Tooltip — `data-[state=open/closed]` → `data-open` / `data-starting-style`; `data-[side=…]` → `data-side`. The current `PopoverContent` has `data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 …` classes — re-point all of these.

**Consumer `asChild` sites migrated in this task (PopoverTrigger):**
- `apps/studio/src/shell/ExplorePerspective.tsx:1767`
- `apps/studio/src/components/GraphFilterMenu.tsx:81`
- `apps/studio/src/components/DiagnosticsPanel.tsx:303`
- `apps/studio/src/components/DiagnosticsPanel.tsx:352`
- `packages/visual-editor/src/components/editors/expression-builder/OperatorPalette.tsx:76`
- `packages/visual-editor/src/components/editors/expression-builder/ReferencePicker.tsx:58`

Run `rg -n "PopoverTrigger.*asChild\|asChild.*PopoverTrigger" apps/studio/src packages` before starting to confirm the full list at migration time.

**Exported API preserved:** `{ Popover, PopoverAnchor, PopoverContent, PopoverTrigger }`

**Files:**
- Rewrite: `packages/design-system/src/ui/popover.tsx`
- Migrate consumers: `apps/studio/src/shell/ExplorePerspective.tsx`, `apps/studio/src/components/GraphFilterMenu.tsx`, `apps/studio/src/components/DiagnosticsPanel.tsx`, `packages/visual-editor/src/components/editors/expression-builder/OperatorPalette.tsx`, `packages/visual-editor/src/components/editors/expression-builder/ReferencePicker.tsx`

- [ ] **Step 1: Read current wrapper and all six consumer call sites**

  Read `packages/design-system/src/ui/popover.tsx` in full. Then read the six consumer call sites (use the line numbers from the table in Task 0 — verify they haven't shifted). Note what element each `<PopoverTrigger asChild>` wraps.

  Read Base UI Popover docs for: how `Popover.Positioner` accepts `sideOffset` / `align`, whether `Popover.Anchor` is still available, and the `render` prop on `Popover.Trigger`.

- [ ] **Step 2: Rewrite `popover.tsx` on Base UI**

  Compose `PopoverContent` as `<Popover.Positioner sideOffset={sideOffset} align={align} …><Popover.Popup className={cn(…)} …>…</Popover.Popup></Popover.Positioner>`. Expose `render` prop on `PopoverTrigger`. Re-point `data-[state=…]` / `data-[side=…]` CSS. Preserve `PopoverAnchor` as a thin wrapper over `Popover.Anchor` (or the equivalent Base UI part). Preserve all `data-slot` attributes.

- [ ] **Step 3: Migrate all six consumer `asChild` → `render` call sites**

  For each call site, convert:
  ```tsx
  // before
  <PopoverTrigger asChild>
    <SomeButton …>label</SomeButton>
  </PopoverTrigger>

  // after
  <PopoverTrigger render={<SomeButton …>label</SomeButton>} />
  ```
  Read each call site carefully before converting. The `OperatorPalette.tsx:76` call has a comment about a "hidden span to avoid a real button" — read lines ~70–85 to understand the intent before migrating, and verify Base UI's `render` prop handles that use case correctly.

- [ ] **Step 4: Type-check and run tests**

  ```bash
  pnpm --filter @rune-langium/design-system run type-check
  pnpm run type-check
  pnpm --filter @rune-langium/design-system test
  pnpm --filter @rune-langium/studio test
  pnpm run lint
  ```

- [ ] **Step 5: Spot-check open/close animation and positioning**

  The `data-[state=…]` CSS re-point is the same risk as Tooltip. Additionally verify that `align` / `sideOffset` positioning props still work correctly — Base UI's Positioner API may differ slightly from Radix Content's direct props.

- [ ] **Step 6: Remove `@radix-ui/react-popover` and reinstall**

  ```bash
  pnpm install
  pnpm --filter @rune-langium/design-system run type-check
  pnpm --filter @rune-langium/studio test
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add packages/design-system/src/ui/popover.tsx \
          apps/studio/src/shell/ExplorePerspective.tsx \
          apps/studio/src/components/GraphFilterMenu.tsx \
          apps/studio/src/components/DiagnosticsPanel.tsx \
          packages/visual-editor/src/components/editors/expression-builder/OperatorPalette.tsx \
          packages/visual-editor/src/components/editors/expression-builder/ReferencePicker.tsx \
          packages/design-system/package.json pnpm-lock.yaml
  SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(design-system): migrate popover to Base UI; asChild→render at 6 call sites

  Replaces @radix-ui/react-popover with @base-ui-components/react Popover.
  Adds Positioner internally (consumers keep PopoverContent unchanged).
  Migrates PopoverTrigger asChild → render at:
    ExplorePerspective.tsx:1767, GraphFilterMenu.tsx:81,
    DiagnosticsPanel.tsx:303+352, OperatorPalette.tsx:76, ReferencePicker.tsx:58.
  Re-pointed data-state/data-side CSS. Removes @radix-ui/react-popover.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

### Task 13: Migrate `dropdown-menu.tsx`

Radix: `@radix-ui/react-dropdown-menu` → Base UI: `Menu`

**Sub-part renames:**
- `DropdownMenuPrimitive.Root` → `Menu.Root`
- `DropdownMenuPrimitive.Trigger` → `Menu.Trigger` (supports `render` prop)
- `DropdownMenuPrimitive.Portal` → removed (handled by `Menu.Positioner`)
- `DropdownMenuPrimitive.Content` → `Menu.Positioner` (wrapping) + `Menu.Popup` (inner)
- `DropdownMenuPrimitive.Group` → `Menu.Group`
- `DropdownMenuPrimitive.Label` → `Menu.GroupLabel`
- `DropdownMenuPrimitive.Item` → `Menu.Item`
- `DropdownMenuPrimitive.CheckboxItem` → `Menu.CheckboxItem`
- `DropdownMenuPrimitive.RadioGroup` → `Menu.RadioGroup`
- `DropdownMenuPrimitive.RadioItem` → `Menu.RadioItem`
- `DropdownMenuPrimitive.ItemIndicator` → `Menu.ItemIndicator`
- `DropdownMenuPrimitive.Separator` → `Menu.Separator`
- `DropdownMenuPrimitive.Sub` → `Menu.SubmenuRoot` or equivalent
- `DropdownMenuPrimitive.SubTrigger` → `Menu.SubmenuTrigger`
- `DropdownMenuPrimitive.SubContent` → `Menu.Positioner` + `Menu.Popup` (nested)
- `DropdownMenuShortcut` has no Radix primitive — it's a plain `<span>` and remains unchanged

Confirm the exact Base UI sub-part names from `@base-ui-components/react` `Menu` docs before implementing — the list above reflects the spec's description but exact API names must be verified.

**`data-state` CSS audit:** `data-[state=open/closed]` on Content → `data-open`; `data-[state=checked]` on CheckboxItem/RadioItem → `data-checked`; `data-[side=…]` → `data-side`; `data-[disabled]` → `data-disabled`; `data-[highlighted]` → `data-highlighted` (may already match Base UI). Re-point all of these.

**Consumer `asChild` site migrated in this task:**
- `packages/visual-editor/src/components/GraphContextMenu.tsx:103` — `<DropdownMenuTrigger asChild>`

Run `rg -n "DropdownMenuTrigger.*asChild\|asChild.*DropdownMenuTrigger" apps/studio/src packages` before starting.

**Exported API preserved:**
```
{ DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger }
```

`DropdownMenuPortal` is exported today — Base UI Menu absorbs portaling into Positioner; keep `DropdownMenuPortal` as either a no-op passthrough or a `React.Fragment` wrapper so consumers that render it explicitly don't break.

**Files:**
- Rewrite: `packages/design-system/src/ui/dropdown-menu.tsx`
- Migrate consumer: `packages/visual-editor/src/components/GraphContextMenu.tsx`

- [ ] **Step 1: Read current wrapper in full**

  Read `packages/design-system/src/ui/dropdown-menu.tsx` in full. This is the most complex wrapper in Wave 3 (15 exported symbols). Note the sub-menu pattern (`DropdownMenuSub` → `DropdownMenuSubTrigger` → `DropdownMenuPortal` → `DropdownMenuSubContent`) and whether any sub-parts use `asChild` internally. Then read lines ~95–115 of `packages/visual-editor/src/components/GraphContextMenu.tsx` to understand the `<DropdownMenuTrigger asChild>` call site.

  Read Base UI `Menu` docs for the full sub-part list and the sub-menu pattern (it differs from Radix's `Sub` / `SubTrigger` / `SubContent` nesting).

- [ ] **Step 2: Rewrite `dropdown-menu.tsx` on Base UI**

  Map each exported wrapper to its Base UI `Menu.*` sub-part. Compose `DropdownMenuContent` as `<Menu.Positioner …><Menu.Popup …>…</Menu.Popup></Menu.Positioner>`. Handle the sub-menu pattern via Base UI's equivalent nesting. Re-point all `data-[state=…]` / `data-[side=…]` / `data-[disabled]` / `data-[highlighted]` CSS. Expose `render` prop on `DropdownMenuTrigger`. Keep `DropdownMenuShortcut` as a plain `<span>` (unchanged). Keep `DropdownMenuPortal` as a passthrough (no-op) to preserve the exported name.

- [ ] **Step 3: Migrate consumer `asChild` → `render`**

  In `packages/visual-editor/src/components/GraphContextMenu.tsx:103`, convert:
  ```tsx
  // before
  <DropdownMenuTrigger asChild>
    <SomeElement …>…</SomeElement>
  </DropdownMenuTrigger>

  // after
  <DropdownMenuTrigger render={<SomeElement …>…</SomeElement>} />
  ```
  Read the actual child element from Step 1 before converting.

- [ ] **Step 4: Type-check and run tests**

  ```bash
  pnpm --filter @rune-langium/design-system run type-check
  pnpm run type-check
  pnpm --filter @rune-langium/design-system test
  pnpm --filter @rune-langium/studio test
  pnpm run lint
  ```

  Pay special attention to test failures related to the sub-menu pattern — the Radix→Base UI sub-menu nesting change is the highest-risk item in this wrapper.

- [ ] **Step 5: Spot-check open/close animation and sub-menu behavior**

  Manually verify that the dropdown opens and sub-menus expand as expected. The animation `data-[state=…]` re-point is the same risk pattern as Tooltip and Popover.

- [ ] **Step 6: Remove `@radix-ui/react-dropdown-menu` and reinstall**

  ```bash
  pnpm install
  pnpm --filter @rune-langium/design-system run type-check
  pnpm --filter @rune-langium/studio test
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add packages/design-system/src/ui/dropdown-menu.tsx \
          packages/visual-editor/src/components/GraphContextMenu.tsx \
          packages/design-system/package.json pnpm-lock.yaml
  SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(design-system): migrate dropdown-menu to Base UI; asChild→render at GraphContextMenu

  Replaces @radix-ui/react-dropdown-menu with @base-ui-components/react Menu.
  Adds Positioner internally; all 15 exported names preserved.
  DropdownMenuPortal kept as passthrough no-op.
  Migrates GraphContextMenu.tsx:103 <DropdownMenuTrigger asChild> → <DropdownMenuTrigger render={…}>.
  Re-pointed data-state/data-side/data-disabled CSS.
  Removes @radix-ui/react-dropdown-menu dependency.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

## Wave 4: Heavy hitters — dialog, select, toast

Wave 4 isolates the two genuinely complex pieces (Select's large part-tree + ~22 usage refs, Toast's provider model) until the patterns from all previous waves are well-understood.

---

### Task 14: Migrate `dialog.tsx`

Radix: `@radix-ui/react-dialog` → Base UI: `Dialog`

**Sub-part renames:**
- `DialogPrimitive.Root` → `Dialog.Root`
- `DialogPrimitive.Trigger` → `Dialog.Trigger`
- `DialogPrimitive.Portal` → `Dialog.Portal` (if Base UI exposes one) or remove (Backdrop/Popup handle portaling)
- `DialogPrimitive.Overlay` → `Dialog.Backdrop`
- `DialogPrimitive.Content` → `Dialog.Popup`
- `DialogPrimitive.Title` → `Dialog.Title`
- `DialogPrimitive.Description` → `Dialog.Description`
- `DialogPrimitive.Close` → `Dialog.Close`

`DialogPortal`, `DialogOverlay`, `DialogHeader`, `DialogFooter` are exported today — `DialogHeader` and `DialogFooter` are plain `<div>` wrappers with no Radix dependency; they stay unchanged. `DialogOverlay` (currently `DialogPrimitive.Overlay`) maps to `Dialog.Backdrop`. `DialogPortal` maps to `Dialog.Portal` (or is kept as a passthrough if Base UI's Popup handles portaling internally).

**`data-state` CSS audit:** `DialogContent` (now `Dialog.Popup`) likely has `data-[state=open/closed]` animation classes → re-point to `data-open` / `data-starting-style`. `DialogOverlay` (now `Dialog.Backdrop`) may have similar. Read the full wrapper before migrating.

**Exported API preserved:**
```
{ Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger }
```

**File:** `packages/design-system/src/ui/dialog.tsx`

- [ ] **Step 1: Read current wrapper in full**

  Read `packages/design-system/src/ui/dialog.tsx` in full. List every `data-[state=…]` class on both `DialogContent` and `DialogOverlay`. Confirm whether `DialogPortal` is a thin wrapper or bare passthrough. Read Base UI Dialog docs for the `Backdrop` / `Popup` focus-trap and `open`/`onOpenChange` prop compatibility.

- [ ] **Step 2: Rewrite the wrapper on Base UI**

  Map sub-parts per the rename table above. `DialogContent` renders `<Dialog.Popup>` (focus trap + portal are built-in). `DialogOverlay` renders `<Dialog.Backdrop>`. Re-point `data-[state=…]` CSS on both. Preserve `DialogHeader` and `DialogFooter` unchanged (no Radix dependency). Preserve all `data-slot` attributes. Confirm `Dialog.Root`'s `open` / `onOpenChange` / `defaultOpen` prop compatibility with the existing wrapper signature.

- [ ] **Step 3: Type-check and run tests**

  ```bash
  pnpm --filter @rune-langium/design-system run type-check
  pnpm run type-check
  pnpm --filter @rune-langium/design-system test
  pnpm --filter @rune-langium/studio test
  pnpm run lint
  ```

  Dialog keyboard/focus tests are the most critical here — verify focus trap on open, focus return on close, and `Escape` to dismiss.

- [ ] **Step 4: Remove `@radix-ui/react-dialog` and reinstall**

  ```bash
  pnpm install
  pnpm --filter @rune-langium/design-system run type-check
  pnpm --filter @rune-langium/studio test
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add packages/design-system/src/ui/dialog.tsx packages/design-system/package.json pnpm-lock.yaml
  SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(design-system): migrate dialog to Base UI (Overlay→Backdrop, Content→Popup)

  Replaces @radix-ui/react-dialog with @base-ui-components/react Dialog.
  Overlay→Backdrop, Content→Popup internally; all 10 exported names preserved.
  Re-pointed data-state CSS. Removes @radix-ui/react-dialog dependency.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

### Task 15: Migrate `select.tsx`

Radix: `@radix-ui/react-select` → Base UI: `Select`

This is the **heaviest wrapper**: the largest internal part-tree, ~22 consumer usage references in `apps/studio/` and `packages/visual-editor/`, and the `SelectPrimitive.Icon asChild` internal usage.

**Sub-part renames:**
- `SelectPrimitive.Root` → `Select.Root`
- `SelectPrimitive.Group` → `Select.Group`
- `SelectPrimitive.Value` → `Select.Value`
- `SelectPrimitive.Trigger` → `Select.Trigger`
- `SelectPrimitive.Icon` (used `asChild` internally in `SelectTrigger`) → replace with a plain `<span>` or `Select.Icon` if Base UI exposes one; the `<ChevronDownIcon>` is rendered inside
- `SelectPrimitive.Portal` → removed (handled by `Select.Positioner`)
- `SelectPrimitive.Content` → `Select.Positioner` (wrapping) + `Select.Popup` (inner)
- `SelectPrimitive.Viewport` → `Select.Viewport` or handled internally by `Popup`
- `SelectPrimitive.Label` → `Select.GroupLabel`
- `SelectPrimitive.Item` → `Select.Item`
- `SelectPrimitive.ItemText` → `Select.ItemText`
- `SelectPrimitive.ItemIndicator` → `Select.ItemIndicator`
- `SelectPrimitive.Separator` → `Select.Separator`
- `SelectPrimitive.ScrollUpButton` → `Select.ScrollUpArrow` or equivalent
- `SelectPrimitive.ScrollDownButton` → `Select.ScrollDownArrow` or equivalent

**`data-state` CSS audit:** `SelectContent` has `data-[state=open/closed]`, `data-[side=…]`, and Radix CSS custom properties (`--radix-select-content-available-height`, `--radix-select-trigger-height`, `--radix-select-trigger-width`) used in `max-h` and viewport sizing. Base UI uses `--available-height` or similar (confirm exact variable names from Base UI docs). `SelectTrigger` has `data-[placeholder]:text-muted-foreground` and `data-[size=…]` — the `data-[size=…]` is a custom attribute (not Radix); preserve as-is. `data-[placeholder]` → Base UI may emit `data-placeholder` (confirm). `SelectItem` has `data-[disabled]:…` → `data-disabled`; `focus:bg-accent` / `focus:text-primary-foreground` may map to `data-highlighted` in Base UI.

**~22 usage references:** The consumers do NOT change (the exported API is preserved). The ~22 refs are consumers of `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, etc. — they don't change at all because those exported names are preserved. Only the internal implementation changes. Verify by running `pnpm run type-check` and the full studio suite.

**Exported API preserved:**
```
{ Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectScrollDownButton, SelectScrollUpButton, SelectSeparator,
  SelectTrigger, SelectValue }
```

**File:** `packages/design-system/src/ui/select.tsx`

- [ ] **Step 1: Read current wrapper in full and list all CSS custom property references**

  Read `packages/design-system/src/ui/select.tsx` in full. List:
  1. Every `data-[…]` Tailwind variant used (especially `data-[state=open/closed]`, `data-[placeholder]`, `data-[disabled]`, `data-[side=…]`)
  2. Every `--radix-select-*` CSS custom property (used in `max-h` and viewport sizing classes)
  3. The `SelectPrimitive.Icon asChild` internal usage in `SelectTrigger` (line ~41)

  Then read Base UI Select docs for: the `Positioner` + `Popup` positioning model, `Select.Value`'s `placeholder` behavior, the `ScrollUpArrow` / `ScrollDownArrow` API (whether they replace `ScrollUpButton` / `ScrollDownButton`), and Base UI's CSS custom property names for available height and trigger dimensions.

- [ ] **Step 2: Rewrite the wrapper on Base UI**

  This is the most complex rewrite. Proceed sub-part by sub-part:

  1. **`Select`** (`Select.Root`) — preserve `open`, `onOpenChange`, `defaultOpen`, `value`, `onValueChange`, `defaultValue`, `disabled`, `name`, `required` props. Confirm Base UI equivalents.
  2. **`SelectGroup`** (`Select.Group`) — straightforward.
  3. **`SelectValue`** (`Select.Value`) — `placeholder` prop handling; confirm Base UI emits `data-placeholder` when empty.
  4. **`SelectTrigger`** — `Select.Trigger` + internal chevron icon. Remove `SelectPrimitive.Icon asChild` usage; render `<ChevronDownIcon>` directly inside (no `asChild` needed). Preserve `size` custom prop and `data-size` attribute. Re-point `data-[placeholder]` CSS.
  5. **`SelectContent`** — `<Select.Positioner …><Select.Popup …><Select.Viewport …>{children}</Select.Viewport></Select.Popup></Select.Positioner>` (or however Base UI structures it). Re-point `--radix-select-*` custom properties to Base UI equivalents. Re-point `data-[state=open/closed]` and `data-[side=…]` animation classes. The `position` and `align` props on the current `SelectContent` must be forwarded to `Positioner`.
  6. **`SelectLabel`** (`Select.GroupLabel`) — straightforward.
  7. **`SelectItem`** — `Select.Item` wrapping `Select.ItemText` + `Select.ItemIndicator`. Re-point `data-[disabled]` → `data-disabled`; focus highlight: `focus:bg-accent focus:text-primary-foreground` may become `data-highlighted:bg-accent data-highlighted:text-primary-foreground` (confirm).
  8. **`SelectSeparator`** (`Select.Separator`) — straightforward.
  9. **`SelectScrollUpButton` / `SelectScrollDownButton`** — map to Base UI's scroll arrow components (confirm exact names: may be `Select.ScrollUpArrow` / `Select.ScrollDownArrow`).

- [ ] **Step 3: Type-check (iterate until clean)**

  ```bash
  pnpm --filter @rune-langium/design-system run type-check
  ```
  Given the size of this wrapper, expect type errors on the first pass. Fix iteratively — do NOT suppress errors with `as any`. Run until clean.

- [ ] **Step 4: Run tests (iterate until green)**

  ```bash
  pnpm --filter @rune-langium/design-system test
  pnpm --filter @rune-langium/studio test
  pnpm run lint
  pnpm run type-check
  ```
  The ~22 consumer refs are the contract test. If tests fail, read the error, compare the Base UI API against the Radix API for the failing component, and adjust.

- [ ] **Step 5: Spot-check controlled/uncontrolled Select behavior**

  Test: open/close, keyboard nav (↑/↓ to move, Enter to select, Escape to dismiss), scroll buttons, and the `placeholder` display when no value is selected.

- [ ] **Step 6: Remove `@radix-ui/react-select` and reinstall**

  ```bash
  pnpm install
  pnpm --filter @rune-langium/design-system run type-check
  pnpm --filter @rune-langium/studio test
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add packages/design-system/src/ui/select.tsx packages/design-system/package.json pnpm-lock.yaml
  SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(design-system): migrate select to Base UI (full part-tree remap)

  Replaces @radix-ui/react-select with @base-ui-components/react Select.
  Adds Positioner internally; all 10 exported names preserved.
  Removes SelectPrimitive.Icon asChild (plain ChevronDownIcon now).
  Re-pointed data-state/data-side/data-placeholder/data-disabled CSS and
  --radix-select-* custom properties to Base UI equivalents.
  ~22 consumer refs unchanged; type-check + full studio suite green.
  Removes @radix-ui/react-select dependency.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

### Task 16: Migrate `toast.tsx` + rework `StudioToastProvider`

Radix: `@radix-ui/react-toast` → Base UI: `Toast`

This is the **second-heaviest** task. Base UI's Toast model differs structurally from Radix's: it uses `Toast.Provider` + `useToastManager()` hook instead of the Radix declarative Provider/Viewport/Root. `StudioToastProvider` must be reworked to use the new model while **preserving the `showToast({title,description,variant,duration})` call signature** so every consumer (`App.tsx`, `ExplorePerspective.tsx`, etc.) remains completely untouched.

**Sub-part renames (inside `toast.tsx`):**
- `ToastPrimitive.Provider` → `Toast.Provider`
- `ToastPrimitive.Viewport` → `Toast.Viewport`
- `ToastPrimitive.Root` → `Toast.Root`
- `ToastPrimitive.Title` → `Toast.Title`
- `ToastPrimitive.Description` → `Toast.Description`
- `ToastPrimitive.Close` → `Toast.Close`
- `ToastPrimitive.Action` (if present) → `Toast.Action`

**`data-state` CSS audit:** `Toast` (the wrapper) has `data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-80 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-bottom-full` — these must all be re-pointed to Base UI's state attributes. Base UI `Toast.Root` likely uses `data-open` and `data-exiting` or `data-starting-style`. Confirm from Base UI Toast docs.

**`StudioToastProvider` rework (`apps/studio/src/components/StudioToastProvider.tsx`):**

> **Read first:** Read `apps/studio/src/components/StudioToastProvider.tsx` in full. The current implementation uses a single `useState<StudioToastState | null>` to hold one toast at a time and passes it to a single `<Toast>` element inside `<ToastProvider duration={…}>`. Base UI's model uses `useToastManager()` to get an `add` method (or equivalent) that enqueues toasts, with `Toast.Provider` holding the state and `Toast.Viewport` rendering the queue.

The rework must:
1. Wrap `StudioToastProvider` around `<Toast.Provider>` from Base UI.
2. Use `useToastManager()` (or Base UI's equivalent hook — confirm the exact hook name and API from Base UI docs) to get the `add` method.
3. Implement `showToast` as: `add({ title, description, variant, duration })` (passing through to Base UI's toast manager), OR keep the `useState` pattern and map it onto `Toast.Root` + `Toast.Viewport` in whatever way Base UI requires.
4. Render `<Toast.Viewport>` in the appropriate position (same fixed bottom-right placement as today).
5. Preserve the exported signatures: `export function StudioToastProvider(…)` and `export function useStudioToast(): StudioToastContextValue`. The `StudioToastContextValue` interface (`{ showToast: (toast: StudioToastInput) => void }`) must remain unchanged.
6. Preserve the `StudioToastVariant = 'default' | 'destructive'` type and the `variant` prop behavior on the rendered toast.

**Exported API preserved (toast.tsx):**
```
{ Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport, toastVariants }
```

**Files:**
- Rewrite: `packages/design-system/src/ui/toast.tsx`
- Rework: `apps/studio/src/components/StudioToastProvider.tsx`

- [ ] **Step 1: Read current wrapper and `StudioToastProvider` in full**

  Read `packages/design-system/src/ui/toast.tsx` in full. Then read `apps/studio/src/components/StudioToastProvider.tsx` in full. Note the existing `duration` handling (`ToastProvider duration={toast?.duration ?? 4000}`), the `type` prop (`foreground` vs `background` keyed on `destructive` variant), the `onOpenChange` cleanup pattern, and the `aria-label` attributes on `ToastViewport`.

  Read Base UI `Toast` docs in full before writing a single line — the hook-based model is significantly different from Radix's declarative model and the exact API (hook name, `add` signature, Viewport rendering, toast lifecycle) must be understood before proceeding.

- [ ] **Step 2: Rewrite `toast.tsx` on Base UI**

  Map each exported wrapper to its Base UI `Toast.*` sub-part. Re-point all `data-[state=open/closed]` animation classes on `Toast` (the `toastVariants` base class has a long list of them). Preserve `toastVariants`, `data-slot`, `data-variant`, and the CVA `variant` prop. The `ToastProvider`, `ToastViewport`, `Toast`, `ToastTitle`, `ToastDescription`, `ToastClose` wrappers must preserve their props interfaces — including `duration` on `ToastProvider` if Base UI `Toast.Provider` accepts it (confirm).

- [ ] **Step 3: Rework `StudioToastProvider.tsx`**

  Replace the Radix-based implementation with Base UI's hook-based model while preserving:
  - `showToast({title, description, variant, duration})` signature unchanged
  - `useStudioToast()` exported hook unchanged
  - `StudioToastProvider` component exported unchanged
  - `ToastProvider` / `ToastViewport` from `@rune-langium/design-system/ui/toast` (the newly-migrated wrappers) are still imported and used — do not import Base UI directly from `StudioToastProvider.tsx`; all Base UI usage is mediated through the design-system wrappers

  The reworked `StudioToastProvider` uses `useToastManager()` (or the equivalent — confirm exact API) from Base UI (via the design-system wrapper chain or directly if the hook is re-exported). The internal state management for queuing / duration / `id` is taken over by Base UI's toast manager.

- [ ] **Step 4: Type-check and run tests**

  ```bash
  pnpm --filter @rune-langium/design-system run type-check
  pnpm run type-check
  pnpm --filter @rune-langium/design-system test
  pnpm --filter @rune-langium/studio test
  pnpm run lint
  ```

  Toast tests are critical: verify `showToast({title, description, variant, duration})` still renders a toast, that the toast dismisses after the duration, and that `variant: 'destructive'` renders the destructive styles.

- [ ] **Step 5: Spot-check toast open/close animation**

  The `toastVariants` base class has many `data-[state=…]` animation classes. After re-pointing, verify the enter/exit animation plays correctly.

- [ ] **Step 6: Remove `@radix-ui/react-toast` and reinstall**

  ```bash
  pnpm install
  pnpm --filter @rune-langium/design-system run type-check
  pnpm --filter @rune-langium/studio test
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add packages/design-system/src/ui/toast.tsx \
          apps/studio/src/components/StudioToastProvider.tsx \
          packages/design-system/package.json pnpm-lock.yaml
  SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(design-system): migrate toast to Base UI; rework StudioToastProvider

  Replaces @radix-ui/react-toast with @base-ui-components/react Toast.
  Reworks StudioToastProvider onto useToastManager() while preserving the
  showToast({title,description,variant,duration}) signature — all consumers unchanged.
  Re-pointed data-state animation CSS on toastVariants.
  Removes @radix-ui/react-toast dependency.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

## Task 17: Final Radix cleanup — drop remaining `@radix-ui/*` and shadcn config

After Wave 4 all 16 wrappers are migrated. This task removes residual Radix dependencies and the shadcn-Radix config.

**Files:**
- Edit: `packages/design-system/package.json`
- Edit: any `shadcn` / `components.json` config that points at Radix primitives (locate with `rg -n "radix\|shadcn" packages/design-system/`)

- [ ] **Step 1: Confirm zero remaining Radix imports in the design-system**

  ```bash
  rg -n "@radix-ui" packages/design-system/src/
  ```
  Expected: no matches. If any match, that wrapper was not fully migrated — fix it first.

- [ ] **Step 2: Confirm zero remaining Radix imports in studio and visual-editor**

  ```bash
  rg -n "@radix-ui" apps/studio/src/ packages/visual-editor/src/ packages/codegen/src/
  ```
  Expected: no matches. These packages import from `@rune-langium/design-system`, not from Radix directly. If matches exist, they are out-of-scope direct imports that need separate handling.

- [ ] **Step 3: Remove residual `@radix-ui/*` from `packages/design-system/package.json`**

  By this point most Radix packages should already have been removed incrementally (one per wrapper migration). Check `packages/design-system/package.json` for any remaining `@radix-ui/*` entries. Also check for `@radix-ui/react-compose-refs` and `@radix-ui/primitive` — remove them if they appear. Run:
  ```bash
  pnpm install
  pnpm --filter @rune-langium/design-system run type-check
  ```

- [ ] **Step 4: Locate and update the shadcn-Radix config**

  Run:
  ```bash
  rg -rn "radix\|shadcn" packages/design-system/ --include="*.json" --include="*.ts" --include="*.js"
  ls packages/design-system/
  ```
  If a `components.json` or similar shadcn config exists that references Radix or a Radix-based registry, update it to note that the design-system wrappers are now hand-maintained (remove any auto-update / `shadcn add` pointers for the 16 migrated components). Document the accepted trade-off per spec §4.4.

- [ ] **Step 5: Run the full suite one final time**

  ```bash
  pnpm --filter @rune-langium/design-system test
  pnpm --filter @rune-langium/studio test
  pnpm run type-check
  pnpm run lint
  ```
  All green.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/design-system/package.json pnpm-lock.yaml
  # Add components.json or other config changes if touched
  SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "chore(design-system): remove all @radix-ui/* deps; note hand-maintained wrappers

  All 16 wrappers migrated to Base UI. Removes @radix-ui/react-compose-refs,
  @radix-ui/primitive, and any remaining @radix-ui/* entries.
  Updates shadcn config to reflect hand-maintained status (spec §4.4).

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

## Task 18: Final verification and smoke test

- [ ] **Step 1: Run `rg -n "asChild" apps/studio/src packages/visual-editor/src packages/design-system/src`**

  Expected: zero matches (all consumer `asChild` call sites migrated, internal `asChild` usage in wrappers removed). If any matches remain, resolve them before proceeding.

- [ ] **Step 2: Run the full suite**

  ```bash
  pnpm --filter @rune-langium/design-system test
  pnpm --filter @rune-langium/studio test
  pnpm run type-check
  pnpm run lint
  ```
  All green. Zero `@radix-ui` imports in design-system, zero `asChild` in consumers.

- [ ] **Step 3: Manual smoke of every migrated surface**

  Test each of the 16 migrated components in a running studio build:
  - **Separator** — renders a horizontal/vertical line
  - **Avatar** — renders image with fallback gradient; the `render`-prop usage in ExplorePerspective renders the wrapped element
  - **Label** — renders a styled `<label>`; associates with its `htmlFor` target
  - **Collapsible** — opens and closes; animate-in/out plays
  - **ScrollArea** — scrollbar appears on overflow; scrolls correctly
  - **Button** — all variants/sizes render; `render` prop works for link buttons
  - **Alert** — all three variants render; `AlertTitle render={…}` at CuratedLoadErrorPanel renders correctly
  - **Checkbox** — checked/unchecked/indeterminate states; keyboard toggle
  - **RadioGroup** — selection moves between items; keyboard nav
  - **Tabs** — switching tabs shows correct panel; active tab styled
  - **Tooltip** — shows on hover/focus; hides on blur; delay correct; animation plays
  - **Popover** — opens on trigger; closes on outside click / Escape; positioning correct
  - **DropdownMenu** — opens; item hover/keyboard nav; sub-menus expand; closes on select
  - **Dialog** — opens; focus trap active; Escape closes; focus returns to trigger
  - **Select** — opens; keyboard nav; placeholder shown when empty; value selection and controlled/uncontrolled modes
  - **Toast** — `showToast({title, description, variant: 'default'})` shows toast; `variant: 'destructive'` shows destructive styles; dismisses after duration

- [ ] **Step 4: Confirm 139 consumer files compile cleanly**

  ```bash
  pnpm run type-check
  ```
  This is the final contract validation. Zero new type errors in consumer files.

---

## Self-review — spec coverage map

| Spec section | Covered by |
|---|---|
| §1 Problem (motivation, insulation boundary) | Task 0 (survey confirms 139 consumers import design-system, not Radix) |
| §2 Goal / Non-goals | Tasks 1–16 preserve exported API; Tasks 11–13 migrate asChild with no shim |
| §3 Scope (16 wrappers) | Tasks 1–16 (one task per wrapper) |
| §4.1 `asChild`→`render` (no shim, co-located) | Tasks 2, 7, 11, 12, 13 (per-wave consumer migrations) |
| §4.2 Toast provider model | Task 16 (`StudioToastProvider` rework + `useStudioToast` preservation) |
| §4.3 Positioner part (floating) | Tasks 11–13 (`Tooltip`, `Popover`, `Menu` absorb Positioner internally) |
| §4.4 shadcn hand-maintained | Task 17 (config update + accepted trade-off note) |
| §4.5 Theming / `data-*` re-point | `data-state` CSS re-point step in every applicable task (4, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16) |
| §5 Wave strategy | Wave 1 = Tasks 1–5; Wave 2 = Tasks 6–10; Wave 3 = Tasks 11–13; Wave 4 = Tasks 14–16 |
| §6 Usage/insulation analysis | Task 0 Step 4 (asChild census); Tasks 1–16 preserve exported API; Task 18 Step 4 (type-check 139 consumers) |
| §7 Error handling / correctness | Tasks 14 (focus trap, Dialog), 15 (Select keyboard nav), 16 (Toast fire-and-forget), 18 Step 3 (smoke) |
| §8 Testing | Each task runs `pnpm --filter @rune-langium/design-system test` + `pnpm --filter @rune-langium/studio test` + type-check + lint; Task 18 is the final regression gate |
| §9 Build sequence step 0 | Task 0 |
| §9 Build sequence steps 1–4 | Wave 1–4 tasks |
| §9 Build sequence step 5 (dep removal) | Incremental: Task 1–16 each remove their dep; Task 17 removes residuals |
| §9 Build sequence step 6 (final suite) | Task 18 |
| §10 Open questions | Not in scope for implementation; deferred per spec |
