# Data Model: Rune Expression Builder

**Date**: 2026-03-04 | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

## Core Entities

### ExpressionNode (Schema-Derived Discriminated Union)

The `ExpressionNode` type is **not hand-coded** — it is inferred via `z.infer<typeof ExpressionNodeSchema>` from Zod schemas that are themselves derived by transformation from the generated `RosettaExpressionSchema`. This ensures the builder's type system stays in sync with the grammar automatically.

The discriminator is `$type` (same as the generated AST schemas), augmented with two UI-only `$type` values: `'Placeholder'` and `'Unsupported'`. Every variant also gains an `id: string` field for React key/selection tracking.

```typescript
// Types are INFERRED from schemas — see "Zod Schemas" section below.
// Do not hand-code interfaces; they drift from the source of truth.

import { ExpressionNodeSchema } from './expression-node-schema.js';

/** The builder's expression node type — inferred from transformed schemas. */
export type ExpressionNode = z.infer<typeof ExpressionNodeSchema>;

/** Unique identifier for each node in the expression tree. */
type NodeId = string; // nanoid-generated
```

### Variant Categories (for reference — shapes are defined by schemas)

| Category | `$type` values | Key fields (beyond generated) |
|----------|---------------|-------------------------------|
| **Binary** | `ArithmeticOperation`, `LogicalOperation`, `ComparisonOperation`, `EqualityOperation`, `RosettaContainsExpression`, `RosettaDisjointExpression`, `DefaultOperation`, `JoinOperation` | `id`, `left`/`right` relaxed to accept `Placeholder` |
| **Unary postfix** | `DistinctOperation`, `FlattenOperation`, `ReverseOperation`, `FirstOperation`, `LastOperation`, `SumOperation`, `OneOfOperation`, `RosettaCountOperation`, `RosettaOnlyElement`, `RosettaExistsExpression`, `RosettaAbsentExpression`, `ToString/Number/Int/Time/Date/DateTime/ZonedDateTime Operation` | `id`, `argument` relaxed |
| **Navigation** | `RosettaFeatureCall`, `RosettaDeepFeatureCall` | `id`, `feature`: `Reference` → `string` |
| **Lambda** | `FilterOperation`, `MapOperation`, `ReduceOperation`, `SortOperation`, `MinOperation`, `MaxOperation`, `ThenOperation` | `id`, `argument` relaxed, `function.body` relaxed |
| **Control flow** | `RosettaConditionalExpression`, `SwitchOperation` | `id`, condition/cases relaxed |
| **Constructor** | `RosettaConstructorExpression` | `id`, `typeRef.symbol` → `string`, `values[].key` → `string` |
| **Literals** | `RosettaBooleanLiteral`, `RosettaIntLiteral`, `RosettaNumberLiteral`, `RosettaStringLiteral` | `id` only |
| **Collection** | `ListLiteral` | `id`, `elements` relaxed |
| **Reference** | `RosettaSymbolReference`, `RosettaImplicitVariable` | `id`, `symbol` → `string` |
| **UI-only** | `Placeholder`, `Unsupported` | `id`, `expectedType?` / `rawText` |

## Zod Schemas (Derived via Generic Transformation)

All UI schemas — both expression builder and existing form schemas — are derived from the generated `zod-schemas.ts` via a single generic `deriveUiSchema()` utility. No hand-crafted Zod schemas exist; the generated schemas are the sole source of truth.

### Source Schemas

The generated file provides `z.looseObject` schemas for every AST type:

```typescript
// generated/zod-schemas.ts (source of truth — DO NOT HAND-EDIT)
export const ArithmeticOperationSchema = z.looseObject({
  $type: z.literal('ArithmeticOperation'),
  left: z.lazy(() => RosettaExpressionSchema),
  operator: z.union([z.literal('+'), z.literal('-'), z.literal('*'), z.literal('/')]),
  right: z.lazy(() => RosettaExpressionSchema)
});
export const DataSchema = z.looseObject({
  $type: z.literal('Data'),
  name: ValidIDSchema,
  superType: ReferenceSchema.optional(),
  attributes: z.array(AttributeSchema).optional()
});
// ... 60+ more type schemas
```

