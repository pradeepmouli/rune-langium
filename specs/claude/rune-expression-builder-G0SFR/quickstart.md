# Quickstart: Rune Expression Builder

**Date**: 2026-03-04

## Prerequisites

- Node.js >= 20
- pnpm >= 10
- Repository cloned with dependencies installed (`pnpm install`)

## Architecture Overview

```
@rune-langium/core          → Parser, AST types, expression grammar
@rune-langium/design-system → Theme tokens, UI components (Popover, Tabs, Badge, etc.)
@rune-langium/visual-editor → Expression builder (new), FunctionForm (existing)
```

The expression builder lives entirely within `packages/visual-editor`. It:
1. Receives DSL text from `FunctionForm` via the `ExpressionEditorSlotProps` interface
2. Parses text → AST → `ExpressionNode` tree (adapter layer)
3. Renders the tree as nested visual blocks
4. On edits, serializes `ExpressionNode` tree → DSL text and calls `onChange`

## Key Files

| File | Purpose |
|------|---------|
| `src/components/editors/expression-builder/ExpressionBuilder.tsx` | Root component, mode toggle |
| `src/components/editors/expression-builder/BlockRenderer.tsx` | Recursive tree → blocks |
| `src/components/editors/expression-builder/blocks/*.tsx` | Block components per $type |
| `src/components/editors/expression-builder/OperatorPalette.tsx` | cmdk command palette |
| `src/store/expression-store.ts` | Zustand store + zundo undo/redo |
| `src/schemas/derive-ui-schema.ts` | Generic schema transformation utility (pick/override/extend) |
| `src/schemas/expression-node-schema.ts` | ExpressionNode schemas via `deriveUiSchema()` |
| `src/adapters/ast-to-expression-node.ts` | RosettaExpression → ExpressionNode (assign ids, resolve refs) |
| `src/adapters/expression-node-to-dsl.ts` | ExpressionNode → DSL text |
| `src/adapters/parse-expression.ts` | DSL text → ExpressionNode (wraps core parser) |
| `src/hooks/useExpressionBuilder.ts` | Orchestration hook |
| `src/hooks/useKeyboardNavigation.ts` | Keyboard navigation |

## Development Workflow

```bash
# Run visual-editor tests (includes expression builder tests)
cd packages/visual-editor
pnpm test

# Watch mode during development
pnpm test:watch

# Type-check
pnpm type-check

# Lint
pnpm lint
```

## Data Flow

```
User clicks placeholder
  → OperatorPalette opens (cmdk in Radix Popover)
  → User selects operator
  → expression-store.replaceNode(placeholderId, newNode)
  → BlockRenderer re-renders affected subtree
  → expressionNodeToDsl(tree) → DSL text
  → onChange(dslText) → FunctionForm validates
```

## Expression Round-Trip

```
Text → Builder:
  1. parseExpression(text)          // wraps in func body, calls core parse()
  2. astToExpressionNode(ast)       // assign ids, resolve refs, wrap unknowns
  3. Store initializes with tree

Builder → Text:
  1. expressionNodeToDsl(tree)      // ExpressionNode → DSL string
  2. onChange(dslText)              // parent validates via core parser
```

## Design System Integration

All builder components use:
- **CSS tokens**: `var(--color-*)` from `@rune-langium/design-system/theme.css`
- **JS tokens**: `colors.*` from `@rune-langium/design-system/tokens`
- **UI components**: Popover, ScrollArea, Tabs, Badge, Tooltip, Collapsible, Button
- **Styling**: Tailwind CSS classes + CVA variants
- **Icons**: lucide-react

Expression-specific color tokens (for operator category coloring) extend the existing domain token pattern in `theme.css`.

## Testing Strategy

| Layer | Test Type | Framework |
|-------|-----------|-----------|
| Adapters (ast↔tree, tree→dsl) | Unit tests | vitest |
| Store (expression-store) | Unit tests | vitest |
| Block components | Component tests | vitest + @testing-library/react |
| Palette interaction | Integration tests | vitest + @testing-library/react |
| Round-trip fidelity | Integration tests | vitest + core parser |

Tests use vendored Rune expression fixtures — no network dependency (constitution principle II).
