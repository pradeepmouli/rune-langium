# Enhancement: Rune DSL Integration — Five Required Additions

**Package**: `langium-zod`
**Requested by**: [`rune-langium`](https://github.com/pradeepmouli/rune-langium) spec 005
**Date**: 2026-02-27

---

## Summary

Five additions are required to make `langium-zod` a complete, drop-in schema generator for the Rune DSL visual editor:

1. **Bug fix** — `z.array().min(1)` for `+` cardinality rules (currently dropped silently)
2. **Enhancement** — expose `--include` / `--exclude` as CLI flags (already in programmatic API, not wired to CLI)
3. **New feature** — `--projection` / `--strip-internals` for form-surface schemas (pick specific fields, strip Langium internals)
4. **New feature** — `--conformance` for compile-time type-assignability assertions against `ast.ts`
5. **New feature** — `--cross-ref-validation` for runtime cross-reference validation against live AST node collections

All five changes are independent and can be shipped in any order.

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

---

## Change 5 — Cross-reference runtime validation

### Problem

Cross-references in Langium grammar (e.g. `superType=[Data]`) are currently emitted as plain `z.string()`. At runtime there is no way to know whether the ref text resolves to an actual node in the model — a form can silently save a broken reference like `"NonExistentType"`.

Because Zod schemas are static objects, the live collection of valid targets cannot be baked into the generated file. It must be injected at the call site.

### Design

Two complementary mechanisms, both opt-in:

**1. Schema factories** (generated via `--cross-ref-validation`)

For every type that contains cross-reference fields, emit a `create*Schema(refs)` factory alongside the static `*Schema`. The factory uses `.extend()` + `.refine()` so the static schema remains usable as a base.

```typescript
// Generated output (alongside static DataSchema)

export interface DataSchemaRefs {
  Data?: string[];   // valid $refText values for the superType field
}

export function createDataSchema(refs: DataSchemaRefs = {}) {
  return DataSchema.extend({
    superType: z.string()
      .refine(
        v => !v || !refs.Data || refs.Data.includes(v),
        { message: 'Unknown Data type' }
      )
      .optional(),
  });
}
```

Usage in the visual editor (memoized so `zodResolver` receives a stable reference):

```tsx
const schema = useMemo(
  () => createDataSchema({ Data: model.dataTypes.map(d => d.name) }),
  [model.dataTypes]
);
const form = useForm({ resolver: zodResolver(schema) });
```

**2. `zRef()` utility** (always exported, no flag required)

A helper for manual schema construction or overriding individual fields:

```typescript
// Exported from 'langium-zod'
export function zRef(
  collection: string[] | (() => string[]),
  message = 'Reference not found'
): z.ZodString {
  return z.string().refine(val => {
    const items = typeof collection === 'function' ? collection() : collection;
    return items.includes(val);
  }, { message });
}

// Usage
const schema = DataSchema.extend({
  superType: zRef(() => store.dataTypes.map(d => d.name)).optional(),
});
```

### Key design decisions

| Decision | Rationale |
|---|---|
| Factory takes `string[]`, not `AstNode[]` | Keeps factories decoupled from Langium types; caller does `nodes.map(n => n.name)` |
| Empty string / undefined always passes | Avoids false failures on optional refs that haven't been set yet |
| Factory uses `.extend()` not full reconstruction | Static schema stays usable; projection / strip still apply to base |
| `*SchemaRefs` interface exported | TypeScript consumers get autocomplete on which types to provide |
| `zRef()` always available | Escape hatch for fields the generator can't automatically classify |

### Files to add / change

| File | Change |
|---|---|
| `generator.ts` | When `--cross-ref-validation` is set, emit `create*Schema(refs)` and `*SchemaRefs` interface alongside each schema that has cross-reference fields |
| `ref-utils.ts` (new) | Export `zRef()` utility (unconditionally — no flag required) |
| `api.ts` | Add `crossRefValidation?: boolean` to `ZodGeneratorConfig` |
| `cli.ts` | Add `--cross-ref-validation` flag |
| `index.ts` | Re-export `zRef` from `ref-utils.ts` |

### Acceptance criteria

- Without `--cross-ref-validation`: output is unchanged; no factories emitted
- With `--cross-ref-validation`: every type with `≥1` cross-reference field gets a `create*Schema(refs)` factory and a `*SchemaRefs` interface
- `createDataSchema({ Data: ['TypeA', 'TypeB'] })` — passing `'TypeA'` for `superType` validates; passing `'TypeC'` fails with message `'Unknown Data type'`
- `createDataSchema()` (no refs provided) — all values pass (safe default; no false positives on missing context)
- Optional cross-reference field with value `undefined` or `''` — passes regardless of refs
- `zRef(['TypeA', 'TypeB'])` — passing `'TypeA'` validates; `'TypeC'` fails
- `zRef()` is importable without any CLI flag being set
- Factories compose with `--projection`: if a cross-ref field is stripped by projection, no factory refinement is emitted for it

---

## Priority

| # | Change | Priority | Notes |
|---|---|---|---|
| 1 | `z.array().min(1)` cardinality bug | **P0** | Correctness — ship first |
| 2 | CLI `--include` / `--exclude` | **P1** | Low effort, unblocks ergonomics |
| 3 | Projection mode | **P1** | Blocks form-schema integration in `rune-langium` |
| 4 | Conformance checks | **P2** | Safety net; not blocking initial integration |
| 5 | Cross-ref runtime validation | **P2** | Needed for full form validation; `zRef()` utility unblocks manual use immediately |

## Out of scope

- Full `Reference<T>` object validation (ref text + resolved node) — cross-ref validation covers the ref text only
- Fragment rule inlining
- Zod v3 support
- Schema generation for non-Langium types
