# Radix → Base UI migration — design

Status: **APPROVED design (brainstorm output)** · 2026-05-26 · studio design-system primitive migration

## 1. Problem

The studio's component primitives are **shadcn/ui wrappers over Radix** (`@radix-ui/react-*`), concentrated in `packages/design-system/src/ui/*.tsx`. The motivation to move to **Base UI** (`@base-ui-components/react`) is **DX/API preference**: a cleaner, more consistent, actively-maintained headless library (built by ex-Radix + MUI + Floating UI maintainers). There is **no functional defect** driving this — so the migration must be **zero-regression, zero-consumer-churn, and incremental**, or it isn't worth doing.

The favourable fact: **139 consumer files import the *design-system* components, not Radix directly.** Radix is an implementation detail of `design-system/ui/*`. The migration is therefore bounded to rewriting those wrappers behind their **unchanged exported API** — *if* two leaks are handled (see §4): `asChild` at call sites, and the Toast/Tooltip provider wiring.

## 2. Goal / Non-goals

**Goal:** Replace Radix primitives with Base UI inside `packages/design-system/src/ui/*`, preserving every exported component's public API so the 139 consumers don't change. Done incrementally (component-by-component, the two libs coexisting), each step shippable and green.

**Non-goals**
- Changing any consumer's markup/props (the design-system API is the contract; `asChild` is preserved via a shim — §4.1).
- Restyling / visual redesign — Tailwind 4 + the existing token classes carry over unchanged (both libs are unstyled).
- Migrating non-Radix components (`app-switcher`, `badge`, `code-block`, `command`/cmdk, `field`, `form`, `heading`, `icon-button-group`, `input`, `kbd`, `resizable`/react-resizable-panels, `spinner`, `textarea`) — they have no Radix dependency.
- Keeping the `shadcn add` generator — Base UI is not canonical shadcn; wrappers become hand-maintained (accepted, §4.4).
- A big-bang cutover — explicitly rejected (§5).

## 3. Scope — the 16 Radix-backed wrappers

| Wrapper (`design-system/src/ui/`) | Radix primitive | Base UI target | Migration notes |
|---|---|---|---|
| `dialog.tsx` | `react-dialog` | `Dialog` | `Overlay`→`Backdrop`, `Content`→`Popup`; add internal `Portal`. Medium. |
| `dropdown-menu.tsx` | `react-dropdown-menu` | `Menu` | adds `Positioner` part; `Content`→`Popup`; sub-menus map. Medium. |
| `select.tsx` | `react-select` | `Select` | **heaviest** — `Trigger/Value/Icon/Portal/Positioner/Popup/Item/ItemText/ItemIndicator`; ~22 usage refs. Highest risk. |
| `popover.tsx` | `react-popover` | `Popover` | adds `Positioner`; `Content`→`Popup`. Medium; `asChild` triggers (§4.1). |
| `tooltip.tsx` | `react-tooltip` | `Tooltip` | `Provider` model differs; adds `Positioner`; `asChild` triggers. Medium. |
| `toast.tsx` | `react-toast` | `Toast` | **2nd heaviest** — Base UI uses `Toast.Provider` + `useToastManager()` hook + `Viewport/Root`; reshapes `StudioToastProvider`/`useStudioToast` (§4.2). |
| `tabs.tsx` | `react-tabs` | `Tabs` | `Trigger`→`Tab`, `Content`→`Panel`. Low-medium. |
| `radio-group.tsx` | `react-radio-group` | `RadioGroup` + `Radio` | `Item`→`Radio.Root`+`Radio.Indicator`. Low-medium. |
| `checkbox.tsx` | `react-checkbox` | `Checkbox` | `Root`/`Indicator` map cleanly. Low. |
| `collapsible.tsx` | `react-collapsible` | `Collapsible` | `Content`→`Panel`. Low. |
| `scroll-area.tsx` | `react-scroll-area` | `ScrollArea` | `Viewport/Scrollbar/Thumb` map; check corner. Low. |
| `avatar.tsx` | `react-avatar` | `Avatar` | `Root/Image/Fallback` map cleanly. Low. |
| `separator.tsx` | `react-separator` | `Separator` | trivial. Low. |
| `label.tsx` | `react-label` | native `<label>` or `Field.Label` | **reshape** — Base UI has no standalone Label (folds into `Field`); simplest is a native `<label htmlFor>` wrapper. Low. |
| `button.tsx` | `react-slot` | `render` prop / `useRender` | Slot→render (§4.1). Low but cross-cutting. |
| `alert.tsx` | `react-slot` | `render` prop / `useRender` | Slot→render (§4.1). Low. |

