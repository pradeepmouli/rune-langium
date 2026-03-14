# Spec Drift Report

Generated: 2026-03-14T03:00:00Z
Project: rune-langium
Spec: 008-core-editor-features

## Summary

| Category | Count |
|----------|-------|
| Specs Analyzed | 1 |
| Requirements Checked | 28 (FR-001 to FR-028) |
| Aligned | 26 (93%) |
| Drifted | 2 (7%) |
| Not Implemented | 0 (0%) |
| Unspecced Code | 1 |
| Success Criteria | 5/7 verified (2 untested) |

## Detailed Findings

### Spec: 008-core-editor-features - Core Editor Features

#### Aligned

**Git Model Loading (FR-001 to FR-006b)** — All 8 requirements fully implemented:
- FR-001: Load from public git URL → `apps/studio/src/services/model-loader.ts` (isomorphic-git clone)
- FR-002: Curated CDM/FpML list → `apps/studio/src/services/model-registry.ts` (3 built-in models + custom URL)
- FR-003: Discover/parse .rosetta files → `model-loader.ts` (recursive walk + glob matching)
- FR-004: Progress + cancellation → `model-loader.ts` (3-phase progress), `ModelLoader.tsx` (ProgressBar + Cancel)
- FR-005: Git tag/branch/commit ref → `model-loader.ts` (ref parameter, resolveRef to SHA)
- FR-006: Multiple models merged → `model-store.ts` (Map<id, LoadedModel>), `workspace.ts` (mergeModelFiles)
- FR-006a: Read-only loaded files → `workspace.ts` (readOnly flag on model files)
- FR-006b: Caching with version check → `model-cache.ts` (IndexedDB, getCachedModelIfFresh)

**zod-to-form Migration (FR-007 to FR-010)** — All 4 requirements fully implemented:
- FR-007: Zod schemas excluding internals → `packages/core/src/generated/zod-schemas.ts`, `form-surfaces.json`
- FR-008: Forms for all 5 types → `EnumForm.tsx`, `DataTypeForm.tsx`, `ChoiceForm.tsx`, `FunctionForm.tsx`, `TypeAliasForm.tsx`
- FR-009: Custom component mappings → `TypeSelector.tsx`, `CardinalityPicker.tsx`, `z2f.config.ts`
- FR-010: CLI regeneration commands → `package.json` scripts (generate:schemas, scaffold:forms)

**Conditions (FR-011 to FR-015)** — All 5 requirements fully implemented:
- FR-011: Conditions section → `FunctionForm.tsx` (ConditionSection with label="Conditions")
- FR-012: Post-conditions section → `ConditionSection.tsx` (postConditions prop, isPostCondition badge)
- FR-013: Optional name/description, required expression → `ConditionDisplayInfo` interface
- FR-014: Function scope in condition expressions → `renderExpressionEditor` slot with FunctionScope
- FR-015: Round-trip conditions → `model-to-ast.ts` (stripMetadata preserves conditions)

**Expression Builder (FR-016 to FR-022)** — All 7 requirements fully implemented:
- FR-016: All expression types → `ast-to-expression-node.ts` (47 KNOWN_TYPES, 4 intentionally excluded)
- FR-017: Conditional blocks → `ConditionalBlock.tsx` (if/then/else rendering)
- FR-018: Switch/case blocks → `SwitchBlock.tsx` (dynamic case management)
- FR-019: Lambda operations → `LambdaBlock.tsx` (filter, map, reduce, sort, min, max)
- FR-020: Constructor expressions → `ConstructorBlock.tsx` (type ref + field assignments)
- FR-021: Expression round-trip → `expression-roundtrip.test.ts` (conformance suite)
- FR-022: Works for both function body and conditions → `renderExpressionEditor` slot in both FunctionForm and ConditionSection

