# Implementation Plan: Complete Codegen for Missing Rune Types

**Branch**: `017-codegen-complete-types` | **Date**: 2026-05-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/017-codegen-complete-types/spec.md`

## Summary

Extend the Rune codegen pipeline to emit TypeScript and Zod output for all grammar constructs that currently lack codegen support: type aliases, rules, reports, library functions, and annotations. Add cross-namespace import resolution backed by a namespace registry. Expand Studio form previews to cover all Zod-emitting types and add function calculation forms with execution capability.

## Technical Context

**Language/Version**: TypeScript 5.9+ (strict mode, ESM)
**Primary Dependencies**: langium 4.2.1, zod 4.3.6, vitest, React 19, dockview-react
**Storage**: N/A (browser-only, codegen is pure transformation)
**Testing**: vitest — byte-identical fixture tests for codegen, unit tests for studio
**Target Platform**: Browser (Studio), CLI (codegen package)
**Project Type**: Library (codegen) + Application (studio)
**Performance Goals**: <200ms single-namespace codegen, <5s full corpus (per constitution)
**Constraints**: Deterministic output, no network dependency at codegen time
**Scale/Scope**: CDM corpus (~300 files, ~50 namespaces, ~600 types, ~200 rules)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. DSL Fidelity & Typed AST | PASS | All new constructs already have typed AST nodes (RosettaRule, RosettaTypeAlias, etc.) with type guards. No grammar changes needed. |
| II. Deterministic Fixtures | PASS | FR-019 requires byte-identical fixture tests for all new codegen output. Test fixtures will be vendored in-repo. |
| III. Validation Parity | PASS | No validation changes. Codegen emits output; it does not validate input beyond what the parser already does. |
| IV. Performance & Workers | PASS | Codegen runs in web worker (existing). Function execution in preview will also run in the worker. No new latency paths. |
| V. Reversibility & Compatibility | PASS | Additive changes only — new constructs that were previously silently skipped now emit output. No existing output changes. No breaking API changes (new optional fields on existing types). |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/017-codegen-complete-types/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
packages/codegen/
├── src/
│   ├── types/
│   │   ├── func.ts                    # Existing — RuneFunc
│   │   ├── type-alias.ts              # NEW — RuneTypeAlias
│   │   ├── rule.ts                    # NEW — RuneRule
│   │   ├── report.ts                  # NEW — RuneReport
│   │   ├── annotation.ts             # NEW — RuneAnnotationDecl
│   │   └── library-func.ts           # NEW — RuneLibraryFunc
│   ├── emit/
│   │   ├── zod-emitter.ts            # MODIFY — new construct emission, annotations as .meta()
│   │   ├── ts-emitter.ts             # MODIFY — new construct emission, decorators, cross-ns imports
│   │   ├── json-schema-emitter.ts    # MODIFY — type alias support
│   │   └── namespace-registry.ts     # NEW — NamespaceRegistry, NamespaceManifest
│   ├── generator.ts                  # MODIFY — build registry before per-namespace emission
│   ├── preview-schema.ts             # MODIFY — type aliases, choices, functions
│   ├── types.ts                      # MODIFY — export new types, extend FormPreviewSchema
│   └── index.ts                      # MODIFY — export new types
└── test/
    ├── fixtures/
    │   ├── type-aliases/             # NEW — fixture dirs
    │   ├── rules/                    # NEW
    │   ├── reports/                  # NEW
    │   ├── library-funcs/            # NEW
    │   ├── annotations/              # NEW
    │   └── cross-namespace/          # NEW
    ├── us7-type-aliases.test.ts      # NEW
    ├── us8-rules.test.ts             # NEW
    ├── us9-reports.test.ts           # NEW
    ├── us10-library-funcs.test.ts    # NEW
    ├── us11-annotations.test.ts      # NEW
    └── us12-cross-namespace.test.ts  # NEW

apps/studio/
├── src/
│   ├── workers/codegen-worker.ts     # MODIFY — preview:execute message
│   ├── store/preview-store.ts        # MODIFY — function execution state
│   ├── components/FormPreviewPanel.tsx # MODIFY — function form UI
│   └── services/codegen-service.ts   # MODIFY — execution message factories
└── test/
    ├── workers/codegen-worker.test.ts # MODIFY — new message types
    └── components/FormPreviewPanel.test.tsx # NEW or MODIFY
```

**Structure Decision**: Extends existing monorepo structure. No new packages — all changes within `packages/codegen` and `apps/studio`. New type representation files follow the existing `types/func.ts` pattern.

## Implementation Phases

### Phase 1: Namespace Registry & Cross-Namespace Foundation

**Goal**: Build the `NamespaceRegistry` that enables cross-namespace import resolution. This is the foundation for all subsequent phases.

