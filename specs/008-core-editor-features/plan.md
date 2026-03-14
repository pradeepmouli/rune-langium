# Implementation Plan: Core Editor Features

**Branch**: `008-core-editor-features` | **Date**: 2026-03-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-core-editor-features/spec.md`

## Summary

Deliver 5 capabilities across 3 phases: (1) Git-based model loading with caching and zod-to-form migration completion, (2) Conditions UI in the function editor and expression builder corpus validation, (3) Code generation export via rosetta-code-generators. Research reveals the expression builder is already feature-complete (51/51 expression types), so Story 4 reduces to validation testing. The zod-to-form migration needs 3 more form migrations (Choice, Data, Function) following the proven EnumForm pattern. Git model loading requires new infrastructure (isomorphic-git, IndexedDB caching). Code generation integrates with the Java-based rosetta-code-generators via subprocess/service.

## Technical Context

**Language/Version**: TypeScript 5.9+ (strict mode, ESM)
**Primary Dependencies**: React 19, @xyflow/react 12, zustand 5, zundo 2, langium 4.2.1, zod 4.3.6, @zod-to-form/cli 0.2.7, langium-zod 0.5.3, isomorphic-git (new), idb (new), commander 14
**Storage**: IndexedDB (via idb) for model caching; in-memory for workspace state
**Testing**: vitest for unit/integration; CDM corpus conformance suite
**Target Platform**: Browser (Vite + React); Node.js CLI
**Project Type**: Monorepo — packages/core (parser), packages/visual-editor (UI components), packages/cli (CLI tool), packages/lsp-server (LSP), apps/studio (main app)
**Performance Goals**: Model load <60s (CDM scale, 1000+ files); parse <5s full corpus; <200ms single-file parse
**Constraints**: Browser-only (no native git); public repos only; offline via cache; Java 17+ for code generation
**Scale/Scope**: CDM corpus (~1000 files, ~50K LOC); 5 form surfaces; 51 expression types

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. DSL Fidelity & Typed AST | ✅ Pass | Expression builder uses typed AST nodes, not opaque strings. Conditions use Expression references. No grammar changes needed. |
| II. Deterministic Fixtures | ✅ Pass | CDM corpus tests remain vendored. Git model loading is a runtime feature, not a test dependency. New round-trip tests will use existing fixtures. |
| III. Validation Parity | ✅ Pass | No new validation rules added. Condition validation follows existing Xtext parity. |
| IV. Performance & Workers | ✅ Pass | Parsing continues in web worker. Model loading uses async generators with progress. Git fetch is non-blocking. |
| V. Reversibility & Compatibility | ✅ Pass | Form migration preserves backward-compatible props (proven by EnumForm). Expression builder adds no breaking changes. Code generation is additive. |
| Tooling: TypeScript + pnpm | ✅ Pass | All new code is TypeScript. No new packages outside pnpm workspace. |
| Tooling: oxlint + vitest | ✅ Pass | Tests added for all new functionality. Lint rules unchanged. |
| Quality Gate: TDD | ✅ Pass | Tests written before implementation per constitution. |

**Post-Phase 1 Re-check**: No violations. All new entities (ModelSource, CachedModel, CodeGenerationRequest) are typed. No new abstractions beyond what's needed for the current task.

## Project Structure

### Documentation (this feature)

```text
specs/008-core-editor-features/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research findings
├── data-model.md        # Entity definitions
├── quickstart.md        # Developer quickstart
├── contracts/           # Interface contracts
│   ├── model-loader-api.md
│   └── codegen-api.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
packages/core/
├── src/
│   ├── api/parse.ts                    # Existing parse API (no changes)
│   ├── serializer/rosetta-serializer.ts # Existing serializer (no changes)
│   └── generated/                       # Generated AST + Zod schemas
└── test/
    └── conformance/                     # CDM corpus tests

packages/visual-editor/
├── src/
│   ├── components/
│   │   └── editors/
│   │       ├── EnumForm.tsx             # Already migrated to useZodForm
│   │       ├── ChoiceForm.tsx           # → Migrate to useZodForm
│   │       ├── DataTypeForm.tsx         # → Migrate to useZodForm
│   │       ├── FunctionForm.tsx         # → Migrate to useZodForm + add conditions
│   │       ├── ConditionSection.tsx     # → New: conditions UI
│   │       └── expression-builder/     # Complete (51/51 types)
│   ├── adapters/
│   │   ├── ast-to-expression-node.ts   # Complete
│   │   └── expression-node-to-dsl.ts   # Complete
│   ├── generated/
│   │   └── zod-schemas.ts              # Generated form schemas
│   └── schemas/
│       └── form-schemas.ts             # Form-specific schema wrappers
└── z2f.config.ts                        # zod-to-form component mappings

packages/cli/
├── src/
│   ├── index.ts                         # CLI entry (add generate command)
│   ├── parse.ts                         # Existing
│   ├── validate.ts                      # Existing
│   └── generate.ts                      # → New: code generation command
└── test/

