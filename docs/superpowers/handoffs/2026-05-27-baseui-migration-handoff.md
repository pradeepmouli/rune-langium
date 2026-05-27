# Base UI Migration — Handoff

**Branch:** `feat/baseui-migration`
**PR:** https://github.com/pradeepmouli/rune-langium/pull/255
**Status:** Implementation complete, PR open, pending review + merge

---

## What was done

All 16 Radix-backed wrappers in `packages/design-system/src/ui/` have been migrated to `@base-ui/react` (now via per-component subpath imports). The migration shipped as 18 commits on the branch, one per task, and follow-up review fixes moved the deprecated package alias to the renamed package.

| Task | Commit | What |
|------|--------|------|
| 0 | `8f9bcbaa` | Install Base UI (initially via deprecated `@base-ui-components/react ^1.0.0-rc.0` alias; later renamed to `@base-ui/react`) |
| 1 | `1db84bf9` | Wave 1: Separator |
| 2 | `3279f40a` | Wave 1: Avatar |
| 3 | `feec7cb6` | Wave 1: Label → native `<label htmlFor>` |
| 4 | `d5a21d0e` | Wave 1: Collapsible |
| 5 | `8ab69705` | Wave 1: ScrollArea |
| 6 | `b1e76a3a` | Wave 2: Button (`@radix-ui/react-slot` → `render`) |
| 7 | `3c9ab049` | Wave 2: Alert (`@radix-ui/react-slot` → `render`) |
| 8 | `d6ac9fff` | Wave 2: Checkbox |
| 9 | `aad048cb` | Wave 2: RadioGroup |
| 10 | `13e4175d` | Wave 2: Tabs |
| 11 | `8ba6ddcb` | Wave 3: Tooltip + asChild→render call sites |
| 12 | `d925ec10` | Wave 3: Popover + asChild→render call sites |
| 13 | `adc6a9e5` | Wave 3: DropdownMenu + asChild→render call sites |
| 14 | `328fc090` | Wave 4: Dialog |
| 15 | `ac047466` | Wave 4: Select (~22 usages) |
| 16 | `4455e31b` | Wave 4: Toast + StudioToastProvider rework |
| 17 | `e72fedb9` | Cleanup: mark wrappers hand-maintained, disable shadcn auto-update |

## What the reviewer needs to verify

1. **`asChild` fully gone from real code** — the remaining JSDoc example in `packages/design-system/src/ui/icon-button-group.tsx` has been updated to the `render` prop pattern, so this should now be fully clear.

2. **Pre-existing type errors on master** — `apps/studio/src/App.tsx` and `apps/studio/src/shell/ExplorePerspective.tsx` have type errors about `EditorStore` hydration properties (`pendingHydrationNamespaces`, `requestNamespaceHydration`, etc.). **These are NOT introduced by this branch** — the migration didn't touch those files at those lines. Confirmed via `git diff master..feat/baseui-migration`. They exist on master and will need a separate fix.

3. **Radix deps fully removed** — `packages/design-system/package.json` no longer lists any `@radix-ui/react-*` dependencies. The studio has no remaining `@radix-ui` imports.

4. **Manual smoke test** — the automated suite was run per task, but floating components (Tooltip, Popover, DropdownMenu, Select) and the Toast system should be manually verified in the running app since `data-state` CSS attribute names differ between Radix and Base UI.

## What's NOT done (deferred)

- **Task 18 (final verification)** — the Copilot agent ran tests per task but the plan's final cross-wave verification pass (full studio suite + manual smoke of all surfaces) should be confirmed by a reviewer. The Copilot agent stopped after Task 17.

- **Radix root-level deps** — `@radix-ui/react-slot`, `@radix-ui/react-compose-refs`, `@radix-ui/primitive` may still be in the workspace root `package.json` as transitive deps from other consumers (shadcn, cmdk, etc.). The plan (Task 17/18) calls for removing them only when no usages remain; verify with `pnpm why @radix-ui/react-slot` before removing.

## Key design decisions (for context)

- **No asChild shim** — all consumer call sites were migrated to Base UI's `render` prop in the same wave as their component. There is no backward-compat wrapper.
- **Positioner absorbed internally** — exported API for floating `*Content` components is unchanged; the `Positioner` layer is inside the wrapper.
- **Label** uses native `<label htmlFor>` — Base UI has no standalone Label primitive. If `Field.Label` adoption grows later, the wrapper can be updated then.
- **StudioToastProvider** — reworked onto `Toast.Provider` + `useToastManager()`. The `showToast({title, description, variant, duration})` signature is preserved; no consumer changed.

## Related branches / PRs

- `feat/github-provider` — GithubProvider implementation (9-task plan at `docs/superpowers/plans/2026-05-26-github-provider.md`), separate agent to implement, not yet started
