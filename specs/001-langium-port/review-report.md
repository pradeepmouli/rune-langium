# Review Report

**Feature**: 001-langium-port (rune-langium)
**Reviewer**: Claude (Opus 4.6)
**Date**: 2026-02-10
**Status**: :x: Needs Changes

## Summary

Reviewed the full implementation of the `rune-langium` Langium-based parser for the Rune DSL. The core grammar (842 lines, all ~95+ rules) and generated AST (127 interfaces, 152 type guards) are solid and functional. The `parse()` and `parseWorkspace()` APIs work correctly. 152 of 156 tests pass. However, several tasks marked as complete in `tasks.md` have missing deliverables: vendored fixtures absent, web worker helper absent, formatter/serializer absent, type provider absent. Validation coverage (14 rules) is well below the 80% parity target (~81 of 101 Xtext rules). These gaps prevent approval.

## Implementation Review

### What Was Reviewed

All 124 tasks across 6 phases (T001-T124), encompassing:
- Repository & build setup (Phase 1)
- Expression grammar (Phase 2)
- Data model grammar (Phase 3)
- Scoping & validation (Phase 4)
- Full grammar coverage (Phase 5)
- Packaging & release (Phase 6)

### Implementation Quality

- **Code Quality**: Good. Grammar is well-structured with clear comments. Services use proper Langium DI patterns. Utilities are concise and correct. CLI is clean with proper error handling.
- **Test Coverage**: Moderate. 156 tests covering grammar, API, scoping, validation, and conformance. However, several test files referenced in tasks do not exist (browser-compat, type-guards, parse-benchmark, round-trip, grammar-parity, CLI tests).
- **Documentation**: Adequate. Spec, plan, tasks, research, and data-model docs are thorough. Core package has a README.
- **Standards Compliance**: Good use of TypeScript strict mode, ESM modules, Langium 4.2 patterns.

## Test Results

```
Test Files:  1 failed | 11 passed (12)
Tests:       4 failed | 152 passed (156)
Duration:    4.76s
```

**Tests Executed**: 156
**Tests Passing**: 152
**Tests Failing**: 4

All 4 failures are in `cdm-corpus.test.ts` due to missing vendored fixtures (`.resources/` directory does not exist).

## Findings

### What Worked Well

- **Grammar completeness**: The Langium grammar at 842 lines covers all Rune DSL constructs including expressions (10-level precedence chain, 30+ postfix operators), data model types, functions, synonyms, mapping, reporting, external sources, and annotations
- **Generated AST quality**: 127 TypeScript interfaces with `$type` discriminators and 152 type guard functions — exceeds the ~95 target from spec
- **Expression grammar design**: The `QualifiedNamePrimary` rule elegantly resolves the common-prefix ambiguity between symbol references, function calls, and constructor expressions
- **Parse API**: Clean async API with proper error reporting, document URIs, and workspace support for cross-file resolution
- **CLI design**: Both `parse` and `validate` commands support file/directory discovery, `--json` output, and proper exit codes
- **Scope provider architecture**: Handles 11 distinct cross-reference patterns with clear case-based dispatch
- **Build pipeline**: TypeScript compilation succeeds cleanly, Langium generation works, monorepo structure is well-organized

### Issues / Concerns

#### 1. Missing vendored fixtures (`.resources/` directory)
- **Severity**: Critical
- **Tasks affected**: T013, T013a, T013b, T013c, T013d (all marked [X])
- **Description**: The `.resources/` directory containing CDM corpus and rune-dsl snapshots does not exist. The fixture-loader (`fixture-loader.ts:8`) expects fixtures at `../../../../.resources` relative to the helpers directory.
- **Impact**: Cannot verify SC-001 (100% CDM parse rate), LANG-CORPUS-001, LANG-CORPUS-002. 4 conformance tests fail.
- **Recommendation**: Run `scripts/update-fixtures.sh` or manually vendor the CDM and rune-dsl snapshots under `.resources/cdm/` and `.resources/rune-dsl/`.

#### 2. Missing formatter/serializer (`rune-dsl-formatter.ts`)
- **Severity**: High
- **Task affected**: T101 (marked [X])
- **Description**: The file `packages/core/src/services/rune-dsl-formatter.ts` does not exist. T101 requires implementing a serializer/formatter for round-trip output.
- **Impact**: Cannot satisfy LANG-RT-002 (round-trip serialization to semantically equivalent `.rosetta` syntax). No round-trip test file exists either (T094, T104).
- **Recommendation**: Implement the Langium `AbstractFormatter` subclass for Rune DSL serialization.

#### 3. Missing type provider (`rune-dsl-type-provider.ts`)
- **Severity**: High
- **Task affected**: T083 (marked [X])
- **Description**: The file `packages/core/src/services/rune-dsl-type-provider.ts` does not exist. T083 requires computing receiver types and expected types.
- **Impact**: Without a type provider, the scope provider falls back to `getAllAttributesScope()` for feature calls (Cases 1-3), returning ALL attributes from the model instead of only attributes of the receiver type. This means cross-references resolve to incorrect candidates.
- **Recommendation**: Implement type computation service that resolves expression types for proper scope resolution.

#### 4. Missing web worker helper (`parser-worker.ts`)
- **Severity**: Medium
- **Task affected**: T110 (marked [X])
- **Description**: The `packages/core/src/worker/` directory does not exist. T110 requires a `createWorkerParser()` helper for off-main-thread parsing.
- **Impact**: US3 acceptance scenario 4 (web worker delegation) cannot be met. LANG-API-005 browser support is partially affected.
- **Recommendation**: Implement worker helper or re-scope T110 to a future phase.