apps/studio/
├── src/
│   ├── components/
│   │   ├── FileLoader.tsx               # Existing file picker
│   │   ├── ModelLoader.tsx              # → New: git model loader UI
│   │   └── ExportDialog.tsx             # → New: code generation export UI
│   ├── services/
│   │   ├── workspace.ts                 # Existing file I/O
│   │   ├── model-loader.ts             # → New: isomorphic-git integration
│   │   ├── model-cache.ts              # → New: IndexedDB caching
│   │   ├── model-registry.ts           # → New: curated model list
│   │   ├── codegen-service.ts          # → New: code generation service client
│   │   └── export.ts                    # Existing download helpers
│   └── store/
│       └── model-store.ts              # → New: model loading state
└── test/
```

**Structure Decision**: Follows existing monorepo layout. New files are added to existing packages in their natural locations. No new packages needed. The `apps/studio` package gets the bulk of new code for git loading and export UI.

## Implementation Phases

### Phase 1: Foundation (Stories 1-2)

**Goal**: Enable model loading from git and complete the form generation pipeline.

**1a. Git Model Loading** (Story 1 — P1)

1. Add `isomorphic-git` and `idb` dependencies to `apps/studio`
2. Create `model-registry.ts` with curated CDM/FpML entries (URLs, default refs, file paths)
3. Create `model-loader.ts` service using isomorphic-git:
   - Shallow clone with blob filter for .rosetta files only
   - AsyncGenerator yielding LoadProgress events
   - AbortSignal for cancellation
4. Create `model-cache.ts` with IndexedDB persistence:
   - Store parsed file contents keyed by sourceId + commitHash
   - Version check on open (compare cached ref with requested ref)
   - Offline fallback to cached data
5. Create `model-store.ts` (zustand) for loading state management
6. Create `ModelLoader.tsx` UI component:
   - Curated model selector (dropdown)
   - Custom URL input with ref/tag field
   - Progress bar with cancel button
   - Error display
7. Integrate loaded model files as read-only WorkspaceFiles into existing workspace pipeline

**1b. zod-to-form Migration** (Story 2 — P1)

1. Migrate `ChoiceForm.tsx`: replace `useNodeForm` → `useZodForm` with `ChoiceSchema`
2. Migrate `DataTypeForm.tsx`: replace `useNodeForm` → `useZodForm` with `DataSchema`
3. Migrate `FunctionForm.tsx`: replace `useNodeForm` → `useZodForm` with `RosettaFunctionSchema`
4. Add `ExternalDataSync` to each migrated form
5. Create `component-config.ts` for compile-time widget validation
6. Verify all forms render correctly with existing fixtures
7. Complete T038 manual smoke test for EnumForm

### Phase 2: Editor Features (Stories 3-4)

**Goal**: Add conditions UI and validate expression builder completeness.

**2a. Conditions UI** (Story 3 — P2)

1. Create `ConditionSection.tsx` component:
   - Add/remove condition entries
   - Optional name and description fields
   - Expression builder integration for condition body
   - Distinguish pre-conditions vs post-conditions
2. Update `FunctionForm.tsx` to include Conditions and Post-Conditions sections
3. Wire condition scope (function inputs, outputs, shortcuts, aliases) into expression builder
4. Implement condition serialization (UI → DSL text round-trip)
5. Test with CDM functions that have existing conditions

**2b. Expression Builder Fix & Validation** (Story 4 — P2)

1. Diagnose why expression builder renders source text instead of interactive blocks:
   - Trace data flow from FunctionForm → expression display → block components
   - Identify where ExpressionNode conversion is skipped or rendering falls back to text
2. Fix expression builder rendering to display interactive blocks
3. Verify interactive blocks render for common expression types (binary ops, function calls, conditionals)
4. Create CDM corpus expression round-trip test:
   - Parse all CDM functions → extract expressions
   - Convert each to ExpressionNode (ast-to-expression-node)
   - Serialize back to DSL (expression-node-to-dsl)
   - Re-parse and compare AST
5. Verify zero `UnsupportedBlock` occurrences across entire CDM corpus
6. Fix any edge cases discovered during corpus testing
7. Document any map-test expression types that are intentionally excluded

### Phase 3: Export (Story 5)

**Goal**: Enable code generation export via rosetta-code-generators.

**3a. CLI Generate Command**

1. Research rosetta-code-generators CLI interface and available generators
2. Create `generate.ts` command in packages/cli:
   - Parse input .rosetta files using existing parse API
   - Serialize to .rosetta text
   - Invoke rosetta-code-generators via subprocess
   - Capture output files and errors
3. Add `--list-languages` flag to enumerate available generators
4. Test with CDM model → Java output (verify compilation)

**3b. Studio Export UI**

1. Create `codegen-service.ts` — HTTP client to code generation service
2. Create `ExportDialog.tsx` — language selector, progress, preview, download
3. Integrate with existing `export.ts` download helpers
4. Wire into Studio toolbar/menu

## Complexity Tracking

> No constitution violations requiring justification.

| Decision | Rationale |
|----------|-----------|
| isomorphic-git over GitHub API | Works with any public git host, not GitHub-specific |
| IndexedDB over localStorage | localStorage has 5-10MB limit; CDM model is larger |
| Subprocess for code generation | rosetta-code-generators is Java; no TypeScript port exists |
| Form migration over full scaffold | z2f CLI doesn't support auto-save mode; hand-migration is proven pattern |
