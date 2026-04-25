# Manual Keyboard-Only Walkthrough — Studio (012)

**Feature**: `012-studio-workspace-ux`
**Owner**: a11y reviewer (rotated per release)
**Cadence**: Once per release branch, before merge.

This complements the automated `axe-core` run in CI (T115). Where axe
catches measurable WCAG breaches, this walkthrough catches the things
axe can't see: keyboard traps, focus invisibility, missed live-region
updates, screen-reader narration that doesn't match the visual order.

Run the walkthrough on the **production-like preview build** (not `pnpm
dev`), with the OS's screen reader on. macOS testers use VoiceOver
(`Cmd-F5`); Windows testers use NVDA. Both must pass.

For each item: tick ✅ when verified, leave ❌ + a one-line note when not.
Open a follow-up issue for any ❌ before requesting merge.

---

## Per-panel coverage

Each new IDE panel introduced in this feature must satisfy the items
under `panel`. Repeat for every panel.

### `panel`: File Tree (FR-A02)

- [ ] `Tab` lands focus on the first tree node from the panel header
- [ ] Arrow keys (`Up`/`Down`/`Left`/`Right`) move focus and expand/collapse per WAI-ARIA tree-view pattern
- [ ] `Enter` activates the focused file (opens it in the source editor)
- [ ] `Escape` returns focus to the panel header without closing the panel
- [ ] Focus ring is visible on every node (no transparent/2-pixel rings)
- [ ] Screen reader announces: tree role, node name, expanded state, level
- [ ] Renaming a node (F2) keeps focus inside the rename input until commit/cancel
- [ ] Drag-and-drop has a keyboard equivalent (Cut/Paste via context menu)

### `panel`: Source Editor (FR-A03)

- [ ] `Tab` enters the editor textarea; `Esc` then `Tab` exits without trapping
- [ ] `Cmd-K Cmd-S` (or platform equivalent) opens the keyboard shortcut help
- [ ] Diagnostics gutter is reachable by `F8` / `Shift-F8` (next/previous problem)
- [ ] Code completions are announced as `listbox` with `option` items
- [ ] Saving a dirty buffer announces "saved" via the status bar live region
- [ ] Error squiggles are visible at the user's chosen contrast level (≥3:1)

### `panel`: Inspector (FR-A04)

- [ ] Section headers are real headings (`h2`/`h3`) — verify with reader's headings list
- [ ] Form fields all have programmatic labels (no `placeholder`-only labels)
- [ ] Required fields announce required, optional ones do not
- [ ] Validation errors appear as `aria-describedby` on the failing field, not a toast
- [ ] Tabbing order matches visual order top-to-bottom

### `panel`: Visual Preview (FR-A04)

- [ ] Graph keyboard shortcuts are listed in the panel's help affordance
- [ ] `?` opens the shortcut sheet
- [ ] Selecting a node announces "selected, X of N"
- [ ] Pan/zoom has keyboard alternatives (`+`/`-`/arrow keys with modifier)
- [ ] Color-only state (selected vs. hovered) is also encoded as outline weight

### `panel`: Problems (FR-A05)

- [ ] `F8` jumps focus into the panel from anywhere
- [ ] Each problem row is a button-role activator (Enter opens the source location)
- [ ] Severity is announced separately from the message ("error: ...")
- [ ] Filtering controls are reachable by Tab and announce their state

### `panel`: Output (FR-A05)

- [ ] New output is announced via `aria-live="polite"`, NOT `assertive`
- [ ] Long output keeps focus position when more lines arrive
- [ ] `Ctrl-End` jumps to the latest line

---

## Cross-panel coverage

- [ ] `Cmd-1`…`Cmd-6` move focus between the six panels with no mouse
- [ ] `Cmd-,` opens Settings; `Esc` closes it and returns focus to where it was
- [ ] The status bar is announced on workspace state changes (clean/ahead/behind/...)
- [ ] No focus-trap when a modal opens; Esc closes it; Shift-Tab from the first focusable element returns focus to the trigger
- [ ] Skip-link on the studio page lets screen-reader users jump to the editor in one move
- [ ] All disabled controls have `aria-disabled` AND visual cues (≥3:1 contrast)

---

## Reduced-motion + colour

- [ ] With `prefers-reduced-motion: reduce`, panel-resize animations + dock drop animations are off
- [ ] Theme toggle (light / dark / system) updates without a full reload
- [ ] In dark mode, focus ring contrast is still ≥3:1 against the panel background

---

## Sign-off

| Tester | Date | OS / SR | Pass? |
|---|---|---|---|
| _name_ | YYYY-MM-DD | macOS / VoiceOver | ✅ / ❌ |
| _name_ | YYYY-MM-DD | Windows / NVDA | ✅ / ❌ |

A release blocks on **both** rows being ✅. Any ❌ → open an issue
before merge and link it from the release PR.
