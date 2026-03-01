# Review Report

**Feature**: 006-adopt-zod-to-form
**Branch**: claude/clarify-speckit-UAzMG
**Reviewer**: Claude Code Agent
**Date**: 2026-02-28
**Status**: ✅ Approved

---

## Summary

Reviewed the complete implementation of feature `006-adopt-zod-to-form` (Phases 1–7, T001–T045).
All 309 automated tests pass. Core functionality is correct and all acceptance criteria are met.

Both `@zod-to-form/react` and `@zod-to-form/cli` are pinned to `^0.2.4`, which provides the
built-in `onValueChange` and `mode` options in `useZodForm`/`ZodForm`. All three forms
(`RosettaEnumerationForm.tsx`, `DataForm.tsx`, `EnumForm.tsx`) already use these options
directly — no `useWatch + isMounted + useEffect` workarounds are present in the codebase.

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

### ✅ No Outstanding Issues

No issues were found. All concerns identified in the initial draft of this review have been
resolved in the final implementation:

- `packages/visual-editor/package.json` pins `"@zod-to-form/react": "^0.2.4"` and
  `"@zod-to-form/cli": "^0.2.4"`; the lockfile resolves both to v0.2.4.
- `RosettaEnumerationForm.tsx` uses `useZodForm(RosettaEnumerationSchema, { defaultValues, onValueChange })` — no `useWatch`/`isMounted`/`useEffect` workaround.
- `DataForm.tsx` uses `useZodForm(DataSchema, { defaultValues, onValueChange })` — same clean pattern.
- `EnumForm.tsx` passes `mode: 'onChange'` to `useZodForm`, restoring validation-on-change behaviour.

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

1. **Complete T038**: Manual smoke verification in studio app — requires a running browser
   environment; out of scope for automated review.

---

## Next Steps

**Status: ✅ Approved**

1. Merge is unblocked — core implementation is correct, all tests pass, and all library versions
   and code patterns are up to date.
2. Complete T038 (manual smoke test) in a browser environment before the next release.