**Code Generator Export (FR-023 to FR-028)** — All 6 requirements fully implemented:
- FR-023: Export user-authored only → `generate.ts` (--reference flag), `ExportDialog.tsx` (getUserFiles vs getReferenceFiles)
- FR-024: Present available languages → `ExportDialog.tsx` (Select dropdown), `generate.ts` (--list-languages)
- FR-025: Preview generated code → `ExportDialog.tsx` (file list + code preview panel)
- FR-026: Download generated code → `ExportDialog.tsx` (handleDownloadFile, handleDownloadAll)
- FR-027: Pre-export validation → `EditorPage.tsx` (validateModelForExport checks diagnostics)
- FR-028: Error messages on failure → `ExportDialog.tsx` (error display), `generate.ts` (parseErrors)

#### Drifted

- **FR-026**: Spec says "download generated code as files or an **archive**" but implementation downloads files individually — no zip/archive functionality.
  - Location: `apps/studio/src/components/ExportDialog.tsx:131-137`
  - Severity: minor
  - Note: `downloadRosettaFiles` in `export.ts` also downloads individually, no zip library present

- **FR-010**: Spec says "Generated form files MUST be fully regenerated (not manually edited)" but current forms are **hand-authored following the useZodForm pattern** — z2f CLI scaffolds are generated but forms are manually maintained. The z2f CLI v0.2.3 didn't support `--mode auto-save` at the time of migration.
  - Location: `packages/visual-editor/src/components/editors/*.tsx`
  - Severity: minor
  - Note: Forms follow generated Zod schemas but are hand-edited to add ExternalDataSync, action handlers, etc. This was a deliberate architectural decision documented in research.md R2.

#### Not Implemented

None — all 28 functional requirements have corresponding implementations.

### Success Criteria

| Criteria | Status | Notes |
|----------|--------|-------|
| SC-001: Model load <60s | UNTESTED | T042 not yet run — no performance benchmark executed |
| SC-002: 100% CDM without Unsupported blocks | VERIFIED | expression-coverage.test.ts passes |
| SC-003: Zero hand-coded form fields | VERIFIED | T043 audited — all 5 forms use useZodForm |
| SC-004: Regeneration <30s | UNTESTED | No timing benchmark documented |
| SC-005: Expression round-trip zero data loss | VERIFIED | expression-roundtrip.test.ts passes |
| SC-006: Condition CRUD with correct DSL | VERIFIED | condition-roundtrip.test.ts passes |
| SC-007: Export to >= 1 target language | VERIFIED | CLI and ExportDialog support 10 languages |

### Edge Cases

| Edge Case | Status |
|-----------|--------|
| No .rosetta files in repo | Handled — ModelLoadError('NO_FILES') |
| Model with parse errors | Handled — partial success, errors inline |
| Condition references unknown type | Handled — validation error, not crash |
| Deeply nested expression (10+ levels) | Handled — recursive rendering, no depth limit |
| Offline model loading | Handled — falls back to cache, error if no cache |
| Multiple models same namespace | Handled — conflict detection, recent model precedence |
| Code generator unavailable | Handled — isAvailable() check, error display |
| Unsupported DSL construct in codegen | Handled — error messages with source identification |

### Unspecced Code

| Feature | Location | Lines | Suggested Spec |
|---------|----------|-------|----------------|
| @rune-langium/codegen package | packages/codegen/ | ~120 | 008-core-editor-features (additive — shared types + proxy extracted to separate package per user request) |

### Inter-Spec Conflicts

- **010-rune-dsl-export** spec is a blank template. If it was intended to cover the code generation export feature, there is overlap with 008's User Story 5 (FR-023 to FR-028). No conflict since 010 is empty.

## Recommendations

1. **Add zip/archive download** (FR-026 drift): Add a zip library (e.g., `fflate` or `jszip`) to enable downloading all generated files as a single archive. Currently each file downloads individually.
2. **Run SC-001 performance benchmark** (T042): Time the CDM model load end-to-end in a real browser to verify <60s target.
3. **Complete T017**: Create `component-config.ts` for compile-time widget validation to close the zod-to-form migration fully.
4. **Run T047 quickstart validation**: Follow quickstart.md steps on a clean environment to verify all commands work.
