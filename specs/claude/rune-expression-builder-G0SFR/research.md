# Research: Rune Expression Builder

**Date**: 2026-03-04 | **Status**: Complete

## R-001: Expression Serialization (AST → DSL Text)

**Decision**: Build a new `expression-tree-to-dsl.ts` serializer in `packages/visual-editor` using visitor-pattern dispatch over the `ExpressionNode` discriminated union.

**Rationale**: The existing `rosetta-serializer.ts` in `@rune-langium/core` handles only top-level elements (Data, Choice, Enumeration). It has **zero** support for expression serialization — conditions are hardcoded to output `True`. No expression-to-text utility exists anywhere in the codebase. The serializer must be built from scratch.

**Alternatives considered**:
- *Extend rosetta-serializer.ts*: Rejected because expression serialization is UI-specific (needs to handle placeholders, partial trees) and the core serializer shouldn't depend on builder concepts.
- *Use Langium's built-in serialization*: Rejected because we're working with a lightweight `ExpressionNode` model (not full Langium AST nodes), and need custom handling for placeholders and unsupported blocks.

**Key findings**:
- 40+ expression AST variants in `RosettaExpression` union type (generated AST)
- 11-level operator precedence hierarchy must be respected for correct parenthesization
- Inline functions (`InlineFunction`) have closure parameters `[param1, param2 body]` requiring careful formatting
- Test file `expressions.test.ts` documents all 26+ DSL syntax patterns needed as serialization targets
- Estimated ~600-800 lines for complete serializer

## R-002: Expression Parsing (DSL Text → ExpressionNode)

**Decision**: Wrap expression text in a minimal function body and use the existing `parse()` API from `@rune-langium/core`, then extract the `RosettaExpression` from the parsed operation. Convert via `ast-to-expression-tree.ts` adapter.

**Rationale**: No direct expression parsing API exists. The grammar requires expressions to appear within operation contexts. The test suite already uses this wrapping pattern successfully.

**Alternatives considered**:
- *Create a standalone expression parser entry point in core*: Rejected for now — would require grammar changes and is out of scope. Can be added later as an optimization.
- *Use a separate parser (e.g., PEG.js)*: Rejected because it would duplicate grammar rules and diverge from the source of truth.

**Wrapping pattern** (from test suite):
```typescript
const input = `namespace test.expr\nfunc TestFunc:\n  output: result int (1..1)\n  set result: ${expressionText}\n`;
const result = await parse(input);
// Extract: result.value.elements[0].operations[0].expression
```

## R-003: ExpressionNode Model Design

**Decision**: Define a lightweight `ExpressionNode` discriminated union in the visual-editor package that mirrors the AST structure but is optimized for UI rendering and manipulation. Include a `Placeholder` variant not present in the grammar AST.

**Rationale**: The generated `RosettaExpression` AST types contain Langium cross-references (`Reference<T>`), parent pointers, and CST nodes that are unnecessary for the UI layer. A clean model enables:
- Immutable state updates (zustand)
- Undo/redo via zundo
- Placeholder nodes for incremental construction
- Unsupported fallback nodes for graceful degradation

**Alternatives considered**:
- *Use RosettaExpression directly*: Rejected because Langium AST nodes are mutable with cross-references, incompatible with zustand immutable patterns and undo/redo snapshots.
- *Use a generic tree structure*: Rejected because type-specific rendering and validation require discriminated union access.

## R-004: Recursive Block Rendering Strategy

**Decision**: Use a single recursive `BlockRenderer` component that dispatches to specialized block components via a switch on `ExpressionNode.kind`. Memoize each block component with `React.memo`. No virtualization needed for target scale (≤50 nodes).

**Rationale**: At the target scale of 50 nodes, virtualization adds complexity without benefit. Each block is a small React component (~20-50 lines). `React.memo` prevents re-renders of unchanged subtrees. The recursive approach naturally mirrors the tree structure and keeps the code simple.

**Alternatives considered**:
- *Flat rendering with indentation*: Rejected because nested blocks need parent-child visual containment (borders, backgrounds) that flat rendering can't express.
- *Virtualized tree (react-window)*: Rejected because 50 nodes is well within React's rendering budget without virtualization.

## R-005: State Management for Expression Trees

**Decision**: Create a dedicated `expression-store.ts` using zustand with zundo temporal middleware for undo/redo. Store holds the `ExpressionNode` tree, selected node path, and mode (builder/text). The store is scoped to a single expression being edited.

**Rationale**: The existing `editor-store.ts` manages graph-level state (nodes, edges, selection). Expression editing is a nested concern within a single function node. A separate store keeps concerns isolated and enables independent undo/redo for expression edits (separate from graph-level undo).

