# ADR 007: Lazy Reference Resolution for Large Models

## Status

Proposed

## Context

Loading the CDM corpus (141 `.rosetta` files, ~4000 types) into Studio currently requires a full parse + link cycle for all documents before the workspace is interactive. The parser worker calls:

```typescript
await builder.build(documents, { validation: false });
```

This runs the complete Langium build pipeline through `DocumentState.Linked` (phase 4) for every document — parsing, indexing, scope computation, AND eager cross-reference resolution across all 141 files. Even with the pre-parsed serialized artifact (which skips the parsing phase via `JsonSerializer.deserialize()`), the linking phase still processes every cross-reference in every document up front.

For CDM, this means resolving thousands of cross-references across files like `cdm.product.template.TradableProduct → cdm.base.staticdata.party.Party → cdm.base.staticdata.identifier.Identifier → ...` — a transitive closure that touches most of the 141 files.

This creates a noticeable delay between clicking "CDM" on the start page and reaching an interactive workspace.

## Decision

Use Langium's built-in lazy reference resolution instead of eager linking at startup. The Langium `DocumentBuilder.build()` API supports this via the `eagerLinking` option:

> `eagerLinking?: boolean` — If set to `false`, references can still be resolved — that's done lazily when you access the `ref` property of a reference. But you won't get any diagnostics for linking errors and the references won't be considered when updating other documents.

### Three-phase loading strategy

**Phase 1 — Fast startup (all documents):**
```typescript
await builder.build(documents, { validation: false, eagerLinking: false });
```
This runs through `DocumentState.ComputedScopes` (phase 3) for all files:
- Parse the source text (or deserialize from the pre-parsed artifact)
- Index exported symbols into the global scope
- Compute local scopes for each document

After this phase, the workspace is interactive: the explorer shows all types, the graph renders nodes, and references resolve lazily when accessed (e.g., when a user clicks a type and the inspector reads its attributes' type references).

**Phase 2 — Active document linking (on demand):**
When the user opens or selects a specific file for editing, build that single document to `Linked` state:
```typescript
await builder.build([activeDocument], { validation: false, eagerLinking: true });
```
This resolves all outgoing references from the active file — enabling features like "go to definition", reference highlighting, and accurate diagnostics for the file being edited.

**Phase 3 — Background validation (deferred):**
Optionally, run validation on the active document or a batch of recently accessed documents in an idle callback:
```typescript
await builder.build([activeDocument], { validation: true });
```

### What changes

| Component | Current | Proposed |
|-----------|---------|----------|
| Parser worker `handleParseWorkspace` | `build(docs, { validation: false })` | `build(docs, { validation: false, eagerLinking: false })` |
| Parser worker on file select | N/A | `build([doc], { validation: false, eagerLinking: true })` |
| Graph node data | Reads `.ref` immediately | Reads `.ref` lazily (same API, Langium resolves on access) |
| Explorer | Populated after full build | Populated after Phase 1 (indexes + scopes only) |
| Diagnostics | None (validation already disabled) | Same — validation stays off until Phase 3 |
| LSP worker | Separate process, unaffected | Unaffected — LSP manages its own document lifecycle |

### What stays the same

- The `JsonSerializer.deserialize()` path for pre-parsed artifacts — it still skips parsing
- The graph adapter reading AST node data — `.ref` access is already lazy in Langium after `ComputedScopes`
- The LSP worker — it has its own Langium instance and manages its own document states
- The codegen worker — it re-parses from the source text it receives, unaffected

## Consequences

### Positive

- **Faster startup**: Phase 1 (parse + index + scope) is significantly cheaper than full linking. For CDM with the serialized artifact, Phase 1 should complete in under 1 second (deserialize + index + scope, no cross-reference resolution).
- **Progressive interactivity**: Users see the type graph and explorer immediately. Reference details resolve as they navigate.
- **No API changes**: Langium's lazy resolution is transparent — accessing `.ref` on a `Reference` object triggers resolution automatically. Consumer code doesn't change.
- **Matches LSP behavior**: Language servers already use incremental/lazy approaches. The embedded LSP worker manages its own build lifecycle independently.

### Negative

- **First access latency**: The first time a user accesses a reference that hasn't been resolved (e.g., clicking a type to see its members' type references), there may be a brief delay while Langium resolves the chain.
- **Diagnostics delay**: Linking errors (unresolved references) won't be reported until the user opens the file for editing (Phase 2). The Problems panel may show fewer issues initially.
- **Complexity**: The parser worker needs a new message type (`linkDocument`) to trigger Phase 2 for a specific file. The existing `parse` and `parseWorkspace` messages aren't sufficient.

### Risks

