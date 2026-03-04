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

## Zod Schemas (Derived from Generated AST Schemas)

The expression builder schema is **derived by transformation** from the generated `RosettaExpressionSchema` in `generated/zod-schemas.ts`, not coded separately. This ensures the builder's validation stays in sync with the grammar as it evolves.

### Source Schema

The generated file provides individual `z.looseObject` schemas for each AST variant, composed into `RosettaExpressionSchema` as a `z.discriminatedUnion('$type', [...])` with 40+ members:

```typescript
// generated/zod-schemas.ts (source of truth — DO NOT HAND-EDIT)
export const ArithmeticOperationSchema = z.looseObject({
  $type: z.literal('ArithmeticOperation'),
  left: z.lazy(() => RosettaExpressionSchema),
  operator: z.union([z.literal('+'), z.literal('-'), z.literal('*'), z.literal('/')]),
  right: z.lazy(() => RosettaExpressionSchema)
});
// ... 40+ more variants
export const RosettaExpressionSchema = z.discriminatedUnion('$type', [ ... ]);
```

### Transformation Strategy

Rather than maintaining a parallel schema, we apply **four transformations** to derive the builder schema from the generated one:

```typescript
// expression-node-schema.ts — builder schema derived from generated schemas
import { z } from 'zod';
import {
  ArithmeticOperationSchema,
  LogicalOperationSchema,
  ComparisonOperationSchema,
  EqualityOperationSchema,
  RosettaContainsExpressionSchema,
  RosettaDisjointExpressionSchema,
  DefaultOperationSchema,
  JoinOperationSchema,
  // ... all 40+ generated variant schemas
  RosettaExpressionSchema,
  CardinalityModifierSchema,
  ExistsModifierSchema,
  InlineFunctionSchema,
  ClosureParameterSchema,
  ConstructorKeyValuePairSchema,
  SwitchCaseOrDefaultSchema,
  RosettaBooleanLiteralSchema,
  RosettaIntLiteralSchema,
  RosettaNumberLiteralSchema,
  RosettaStringLiteralSchema,
  ListLiteralSchema,
  RosettaImplicitVariableSchema,
  RosettaSymbolReferenceSchema,
  RosettaFeatureCallSchema,
  RosettaDeepFeatureCallSchema,
  RosettaConditionalExpressionSchema,
  SwitchOperationSchema,
  RosettaConstructorExpressionSchema,
  FilterOperationSchema,
  MapOperationSchema,
  ReduceOperationSchema,
  SortOperationSchema,
  MinOperationSchema,
  MaxOperationSchema,
  ThenOperationSchema,
} from '../generated/zod-schemas.js';

// ---------------------------------------------------------------------------
// T1: UI augmentation fields (added to every variant)
// ---------------------------------------------------------------------------

/** Fields injected into every node for UI tracking. */
const uiFields = {
  id: z.string().min(1),  // nanoid — React key + selection tracking
};

// ---------------------------------------------------------------------------
// T2: Reference relaxation (Reference<T> → resolved string)
// ---------------------------------------------------------------------------

/**
 * The generated schemas use `ReferenceSchema = { $refText, ref? }` for
 * cross-references. In the builder UI, these are resolved to plain strings
 * at the adapter boundary. This helper replaces Reference fields.
 */
const resolvedRef = z.string().min(1);

// ---------------------------------------------------------------------------
// T3: Field relaxation (required → optional for partial trees)
// ---------------------------------------------------------------------------

/**
 * During incremental construction, child expression slots may be empty
 * (represented as placeholders). We relax required expression-child fields
 * to accept either a valid expression subtree OR a placeholder/undefined.
 *
 * The `relaxExpression` wrapper makes an expression field accept
 * ExpressionNodeSchema (which includes placeholder) instead of only
 * complete RosettaExpressionSchema.
 */
const exprChild = z.lazy(() => ExpressionNodeSchema);
const optExprChild = z.lazy(() => ExpressionNodeSchema).optional();

// ---------------------------------------------------------------------------
// T4: UI-only variants (no AST counterpart)
// ---------------------------------------------------------------------------

const ExpressionTypeHintSchema = z.enum([
  'any', 'boolean', 'numeric', 'string', 'collection', 'comparable'
]);

/** Placeholder — empty slot in the tree awaiting user input. */
const PlaceholderNodeSchema = z.object({
  ...uiFields,
  $type: z.literal('Placeholder'),
  expectedType: ExpressionTypeHintSchema.optional(),
});

/** Unsupported — sub-tree that couldn't be converted from AST. */
const UnsupportedNodeSchema = z.object({
  ...uiFields,
  $type: z.literal('Unsupported'),
  rawText: z.string(),
});

// ---------------------------------------------------------------------------
// Transformed variants (derived from generated schemas)
// ---------------------------------------------------------------------------
//
// Each variant extends its generated counterpart with:
//   - `id` field (T1)
//   - Reference fields relaxed to strings (T2)
//   - Required child expressions relaxed to accept placeholders (T3)
//
// The generated schemas use `z.looseObject` so `.extend()` works naturally.
// We use `.extend()` to overlay UI fields and relaxed types on top of the
// generated shape, keeping all other fields (operator, etc.) inherited.

/** Binary operations: arithmetic, logical, equality, comparison, keyword */
const ArithmeticNodeSchema = ArithmeticOperationSchema.extend({
  ...uiFields,
  left: exprChild,   // relax: required → accepts placeholder
  right: exprChild,  // relax: required → accepts placeholder
});

const LogicalNodeSchema = LogicalOperationSchema.extend({
  ...uiFields,
  left: exprChild,
  right: exprChild,
});

const ComparisonNodeSchema = ComparisonOperationSchema.extend({
  ...uiFields,
  left: optExprChild,  // already optional in grammar
  right: exprChild,
  cardMod: CardinalityModifierSchema.optional(),
});

const EqualityNodeSchema = EqualityOperationSchema.extend({
  ...uiFields,
  left: optExprChild,
  right: exprChild,
  cardMod: CardinalityModifierSchema.optional(),
});

const ContainsNodeSchema = RosettaContainsExpressionSchema.extend({
  ...uiFields,
  left: optExprChild,
  right: exprChild,
});

const DisjointNodeSchema = RosettaDisjointExpressionSchema.extend({
  ...uiFields,
  left: optExprChild,
  right: exprChild,
});

const DefaultNodeSchema = DefaultOperationSchema.extend({
  ...uiFields,
  left: optExprChild,
  right: exprChild,
});

const JoinNodeSchema = JoinOperationSchema.extend({
  ...uiFields,
  left: optExprChild,
  right: optExprChild,
});

/** Navigation */
const FeatureCallNodeSchema = RosettaFeatureCallSchema.extend({
  ...uiFields,
  receiver: exprChild,
  feature: resolvedRef.optional(),  // T2: Reference → string
});

const DeepFeatureCallNodeSchema = RosettaDeepFeatureCallSchema.extend({
  ...uiFields,
  receiver: exprChild,
  feature: resolvedRef.optional(),  // T2: Reference → string
});

/** Unary postfix operations */
// Each unary op schema just needs `id` + argument relaxation.
// We generate these with a helper since they share the same shape.
function extendUnary(schema: typeof DistinctOperationSchema) {
  return schema.extend({ ...uiFields, argument: optExprChild });
}

// ... applied to: DistinctOperation, FlattenOperation, ReverseOperation,
// FirstOperation, LastOperation, SumOperation, OneOfOperation,
// RosettaCountOperation, RosettaOnlyElement, RosettaExistsExpression,
// RosettaAbsentExpression, ToStringOperation, ToNumberOperation, etc.

/** Exists with modifier */
const ExistsNodeSchema = RosettaExistsExpressionSchema.extend({
  ...uiFields,
  argument: optExprChild,
  modifier: ExistsModifierSchema.optional(),
});

/** Control flow */
const ConditionalNodeSchema = RosettaConditionalExpressionSchema.extend({
  ...uiFields,
  if: optExprChild,      // condition
  ifthen: optExprChild,  // consequent
  elsethen: optExprChild, // alternate (already optional)
});

const SwitchNodeSchema = SwitchOperationSchema.extend({
  ...uiFields,
  argument: optExprChild,
  cases: z.array(SwitchCaseOrDefaultSchema.extend({
    expression: exprChild,
  })),
});

/** Lambda operations (filter, extract, reduce, sort, min, max, then) */
function extendLambda(schema: typeof FilterOperationSchema) {
  return schema.extend({
    ...uiFields,
    argument: optExprChild,
    function: InlineFunctionSchema.extend({
      body: exprChild,
      parameters: z.array(ClosureParameterSchema).optional(),
    }).optional(),
  });
}

/** Constructor */
const ConstructorNodeSchema = RosettaConstructorExpressionSchema.extend({
  ...uiFields,
  typeRef: z.union([
    z.object({ $type: z.literal('RosettaSymbolReference'), symbol: resolvedRef }),
    z.object({ $type: z.literal('RosettaSuperCall'), name: z.literal('super') }),
  ]),
  values: z.array(ConstructorKeyValuePairSchema.extend({
    key: resolvedRef,   // T2: Reference → string
    value: exprChild,   // T3: relax child
  })).optional(),
});

/** Literals — extend each generated literal variant with `id` */
const BooleanLiteralNodeSchema = RosettaBooleanLiteralSchema.extend(uiFields);
const IntLiteralNodeSchema = RosettaIntLiteralSchema.extend(uiFields);
const NumberLiteralNodeSchema = RosettaNumberLiteralSchema.extend(uiFields);
const StringLiteralNodeSchema = RosettaStringLiteralSchema.extend(uiFields);

/** List & implicit var */
const ListNodeSchema = ListLiteralSchema.extend({
  ...uiFields,
  elements: z.array(exprChild),
});

const ImplicitVarNodeSchema = RosettaImplicitVariableSchema.extend(uiFields);

/** Symbol reference — relax cross-reference to resolved string */
const SymbolRefNodeSchema = RosettaSymbolReferenceSchema.extend({
  ...uiFields,
  symbol: resolvedRef,  // T2: Reference → string
});

// ---------------------------------------------------------------------------
// Composed union (generated variants + UI-only variants)
// ---------------------------------------------------------------------------

/**
 * The builder's expression schema: the generated RosettaExpressionSchema
 * union, with each member extended (T1–T3), plus UI-only variants (T4).
 *
 * Discriminated on `$type` — same discriminator as the generated schema,
 * so the adapter layer doesn't need to remap discriminators.
 */
export const ExpressionNodeSchema: z.ZodType<ExpressionNode> = z.discriminatedUnion('$type', [
  // — Transformed generated variants —
  ArithmeticNodeSchema,
  LogicalNodeSchema,
  ComparisonNodeSchema,
  EqualityNodeSchema,
  ContainsNodeSchema,
  DisjointNodeSchema,
  DefaultNodeSchema,
  JoinNodeSchema,
  FeatureCallNodeSchema,
  DeepFeatureCallNodeSchema,
  // ... all unary variants via extendUnary()
  ExistsNodeSchema,
  ConditionalNodeSchema,
  SwitchNodeSchema,
  // ... all lambda variants via extendLambda()
  ConstructorNodeSchema,
  BooleanLiteralNodeSchema,
  IntLiteralNodeSchema,
  NumberLiteralNodeSchema,
  StringLiteralNodeSchema,
  ListNodeSchema,
  ImplicitVarNodeSchema,
  SymbolRefNodeSchema,
  // — UI-only variants (T4) —
  PlaceholderNodeSchema,
  UnsupportedNodeSchema,
]);

/** Inferred TypeScript type — the builder's expression node type. */
export type ExpressionNode = z.infer<typeof ExpressionNodeSchema>;
```