Base UI covers **all 16** (Label is the only one without a 1:1 primitive — handled with native `<label>`).

## 4. Cross-cutting concerns (the real work)

### 4.1 `asChild` → `render` (preserve the consumer API)
Radix's `asChild` is used at **16 consumer call sites** (e.g. `<TooltipTrigger asChild>`, `<PopoverTrigger asChild>`, `<DropdownMenuTrigger asChild>`) plus **8 times inside the wrappers**. Base UI replaces `asChild` with a `render` prop. **Decision: keep `asChild` in the design-system API via a shim** — consumers do NOT change. Each trigger-style wrapper accepts `asChild?: boolean` and translates: when `asChild` is set, pass the single child through Base UI's `render` prop (`render={childElement}`); otherwise render normally. A tiny shared helper (`asChildToRender(asChild, children)`) centralizes this. This keeps all 16 call sites + the 8 internal usages working untouched.

### 4.2 Toast provider model
Radix Toast (component `Provider`/`Viewport`/imperative-ish) → Base UI Toast (`Toast.Provider` + `useToastManager()` hook + `Toast.Viewport`/`Toast.Root`). `apps/studio/src/components/StudioToastProvider.tsx` (the `useStudioToast().showToast(...)` surface, mounted once in `App.tsx`) is reworked to wrap Base UI's toast manager while **preserving `useStudioToast()`'s `showToast({title,description,variant,duration})` signature** — consumers (App, ExplorePerspective, etc.) unchanged. This is the single highest-touch piece after Select.

### 4.3 Positioner part
Base UI's floating components (`Popover`, `Select`, `Menu`, `Tooltip`) introduce a `Positioner` element between trigger and popup (Radix folded positioning into `Content`). The wrappers absorb `Positioner` internally; the exported `*Content` components render `<Positioner><Popup>…` so consumers keep using `PopoverContent`/`SelectContent`/etc. unchanged.

### 4.4 shadcn workflow
The repo's `ui:add` (`shadcn add`) targets Radix-based shadcn. After migration, the Base UI wrappers are **hand-maintained** (or sourced from a Base-UI component registry if one is adopted). Documented as an accepted trade-off; `ui:add` stays usable for any remaining Radix-based additions during the transition (coexistence).

### 4.5 Theming
Unchanged. Both libraries are unstyled; the wrappers keep their Tailwind 4 classes + Radix/Studio design tokens. `data-*` state attributes differ slightly between libs (Radix `data-state` vs Base UI `data-*`) — any CSS keyed on `data-state` (animations, open/closed styles) must be re-pointed per component during its migration (a per-component checklist item).

## 5. Migration strategy — incremental coexistence

Both libraries install side-by-side; migrate **one wrapper per PR**, leaf-first, lowest-risk/lowest-usage first to build confidence and de-risk the API-delta patterns before the heavy hitters:

**Wave 1 (trivial, ~0–1 usages):** `separator`, `avatar`, `label`, `collapsible`, `scroll-area`.
**Wave 2 (low, establishes the `asChild` shim + render pattern):** `button`, `alert` (Slot→render), `checkbox`, `radio-group`, `tabs`.
**Wave 3 (floating + Positioner + asChild shim):** `tooltip`, `popover`, `dropdown-menu`.
**Wave 4 (heaviest, last):** `dialog`, then `select` (22 refs), then `toast` (provider rework).

