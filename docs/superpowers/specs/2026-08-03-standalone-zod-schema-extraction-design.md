# Standalone Zod Schema Extraction Design

**Goal:** Add a codegen-package function that produces one target type's real, generated Zod schema as a single self-contained script, free of *cross-namespace* imports (a genuine `import { z } from 'zod';` header line remains, and the output is real TypeScript requiring a caller-side type-erasure pass before evaluation) — the missing prerequisite for retiring `apps/studio/src/services/preview-validator.ts`'s hand-rolled structural validator/renderer in favor of the actual generated schema.

**Architecture:** Compute the transitive closure of every type a target depends on (same- and cross-namespace), assemble a synthetic single-namespace view over those real AST nodes, and run the existing, unmodified `emitNamespace()` (zod target) against it. Zero changes to `zod-emitter.ts` itself.

**Tech Stack:** TypeScript, Langium, the existing `packages/codegen` emitter/graph infrastructure (`type-ref-resolver.ts`, `cycle-detector.ts`, `namespace-walker.ts`).

## Background

`apps/studio/src/services/preview-validator.ts` is the file this repo's CLAUDE.md documents as the incident that established its "never build a parallel implementation" rule: a hand-rolled Zod validator built to approximate the real generated Zod schema's semantics, which drifted from that real behavior across five separate bot-review rounds on PR #391 (`.strict()` handling, optional-array handling, choice exactly-one-arm, required-arm-payload, nested choice arms).

Separately, `apps/studio/src/workers/codegen-worker.ts`'s `validateInstance` already evaluates the *real* generated condition-predicate expressions at runtime, via a hardened `new Function()` sandbox (`runInWorkerSandbox`) shared with real `func` execution — proving dynamic evaluation of generated output is both already accepted in this codebase and already isolated appropriately. Only the *structural* half of Form Preview's validation (and its form rendering) still goes through hand-rolled approximations.

The original `specs/016-studio-form-preview` feature explicitly required "z2f-derived" schema behavior and rejected inventing "a parallel schema-mapping path," but that intent was never actually wired up — the shipped implementation has zero trace of it. The long-term direction (confirmed with the project owner) is for Form Preview and Prototype Workspace's instance-editing UI to use `@zod-to-form`'s `useZodForm` hook against the *real* generated schema, replacing both the hand-rolled renderer and the hand-rolled validator, not just patching the validator's semantics again.

`useZodForm` needs a live Zod schema object, which existing per-namespace `zod-emitter.ts` output can't provide directly for one arbitrary type on its own — the real per-namespace `.zod.ts` file is one file per namespace, with real ES `import` statements for cross-namespace types, which don't resolve inside a `new Function()`-evaluated script (no module loader there).

## Scope

This design covers **only** the codegen-package extraction primitive: given a target type, produce its real Zod schema as one flat, dependency-complete, import-free script. It is deliberately scoped as its own sub-project, decomposed from the larger "replace `preview-validator.ts`" effort, because:

- It has a clean, testable boundary (`documents` + `targetId` in, `{code, diagnostics}` out) independent of any consumer.
- It's needed regardless of how the consuming side resolves its own open question (see Non-Goals) about *where* the resulting script gets evaluated (worker vs. main thread) — that's a Studio-side architectural decision for a separate design, once this primitive actually exists and its real output shape is known.

### Non-Goals

