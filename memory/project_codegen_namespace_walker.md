---
name: Codegen namespace walker
description: Codegen now shares namespace walking and graph preparation across targets via NamespaceWalkResult
type: project
---

`packages/codegen/src/emit/namespace-walker.ts` is the shared codegen normalization layer.

**Architecture:**
- `walkNamespace(docs, namespace)` collects the namespace's data types, enums, type aliases, rules, annotations, and external functions.
- The walker also builds the type reference graph, computes `emitOrder`, and records `cyclicTypes`.
- `NamespaceWalkResult` is treated as readonly shared input. Emitters create their own diagnostics/source-map state instead of mutating the walk result.
- `getTargetRelativePath(namespace, target)` centralizes `.zod.ts`, `.ts`, and `.schema.json` relative path generation.

**Emission split:**
- `packages/codegen/src/generator.ts` groups documents by namespace, builds the cross-namespace registry once, walks each namespace once, and dispatches the walk result to the selected emitter.
- `zod-emitter.ts`, `json-schema-emitter.ts`, and `ts-emitter.ts` now focus on target-specific output only.
- TypeScript-only func extraction remains in `ts-emitter.ts` so Zod/JSON Schema generation does not inherit func diagnostics or extra behavior.
