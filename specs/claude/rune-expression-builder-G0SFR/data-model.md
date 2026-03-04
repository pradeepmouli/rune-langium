# Data Model: Rune Expression Builder

**Date**: 2026-03-04 | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

## Core Entities

### ExpressionNode (Discriminated Union)

The central data structure for the expression builder UI. A lightweight, immutable representation of expression trees optimized for React rendering and zustand state management. Each variant maps to a grammar-level expression kind from `RosettaExpression` but without Langium internals (cross-references, CST nodes, parent pointers).

```typescript
/** Unique identifier for each node in the expression tree. */
type NodeId = string; // nanoid-generated

/** Base fields shared by all expression nodes. */
interface ExpressionNodeBase {
  id: NodeId;
  kind: ExpressionKind;
}

/** All possible expression kinds. */
type ExpressionKind =
  | 'binary'         // +, -, *, /, and, or, =, <>, >, <, >=, <=, contains, disjoint, default, join
  | 'unary'          // exists, is absent, count, flatten, distinct, reverse, first, last, sum, only-element, one-of, type conversions
  | 'featureCall'    // -> (shallow navigation)
  | 'deepFeatureCall'// ->> (deep navigation)
  | 'conditional'    // if/then/else
  | 'switch'         // switch with cases
  | 'lambda'         // filter, extract, reduce, sort, min, max, then (with inline function)
  | 'constructor'    // Type { key: value, ... }
  | 'literal'        // boolean, string, number, integer, empty
  | 'list'           // [elem1, elem2, ...]
  | 'reference'      // symbol reference (variable, input, alias)
  | 'implicitVar'    // implicit `item` variable
  | 'placeholder'    // empty slot awaiting user input
  | 'unsupported';   // fallback for unparseable sub-trees

type ExpressionNode =
  | BinaryNode
  | UnaryNode
  | FeatureCallNode
  | DeepFeatureCallNode
  | ConditionalNode
  | SwitchNode
  | LambdaNode
  | ConstructorNode
  | LiteralNode
  | ListNode
  | ReferenceNode
  | ImplicitVarNode
  | PlaceholderNode
  | UnsupportedNode;
```

### Node Variants

```typescript
/** Binary operation: left <op> right */
interface BinaryNode extends ExpressionNodeBase {
  kind: 'binary';
  operator: BinaryOperator;
  left: ExpressionNode;
  right: ExpressionNode;
  cardMod?: 'any' | 'all'; // for equality/comparison operations
}

type BinaryOperator =
  | '+' | '-' | '*' | '/'                          // arithmetic
  | 'and' | 'or'                                    // logical
  | '=' | '<>'                                      // equality
  | '>' | '<' | '>=' | '<='                         // comparison
  | 'contains' | 'disjoint' | 'default' | 'join';  // keyword binary

/** Unary postfix operation: argument <op> */
interface UnaryNode extends ExpressionNodeBase {
  kind: 'unary';
  operator: UnaryOperator;
  argument: ExpressionNode;
  modifier?: 'single' | 'multiple'; // for exists
}

type UnaryOperator =
  | 'exists' | 'is absent' | 'count' | 'flatten' | 'distinct'
  | 'reverse' | 'first' | 'last' | 'sum' | 'only-element' | 'one-of'
  | 'to-string' | 'to-number' | 'to-int' | 'to-time'
  | 'to-date' | 'to-date-time' | 'to-zoned-date-time';

/** Feature call: receiver -> feature */
interface FeatureCallNode extends ExpressionNodeBase {
  kind: 'featureCall';
  receiver: ExpressionNode;
  feature: string; // resolved feature/attribute name
}

/** Deep feature call: receiver ->> feature */
interface DeepFeatureCallNode extends ExpressionNodeBase {
  kind: 'deepFeatureCall';
  receiver: ExpressionNode;
  feature: string;
}

/** Conditional: if <condition> then <consequent> [else <alternate>] */
interface ConditionalNode extends ExpressionNodeBase {
  kind: 'conditional';
  condition: ExpressionNode;
  consequent: ExpressionNode;
  alternate?: ExpressionNode; // absent for if/then without else
}

/** Switch: argument switch case1 then expr1, case2 then expr2 [default expr] */
interface SwitchNode extends ExpressionNodeBase {
  kind: 'switch';
  argument: ExpressionNode;
  cases: SwitchCase[];
  defaultCase?: ExpressionNode;
}

interface SwitchCase {
  guard: ExpressionNode; // enum value or type reference
  expression: ExpressionNode;
}

/** Lambda: argument <op> [params body] (filter, extract, reduce, sort, min, max, then) */
interface LambdaNode extends ExpressionNodeBase {
  kind: 'lambda';
  operator: LambdaOperator;
  argument: ExpressionNode;
  parameters: string[];  // closure parameter names (may be empty for implicit `item`)
  body: ExpressionNode;
}

type LambdaOperator = 'filter' | 'extract' | 'reduce' | 'sort' | 'min' | 'max' | 'then';

/** Constructor: TypeName { key1: value1, key2: value2, ... } */
interface ConstructorNode extends ExpressionNodeBase {
  kind: 'constructor';
  typeName: string;
  entries: ConstructorEntry[];
  implicitEmpty: boolean; // trailing `...` spread
}

interface ConstructorEntry {
  key: string;
  value: ExpressionNode;
}

/** Literal value: boolean, string, number, integer, or empty */
interface LiteralNode extends ExpressionNodeBase {
  kind: 'literal';
  literalKind: 'boolean' | 'string' | 'number' | 'integer' | 'empty';
  value: string; // string representation for all types (allows editing)
}

/** List literal: [elem1, elem2, ...] */
interface ListNode extends ExpressionNodeBase {
  kind: 'list';
  elements: ExpressionNode[];
}

/** Symbol reference: a named variable, input, or alias in scope */
interface ReferenceNode extends ExpressionNodeBase {
  kind: 'reference';
  name: string;       // the symbol name
  typeName?: string;  // resolved type (for display)
  cardinality?: string; // resolved cardinality (for display)
  broken?: boolean;   // true if reference cannot be resolved
}

/** Implicit variable: `item` (auto-bound in filter/extract/reduce closures) */
interface ImplicitVarNode extends ExpressionNodeBase {
  kind: 'implicitVar';
  name: 'item';
}

/** Placeholder: empty slot awaiting user input */
interface PlaceholderNode extends ExpressionNodeBase {
  kind: 'placeholder';
  expectedType?: ExpressionTypeHint; // hint for palette filtering
}

type ExpressionTypeHint = 'any' | 'boolean' | 'numeric' | 'string' | 'collection' | 'comparable';

/** Unsupported: sub-tree that couldn't be converted from AST */
interface UnsupportedNode extends ExpressionNodeBase {
  kind: 'unsupported';
  rawText: string; // original DSL text for display and round-trip
}
```

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
  /** Which node kind this creates. */
  nodeKind: ExpressionKind;
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
        │     └── dispatches to: BinaryBlock, UnaryBlock, LiteralBlock, ...
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
| V-002 | ReferenceNode | Reference `name` must exist in `FunctionScope` (inputs, aliases, or output) |
| V-003 | BinaryNode | Both `left` and `right` must be non-placeholder for complete expression |
| V-004 | ConditionalNode | `condition` must resolve to boolean type hint |
| V-005 | LambdaNode | `body` must be present; `parameters` count must match operator expectations (reduce=2, others=0-1) |
| V-006 | ConstructorNode | `typeName` must exist in `scope.availableTypes` |
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
