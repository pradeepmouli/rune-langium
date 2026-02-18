# Data Model: Langium-to-Zod Schema Generator

**Feature**: 005-langium-zod
**Date**: 2026-02-18

## Input: Langium Grammar Structure

The generator reads the Langium grammar AST, which has the following structure:

### GrammarRule (input)

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Rule name (becomes the AST type name) |
| `type` | `AbstractType` | Declared return type |
| `definition` | `AbstractElement` | Rule body (alternatives, groups, assignments) |
| `fragment` | `boolean` | Whether this is a fragment rule (inlined, no own type) |
| `hidden` | `boolean` | Whether this is a hidden terminal |

### Assignment (input)

| Field | Type | Description |
|-------|------|-------------|
| `feature` | `string` | Field name on the generated interface |
| `operator` | `'=' \| '+=' \| '?='` | `=` single, `+=` array, `?=` boolean |
| `terminal` | `AbstractElement` | What is assigned (rule ref, keyword, cross-ref) |

### CrossReference (input)

| Field | Type | Description |
|-------|------|-------------|
| `type` | `TypeReference` | Target AST type |
| `terminal` | `AbstractElement?` | Terminal for parsing the reference text |

## Output: Generated Zod Schemas

### SchemaDeclaration (output)

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Schema variable name (e.g., `DataSchema`) |
| `sourceRule` | `string` | Name of the grammar rule it was generated from |
| `fields` | `SchemaField[]` | The Zod object fields |
| `isRecursive` | `boolean` | Whether this schema contains self-references |
| `discriminator` | `string?` | Literal `$type` value if applicable |

### SchemaField (output)

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Field name (matches `Assignment.feature`) |
| `zodExpression` | `string` | Zod expression string (e.g., `z.string().min(1)`) |
| `isOptional` | `boolean` | Whether `.optional()` is applied |
| `isArray` | `boolean` | Whether wrapped in `z.array()` |
| `minItems` | `number?` | Minimum array length (1 for `+=` cardinality `+`) |
| `isLazy` | `boolean` | Whether wrapped in `z.lazy()` |
| `isCrossReference` | `boolean` | Whether the original was a `[Type]` reference |

## Mapping: Grammar → Zod

### Operator Mapping

| Grammar Operator | TS Type | Zod Schema |
|------------------|---------|------------|
| `feature = RuleRef` | `T` | `RuleRefSchema` |
| `feature = RuleRef?` | `T \| undefined` | `RuleRefSchema.optional()` |
| `feature += RuleRef` | `T[]` | `z.array(RuleRefSchema)` |
| `feature ?= 'keyword'` | `boolean` | `z.boolean()` |

### Terminal Mapping

| Grammar Terminal | TS Type | Zod Schema |
|------------------|---------|------------|
| `ID` | `string` | `z.string()` |
| `ValidID` | `string` | `z.string().min(1)` |
| `STRING` | `string` | `z.string()` |
| `INT` | `number` | `z.number().int()` |
| `NUMBER` | `number` | `z.number()` |
| `BOOLEAN` | `boolean` | `z.boolean()` |
| `[RuleRef]` (cross-ref) | `Reference<T>` | `z.string()` (default) |

### Cardinality Mapping

| Grammar | Operator | Zod Schema |
|---------|----------|------------|
| `rule` (required) | `=` | `schema` |
| `rule?` (optional) | `=` | `schema.optional()` |
| `rule*` (0..n) | `+=` | `z.array(schema)` |
| `rule+` (1..n) | `+=` | `z.array(schema).min(1)` |

## Example: Rune DSL Data Type

### Grammar (input)

```langium
Data:
    'type' name=ValidID ':'
    (definition=STRING)?
    ('extends' superType=[Data])?
    attributes+=Attribute*
    conditions+=Condition*;
```

### Generated Schema (output)

```typescript
export const DataSchema = z.object({
  $type: z.literal('Data'),
  name: z.string().min(1),
  definition: z.string().optional(),
  superType: z.string().optional(), // cross-reference → ref text
  attributes: z.array(AttributeSchema),
  conditions: z.array(ConditionSchema),
});
```

### Conformance Check (output)

```typescript
import type { Data } from './ast.js';

type DataSurface = Omit<Data, '$container' | '$document' | '$cstNode'>;
type SchemaInferred = z.infer<typeof DataSchema>;

// Compile-time assertion
type _fwd = SchemaInferred extends DataSurface ? true : never;
type _rev = DataSurface extends SchemaInferred ? true : never;
```