- **Stale graph data**: If the graph adapter reads `.ref` on an attribute's type reference and it hasn't been resolved yet, it gets `undefined`. The graph already handles undefined refs (renders the type name from `$refText` instead). But the adapter should be audited to confirm no code path assumes `.ref` is always populated after `parseWorkspace`.
- **Z2F form rendering**: The inspector forms read type references to populate dropdowns. If a referenced type hasn't been resolved, the form may show a stale or empty value until the reference resolves. This needs testing with CDM-scale data.

## Alternatives Considered

### 1. Keep eager linking (status quo)
Pros: Simple, deterministic. Cons: Slow startup for large models, can't improve without reducing corpus size.

### 2. Background eager linking
Run `build(docs, { eagerLinking: true })` in a background thread after the UI renders. Pros: UI appears fast. Cons: Still pays the full linking cost; memory pressure from holding two states; complex synchronization.

### 3. Incremental indexing (only index changed files)
Use `builder.update(changed, deleted)` to re-index only modified files. Pros: Fast updates after initial load. Cons: Still needs the initial full load; doesn't help cold-start performance.

### 4. Virtual file system with on-demand loading
Load only the files the user navigates to, fetching others from the serialized artifact on demand. Pros: Minimal memory footprint. Cons: Langium's workspace model expects all documents to be registered; significant refactoring required.

**Decision: Option 1 (lazy references) with Phase 2 on-demand linking is the best cost/benefit tradeoff. It uses Langium's built-in capability, requires minimal code changes, and delivers the biggest perceived performance win.**

## Impact on Downstream Consumers

### Codegen (TypeScript, Zod, JSON Schema)

The codegen worker (`apps/studio/src/workers/codegen-worker.ts`) receives source text via `codegen:setFiles` and re-parses it internally using its own Langium instance. It does NOT consume the parser worker's AST. Therefore:

- **No impact on codegen correctness** — the codegen worker always builds its own fully-linked workspace before generating output.
- **Codegen timing** — currently triggered on every parse cycle via `codegen:setFiles`. With lazy loading, Phase 1 still sends files to the codegen worker. The worker's internal `builder.build()` still does full linking. This means codegen is not faster, but it's also not broken.
- **Optimization opportunity** — the codegen worker could also adopt lazy linking and only generate code for the selected type on demand. But this is a separate concern.

### Form Preview

The form preview (`FormPreviewPanel`) renders from `FormPreviewSchema` objects generated by `preview-schema.ts` in the codegen package. These schemas are generated from the parsed AST.

- **Schema generation** runs in the codegen worker (same internal Langium instance), so references are already resolved there. No impact.
- **The preview store** receives schemas via worker messages. It doesn't read `.ref` directly. No impact.
- **Form field rendering** uses the generated schema's `kind`, `label`, `enumValues` etc. — all pre-resolved during generation. No impact.

### Code Preview

The code preview panel renders generated code from the codegen worker. Same path as codegen above — no impact.

### Inspector (EditorFormPanel)

The inspector reads the selected node's AST data directly (not from codegen). It accesses:

- `data.attributes[].typeCall.type.ref` — to show the referenced type name
- `data.superType.ref` — to show inheritance
- `data.conditions[].expression` — condition expressions

With lazy resolution, these `.ref` accesses will trigger on-demand resolution at `ComputedScopes` state. This is Langium's designed behavior — the ref resolves transparently. However:

- **First-access latency**: The first time the inspector renders a CDM type with many cross-references, there may be a brief delay while Langium resolves the chain. This should be sub-100ms for a single type's references.
- **Fallback display**: If `.ref` returns `undefined` (unresolvable reference), the UI already falls back to `$refText` (the text used in the source). This is the same behavior as today for unresolved references.

### Graph Adapter (ast-to-model.ts)

The graph adapter converts Langium AST nodes into the graph's `TypeGraphNode` shape. It reads `.ref` on attribute type references to determine edge targets.

- With lazy resolution, edges to unresolved types will show as missing until the reference is accessed and resolved.
- **Mitigation**: The graph adapter should trigger resolution for visible nodes by accessing `.ref` during the adapter pass. Since the adapter runs after Phase 1 (which has computed scopes), this will cause lazy resolution for the visible subset only — much cheaper than resolving the entire corpus.

### LSP Worker

The embedded LSP worker has its own Langium services instance and manages its own document lifecycle. It is completely independent of the parser worker. No impact.

## Implementation Notes

1. Change `handleParseWorkspace` in `parser-worker.ts` to pass `eagerLinking: false`
2. Add a `linkDocument` message handler that builds a single document with `eagerLinking: true`
3. Wire `linkDocument` to fire when the user selects a type in the graph/explorer (via EditorPage)
4. Audit the graph adapter (`ast-to-model.ts`) for assumptions about resolved references
5. Test with CDM corpus: measure Phase 1 time vs. current full-build time
6. Consider a loading indicator ("Resolving references...") for Phase 2 if it's noticeable