### Transformation Summary

| Transform | What | Why |
|-----------|------|-----|
| **T1: UI augmentation** | Add `id: string` to every variant via `.extend(uiFields)` | React keys, selection tracking, store lookups |
| **T2: Reference relaxation** | Replace `ReferenceSchema` (`{ $refText, ref? }`) with `z.string()` | Cross-references are resolved to plain names at the adapter boundary |
| **T3: Field relaxation** | Required expression children accept `PlaceholderNodeSchema` | Partial trees during incremental construction |
| **T4: UI-only variants** | Add `Placeholder` and `Unsupported` to the discriminated union | Empty slots and graceful fallback for unrecognized sub-trees |

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Keep `$type` as discriminator (not `kind`) | Same discriminator as generated schemas; no remapping needed in adapter |
| Use `.extend()` on `z.looseObject` | Generated schemas use `z.looseObject` which supports `.extend()` naturally; extra AST fields (CST, parent) pass through without error |
| `extendUnary()`/`extendLambda()` helpers | 20+ unary/lambda variants share the same extension pattern; DRY |
| Literal variants stay separate (not collapsed) | Preserves 1:1 mapping with generated `RosettaBooleanLiteral`, `RosettaIntLiteral`, etc.; type-specific rendering in blocks |
| `z.string()` for resolved references | Adapter resolves `ref.$refText` at conversion time; builder only needs the display name |

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
