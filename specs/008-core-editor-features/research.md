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

**Decision**: Java subprocess wrapper for CLI; HTTP service endpoint for Studio UI.

**Rationale**: rosetta-code-generators (REGnosys/rosetta-code-generators) is a Java/Maven multi-module framework — NOT a standalone CLI tool. It provides `AbstractExternalGenerator` as a base class for language-specific generators. Available generators: DAML, Scala, TypeScript, C#, Go, Kotlin (plus Java built into finos/rune-dsl). The codebase is 71% Xtend, 19.5% C#, 9.5% Java. Requires Java 21+.

**Key finding**: There is no runnable JAR, no CLI interface, and no standalone executable. Code generation is invoked programmatically by subclassing `AbstractExternalGenerator`. Integration requires building a custom Maven wrapper project that:
1. Depends on `com.regnosys.rosetta.code-generators` Maven artifacts
2. Loads requested generator modules
3. Accepts .rosetta files as input (directory or stdin)
4. Writes generated output to a directory
5. Packages as a fat JAR for `java -jar` invocation

**Current infrastructure**:
- CLI framework (Commander.js) ready for new `generate` command
- `serializeModel()` API can produce .rosetta text output
- `downloadFile()` / `downloadRosettaFiles()` in Studio for browser downloads
- LSP server with WebSocket transport could be extended with custom handlers

**Integration approach**:
1. CLI: `rune-dsl generate --language java --input <files> --output <dir>` — validates input, writes .rosetta files to temp dir, spawns `java -jar <codegen-jar>` subprocess, captures output
2. Studio: POST to code generation HTTP service → receive generated files → preview + download as zip
3. Codegen JAR path configurable via `--codegen-jar` flag or `RUNE_CODEGEN_JAR` env var
4. Input format: .rosetta file directory (what rosetta-code-generators expects via Ecore parsing)

**Available generators** (from rosetta-code-generators repo):
- `daml` — DAML (Digital Asset)
- `scala` — Scala
- `typescript` — TypeScript
- `c-sharp` — C# (8.0 and 9.0)
- `golang` — Go
- `kotlin` — Kotlin
- `java` — Java (built into finos/rune-dsl, not in rosetta-code-generators)
- `json-schema` — JSON Schema
- `csv` — CSV
- `excel` — Excel

**Alternatives considered**:
- GraalVM native-image — would remove JVM dependency but complex build pipeline
- Rewriting codegen in TypeScript — massive effort, duplicates existing work; viable long-term
- Docker container — adds deployment complexity for a CLI tool
- Direct Maven invocation — too heavy; requires Maven installation on user machine
