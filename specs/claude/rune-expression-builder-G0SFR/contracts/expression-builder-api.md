# Contract: Expression Builder Component API

**Date**: 2026-03-04 | **Package**: `@rune-langium/visual-editor`

## Public Component: ExpressionBuilder

The expression builder is exposed as a React component that conforms to the existing `ExpressionEditorSlotProps` interface, allowing it to plug into `FunctionForm` via the `renderExpressionEditor` slot.

### Slot Integration Contract

```typescript
/**
 * Existing interface (from types.ts) — the builder MUST conform to this.
 * The builder receives these props from FunctionForm's Controller.
 */
interface ExpressionEditorSlotProps {
  value: string;                    // Current expression DSL text
  onChange: (value: string) => void; // Called when expression changes
  onBlur: () => void;               // Called when editor loses focus (triggers validation)
  error?: string | null;            // Validation error from parent
  placeholder?: string;             // Placeholder text
}
```

### Extended Props (builder-specific)

```typescript
interface ExpressionBuilderProps extends ExpressionEditorSlotProps {
  /** Function scope for reference resolution and palette filtering. */
  scope: FunctionScope;
  /** Initial mode. Defaults to 'builder'. */
  defaultMode?: 'builder' | 'text';
}
```

### Usage in FunctionForm

```tsx
<FunctionForm
  nodeId={nodeId}
  data={data}
  availableTypes={availableTypes}
  actions={actions}
  renderExpressionEditor={(slotProps) => (
    <ExpressionBuilder
      {...slotProps}
      scope={functionScope}
    />
  )}
/>
```

## Adapter Contracts

### ast-to-expression-node

```typescript
/**
 * Convert a RosettaExpression AST node to an ExpressionNode.
 *
 * Since ExpressionNode is derived from the same generated schemas (extended
 * with `id` + relaxed fields), this adapter primarily:
 *   1. Assigns `id` (nanoid) to each node
 *   2. Resolves Reference<T> cross-refs to plain strings ($refText)
 *   3. Wraps unrecognized sub-trees as { $type: 'Unsupported', rawText }
 *
 * The $type discriminator passes through unchanged.
 */
function astToExpressionNode(
  ast: RosettaExpression,
  sourceText: string
): ExpressionNode;
```

### expression-node-to-dsl

```typescript
/**
 * Serialize an ExpressionNode tree to Rune DSL text.
 * Throws if tree contains placeholder nodes.
 * UnsupportedNode serializes using its rawText.
 */
function expressionNodeToDsl(tree: ExpressionNode): string;

/**
 * Serialize with placeholders replaced by a marker (for preview).
 * Returns text with `___` at placeholder positions.
 */
function expressionNodeToDslPreview(tree: ExpressionNode): string;
```

### parse-expression (wrapper)

```typescript
/**
 * Parse a Rune DSL expression string into an ExpressionNode tree.
 * Wraps the expression in a minimal function body for the parser.
 * Returns error information if parsing fails.
 */
function parseExpression(
  text: string
): Promise<{ tree: ExpressionNode } | { error: string }>;
```

## Store Contract

```typescript
/**
 * Create an expression builder store instance.
 * Each expression editor gets its own store.
 */
function createExpressionStore(
  initialText: string,
  scope: FunctionScope
): StoreApi<ExpressionBuilderState>;
```

## Event Contract (onChange integration)

The builder calls `onChange(dslText)` from the slot props whenever:
1. A node is inserted via the operator palette
2. A node is removed (replaced with placeholder) — onChange called with partial text including `___` markers
3. A literal value is edited inline
4. A reference is selected
5. Text mode content changes

The builder calls `onBlur()` from the slot props when:
1. The builder component loses focus entirely (not internal focus changes)
2. The user switches from text mode to builder mode (triggers parse + validation)