### Generic Transformation Utility

```typescript
// schemas/derive-ui-schema.ts — single reusable transformation function
import { z } from 'zod';

type LooseObjectSchema = ReturnType<typeof z.looseObject>;

interface DeriveOptions<TOverrides extends z.ZodRawShape = z.ZodRawShape> {
  /**
   * Fields to pick from the source schema. If omitted, all fields are kept.
   * Use when creating a form projection (e.g., Data form only needs name).
   */
  pick?: string[];

  /**
   * Field overrides — replaces matched fields in the source schema.
   * Handles all three transformation types:
   *   - Reference relaxation:  `{ superType: z.string() }`
   *   - Field relaxation:      `{ left: exprChild }`
   *   - Validation additions:  `{ name: z.string().min(1, 'Required') }`
   */
  overrides?: TOverrides;

  /**
   * Additional fields not present in the source schema.
   * Used for UI-only fields (e.g., `id`, `parentName`, `expressionText`).
   */
  extend?: z.ZodRawShape;

  /**
   * Strip the $type discriminator from the output.
   * Used for form schemas that don't need $type in their shape.
   * Default: false (keep $type).
   */
  omitType?: boolean;
}

/**
 * Derive a UI schema from a generated z.looseObject schema.
 *
 * This single function replaces all hand-crafted schemas by applying
 * pick/override/extend transformations to generated schemas. Since
 * generated schemas use z.looseObject, .extend() works naturally and
 * extra AST fields (CST, parent) pass through without error.
 *
 * @example Expression node — add id, relax children:
 *   deriveUiSchema(ArithmeticOperationSchema, {
 *     extend: { id: z.string().min(1) },
 *     overrides: { left: exprChild, right: exprChild },
 *   })
 *
 * @example Form schema — pick fields, add validation:
 *   deriveUiSchema(DataSchema, {
 *     pick: ['name'],
 *     overrides: { name: z.string().min(1, 'Type name is required') },
 *     extend: { parentName: z.string(), members: z.array(memberSchema) },
 *     omitType: true,
 *   })
 */
function deriveUiSchema<T extends LooseObjectSchema>(
  source: T,
  options: DeriveOptions = {}
): z.ZodObject<any> {
  const { pick, overrides, extend, omitType } = options;

  // Step 1: Pick (if specified, select only these fields from source)
  let schema = pick ? source.pick(
    Object.fromEntries(pick.map(k => [k, true]))
  ) : source;

  // Step 2: Omit $type if requested (form schemas don't need it)
  if (omitType) {
    schema = schema.omit({ $type: true });
  }

  // Step 3: Apply overrides (relaxation, validation, reference resolution)
  if (overrides) {
    schema = schema.extend(overrides);
  }

  // Step 4: Extend with UI-only fields
  if (extend) {
    schema = schema.extend(extend);
  }

  return schema;
}
```

### Expression Node Schemas (via `deriveUiSchema`)

