# Enhancement: Rune DSL Integration — Four Required Additions

**Package**: `langium-zod`
**Requested by**: [`rune-langium`](https://github.com/pradeepmouli/rune-langium) spec 005
**Date**: 2026-02-27

---

## Summary

Four additions are required to make `langium-zod` a complete, drop-in schema generator for the Rune DSL visual editor:

1. **Bug fix** — `z.array().min(1)` for `+` cardinality rules (currently dropped silently)
2. **Enhancement** — expose `--include` / `--exclude` as CLI flags (already in programmatic API, not wired to CLI)
3. **New feature** — `--projection` / `--strip-internals` for form-surface schemas (pick specific fields, strip Langium internals)
4. **New feature** — `--conformance` for compile-time type-assignability assertions against `ast.ts`

All four changes are independent and can be shipped in any order.

---

## Change 1 — `z.array().min(1)` for `+` cardinality

### Problem

Both `rule*` (zero-or-more) and `rule+` (one-or-more) use the `+=` assignment operator in Langium grammar. `langium-zod` currently emits `z.array(schema)` for both, losing the minimum-length constraint for `+` cardinality rules.

```langium
// Both produce z.array(…) today — the min(1) for the + rule is lost
enumValues+=RosettaEnumValue+    // should be z.array(RosettaEnumValueSchema).min(1)
attributes+=Attribute*            // z.array(AttributeSchema) ✓ correct
```

### Root cause

`ruleCall.cardinality` in the Langium `GrammarAST` distinguishes `'+'` from `'*'`. The extractor / type-mapper doesn't read this value when building property descriptors, so no `minItems` information reaches the generator.

### Required change

- In `extractor.ts` or `type-mapper.ts`: when processing a `+=` assignment, check `ruleCall.cardinality`; if it equals `'+'`, set `minItems: 1` on the property descriptor.
- In `generator.ts`: when emitting an array type, if `minItems` is defined, append `.min(${minItems})` to the `z.array(…)` call.

### Acceptance criteria

- `enumValues+=RosettaEnumValue+` → `z.array(RosettaEnumValueSchema).min(1)`
- `attributes+=Attribute*` → `z.array(AttributeSchema)` (no `.min`)
- `items+=Item` (no repetition marker) → `z.array(ItemSchema)` (no `.min`)

---

## Change 2 — CLI `--include` / `--exclude` flags

### Problem

`ZodGeneratorConfig.include` and `ZodGeneratorConfig.exclude` work in the programmatic API, but `cli.ts` doesn't expose them. Users must create a `langium-zod.config.js` just to filter types.

### Required change

Add to `cli.ts`:

```
--include <types>   Comma-separated list of type names to include
--exclude <types>   Comma-separated list of type names to exclude
```

Parse the comma-separated string into `string[]` and pass to `generateZodSchemas()`. CLI flags take precedence over config file values.

### Acceptance criteria

- `--include Data,Attribute` → only `DataSchema` and `AttributeSchema` in output
- `--exclude Condition` → all schemas except `ConditionSchema`
- Unknown type name → CLI warns with list of available types (non-fatal)
- Both `--include` and config file `include` present → CLI wins

---

## Change 3 — Projection / form-surface mode

### Problem

AST schemas include Langium-internal fields (`$container`, `$cstNode`, `$document`, etc.) and may include more fields than a form needs. Form libraries (`react-hook-form + zodResolver`) need schemas that reflect only the user-editable fields.

### Required change

New `--projection <file>` and `--strip-internals` CLI options.

**`--strip-internals`** (no config file required): removes the five Langium internal fields from every schema:

```
$container  $containerProperty  $containerIndex  $document  $cstNode
```

**`--projection <file>`**: loads a JSON config file that specifies which fields to keep per type:

```json
{
  "defaults": {
    "strip": ["$container", "$document", "$cstNode", "$containerProperty", "$containerIndex"]
  },
  "types": {
    "Data": { "fields": ["name", "superType", "description", "conditions", "attributes"] },
    "RosettaEnumeration": { "fields": ["name", "description", "enumValues"] }
  }
}
```

Types not listed in `types` have only the default strip applied (all grammar-defined fields are kept).

### Files to add / change

| File | Change |
|---|---|
| `projection.ts` (new) | `ProjectionConfig` type, `loadProjection()`, `applyProjection()` |
| `generator.ts` | Accept optional `ProjectionConfig`; filter fields before emitting `z.object({…})` |
| `api.ts` | Add `projection?: ProjectionConfig` to `ZodGeneratorConfig` |
| `cli.ts` | Add `--projection <file>` and `--strip-internals` flags |

### Acceptance criteria

- `--strip-internals` removes all five internal fields from every schema; all grammar-defined fields remain
- `--projection` with `Data.fields = [name, superType]` → `DataSchema` has only `name`, `superType`, and `$type` literal
- Unknown field in projection config → warn and skip (non-fatal)
- Type not listed in `types` → defaults strip applied, all grammar fields kept
- Works with `--include` / `--exclude` (projection applied after filtering)

---

## Change 4 — Conformance check generation

### Problem

As the grammar evolves, generated Zod schemas can silently drift from the Langium-generated `ast.ts` types. There is no automated way to detect this drift.

### Required change

New `--conformance --ast-types <path>` flags that generate a `.conformance.ts` file alongside the main schema output.

**Generated file format:**

```typescript
// zod-schemas.conformance.ts — auto-generated, do not edit
import type { Data, Attribute } from './ast.js';
import { DataSchema, AttributeSchema } from './zod-schemas.js';
import { z } from 'zod';

type _Internals = '$container' | '$containerProperty' | '$containerIndex' | '$document' | '$cstNode';

type _DataSurface  = Omit<Data, _Internals>;
type _DataInferred = z.infer<typeof DataSchema>;
type _DataFwd = _DataInferred extends _DataSurface ? true : never;
type _DataRev = _DataSurface  extends _DataInferred ? true : never;
// … one block per schema
```

If `_DataFwd` or `_DataRev` resolves to `never`, TypeScript reports a type error at that line.

### CLI interface

```bash
langium-zod generate --conformance --ast-types src/generated/ast.ts
langium-zod generate --conformance --ast-types src/generated/ast.ts --conformance-out src/generated/zod-schemas.conformance.ts
```

### Files to add / change

| File | Change |
|---|---|
| `conformance.ts` (new) | `generateConformanceFile(schemaNames, astTypesPath, strippedFields): string` |
| `api.ts` | Add `conformance?: { astTypesPath: string; outputPath?: string }` to `ZodGeneratorConfig` |
| `cli.ts` | Add `--conformance` and `--conformance-out <path>` flags; require `--ast-types` when `--conformance` is set |

### Acceptance criteria

- Generates `.conformance.ts` alongside main schema file when `--conformance` is set
- Valid grammar → `tsc --noEmit` on conformance file passes with zero errors
- Grammar field added, schemas regenerated, conformance NOT regenerated → `tsc --noEmit` fails at the `_XxxFwd`/`_XxxRev` line for the affected type
- `--conformance` without `--ast-types` → CLI exits with a clear error
- Type in schema with no matching export in `ast.ts` → warn and skip (non-fatal)
- Respects `--strip-internals` / `--projection` strip list in the `Omit<>` surface type

---

## Priority

| # | Change | Priority | Notes |
|---|---|---|---|
| 1 | `z.array().min(1)` cardinality bug | **P0** | Correctness — ship first |
| 2 | CLI `--include` / `--exclude` | **P1** | Low effort, unblocks ergonomics |
| 3 | Projection mode | **P1** | Blocks form-schema integration in `rune-langium` |
| 4 | Conformance checks | **P2** | Safety net; not blocking initial integration |

## Out of scope

- `Reference<T>` runtime resolution
- Fragment rule inlining
- Zod v3 support
- Schema generation for non-Langium types
