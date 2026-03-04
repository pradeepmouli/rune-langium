# Implementation Plan: Rune Expression Builder

**Branch**: `007-expression-builder` | **Date**: 2026-03-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/claude/rune-expression-builder-G0SFR/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Build a visual block-based expression builder for constructing Rune function expressions (operations, conditions, shortcuts, post-conditions) as an alternative to raw text editing. The builder renders expression ASTs as nested, color-coded blocks with placeholder-driven construction, operator palette selection, context-aware filtering, and bidirectional text↔block synchronization. It integrates into the existing `FunctionForm` via the `renderExpressionEditor` slot and leverages the `@rune-langium/core` parser and generated AST types alongside `@rune-langium/design-system` tokens and components.

## Technical Context

**Language/Version**: TypeScript 5.9+ (strict mode, ESM)
**Primary Dependencies**: React 19, @xyflow/react 12, zustand 5, zundo 2 (undo/redo), @rune-langium/core (parser, AST types), @rune-langium/design-system (theme, tokens, UI primitives), @radix-ui/* (popover, collapsible, tabs, tooltip, scroll-area), class-variance-authority (CVA), cmdk (command palette), lucide-react (icons), Tailwind CSS 4
**Storage**: N/A (browser-only, in-memory expression tree state)
**Testing**: vitest + @testing-library/react + jsdom
**Target Platform**: Browser-only (no backend); File System Access API for standalone app
**Project Type**: Component library (visual-editor package within pnpm monorepo)
**Performance Goals**: Expressions up to 50 nodes render and respond to edits without perceptible delay (<16ms frame budget for interactions)
**Constraints**: Browser-only; must integrate into existing FunctionForm via `ExpressionEditorSlotProps`; must use design system tokens and components; text (Rune DSL) is the source of truth
**Scale/Scope**: Covers all 48 expression AST types in 11-level precedence hierarchy; 19 UI components for operator categories

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. DSL Fidelity & Typed AST | ✅ PASS | Builder uses typed `RosettaExpression` union from generated AST. Expression nodes are never opaque strings. Serialization produces parseable Rune DSL text. |
| II. Deterministic Fixtures | ✅ PASS | Builder tests will use vendored fixture expressions from in-repo Rune sources; no network dependency. |
| III. Validation Parity | ✅ PASS | Builder does not introduce new validation rules; it validates expressions by round-tripping through the existing Rune parser. |
| IV. Performance & Workers | ✅ PASS | Builder runs in browser; parsing for validation can use existing parser. No new latency budgets are introduced beyond the spec's 50-node target. |
| V. Reversibility & Compatibility | ✅ PASS | Builder integrates via existing `renderExpressionEditor` slot — fully backward-compatible. Fallback textarea remains when builder is not used. |
| Tooling: TypeScript + pnpm | ✅ PASS | All code in TypeScript within existing `packages/visual-editor`. |
| Tooling: oxlint + oxfmt | ✅ PASS | Will follow existing repo linting/formatting config. |
| Tooling: vitest | ✅ PASS | Tests use vitest with jsdom environment, matching existing visual-editor test setup. |
| Quality: TDD | ✅ PASS | Tests written before implementation per constitution gates. |

## Project Structure

### Documentation (this feature)

```text
specs/claude/rune-expression-builder-G0SFR/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/visual-editor/
├── src/
│   ├── components/
│   │   ├── editors/
│   │   │   ├── FunctionForm.tsx           # Existing — wire in expression builder
│   │   │   └── expression-builder/        # NEW — all builder components
│   │   │       ├── ExpressionBuilder.tsx   # Root builder component (mode toggle, layout)
│   │   │       ├── BlockRenderer.tsx       # Recursive block tree renderer
│   │   │       ├── blocks/                # Block components by expression kind
│   │   │       │   ├── BinaryBlock.tsx
│   │   │       │   ├── UnaryBlock.tsx
│   │   │       │   ├── FeatureCallBlock.tsx
│   │   │       │   ├── ConditionalBlock.tsx
│   │   │       │   ├── SwitchBlock.tsx
│   │   │       │   ├── LambdaBlock.tsx
│   │   │       │   ├── ConstructorBlock.tsx
│   │   │       │   ├── LiteralBlock.tsx
│   │   │       │   ├── ReferenceBlock.tsx
│   │   │       │   ├── ListBlock.tsx
│   │   │       │   ├── PlaceholderBlock.tsx
│   │   │       │   └── UnsupportedBlock.tsx
│   │   │       ├── OperatorPalette.tsx     # Categorized operator/operand picker (cmdk)
│   │   │       ├── ReferencePicker.tsx     # In-scope variable picker
│   │   │       ├── DslPreview.tsx          # Live DSL text preview panel
│   │   │       └── index.ts               # Public exports
│   │   └── ...
│   ├── store/
│   │   ├── editor-store.ts                # Existing — extend for expression state
│   │   ├── expression-store.ts            # NEW — expression tree state + undo/redo
│   │   └── history.ts                     # Existing
│   ├── schemas/
│   │   ├── form-schemas.ts               # Existing — refactor to derive from generated schemas
│   │   ├── expression-node-schema.ts     # NEW — ExpressionNode schema (transforms generated)
│   │   └── index.ts                      # Existing — add expression schema exports
│   ├── adapters/
│   │   ├── ast-to-expression-node.ts     # NEW — RosettaExpression AST → ExpressionNode
│   │   └── expression-node-to-dsl.ts     # NEW — ExpressionNode → Rune DSL text
│   ├── hooks/
│   │   ├── useExpressionAutocomplete.ts   # Existing — enhance for context-aware filtering
│   │   ├── useExpressionBuilder.ts        # NEW — builder orchestration hook
│   │   └── useKeyboardNavigation.ts       # NEW — keyboard nav for blocks/slots
│   ├── types.ts                           # Existing — ExpressionNode type inferred from schema
│   └── validation/
│       └── edit-validator.ts              # Existing — enhance for round-trip validation
├── test/
│   ├── expression-builder/
│   │   ├── expression-node-schema.test.ts # Schema transformation tests
│   │   ├── ast-to-expression-node.test.ts # Adapter unit tests
│   │   ├── expression-node-to-dsl.test.ts # Serializer unit tests
│   │   ├── block-renderer.test.tsx        # Component render tests
│   │   ├── operator-palette.test.tsx      # Palette interaction tests
│   │   ├── expression-store.test.ts       # Store unit tests
│   │   └── round-trip.test.ts             # Parse → build → serialize fidelity
│   └── ...
└── ...
```

**Structure Decision**: All new code lives within the existing `packages/visual-editor` package. The expression builder is a sub-module of the editors directory, following the established pattern. No new packages are created.

## Follow-On: Migrate Hand-Crafted Form Schemas (R-011)

After the expression builder is complete, refactor `schemas/form-schemas.ts` to derive all schemas from the generated `zod-schemas.ts` using the same transformation pattern (`.pick()` / `.extend()`), eliminating hand-coded schemas and manual conformance checks. See [research.md R-011](./research.md#r-011-migrate-hand-crafted-form-schemas-to-generated-schema-transformations) for full scope and migration pattern.

**Scope**: `dataTypeFormSchema`, `enumFormSchema`, `choiceFormSchema`, `functionFormSchema`, `memberSchema`, `attributeSchema`, `enumValueSchema` — all derived from their generated counterparts. `metadataSchema` kept as-is (form-specific). Removes ~130 lines of hand-coded schema + conformance checks.

**Timing**: Separate PR after expression builder lands.

## Complexity Tracking

> No constitution violations requiring justification.