**Files**:
- `packages/codegen/src/emit/namespace-registry.ts` (NEW)
- `packages/codegen/src/generator.ts` (MODIFY)
- `packages/codegen/src/emit/zod-emitter.ts` (MODIFY — accept registry)
- `packages/codegen/src/emit/ts-emitter.ts` (MODIFY — accept registry)
- `packages/codegen/src/emit/json-schema-emitter.ts` (MODIFY — accept registry)

**Design**:
1. `buildNamespaceRegistry(groupedDocs)` scans all namespaces, builds a `NamespaceManifest` per namespace listing all exported names (data, enum, func, rule, typeAlias, annotation) and the output relative path.
2. `runGenerate()` calls `buildNamespaceRegistry()` after `groupByNamespace()` and passes the registry into each per-namespace emitter call.
3. Each emitter's `EmissionContext` gains a `registry: NamespaceRegistry` field.
4. New utility: `resolveImportPath(fromNamespace, toNamespace, registry)` computes relative import paths.
5. New utility: `collectCrossNamespaceImports(ctx)` walks all type references in the namespace and collects `import { FooSchema } from './path.js'` statements.

**FR coverage**: FR-021, FR-022, FR-023, FR-024, FR-025

**Tests**: `us12-cross-namespace.test.ts` — multi-namespace fixtures with inheritance, attribute refs, function params across namespaces.

---

### Phase 2: Type Alias Codegen

**Goal**: Emit TypeScript type alias declarations and Zod schemas for `typeAlias` constructs.

**Files**:
- `packages/codegen/src/types/type-alias.ts` (NEW)
- `packages/codegen/src/emit/zod-emitter.ts` (MODIFY)
- `packages/codegen/src/emit/ts-emitter.ts` (MODIFY)
- `packages/codegen/src/emit/json-schema-emitter.ts` (MODIFY)

**Design**:
1. Extend `buildEmissionContext()` in all emitters to collect `isRosettaTypeAlias()` elements into `typeAliasByName`.
2. `emitTypeAlias()` in TS emitter: resolve the aliased type, emit `export type Price = number;` for primitives or `export type Foo = BarShape;` for data types.
3. `emitTypeAlias()` in Zod emitter: emit `export const PriceSchema = z.number()` with `.refine()` for conditions.
4. Chained aliases: resolve through the chain to the underlying type.
5. Type parameters: emit as TypeScript generics; Zod inlines concrete types.
6. Emit after enums, before data types (type aliases may be referenced by data attributes).

**FR coverage**: FR-001, FR-002, FR-003, FR-004

**Tests**: `us7-type-aliases.test.ts` — fixtures for primitive alias, data alias, alias with conditions, chained alias, parameterized alias.

---

### Phase 3: Annotation Codegen

**Goal**: Emit annotation declarations as TypeScript decorator factories and annotation usages as decorator invocations. Emit Zod `.meta()` for annotations.

**Files**:
- `packages/codegen/src/types/annotation.ts` (NEW)
- `packages/codegen/src/emit/ts-emitter.ts` (MODIFY)
- `packages/codegen/src/emit/zod-emitter.ts` (MODIFY)

**Design**:
1. Extend `buildEmissionContext()` to collect `isAnnotation()` elements.
2. TS emitter — `emitAnnotationDeclaration()`: for each `Annotation` node, emit a typed decorator factory function. The parameter type is derived from the annotation's `attributes` (reuse `resolveTypeExprAsTs` for each attribute).
3. TS emitter — in `emitClass()` and field emission: for each `AnnotationRef` on a type or attribute, emit `@annotationName({ key: "value" })` above the class/field declaration.
4. Zod emitter — in `emitTypeSchema()`: for each `AnnotationRef`, chain `.meta({ annotationName: { key: "value" } })`.
5. Zod emitter — in field-level emission: chain `.describe()` for annotation definitions and `.meta()` for qualifier data.
6. Annotation declarations emitted before types (decorators must be declared before use).

**FR coverage**: FR-026, FR-027, FR-028, FR-029, FR-030

**Tests**: `us11-annotations.test.ts` — fixtures for annotation declaration, usage on type, usage on attribute, usage on enum value, annotation with qualifiers.

---

### Phase 4: Rule Codegen

**Goal**: Emit TypeScript validation functions and Zod refinements for `rule` constructs.

**Files**:
- `packages/codegen/src/types/rule.ts` (NEW)
- `packages/codegen/src/emit/ts-emitter.ts` (MODIFY)
- `packages/codegen/src/emit/zod-emitter.ts` (MODIFY)

**Design**:
1. Extend `buildEmissionContext()` to collect `isRosettaRule()` elements into `rulesByName`.
2. Extract rules similarly to `extractFuncs()` — walk AST, build `RuneRule` representations.
3. TS emitter — `emitRule()`: emit `export function validateRuleName(input: InputType): boolean { return <transpiled expression>; }`. For eligibility rules, return boolean. For reporting rules, return the extracted value.
4. Zod emitter — `emitRuleValidator()`: for rules associated with a data type (via input type), emit a standalone `export const RuleNameValidator = InputTypeSchema.refine(...)`. For rules without a clear association, emit standalone validation functions.
5. Multiple rules targeting the same type compose independently — each is a separate function/refinement.
6. Rules emitted after types and type aliases (rules reference types).