**Alternatives considered**:
- *Extend editor-store.ts*: Rejected because expression state is transient (only exists while editing a function) and would bloat the graph store.
- *React useState/useReducer*: Rejected because undo/redo support and cross-component state sharing (palette → tree → preview) favor zustand.

## R-006: Operator Palette Implementation

**Decision**: Use `cmdk` (already in design-system dependencies) within a `@radix-ui/react-popover` for the operator palette. Anchor the popover to the clicked placeholder slot. Organize operators into categories matching spec FR-003.

**Rationale**: `cmdk` provides fuzzy search, keyboard navigation, and categorized groups out of the box. It's already a dependency of `@rune-langium/design-system` via the `command.tsx` component. Popover positioning from Radix handles edge cases (viewport overflow, scroll).

**Alternatives considered**:
- *Custom dropdown*: Rejected — would duplicate cmdk functionality already available.
- *Inline autocomplete (like VS Code)*: Rejected for P1 — the categorized palette is more discoverable for domain experts unfamiliar with Rune syntax. Could be added as P3 enhancement.

## R-007: Keyboard Navigation Approach

**Decision**: Use `aria-activedescendant` pattern with a single container managing focus. Arrow keys move through a linearized (depth-first) ordering of blocks and slots. Enter opens palette on placeholders, Escape cancels, Delete replaces with placeholder.

**Rationale**: Roving tabindex in deeply nested trees is fragile — focus management across 50+ elements is error-prone. `aria-activedescendant` keeps DOM focus on the container while visually highlighting the active block, which is simpler and more performant.

**Alternatives considered**:
- *Roving tabindex*: Rejected for deep trees — requires careful focus management across re-renders and tree mutations.
- *No keyboard support initially*: Rejected — FR-018 requires keyboard navigation.

## R-008: Drag-and-Drop Strategy

**Decision**: Defer drag-and-drop to P3 (User Story 5). When implemented, use `@dnd-kit/core` with a custom tree collision strategy. The expression store will handle reparenting by removing the node from the source path and inserting at the target path.

**Rationale**: Drag-and-drop is P3 priority per spec. @dnd-kit is the modern React DnD library (maintained, accessible, supports nested trees). react-dnd is legacy. Native HTML5 DnD has poor tree support.

**Alternatives considered**:
- *Implement DnD in P1*: Rejected — not required for core value proposition; users can delete and rebuild.
- *react-dnd*: Rejected — less maintained, more complex API for tree reparenting.

## R-009: Design System Integration

**Decision**: Use design system tokens (CSS custom properties from `theme.css`), color tokens from `tokens.ts`, and existing UI components (Popover, ScrollArea, Tabs, Badge, Tooltip, Collapsible, Button) throughout the builder. Define expression-specific tokens (operator category colors) as extensions to the existing domain token pattern.

**Rationale**: FR-019 requires design system adherence. The existing design system provides all foundational primitives needed. Expression-specific colors (for operator categories like arithmetic=blue, comparison=green, logic=purple) follow the same pattern as existing domain colors (data=blue, choice=amber, enum=green, func=purple).

**New tokens needed** (extend `theme.css` and `tokens.ts`):
- `--color-expr-arithmetic` / `--color-expr-arithmetic-bg`
- `--color-expr-comparison` / `--color-expr-comparison-bg`
- `--color-expr-logic` / `--color-expr-logic-bg`
- `--color-expr-navigation` / `--color-expr-navigation-bg`
- `--color-expr-collection` / `--color-expr-collection-bg`
- `--color-expr-control` / `--color-expr-control-bg`
- `--color-expr-literal` / `--color-expr-literal-bg`
- `--color-expr-reference` / `--color-expr-reference-bg`
- `--color-expr-placeholder` / `--color-expr-placeholder-bg`

## R-010: Text ↔ Builder Mode Toggle

**Decision**: Implement mode toggle as a `Tabs` component (from design system) with "Builder" and "Text" tabs. Text mode uses the existing `Textarea` fallback. Switching from text→builder re-parses via the wrapping pattern (R-002). Switching from builder→text serializes the tree (R-001). Parse errors block the switch to builder and display inline.

**Rationale**: This aligns with User Story 3 and FR-008. The Tabs component from the design system provides consistent styling. Using text as the source of truth (per spec assumptions) means every mode switch is a parse or serialize operation, ensuring consistency.

**Alternatives considered**:
- *Side-by-side view*: Rejected for P1 — adds complexity; the DSL preview panel (FR-009) already shows live text alongside blocks.
- *Auto-sync on every keystroke in text mode*: Rejected — too expensive and would show constant parse errors during typing.
