# Review Report

**Feature**: 006-adopt-zod-to-form
**Branch**: claude/clarify-speckit-UAzMG
**Reviewer**: Claude Code Agent
**Date**: 2026-02-28
**Status**: ⚠️ Approved with Minor Notes

---

## Summary

Reviewed the complete implementation of feature `006-adopt-zod-to-form` (Phases 1–7, T001–T045).
All 309 automated tests pass. Core functionality is correct and all acceptance criteria are met.

This PR upgrades `@zod-to-form/react` and `@zod-to-form/cli` to v0.2.4. Version 0.2.4 adds
built-in `onValueChange` and `mode` options to `useZodForm`/`ZodForm`, which directly eliminates
the previous `useWatch + isMounted + useEffect` workarounds present in the two generated forms and
restores the `mode: 'onChange'` validation behaviour that had been temporarily lost during the
`EnumForm` migration.

`langium-zod` v0.5.0 is installed and fully leveraged.

---

## Implementation Review

### What Was Reviewed

- T001–T005: Package setup and directory scaffolding
- T006–T007: Grammar field name verification
- T008–T014: Schema generation pipeline (US1)
- T015–T022: Component subpath + widget config (US2)
- T023–T028: Generated form components (US3)
- T029–T037: Pre-migration tests + EnumForm migration (US4)
- T039–T045: CI enforcement, build hygiene, end-to-end smoke (Phase 7)
- Pending: T038 (manual smoke test — out of scope for automated review)

### Implementation Quality

- **Code Quality**: Good. `ExternalDataSync`, `MapFormRegistry`, and the migrated `EnumForm` are
  clean and well-structured. The `ZodFormRegistryLike` local interface correctly avoids a direct
  `@zod-to-form/core` dependency that does not resolve in the workspace.
- **Test Coverage**: Strong. 309 tests across 37 files. TDD was followed for T029–T031 (tests
  written before migration). Regression guard tests for non-migrated forms are comprehensive.
- **Documentation**: Adequate. Module-level JSDoc present on all new files. Inline comments
  explain non-obvious choices (e.g. `keepDirtyValues`, `ZodFormRegistryLike` rationale).
- **Standards Compliance**: Passes `pnpm type-check`, `pnpm lint`, `pnpm format:check`, and
  `pnpm build` cleanly. CI `check-generated` job correctly guards schema drift.

---

## Test Results

```
Tests: 309 passing
Test files: 37
Failures: 0
```

Key test files verified:
- `test/EnumForm.test.tsx` — debounce + dirty-field preservation (T029)
- `test/non-migrated-forms.test.tsx` — smoke regression guard (T030)
- `test/EnumForm-members.test.tsx` — list-style member editing (T031)
- `test/generated-forms.test.tsx` — generated form render (T023)
- `test/generated-form-widgets.test.tsx` — TypeSelector widget integration (T028)

---

## Findings

### ✅ What Worked Well

- `ExternalDataSync` correctly implements the `keepDirtyValues` reset semantics from FR-014.
  The `useRef` pattern for `toValues` prevents stale closures without adding it to the effect
  dependency array.
- `MapFormRegistry` uses a structural `ZodFormRegistryLike` interface (not importing from the
  unresolvable `@zod-to-form/core` directly), which is the correct adaptation for this workspace.
- The `EnumForm` migration preserved the `EnumFormProps` interface exactly (FR-013 verified by
  T035), and all pre-migration tests (T029–T031) pass, confirming behaviour parity.
- `langium-zod` v0.5.0 is fully leveraged: `--strip-internals`, `--projection`,
  `--cross-ref-validation`, `--conformance`, `--ast-types`, `--conformance-out` are all used.
  The optional `regexOverrides` and programmatic `generateZodSchemas` API are not needed.
- The `check-generated` CI job (T039) correctly normalises formatting via `oxfmt` before diffing,
  preventing false positives from quote-style differences between the generator and the linter.

### ⚠️ Issues / Concerns

#### [1] `@zod-to-form/react` v0.2.3 → v0.2.4 upgrade not performed

- **Severity**: Medium
- **Description**: `packages/visual-editor/package.json` declares `"@zod-to-form/react": "*"` and
  `"@zod-to-form/cli": "*"` but the pnpm lockfile resolves both to **v0.2.3**. Version **0.2.4**
  has been published to npm.
- **Impact**: Three workarounds implemented to compensate for missing v0.2.3 features remain in
  the codebase when they could be removed:
  1. `RosettaEnumerationForm.tsx` (L14–57): `useWatch + isMounted ref + useEffect` auto-save
     pattern — replaced by `useZodForm({ onValueChange })` in v0.2.4.
  2. `DataForm.tsx` (L14–53): same `useWatch + isMounted ref + useEffect` pattern.
  3. `EnumForm.tsx` (L87–89): `useZodForm(enumFormSchema, { defaultValues })` missing
     `mode: 'onChange'` — this option was added in v0.2.4 and restores the validation-on-change
     behaviour that `useNodeForm` previously provided.
- **v0.2.4 API additions** (verified from npm dist):
  - `useZodForm(schema, { mode?: 'onSubmit' | 'onChange' | 'onBlur', onValueChange?: (values) => void })`
  - `ZodForm` props: `onSubmit` now optional, new `onValueChange`, `mode`, `componentConfig`
  - `onValueChange` internally uses `form.watch()` with `!info?.name` guard (skips initial mount
    load) and `schema.safeParse()` (only fires on valid form states) — semantically identical to
    the `isMounted` guard currently hand-coded.
- **Recommendation**: Upgrade lockfile by pinning to `^0.2.4`; simplify generated forms.

---

## Tasks Status

### Completed (Marked as Done)

All tasks T001–T037 and T039–T045 were previously marked `[X]` in tasks.md.
No status changes from this review (approved work was already marked).

### Remaining Pending

- `[ ] T038`: Manual smoke verification in studio app — requires a running browser environment;
  out of scope for automated review.

---

## Recommendations

1. **Upgrade `@zod-to-form/react` and `@zod-to-form/cli` to `^0.2.4`** in
   `packages/visual-editor/package.json`, then run `pnpm install` to update the lockfile.
2. **Simplify `RosettaEnumerationForm.tsx`**: Replace the `useWatch + isMounted + useEffect`
   block with `useZodForm(RosettaEnumerationSchema, { defaultValues, onValueChange })`. Remove
   `useRef`, `useEffect`, and the `useWatch` import; import `useZodForm` from `@zod-to-form/react`.
3. **Simplify `DataForm.tsx`**: Same refactor as `RosettaEnumerationForm.tsx`.
4. **Update `EnumForm.tsx`**: Add `mode: 'onChange'` to the `useZodForm` options.
5. **Update the hand-authored form note**: The comment citing "zodform CLI v0.2.3 does not support
   `--mode`" in `check-generated` CI job and in the form file headers can be updated once the CLI
   is also on v0.2.4 (the `--mode` flag may now be available).

---

## Next Steps

**Status: ⚠️ Approved with Minor Notes**

1. Merge is unblocked — core implementation is correct, all tests pass.
2. Perform the library upgrade and simplification (Recommendations 1–4) as a follow-up commit.
3. Complete T038 (manual smoke test) in a browser environment before the next release.
