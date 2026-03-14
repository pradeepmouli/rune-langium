# Enhancement: Comprehensive E2E Tests for Code Generation Flow

**Enhancement ID**: enhance-003
**Branch**: `enhance/003-comprehensive-e2e-tests`
**Created**: 2026-03-14
**Priority**: [x] High | [ ] Medium | [ ] Low
**Component**: apps/studio/test/e2e/codegen.spec.ts, apps/studio/test/e2e/export.spec.ts
**Status**: [x] Planned | [ ] In Progress | [ ] Complete

## Input
User description: "Add comprehensive E2E tests for code generation flow with mocked codegen service"

## Overview
Extend the E2E test coverage for the Export Code dialog and code generation flow. The existing `export.spec.ts` only tests basic dialog UI (open/close, button presence, service unavailable warning) without mocking the codegen service, so it cannot test the actual generation flow. The new `codegen.spec.ts` (17 tests) uses `page.route()` to mock the HTTP service but still has gaps: no download verification, no validation warning tests, no keyboard interaction tests, and no multi-model/reference-file scenarios.

## Motivation
The code generation flow is a critical user-facing feature that bridges the visual editor to real code output. Without thorough E2E tests covering the full lifecycle — including downloads, validation warnings, reference files, and edge cases — regressions can ship undetected. The existing tests cover the "happy path" but leave important scenarios untested.

## Proposed Changes
- Add download verification tests using Playwright's `page.on('download')` event to confirm file downloads trigger correctly with expected filenames and content
- Add validation warning display tests that verify pre-export validation warnings render in the yellow warning box
- Add reference file inclusion test to verify `getReferenceFiles` contributes files to the generate request payload
- Add keyboard accessibility tests (Escape to close dialog, Enter to trigger Generate)
- Add test for the "no user-authored files" error path (`getUserFiles` returns empty map)
- Consolidate overlapping tests between `export.spec.ts` and `codegen.spec.ts` to reduce duplication

**Files to Modify**:
- `apps/studio/test/e2e/codegen.spec.ts` — add new test cases for downloads, validation warnings, reference files, keyboard nav, empty files error
- `apps/studio/test/e2e/export.spec.ts` — remove Export Code dialog tests that are now covered more thoroughly in `codegen.spec.ts`

**Breaking Changes**: [ ] Yes | [x] No

## Implementation Plan

**Phase 1: Implementation**

**Tasks**:
1. [ ] Add download verification tests — use `page.on('download')` to intercept downloads triggered by "Download" and "Download all" buttons; assert filename and content match mock data
2. [ ] Add validation warning test — mock `validateModel` returning warnings, open dialog, generate, and assert the yellow warning box renders with expected warning text
3. [ ] Add reference files test — mock both `getUserFiles` and `getReferenceFiles`, generate, capture the POST body via `page.route()`, and assert reference files are included in the request payload alongside user files
4. [ ] Add keyboard interaction tests — test Escape key closes dialog, test that generating state disables language selector interaction
5. [ ] Add empty user files error test — mock an empty `getUserFiles` return, click Generate, assert "No user-authored files to export." error message displays
6. [ ] Consolidate export.spec.ts — move the 4 Export Code dialog tests from `export.spec.ts` into `codegen.spec.ts` (or remove them as duplicates), keeping only the export menu and .rosetta/SVG export tests in `export.spec.ts`
7. [ ] Run full E2E suite and verify all tests pass with no regressions

**Acceptance Criteria**:
- [ ] Download "Download" button triggers a browser download with correct filename extracted from file path
- [ ] Download "Download all" triggers multiple downloads matching all generated files
- [ ] Validation warnings from `validateModel` render in the dialog before generation proceeds
- [ ] Reference files are included in the codegen service POST request payload
- [ ] Escape key closes the Export Code dialog
- [ ] Empty user files shows the appropriate error message
- [ ] No duplicate test coverage between `export.spec.ts` and `codegen.spec.ts`
- [ ] All E2E tests pass (`pnpm playwright test`)

## Testing
- [ ] Unit tests added/updated
- [x] Integration tests pass (existing 17 codegen E2E tests pass)
- [ ] Manual testing complete
- [ ] Edge cases verified

## Verification Checklist
- [ ] Changes implemented as described
- [ ] Tests written and passing
- [ ] No regressions in existing functionality
- [ ] Documentation updated (if needed)
- [ ] Code reviewed (if appropriate)

## Notes
- The codegen service mock uses `page.route('**/api/generate')` to intercept both OPTIONS (availability check) and POST (generate) requests — this pattern should be reused for all new tests
- Download verification requires Playwright's download event API since downloads are triggered via programmatic `<a>` click with blob URLs
- Validation warnings test may need to mock at the component level since `validateModel` is a prop passed from `EditorPage` — alternatively, the test can load a model with known validation issues
- Reference files are provided via `getReferenceFiles` prop which is wired up in `EditorPage` — testing this end-to-end may require loading a model that imports from a reference namespace

---
*Enhancement created using `/enhance` workflow - See .specify/extensions/workflows/enhance/*
