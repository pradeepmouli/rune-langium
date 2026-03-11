# Spec: langium-zod Enhancements

**Target package**: `langium-zod` ([pradeepmouli/langium-zod](https://github.com/pradeepmouli/langium-zod))
**Requested by**: `@rune-langium/core` integration (spec 005)
**Date**: 2026-02-27
**Status**: Draft

## Overview

Four targeted changes to `langium-zod` are required before it can fully replace the schema generator planned in spec 005. Three are new capabilities (conformance checks, form-surface projection, CLI flag exposure); one is a correctness bug (cardinality `+` not producing `.min(1)`).

The changes are independent and can be shipped incrementally.

---

## Change 1 — `z.array().min(1)` for `+` cardinality (Bug Fix)

### Problem

The data model (`SchemaField.minItems`) already correctly models one-or-more arrays, but `generator.ts` ignores `minItems` and always emits bare `z.array()`. This means:

```langium
enumValues+=RosettaEnumValue+   // one or more — MUST have at least 1
attributes+=Attribute*           // zero or more — empty is valid
```

Both currently produce `z.array(RosettaEnumValueSchema)` and `z.array(AttributeSchema)`. The `+` constraint is silently dropped, so a schema that should reject empty arrays accepts them.

### Root cause

In Langium's `GrammarAST`, a `RuleCall` has a `cardinality` property (`'?'`, `'*'`, `'+'`, or `undefined`). Both `*` and `+` repetition use the `+=` assignment operator, so the operator alone is insufficient. `extractor.ts` (or `type-mapper.ts`) needs to inspect `ruleCall.cardinality` when building `PropertyDescriptor` and propagate `minItems: 1` when `cardinality === '+'`.

`generator.ts` then needs to emit `.min(1)` when `minItems` is set.

### Acceptance scenarios

1. **Given** grammar `enumValues+=RosettaEnumValue+`, **When** generated, **Then** schema field is `z.array(RosettaEnumValueSchema).min(1)`
2. **Given** grammar `attributes+=Attribute*`, **When** generated, **Then** schema field is `z.array(AttributeSchema)` (no `.min(1)`)
3. **Given** grammar `items+=Item` (no repetition marker — single item becomes array via `+=`), **When** generated, **Then** schema field is `z.array(ItemSchema)` (no `.min(1)`)

### Files to change

| File | Change |
|---|---|
| `extractor.ts` or `type-mapper.ts` | When processing `+=` assignment, read `ruleCall.cardinality`; if `'+'`, set `minItems: 1` on the property descriptor |
| `generator.ts` | When emitting array type, check `minItems`; if set, append `.min(${minItems})` to the `z.array()` call |

### Tests to add

- `cardinality-plus.test.ts` or inline in `schema-emitter.test.ts`:
  - Grammar fixture with `+=Item+`, `+=Item*`, `+=Item` (no marker)
  - Assert generated output strings

---

## Change 2 — Expose `--include` / `--exclude` as CLI flags (Enhancement)

### Problem

`ZodGeneratorConfig.include` and `ZodGeneratorConfig.exclude` exist in the programmatic API and work correctly, but `cli.ts` does not expose them as command-line flags. Users can only filter types via `langium-zod.config.js`, which requires a JavaScript file even for trivial cases.

### Required CLI interface

```bash
# Include only specific types (comma-separated or repeatable)
langium-zod generate --include Data,Attribute,RosettaEnumeration

# Exclude specific types
langium-zod generate --exclude Condition,AnnotationRef

# Combine (include takes precedence)
langium-zod generate --include Data --include Attribute --exclude RosettaCondition
```

### Acceptance scenarios

1. **Given** `--include Data,Attribute`, **When** generated, **Then** only `DataSchema` and `AttributeSchema` are in the output file
2. **Given** `--exclude Condition,AnnotationRef`, **When** generated, **Then** all schemas except those two are emitted
3. **Given** both `--include` and config-file `include` specified, **Then** CLI flags take precedence over config file values
4. **Given** `--include` with a type name that doesn't exist in the grammar, **Then** CLI exits with a clear error message listing available types

### Files to change

| File | Change |
|---|---|
| `cli.ts` | Add `.option('--include <types>', 'Comma-separated list of types to include')` and `--exclude` equivalents; parse comma-separated string into string array before passing to `generateZodSchemas()` |

---

## Change 3 — Form-surface projection mode (New Feature)

### Problem

The visual editor forms (`DataTypeForm`, `EnumForm`, `ChoiceForm`) only edit a subset of each AST type's fields — the user-facing, editable fields. The full AST schemas (including `$container`, `$cstNode`, `$document`, computed fields) are not suitable as form schemas directly.

A projection mode is needed that:
1. Strips internal Langium metadata fields automatically
2. Optionally picks only specific named fields per type
3. Produces schemas that exactly match what `react-hook-form + zodResolver` needs

### Config format

A JSON projection config file specifying per-type field lists:

```json
{
  "defaults": {
    "strip": ["$container", "$document", "$cstNode", "$containerProperty", "$containerIndex"]
  },
  "types": {
    "Data": {
      "fields": ["name", "superType", "description", "conditions", "attributes"]
    },
    "RosettaEnumeration": {
      "fields": ["name", "description", "enumValues"]
    },
    "Attribute": {
      "fields": ["name", "typeCall", "card"]
    }
  }
}
```

If a type is not listed in `types`, the `defaults.strip` rules still apply (internal fields removed, all other fields kept).

### CLI interface

```bash
# Apply projection config
langium-zod generate --projection form-surfaces.json

# Short form: apply just the default strip (remove internals) with no per-type picks
langium-zod generate --strip-internals
```

### Acceptance scenarios

1. **Given** projection config specifying `Data` fields `[name, superType, attributes]`, **When** generated, **Then** `DataSchema` has only those three fields (plus `$type` literal)
2. **Given** `--strip-internals` with no projection file, **When** generated, **Then** `$container`, `$document`, `$cstNode`, `$containerProperty`, `$containerIndex` are absent from all schemas; all other fields are present
3. **Given** a type not listed in `types`, **When** generated with a projection file, **Then** it still has internals stripped but all grammar-defined fields kept
4. **Given** projection config specifying a field name that doesn't exist on the grammar type, **Then** CLI warns and skips the unknown field (not a fatal error)
5. **Given** `--projection` combined with `--include`, **Then** projection is applied only to the included types

### Files to change / add

| File | Change |
|---|---|
| `projection.ts` (new) | `ProjectionConfig` type, `loadProjection(path): ProjectionConfig`, `applyProjection(descriptors, config): descriptors` |
| `cli.ts` | Add `--projection <file>` and `--strip-internals` options; load config and pass to generator |
| `generator.ts` | Accept optional projection config; filter fields before emitting `z.object({...})` |
| `api.ts` | Add `projection?: ProjectionConfig` to `ZodGeneratorConfig` |

### Default strip list

These Langium internal fields should be stripped by default when any projection mode is active:

```
$container  $containerProperty  $containerIndex  $document  $cstNode
```

---

## Change 4 — Conformance check generation (New Feature)

### Problem

Generated Zod schemas must stay aligned with the Langium-generated `ast.ts` as the grammar evolves. Without automated checking, schema drift is silent — the generator produces structurally valid TypeScript but the types diverge from the AST.

Conformance checks use TypeScript's type system to assert bidirectional assignability at compile time: if a grammar field is added or removed, a regenerate-then-typecheck cycle will fail.

### Output format

A separate file (or an appended section in the main output) containing type-level assertions per schema:

```typescript
// generated/zod-schemas.conformance.ts
import type { Data, Attribute, RosettaEnumeration } from './ast.js';
import { DataSchema, AttributeSchema, RosettaEnumerationSchema } from './zod-schemas.js';
import { z } from 'zod';

// Internal Langium fields excluded from surface type
type _Internals = '$container' | '$containerProperty' | '$containerIndex' | '$document' | '$cstNode';

type _DataSurface = Omit<Data, _Internals>;
type _DataInferred = z.infer<typeof DataSchema>;
type _DataFwd = _DataInferred extends _DataSurface ? true : never;
type _DataRev = _DataSurface extends _DataInferred ? true : never;

type _AttributeSurface = Omit<Attribute, _Internals>;
// ... etc
```

If `_DataFwd` or `_DataRev` resolves to `never`, TypeScript reports a compile error at the declaration site, pinpointing the mismatched type.

### CLI interface

```bash
# Generate conformance file alongside schemas
langium-zod generate --conformance --ast-types src/generated/ast.ts

# Custom output path for conformance file
langium-zod generate --conformance --ast-types src/generated/ast.ts --conformance-out src/generated/zod-schemas.conformance.ts
```

### Acceptance scenarios

1. **Given** `--conformance` flag and `--ast-types` path, **When** generated, **Then** a `.conformance.ts` file is written alongside the main schema file with one bidirectional check per generated schema
2. **Given** a schema that matches its AST interface, **When** `tsc --noEmit` runs on the conformance file, **Then** zero type errors
3. **Given** a grammar change that adds a required field (and schemas regenerated but conformance not regenerated), **When** `tsc --noEmit` runs, **Then** a type error on the `_XxxFwd` or `_XxxRev` line for the changed type
4. **Given** schemas using `--strip-internals` or `--projection`, **When** conformance generated, **Then** `_Internals` fields are excluded from the `Omit<>` surface type automatically (matching what was stripped)
5. **Given** `--ast-types` pointing to a file that doesn't export a type matching a schema name, **Then** CLI warns and skips the check for that type (not a fatal error)
6. **Given** `--conformance` without `--ast-types`, **Then** CLI exits with an error: `--ast-types is required when using --conformance`

### Files to change / add

| File | Change |
|---|---|
| `conformance.ts` (new) | `generateConformanceChecks(schemaNames, astTypesPath, strippedFields): string` — produces the conformance file content |
| `cli.ts` | Add `--conformance` boolean flag and `--conformance-out <path>` option; wire to `generateConformanceChecks()` |
| `api.ts` | Add `conformance?: { astTypesPath: string; outputPath?: string }` to `ZodGeneratorConfig` |

---

## Priority and sequencing

| Change | Type | Priority | Rationale |
|---|---|---|---|
| 1 — `z.array().min(1)` | Bug fix | **P0** | Silent data loss; affects any grammar with `+` cardinality. Ship first. |
| 2 — CLI `--include`/`--exclude` | Enhancement | **P1** | Unblocks selective generation without requiring a JS config file. Low effort. |
| 3 — Projection mode | New feature | **P1** | Required for form-surface schemas in `@rune-langium/visual-editor`. Needed before 004-editor-forms integration. |
| 4 — Conformance checks | New feature | **P2** | Important for long-term grammar evolution safety, but not blocking form integration. |

## Out of scope

- Full `Reference<T>` resolution at runtime (requires Langium document context — explicitly out of scope per spec 005)
- Zod v3 support
- Schema generation for non-Langium TypeScript types
- Fragment rule inlining (not required for Rune DSL grammar)
- `--grammar <path>` direct flag (the `langium-config.json` driven approach is equivalent for all practical purposes)
