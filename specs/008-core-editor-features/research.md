# Research: Core Editor Features

**Branch**: `008-core-editor-features` | **Date**: 2026-03-12

## R1: Expression Builder Completeness

**Decision**: Expression builder adapter code covers 51/51 expression types, but the UI is NOT rendering interactive blocks — users see only source text of expressions. Story 4 requires debugging the rendering pipeline before corpus validation.

**Rationale**: Audit of `ast-to-expression-node.ts` confirms 51 expression types are handled with explicit switch cases. The KNOWN_TYPES set covers all binary ops (8), unary/postfix ops (20+), navigation (2), lambdas (7), control flow (2), constructors/references (4), literals (4), and collections (1). Block components exist in `expression-builder/`. However, **the UI does not render interactive blocks** — the expression builder shows raw source text instead. This indicates the rendering pipeline (FunctionForm → expression display → block components) is not correctly wired: either the ExpressionNode conversion is skipped, or the block rendering falls back to a text display mode.

Only 4 types are excluded: `RosettaMapTestExistsExpression`, `RosettaMapTestAbsentExpression`, `RosettaMapTestEqualityOperation`, and `RosettaAttributeReference` — all belong to map-testing contexts, not the main expression language.

**Alternatives considered**: Building additional blocks for map-test expressions — rejected because they belong to a different DSL construct (mapping rules) not used in function bodies or conditions.

**Impact on spec**: FR-016 through FR-021 adapter code exists but UI rendering is broken. Story 4 requires: (1) diagnose and fix the rendering pipeline, (2) then corpus round-trip validation testing.

## R2: zod-to-form Migration State

**Decision**: Incremental migration — migrate ChoiceForm, DataTypeForm, and FunctionForm using the same pattern as the completed EnumForm migration.

**Rationale**: EnumForm successfully migrated from `useNodeForm` to `useZodForm` with backward-compatible props. Infrastructure is in place: `form-surfaces.json` projections configured for all 5 types, Zod schemas generated with cross-ref factories, `ExternalDataSync` component handles undo/redo, CLI commands operational.

**What's done**:
- Schema generation pipeline (langium-zod → zod-schemas.ts) ✅
- form-surfaces.json projections for Enum, Data, Attribute, Function, Choice ✅
- z2f.config.ts component mappings (TypeSelector, CardinalitySelector) ✅
- EnumForm migration to useZodForm ✅
- ExternalDataSync for external model updates ✅
- CI check-generated job ✅

**What's remaining**:
- ChoiceForm migration (hand-coded, uses useNodeForm)
- DataTypeForm migration (hand-coded, uses useNodeForm)
- FunctionForm migration (hand-coded, uses useNodeForm) — most complex due to conditions/expressions
- component-config.ts for compile-time widget validation
- T038 manual smoke test for EnumForm

**Alternatives considered**: Full scaffold generation via z2f CLI — rejected because z2f CLI v0.2.3 doesn't support `--mode auto-save`; forms are hand-authored following the useZodForm pattern instead.

## R3: Browser Git and Caching Infrastructure

**Decision**: Use isomorphic-git for browser-based git operations with IndexedDB (via idb) for model caching.

**Rationale**: The editor is browser-only with no backend. isomorphic-git is the only mature browser-compatible git client. It supports shallow clones, sparse checkout, and works with any HTTP-accessible public repo. IndexedDB provides persistent browser storage suitable for caching 1000+ parsed model files across sessions.

**Current state**: Zero git/storage infrastructure exists. File loading is drag-and-drop only via FileLoader.tsx. All workspace state is in-memory (lost on refresh). No model registry.

**What must be built**:
1. Git fetch service using isomorphic-git with `http` backend
2. .rosetta file discovery from cloned repo tree
3. Model registry (curated list: CDM, FpML with URLs/tags)
4. IndexedDB cache layer for parsed models with version tracking
5. ModelLoader UI component (similar to existing FileLoader)
6. Progress reporting with cancellation support
7. Offline fallback to cached models

**Alternatives considered**:
- GitHub API (REST) for file listing + raw content fetch — rejected because it's GitHub-specific and rate-limited
- Service worker with Cache API — rejected because it's designed for HTTP responses, not structured data
- OPFS (Origin Private File System) — viable alternative to IndexedDB for file storage but less mature browser support

## R4: Rosetta Code Generators Integration

**Decision**: Subprocess-based CLI integration for MVP; service endpoint for Studio UI in Phase 3.

**Rationale**: rosetta-code-generators is a Java/Maven project. No WASM or TypeScript port exists. The simplest integration is invoking the Java codegen as a subprocess from the CLI package, passing serialized .rosetta text as input. For the browser-based Studio, a lightweight HTTP service wrapper around the Java codegen would be needed.

**Current infrastructure**:
- CLI framework (Commander.js) ready for new `generate` command
- `serializeModel()` API can produce .rosetta text output
- `downloadFile()` / `downloadRosettaFiles()` in Studio for browser downloads
- LSP server with WebSocket transport could be extended with custom handlers

**Integration approach**:
1. CLI: `rune-dsl generate --language java --input <files> --output <dir>` — spawns Java codegen subprocess
2. Studio: POST to code generation service → receive generated files → download as zip
3. Input format: serialized .rosetta text (what rosetta-code-generators expects)

**Alternatives considered**:
- GraalVM native-image — would remove JVM dependency but complex build pipeline
- Rewriting codegen in TypeScript — massive effort, duplicates existing work
- Docker container — adds deployment complexity for a CLI tool

**Open question**: Exact CLI interface and available generators from rosetta-code-generators need verification against the actual project. Assumed: Java, Python, Scala, C# generators available.