- Studio-side consumption: wiring `codegen-worker.ts`, `preview-store.ts`, or `FormPreviewPanel.tsx` to call this function.
- Where the generated script gets evaluated (worker `new Function()` sandbox vs. main-thread, needed because `useZodForm` is a React hook requiring a live schema object, which can't cross a `postMessage` structured-clone boundary). This is a real open architectural question, explicitly deferred to the Studio-side sub-project's own design.
- The `@zod-to-form` integration itself (`useZodForm` wiring, form-control rendering, retiring `FormPreviewPanel.tsx`'s hand-rolled rendering).
- Retiring `preview-validator.ts` or any of its exports (`buildDefaultValue`/`buildDefaultValues`/etc. are default-value synthesis for the UI, not validation duplication, and are expected to survive unchanged regardless of how validation itself is resolved).
- Caching/performance strategy for repeated extraction calls (a Studio-side concern, analogous to `codegen-worker.ts`'s existing `cachedFuncCode` pattern).

## Architecture

### New module & signature

`packages/codegen/src/emit/standalone-schema.ts`, exporting:

```ts
function emitStandaloneZodSchema(
  documents: LangiumDocument[],
  targetId: string
): { code: string; diagnostics: GeneratorDiagnostic[] }
```

`targetId` matches `preview-schema.ts`'s existing `${namespace}.${typeName}` convention (`generatePreviewSchemas`'s own `options.targetId`). `documents` is whatever multi-namespace document set the caller has already loaded — in Studio's case, exactly what `codegen-worker.ts`'s existing `buildDocuments()` already produces for `generatePreviewSchemas`/`generate` calls today.

The return shape deliberately mirrors `GeneratorOutput` minus the fields that don't apply to a synthetic, unwritten "file" (`relativePath`, `sourceMap`, `funcs`) — callers already familiar with `GeneratorOutput` from `generate()` shouldn't need to learn a new shape.

The runtime helper bundle (`runeCheckOneOf`, `runeExtendChoice`, etc.) required to *execute* the returned `code` is **not** part of this return value — it's already separately exported as `RUNTIME_HELPER_JS_SOURCE` from `@rune-langium/codegen/export`, and callers prepend it themselves exactly as `codegen-worker.ts`'s `executeFunction` already does for generated `func` bodies.

### Closure computation

`buildTypeReferenceGraph` (the graph `preview-schema.ts` already builds for whole-graph cycle detection) turns out to be the wrong tool for discovering the closure itself: it only walks `Data`/`Choice` nodes and their `extends`/attribute-type edges, and an edge is only added when the attribute's resolved `.ref` is directly a `Data` or `Choice` — it never chases through a `RosettaTypeAlias`, and never includes `RosettaEnumeration`/`RosettaTypeAlias` as graph nodes at all. Using it as-is for closure discovery would silently miss every alias-typed dependency and every Enum.

Closure discovery is instead a small reachability walk (BFS from the target node) that calls `resolveTypeCallTarget` on every attribute/choice-option `typeCall` — since that resolver already transparently chases alias chains and reports only the terminal `Data`/`Enum`/`Choice`, the walker never needs its own alias-aware logic. `Data.superType` is walked directly (not through `resolveTypeCallTarget`) since it's grammar-typed as a direct `Data`/`Choice` reference, never an alias.

`findCyclicTypes`/`topoSort` are reused for their original purpose: computing a correct emit order and cycle set once discovery is complete. `buildTypeReferenceGraph` itself, however, turned out NOT to be reusable even for this narrower purpose — implementation found it alias-blind for edge-building too (an attribute typed via a `RosettaTypeAlias` produces no graph edge, since the alias node is neither `Data` nor `Choice`, silently corrupting emit order and producing real `ReferenceError`s at `new Function()` eval time from `const` declarations emitted out of order). The actual implementation uses a small local graph builder that walks the closure's own `Data`/`Choice` members via `resolveTypeCallTarget` (the same mechanism closure discovery uses) instead, feeding its output into the unmodified `findCyclicTypes`/`topoSort`.

### Synthetic namespace assembly

The closure's real `Data`/`Choice`/`RosettaEnumeration`/`RosettaTypeAlias` AST nodes — regardless of which namespace they actually belong to — get indexed into one synthetic `NamespaceWalkResult`-shaped object (`dataByName`/`choiceByName`/`enumByName`/`typeAliasByName`, keyed by bare name), then handed to the existing, completely unmodified `emitNamespace()` (zod target).

This does NOT fully eliminate cross-namespace `import` lines on its own, contrary to this design's original expectation: `zod-emitter.ts`'s `collectCrossNamespaceImports` decides whether to emit an import by comparing each referenced node's REAL AST-derived namespace against the synthetic model's `namespace` label — since a real node's namespace can never equal the synthetic label, every cross-namespace-originating symbol in the closure still triggers a (here, always wrong) import line. Rather than threading a "local" concept through `zod-emitter.ts` (out of scope — this design's whole premise is reusing that file unmodified), the implementation strips these lines post-hoc, matching `collectCrossNamespaceImports`'s own exact, deterministic output shape. This is safe by construction: `collectCrossNamespaceImports` and closure discovery both resolve the same reference categories (attribute types, choice options, alias-declaration RHS, `superType` chains — including the multi-level Data-extends-Choice fold) via the same `resolveTypeCallTarget` mechanism, so any symbol the former would flag as needing an import is one the latter has already added to the closure and declared locally in the same script.

Bare-name keying assumes global name uniqueness across the closure, matching the same assumption `base-namespace-emitter.ts`'s existing `buildCrossNsImportLines` already relies on for today's real per-namespace cross-namespace imports (`imports: Map<string, Set<string>>`, keyed by symbol name, not namespace-qualified) — this design does not introduce a new assumption, it inherits an existing one. If that assumption is ever revisited repo-wide, this function inherits the fix for free by construction (it delegates entirely to `emitNamespace()`'s own resolution logic).

Every type-resolution fix from the `unified-type-reference-resolution` branch (`RosettaTypeAlias` chasing, `RosettaRecordType` handling, Choice handling) applies here automatically, since `emitNamespace()` runs unmodified.

### Error handling

Unresolved-reference diagnostics flow through exactly as `emitNamespace()` already produces them (`GeneratorDiagnostic[]`, returned as-is) — no new diagnostic model. The one new error case this function must handle explicitly: `targetId` not found in any loaded document. Consistent with the rest of the codegen package's diagnostic-based (not exception-based) error convention, this returns `{ code: '', diagnostics: [{ severity: 'error', ... }] }` rather than throwing — mirrors the existing "Unknown type" handling `codegen-worker.ts`'s `validateInstance` already does for `generatePreviewSchemas`.

## Testing

Fixture-driven tests in `packages/codegen/test/emit/standalone-schema.test.ts` asserting:

- The output string contains no *cross-namespace* `import` statements, for a target with real cross-namespace dependencies — the genuine `import { z } from 'zod';` header line is expected and still present.
- The script genuinely evaluates via `new Function()` + `RUNTIME_HELPER_JS_SOURCE`, in a Node-side test harness — proving real runtime correctness (a schema object that actually parses/rejects sample data), not just string shape. Since the output is real TypeScript (types, `export`, cyclic-type `interface` predeclarations), the test harness first runs a TS-erasure pass (`ts.transpileModule`), matching `codegen-worker.ts`'s existing `stripTypeAnnotations`-before-eval precedent for generated `func` bodies — this erasure is the caller's responsibility, not something `emitStandaloneZodSchema` does itself.
- A cross-namespace alias-to-Data dependency case specifically (the exact defect class the `unified-type-reference-resolution` branch just fixed) — a real `.safeParse()` call against both valid and invalid sample data.
- A target with no dependencies at all (single scalar-only Data type) — the trivial/degenerate case.
- Diagnostics for a genuinely unresolvable reference within the closure, and for an unknown `targetId`.

## Relationship to Prototype Workspace

`PrototypePerspective.tsx` embeds `FormPreviewPanel` directly for its instance-editing UI, going through the identical `preview-store.ts` → `codegen-worker.ts` → `preview-validator.ts` chain Form Preview uses. Whatever the Studio-side sub-project eventually builds on top of this extraction primitive, Prototype Workspace inherits it automatically — no separate integration work, consistent with how the `unified-type-reference-resolution` fix carried over to both surfaces without any Prototype-specific changes.