```typescript
// schemas/expression-node-schema.ts
import { deriveUiSchema } from './derive-ui-schema.js';

// Shared UI fields for all expression nodes
const uiFields = { id: z.string().min(1) };

// Shared child expression schemas (self-referencing)
const exprChild = z.lazy(() => ExpressionNodeSchema);
const optExprChild = z.lazy(() => ExpressionNodeSchema).optional();
const resolvedRef = z.string().min(1);

// --- Binary operations ---
const ArithmeticNodeSchema = deriveUiSchema(ArithmeticOperationSchema, {
  extend: uiFields,
  overrides: { left: exprChild, right: exprChild },
});

const ComparisonNodeSchema = deriveUiSchema(ComparisonOperationSchema, {
  extend: uiFields,
  overrides: { left: optExprChild, right: exprChild },
});

// ... LogicalOperation, EqualityOperation, Contains, Disjoint, Default, Join
// all follow the same pattern with deriveUiSchema()

// --- Unary operations (20+ variants, identical shape) ---
function deriveUnary(schema: LooseObjectSchema) {
  return deriveUiSchema(schema, {
    extend: uiFields,
    overrides: { argument: optExprChild },
  });
}
// Applied to: Distinct, Flatten, Reverse, First, Last, Sum, OneOf,
// RosettaCount, RosettaOnlyElement, RosettaAbsent, all To* conversions

// --- Lambda operations (7 variants, identical shape) ---
function deriveLambda(schema: LooseObjectSchema) {
  return deriveUiSchema(schema, {
    extend: uiFields,
    overrides: {
      argument: optExprChild,
      function: InlineFunctionSchema.extend({
        body: exprChild,
        parameters: z.array(ClosureParameterSchema).optional(),
      }).optional(),
    },
  });
}
// Applied to: Filter, Map, Reduce, Sort, Min, Max, Then

// --- Navigation ---
const FeatureCallNodeSchema = deriveUiSchema(RosettaFeatureCallSchema, {
  extend: uiFields,
  overrides: { receiver: exprChild, feature: resolvedRef.optional() },
});

// --- Control flow ---
const ConditionalNodeSchema = deriveUiSchema(RosettaConditionalExpressionSchema, {
  extend: uiFields,
  overrides: { if: optExprChild, ifthen: optExprChild, elsethen: optExprChild },
});

// --- Literals (only need id) ---
const BooleanLiteralNodeSchema = deriveUiSchema(RosettaBooleanLiteralSchema, {
  extend: uiFields,
});

// --- Symbol reference (resolve cross-ref) ---
const SymbolRefNodeSchema = deriveUiSchema(RosettaSymbolReferenceSchema, {
  extend: uiFields,
  overrides: { symbol: resolvedRef },
});

// --- UI-only variants (no generated source) ---
const PlaceholderNodeSchema = z.object({
  ...uiFields,
  $type: z.literal('Placeholder'),
  expectedType: z.enum([
    'any', 'boolean', 'numeric', 'string', 'collection', 'comparable'
  ]).optional(),
});

const UnsupportedNodeSchema = z.object({
  ...uiFields,
  $type: z.literal('Unsupported'),
  rawText: z.string(),
});

// --- Composed union ---
export const ExpressionNodeSchema = z.discriminatedUnion('$type', [
  ArithmeticNodeSchema, /* ... all transformed variants ... */
  PlaceholderNodeSchema, UnsupportedNodeSchema,  // UI-only
]);

export type ExpressionNode = z.infer<typeof ExpressionNodeSchema>;
```

### Form Schemas (via same `deriveUiSchema`) — replaces `form-schemas.ts`

```typescript
// schemas/form-schemas.ts — AFTER migration (R-011)
import { deriveUiSchema } from './derive-ui-schema.js';
import {
  DataSchema, ChoiceSchema, RosettaEnumerationSchema,
  RosettaFunctionSchema, AttributeSchema, RosettaEnumValueSchema,
} from '../generated/zod-schemas.js';

const metadataFields = {
  definition: z.string().optional(),
  comments: z.string().optional(),
  synonyms: z.array(z.string()).optional(),
};

// --- Member (shared attribute shape for useFieldArray) ---
export const memberSchema = deriveUiSchema(AttributeSchema, {
  pick: ['name'],
  overrides: { name: z.string() },
  extend: {
    typeName: z.string(),
    cardinality: z.string(),
    isOverride: z.boolean(),
    displayName: z.string().optional(),
  },
  omitType: true,
});

// --- Attribute row ---
export const attributeSchema = deriveUiSchema(AttributeSchema, {
  pick: ['name'],
  overrides: { name: z.string().min(1, 'Attribute name is required') },
  extend: { typeName: z.string(), cardinality: z.string() },
  omitType: true,
});

// --- Data form ---
export const dataTypeFormSchema = deriveUiSchema(DataSchema, {
  pick: ['name'],
  overrides: { name: z.string().min(1, 'Type name is required') },
  extend: {
    parentName: z.string(),              // superType ref → string
    members: z.array(memberSchema),
    ...metadataFields,
  },
  omitType: true,
});

// --- Enum form ---
export const enumFormSchema = deriveUiSchema(RosettaEnumerationSchema, {
  pick: ['name'],
  overrides: { name: z.string().min(1, 'Enum name is required') },
  extend: {
    parentName: z.string(),
    members: z.array(memberSchema).default([]),
    ...metadataFields,
  },
  omitType: true,
});

// --- Choice form ---
export const choiceFormSchema = deriveUiSchema(ChoiceSchema, {
  pick: ['name'],
  overrides: { name: z.string().min(1, 'Choice name is required') },
  extend: {
    members: z.array(memberSchema).default([]),
    ...metadataFields,
  },
  omitType: true,
});

// --- Function form ---
export const functionFormSchema = deriveUiSchema(RosettaFunctionSchema, {
  pick: ['name'],
  overrides: { name: z.string().min(1, 'Function name is required') },
  extend: {
    outputType: z.string(),
    expressionText: z.string(),
    members: z.array(memberSchema).optional(),
    ...metadataFields,
  },
  omitType: true,
});

// Types inferred from schemas (no hand-coded interfaces)
export type DataTypeFormValues = z.infer<typeof dataTypeFormSchema>;
export type EnumFormValues = z.infer<typeof enumFormSchema>;
// ... etc.
```