#### 5. Validation parity well below 80% target
- **Severity**: High
- **Tasks affected**: T084 (22 rules), T085 (15 rules), T086 (12 rules), T087 (5 rules) — all marked [X]
- **Description**: The validator implements 14 checks total (S-01 through S-14). The tasks claim 54 rules (22 expression + 15 structural + 12 naming + 5 reporting) are ported, but the actual validator has only 14. The spec requires 80% of 101 Xtext rules (~81 rules) for LANG-VAL-001.
- **Impact**: Validation parity is ~14% instead of the required 80%. SC-006 cannot be met.
- **Recommendation**: Port the remaining validation rules as specified in the tasks. Priority: expression validators (T084), then structural validators (T085).

#### 6. Missing test files referenced by tasks
- **Severity**: Medium
- **Tasks affected**: T094, T107, T108, T117, T118, T123, T124 (all marked [X])
- **Description**: The following test files do not exist:
  - `packages/core/tests/conformance/round-trip.test.ts` (T094)
  - `packages/core/tests/performance/parse-benchmark.test.ts` (T107)
  - `packages/core/tests/api/browser-compat.test.ts` (T108)
  - `packages/cli/tests/cli-parse.test.ts` (T117)
  - `packages/cli/tests/cli-validate.test.ts` (T118)
  - `packages/core/tests/conformance/grammar-parity.test.ts` (T123)
  - `packages/core/tests/api/type-guards.test.ts` (T124)
- **Impact**: Coverage gaps for round-trip, performance, browser compat, CLI, and grammar parity testing.
- **Recommendation**: Create the missing test files or update tasks.md to reflect actual status.

#### 7. Scope provider partial implementations
- **Severity**: Medium
- **Tasks affected**: T077-T082 (all marked [X])
- **Description**: Feature call scopes (Cases 1-3) use `getAllAttributesScope()` as a fallback instead of resolving the receiver type. `getWithMetaKeyScope()` returns `EMPTY_SCOPE`. `getConstructorKeyScope()` also falls back to `getAllAttributesScope()`. The spec requires scoping "with the same scoping rules as the Xtext `RosettaScopeProvider`" (LANG-RT-003).
- **Impact**: Cross-references resolve to overly broad candidate sets. Feature calls like `a -> b` will find `b` in any Data type, not just in the receiver type of `a`.
- **Recommendation**: Implement proper receiver type resolution (depends on T083 type provider) for Cases 1-3, 5, and 6.

#### 8. CLI `discoverFiles` duplication
- **Severity**: Low
- **Description**: The `discoverFiles()` function is duplicated identically in `packages/cli/src/parse.ts:13-30` and `packages/cli/src/validate.ts:15-32`.
- **Impact**: Maintenance burden; bug fixes need to be applied in two places.
- **Recommendation**: Extract to a shared utility (e.g., `packages/cli/src/utils.ts`).

#### 9. `parse()` singleton document accumulation
- **Severity**: Low
- **Description**: `parse()` in `packages/core/src/api/parse.ts:30-37` uses a module-level singleton for services but never removes documents from the workspace between calls. Documents accumulate over the lifetime of the process.
- **Impact**: Memory leak in long-running processes. May also cause cross-reference interference between unrelated parse calls.
- **Recommendation**: Clear the document from the workspace after extracting the parse result, or create fresh services per call (with caching for repeated use).

## Tasks Status

### Marked as Done (in tasks.md) — Actually Complete
All Phase 1-6 tasks are marked [X] in tasks.md.

### Deliverables Actually Missing (tasks marked [X] but not delivered)

| Task | Claimed Deliverable | Status |
|------|---------------------|--------|
| T013, T013a-d | Vendored CDM & rune-dsl fixtures | Missing (`.resources/` absent) |
| T083 | Type provider (`rune-dsl-type-provider.ts`) | Missing |
| T084-T087 | 54 validation rules | Only 14 implemented |
| T088 | Validation parity report | Missing |
| T094 | Round-trip serialization test | Missing |
| T101 | Formatter/serializer (`rune-dsl-formatter.ts`) | Missing |
| T107 | Performance benchmark test | Missing |
| T108 | Browser compatibility test | Missing |
| T110 | Web worker helper (`parser-worker.ts`) | Missing |
| T117-T118 | CLI tests | Missing |
| T123 | Grammar parity check harness | Missing |
| T124 | Type guard export tests | Missing |

## Recommendations

1. **Revert task status**: Mark the 20+ tasks listed above back to `[ ]` pending to accurately reflect implementation status
2. **Priority 1**: Vendor the CDM and rune-dsl fixtures to unblock conformance testing
3. **Priority 2**: Implement the type provider to enable proper scope resolution
4. **Priority 3**: Port remaining validation rules toward the 80% parity target
5. **Priority 4**: Implement the formatter for round-trip support
6. **Lower priority**: Worker helper, missing tests, CLI refactoring

## Next Steps

**For :x: Needs Changes**:
1. Fix listed issues — at minimum vendor fixtures, implement type provider, and increase validation coverage
2. Update tasks.md to accurately reflect completion status
3. Run tests to verify fixtures are loaded and conformance tests pass
4. Request re-review with `/speckit.review`