Each PR: rewrite one wrapper on Base UI behind its exact exported API (incl. the `asChild` shim where relevant), re-point any `data-state` CSS, run the full studio suite + type-check + lint, ship. Remove the corresponding `@radix-ui/react-*` dependency only when its last wrapper is migrated. After the final wave, drop `@radix-ui/react-slot`/`compose-refs`/`primitive` and the `shadcn` Radix config.

**Why this order:** Wave 1 proves the mechanical rename pattern with near-zero blast radius; Wave 2 nails the `asChild`/`render` shim on simple components; Wave 3 applies it to floating components with the `Positioner` addition; Wave 4 isolates the two genuinely hard pieces (Select's large part-tree, Toast's provider model) when the patterns are well-understood.

## 6. Usage / insulation analysis

- **139 consumer files** import `@rune-langium/design-system`; they reference the wrapped components (`Dialog`, `Select`, `Button`, …), not Radix. Preserving the exported API = consumers untouched.
- **The only API leak is `asChild`** (16 call sites) — neutralized by the §4.1 shim, so even those sites don't change.
- Heaviest-used wrappers (migrate last / test hardest): `Select` (~22 refs), then `Alert`/`RadioGroup`/`Popover`/`Toast`/`Dialog`/`Button` (mid), the rest light.
- No consumer imports a Radix package directly (verified) — so there is no consumer-side Radix removal beyond `asChild` (shimmed).

## 7. Error handling / correctness

- Each migrated wrapper must preserve: keyboard nav, focus trap/return (Dialog/Popover/Menu/Select), portal behavior, controlled/uncontrolled `open`/`value` props, and `data-*` state styling.
- The `asChild` shim must error clearly (dev-time) if given multiple children (mirrors Radix Slot's single-child requirement).
- Toast: `showToast` must remain fire-and-forget with the same variant/duration semantics; dropped/queued behavior matches today.

## 8. Testing

- **Per-wrapper render/interaction tests** (most already exist for consumers; add wrapper-level tests where missing): open/close, selection, keyboard, controlled value, and the `asChild` shim (renders the passed child as the trigger).
- **Toast**: `useStudioToast().showToast` still renders a toast with title/description/variant; provider mounted once.
- **Regression gate:** the full studio suite (`pnpm --filter @rune-langium/studio test`) + `@rune-langium/design-system` tests stay green after each wrapper migration — the suite is the contract that consumers didn't break.
- **Visual/`data-state` CSS:** spot-check open/closed animations per migrated floating component (manual or snapshot) since state-attribute names shift.
- Type-check + lint green per PR.

## 9. Build sequence (for the plan)

0. Add `@base-ui-components/react`; confirm its installed version covers all 16 (esp. `Toast`, `ScrollArea`, `Avatar`); read each `ui/*.tsx` wrapper's exported API + every `data-state` CSS rule keyed to it.
1. Shared `asChildToRender` helper + unit test.
2. **Wave 1** (separator, avatar, label, collapsible, scroll-area) — one commit each, suite green.
3. **Wave 2** (button, alert, checkbox, radio-group, tabs) — establishes the render/asChild shim on simple cases.
4. **Wave 3** (tooltip, popover, dropdown-menu) — Positioner + asChild on floating components.
5. **Wave 4**: dialog → select → toast (toast includes the `StudioToastProvider`/`useStudioToast` rework).
6. Remove migrated `@radix-ui/*` deps incrementally; final cleanup of `slot`/`compose-refs`/`primitive` + shadcn-Radix config.
7. Full suite + type-check + lint; manual smoke of every migrated surface (dialogs, menus, selects, tooltips, toasts, tabs).

## 10. Open questions / deferred

- **Base UI registry vs hand-maintained wrappers** — whether to adopt a Base-UI shadcn-style registry for future `ui:add`-like ergonomics, or hand-maintain. Decide after Wave 1 (feel the maintenance cost). Not blocking.
- **`label` end state** — native `<label>` wrapper vs `Field.Label`. Native is simplest and sufficient; revisit only if `Field` adoption grows.
- **Per-component `data-state` CSS audit** — enumerated lazily per wave (step 0 lists them); a global audit up front is optional.
- **`command` (cmdk) + `resizable` (react-resizable-panels)** — unaffected (not Radix); out of scope.