### How `deriveUiSchema` Unifies All Transformations

| Use Case | `pick` | `overrides` | `extend` | `omitType` |
|----------|--------|-------------|----------|------------|
| Expression binary op | — | `{ left: exprChild }` | `{ id }` | no |
| Expression literal | — | — | `{ id }` | no |
| Expression reference | — | `{ symbol: z.string() }` | `{ id }` | no |
| Form data type | `['name']` | `{ name: z.string().min(1) }` | `{ parentName, members, ... }` | yes |
| Form member row | `['name']` | `{ name: z.string() }` | `{ typeName, cardinality, ... }` | yes |

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Single generic `deriveUiSchema()` | One function for all schema derivations; eliminates `extendUnary()`, `extendLambda()`, and all hand-coded `z.object()` calls |
| `pick` before `overrides` before `extend` | Pick narrows, overrides replace, extend adds — a consistent pipeline regardless of use case |
| `omitType: true` for forms | Form schemas don't participate in discriminated unions; `$type` would leak into react-hook-form values |
| Keep `$type` for expression nodes | Same discriminator as generated schemas; BlockRenderer switches on `node.$type` |
| `deriveUnary()` / `deriveLambda()` wrappers | Thin wrappers over `deriveUiSchema` for 20+ identical-shape variants; keeps call sites one-line |
| UI-only variants (`Placeholder`, `Unsupported`) built with `z.object()` | No generated source to derive from; these are small leaf schemas |

## Supporting Entities

### FunctionScope

The set of names and types available within a function body. Populated from the parsed `RosettaFunction` AST node. Used to populate reference pickers and validate references.

```typescript
interface FunctionScope {
  /** Function input parameters. */
  inputs: ScopeEntry[];
  /** Shortcut/alias declarations. */
  aliases: ScopeEntry[];
  /** Output attribute (if defined). */
  output?: ScopeEntry;
  /** Available type names for constructor expressions. */
  availableTypes: TypeOption[]; // reuses existing TypeOption from visual-editor
}

interface ScopeEntry {
  name: string;
  typeName: string;
  cardinality: string; // e.g., "(1..1)", "(0..*)"
  description?: string;
}
```

### OperatorCategory

Grouping of operators for the palette UI. Maps to FR-003 categories.

```typescript
interface OperatorCategory {
  id: OperatorCategoryId;
  label: string;
  icon: string; // lucide-react icon name
  operators: OperatorDefinition[];
}

type OperatorCategoryId =
  | 'arithmetic'
  | 'comparison'
  | 'logic'
  | 'navigation'
  | 'collection'
  | 'control';

interface OperatorDefinition {
  /** Display label (e.g., "Addition (+)"). */
  label: string;
  /** The operator value to insert. */
  operator: string;
  /** Which AST $type this creates (e.g., 'ArithmeticOperation'). */
  nodeType: ExpressionNode['$type'];
  /** Description for tooltip. */
  description: string;
  /** Type constraint: when is this operator valid? */
  applicableWhen?: ExpressionTypeHint[];
}
```