**FR coverage**: FR-005, FR-006, FR-007

**Tests**: `us8-rules.test.ts` — fixtures for eligibility rule, reporting rule, rule with complex expression, multiple rules on same type.

---

### Phase 5: Report & Library Function Codegen

**Goal**: Emit TypeScript structures for reports and type-safe signatures for library functions.

**Files**:
- `packages/codegen/src/types/report.ts` (NEW)
- `packages/codegen/src/types/library-func.ts` (NEW)
- `packages/codegen/src/emit/ts-emitter.ts` (MODIFY)

**Design**:
1. **Reports**: Extend `buildEmissionContext()` to collect `isRosettaReport()` elements. Emit a typed interface per report: `export interface FooReport { inputType: InputTypeName; reportType: ReportTypeName; eligibilityRules: [typeof validateRule1, ...]; timing: 'real-time' | ...; }`. Zod/JSON Schema: silently skipped (FR-020).
2. **Library functions**: Extend extraction to handle `isRosettaExternalFunction()` (the `library function` grammar). Emit `export type LibFuncName = (param1: Type1, param2: Type2) => ReturnType;` — signature only, no body. Zod: silently skipped.
3. Reports emitted after rules (they reference rules). Library functions emitted with regular functions.

**FR coverage**: FR-008, FR-009, FR-010, FR-020

**Tests**: `us9-reports.test.ts`, `us10-library-funcs.test.ts`.

---

### Phase 6: Form Preview Expansion

**Goal**: Extend `generatePreviewSchemas()` to produce `FormPreviewSchema` entries for type aliases, choices (with one-of semantics), and rules. Add `kind` discriminator to schemas.

**Files**:
- `packages/codegen/src/preview-schema.ts` (MODIFY)
- `packages/codegen/src/types.ts` (MODIFY)

**Design**:
1. Add `kind` field to `FormPreviewSchema`: `'data' | 'typeAlias' | 'choice' | 'function'`.
2. **Type aliases**: If the alias resolves to a primitive, emit a single-field form. If it resolves to a data type, delegate to existing data form logic.
3. **Choices**: Emit a form with a radio/select for the choice option, plus nested fields for the selected option's type. Mark as `kind: 'choice'` so the UI can enforce one-of.
4. **Rules**: Rules with Zod representations appear as validation refinements on their target type's form — not as separate forms.
5. Extend `buildNamespaceIndexes()` to index type aliases and choices.

**FR coverage**: FR-011, FR-012, FR-013

**Tests**: Extend `preview-schema.test.ts` with type alias and choice fixtures.

---

### Phase 7: Function Calculation Form

**Goal**: Add function input forms to the form preview panel with execution capability.

**Files**:
- `packages/codegen/src/preview-schema.ts` (MODIFY)
- `apps/studio/src/workers/codegen-worker.ts` (MODIFY)
- `apps/studio/src/store/preview-store.ts` (MODIFY)
- `apps/studio/src/components/FormPreviewPanel.tsx` (MODIFY)
- `apps/studio/src/services/codegen-service.ts` (MODIFY)

**Design**:
1. **Preview schema**: Extend `generatePreviewSchemas()` to iterate `isRosettaFunction()` elements. For each function, build a `FormPreviewSchema` with `kind: 'function'`, `inputFields` from the function's `inputs`, and metadata for pre/post-conditions.
2. **Worker message**: Add `preview:execute` message type. Worker receives function name + input values, evaluates the generated TypeScript function body (via `new Function()` in worker scope), returns output or error.
3. **Preview store**: Add `executionResult` and `executionError` state per function target. Add `executeFunction()` action.
4. **FormPreviewPanel**: When `kind === 'function'`, render input fields + "Run" button. On run, dispatch `preview:execute`. Display output below inputs. Show pre-condition violations inline, post-condition violations on output.

**FR coverage**: FR-014, FR-015, FR-016, FR-017

**Tests**: Worker test for `preview:execute` message. FormPreviewPanel test for function form rendering and execution flow.

---

### Phase 8: Integration & Regression

**Goal**: End-to-end validation, regression suite, fixture completeness.

**Design**:
1. Run full codegen against CDM corpus fixtures — verify no regressions.
2. Verify all pre-existing fixture tests still pass (SC-006).
3. Add cross-namespace fixtures using real CDM patterns (inheritance across namespaces).
4. Verify Studio form preview renders all new types correctly.
5. Verify function execution works end-to-end in Studio.

**FR coverage**: FR-018, FR-019, SC-005, SC-006, SC-007

## Complexity Tracking

No constitution violations to justify.