### ExpressionBuilderState (Zustand Store)

```typescript
interface ExpressionBuilderState {
  /** The expression tree being edited. */
  tree: ExpressionNode;
  /** Currently selected/focused node ID. */
  selectedNodeId: NodeId | null;
  /** Current editing mode. */
  mode: 'builder' | 'text';
  /** Text content when in text mode. */
  textValue: string;
  /** Scope information for reference resolution. */
  scope: FunctionScope;
  /** Whether the palette is open. */
  paletteOpen: boolean;
  /** The placeholder node ID the palette is anchored to. */
  paletteAnchorId: NodeId | null;

  // --- Actions ---
  /** Replace a node at the given ID with a new node. */
  replaceNode: (nodeId: NodeId, newNode: ExpressionNode) => void;
  /** Remove a node, replacing it with a placeholder. */
  removeNode: (nodeId: NodeId) => void;
  /** Update a literal value in-place. */
  updateLiteral: (nodeId: NodeId, value: string) => void;
  /** Set the selected node. */
  selectNode: (nodeId: NodeId | null) => void;
  /** Open the palette anchored to a placeholder. */
  openPalette: (nodeId: NodeId) => void;
  /** Close the palette. */
  closePalette: () => void;
  /** Switch between builder and text modes. */
  setMode: (mode: 'builder' | 'text') => void;
  /** Update text value (text mode). */
  setTextValue: (text: string) => void;
  /** Initialize from parsed expression text. */
  initFromText: (text: string, scope: FunctionScope) => Promise<void>;
  /** Serialize current tree to DSL text. */
  serializeTree: () => string;
}
```

## Entity Relationships

```
FunctionForm
  └── ExpressionBuilder (via renderExpressionEditor slot)
        ├── ExpressionBuilderState (zustand store)
        │     ├── tree: ExpressionNode (recursive)
        │     ├── scope: FunctionScope
        │     └── mode: 'builder' | 'text'
        ├── BlockRenderer (recursive)
        │     └── dispatches on $type: ArithmeticBlock, LogicalBlock, LiteralBlock, ...
        ├── OperatorPalette (cmdk + popover)
        │     └── reads: OperatorCategory[]
        ├── ReferencePicker
        │     └── reads: FunctionScope.inputs/aliases/output
        └── DslPreview
              └── reads: serializeTree()
```

## Validation Rules

| Rule | Entity | Description |
|------|--------|-------------|
| V-001 | ExpressionNode tree | Tree must have no placeholder nodes for serialization to succeed |
| V-002 | `RosettaSymbolReference` | `symbol` name must exist in `FunctionScope` (inputs, aliases, or output) |
| V-003 | Binary variants | Both `left` and `right` must be non-placeholder for complete expression |
| V-004 | `RosettaConditionalExpression` | `if` field must resolve to boolean type hint |
| V-005 | Lambda variants | `function.body` must be present; `parameters` count must match operator expectations (reduce=2, others=0-1) |
| V-006 | `RosettaConstructorExpression` | `typeRef` must reference a type in `scope.availableTypes` |
| V-007 | Round-trip | `parse(serialize(tree))` must produce equivalent tree (SC-004) |

## State Transitions

```
                    ┌──────────────────┐
                    │   Empty/Initial  │
                    │  (placeholder)   │
                    └────────┬─────────┘
                             │ initFromText("") or new
                             ▼
              ┌──────────────────────────┐
         ┌───▶│     Builder Mode         │◀───┐
         │    │  (tree: ExpressionNode)  │    │
         │    └──────────┬───────────────┘    │
         │               │                     │
         │  setMode      │ setMode             │ replaceNode
         │  ('builder')  │ ('text')            │ removeNode
         │               ▼                     │ updateLiteral
         │    ┌──────────────────────────┐    │
         │    │      Text Mode           │    │
         └────│  (textValue: string)     │────┘
              └──────────────────────────┘
                         │
                         │ parse error
                         ▼
              ┌──────────────────────────┐
              │   Text Mode (error)      │
              │  (cannot switch to       │
              │   builder until fixed)   │
              └──────────────────────────┘
```
