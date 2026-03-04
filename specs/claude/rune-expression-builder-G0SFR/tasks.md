# Tasks: Rune Expression Builder

**Input**: Design documents from `/specs/claude/rune-expression-builder-G0SFR/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included per constitution TDD requirement — tests are written before implementation in each phase.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create project structure, shared utilities, and expression node schemas

- [X] T001 Create expression builder directory structure per plan.md (`packages/visual-editor/src/components/editors/expression-builder/`, `packages/visual-editor/src/components/editors/expression-builder/blocks/`, `packages/visual-editor/src/adapters/`, `packages/visual-editor/test/expression-builder/`)
- [X] T002 [P] Implement generic `deriveUiSchema()` transformation utility in `packages/visual-editor/src/schemas/derive-ui-schema.ts` per data-model.md (pick/overrides/extend/omitType on z.looseObject)
- [X] T003 [P] Write unit tests for `deriveUiSchema()` in `packages/visual-editor/test/expression-builder/derive-ui-schema.test.ts` — test pick, overrides, extend, omitType options
- [X] T004 Implement expression node schemas via `deriveUiSchema()` in `packages/visual-editor/src/schemas/expression-node-schema.ts` — derive all 40+ expression variant schemas from generated `zod-schemas.ts`, add Placeholder and Unsupported UI-only variants, compose into `ExpressionNodeSchema` discriminated union on `$type`
- [X] T005 Write unit tests for expression node schemas in `packages/visual-editor/test/expression-builder/expression-node-schema.test.ts` — validate schema shapes, discriminated union parsing, placeholder/unsupported variants
- [X] T006 Export `ExpressionNode` type and `ExpressionNodeSchema` from `packages/visual-editor/src/schemas/index.ts` and add `FunctionScope`, `OperatorCategory`, `OperatorDefinition` types to `packages/visual-editor/src/types.ts`

**Checkpoint**: Schema infrastructure ready — deriveUiSchema utility works, ExpressionNode type is inferred from schemas

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core adapters and store that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Tests (TDD — write first, verify they fail)

- [X] T007 [P] Write adapter tests in `packages/visual-editor/test/expression-builder/ast-to-expression-node.test.ts` — test conversion of RosettaExpression AST nodes to ExpressionNode tree: id assignment, Reference→string resolution, unsupported fallback, all major expression categories (binary, unary, lambda, conditional, switch, literal, reference, feature call, constructor, list)
- [X] T008 [P] Write serializer tests in `packages/visual-editor/test/expression-builder/expression-node-to-dsl.test.ts` — test DSL text generation for all expression types: operator precedence, parenthesization, inline function syntax `[param body]`, placeholder marker `___` for preview mode, unsupported rawText passthrough
- [X] T009 [P] Write store tests in `packages/visual-editor/test/expression-builder/expression-store.test.ts` — test replaceNode, removeNode, updateLiteral, selectNode, openPalette/closePalette, setMode, initFromText, serializeTree, undo/redo via zundo
- [ ] T010 [P] Write round-trip fidelity tests in `packages/visual-editor/test/expression-builder/round-trip.test.ts` — parse expression text → astToExpressionNode → expressionNodeToDsl → re-parse, verify equivalence for vendored Rune expression fixtures (binary, nested, conditionals, lambdas, switch, constructors)

### Implementation

- [X] T011 Implement `astToExpressionNode()` adapter in `packages/visual-editor/src/adapters/ast-to-expression-node.ts` — convert RosettaExpression AST → ExpressionNode tree: assign nanoid `id` to each node, resolve `Reference<T>` cross-refs to `$refText` strings, wrap unrecognized sub-trees as `{ $type: 'Unsupported', rawText }`, pass `$type` discriminator through unchanged
- [X] T012 Implement `expressionNodeToDsl()` and `expressionNodeToDslPreview()` serializer in `packages/visual-editor/src/adapters/expression-node-to-dsl.ts` — visitor-pattern dispatch over ExpressionNode `$type`, respect 11-level operator precedence for parenthesization, handle InlineFunction closure syntax `[param1, param2 body]`, Placeholder→throw (strict) or `___` (preview), Unsupported→rawText passthrough
- [X] T013 Implement `parseExpression()` wrapper in `packages/visual-editor/src/adapters/parse-expression.ts` — wrap expression text in minimal function body per R-002 pattern (`namespace test.expr\nfunc TestFunc:\n  output: result int (1..1)\n  set result: ${text}\n`), call core `parse()`, extract `RosettaExpression` from parsed operation, convert via `astToExpressionNode()`, return `{ tree }` or `{ error }`
- [X] T014 Implement `createExpressionStore()` in `packages/visual-editor/src/store/expression-store.ts` — zustand store with zundo temporal middleware: tree (ExpressionNode), selectedNodeId, mode, textValue, scope, paletteOpen, paletteAnchorId; actions: replaceNode (deep tree update by id), removeNode (replace with Placeholder), updateLiteral, selectNode, openPalette/closePalette, setMode, setTextValue, initFromText (parse→tree), serializeTree (tree→DSL)
- [X] T015 Add expression-specific color tokens to design system: extend `packages/design-system/src/theme.css` with `--color-expr-arithmetic`, `--color-expr-comparison`, `--color-expr-logic`, `--color-expr-navigation`, `--color-expr-collection`, `--color-expr-control`, `--color-expr-literal`, `--color-expr-reference`, `--color-expr-placeholder` (and `-bg` variants); add corresponding JS tokens to `packages/design-system/src/tokens.ts`

**Checkpoint**: Foundation ready — adapters parse/serialize expressions, store manages tree state, all foundational tests pass

---

## Phase 3: User Story 1 — View Function Expression as Visual Blocks (Priority: P1) 🎯 MVP

**Goal**: Render Rune function expressions as nested, color-coded visual blocks that domain experts can read without knowing DSL syntax

**Independent Test**: Load any Rune function with expressions and verify blocks render correctly with proper nesting, operator labels, and color coding

### Tests for User Story 1 (TDD — write first, verify they fail)

- [X] T016 [P] [US1] Write BlockRenderer component tests in `packages/visual-editor/test/expression-builder/block-renderer.test.tsx` — test recursive rendering: binary block shows operator with left/right children, unary shows argument, literal shows value, reference shows name, nested trees render correct depth, placeholder renders distinct style, unsupported renders rawText
- [X] T017 [P] [US1] Write individual block component tests in `packages/visual-editor/test/expression-builder/blocks.test.tsx` — test BinaryBlock (operator label, left/right slots), UnaryBlock (argument slot), FeatureCallBlock (receiver→feature chain), ConditionalBlock (if/then/else sections), SwitchBlock (cases list), LambdaBlock (parameter + body), ConstructorBlock (type + key-value pairs), LiteralBlock (value display), ReferenceBlock (name + type indicator), ListBlock (elements), PlaceholderBlock (dashed border, click target), UnsupportedBlock (rawText + warning)

### Implementation for User Story 1

- [X] T018 [US1] Implement `BlockRenderer.tsx` in `packages/visual-editor/src/components/editors/expression-builder/BlockRenderer.tsx` — recursive component that dispatches on `node.$type` to specialized block components, wraps each block with selection highlighting and `data-node-id` attribute, memoize with `React.memo`
- [X] T019 [P] [US1] Implement `BinaryBlock.tsx` in `packages/visual-editor/src/components/editors/expression-builder/blocks/BinaryBlock.tsx` — render operator label between left/right child BlockRenderer slots, color-coded by operator category (arithmetic/comparison/logic), display operator symbol
- [X] T020 [P] [US1] Implement `UnaryBlock.tsx` in `packages/visual-editor/src/components/editors/expression-builder/blocks/UnaryBlock.tsx` — render postfix operator label after argument child slot, handle all 20+ unary variants (exists, count, sum, flatten, distinct, first, last, reverse, type conversions)
- [X] T021 [P] [US1] Implement `FeatureCallBlock.tsx` in `packages/visual-editor/src/components/editors/expression-builder/blocks/FeatureCallBlock.tsx` — render receiver block with `->` or `->>` arrow and feature name, navigation category color
- [X] T022 [P] [US1] Implement `ConditionalBlock.tsx` in `packages/visual-editor/src/components/editors/expression-builder/blocks/ConditionalBlock.tsx` — render if/then/else sections with labeled headers, control flow category color
- [X] T023 [P] [US1] Implement `SwitchBlock.tsx` in `packages/visual-editor/src/components/editors/expression-builder/blocks/SwitchBlock.tsx` — render argument block, scrollable case list with pattern→result pairs, default case, "add case" action button, control flow category color
- [X] T024 [P] [US1] Implement `LambdaBlock.tsx` in `packages/visual-editor/src/components/editors/expression-builder/blocks/LambdaBlock.tsx` — render operator label (filter/extract/sort/min/max/reduce/then), optional argument block, closure parameter names, body block, collection category color
- [X] T025 [P] [US1] Implement `ConstructorBlock.tsx` in `packages/visual-editor/src/components/editors/expression-builder/blocks/ConstructorBlock.tsx` — render type name, key-value pair list with value blocks as child slots
- [X] T026 [P] [US1] Implement `LiteralBlock.tsx` in `packages/visual-editor/src/components/editors/expression-builder/blocks/LiteralBlock.tsx` — render literal value (boolean, int, number, string) with inline display, literal category color
- [X] T027 [P] [US1] Implement `ReferenceBlock.tsx` in `packages/visual-editor/src/components/editors/expression-builder/blocks/ReferenceBlock.tsx` — render symbol name with type badge, visual indicator for input/alias/output origin, check symbol against FunctionScope and display warning Badge (design system) for broken/unresolved references (FR-013)
- [X] T028 [P] [US1] Implement `ListBlock.tsx` in `packages/visual-editor/src/components/editors/expression-builder/blocks/ListBlock.tsx` — render list brackets with element blocks as child slots, collection category color
- [X] T029 [P] [US1] Implement `PlaceholderBlock.tsx` in `packages/visual-editor/src/components/editors/expression-builder/blocks/PlaceholderBlock.tsx` — render dashed border placeholder with expected type hint, accept `onActivate` prop callback (wired to palette in US2 T041)
- [X] T030 [P] [US1] Implement `UnsupportedBlock.tsx` in `packages/visual-editor/src/components/editors/expression-builder/blocks/UnsupportedBlock.tsx` — render rawText in monospace with distinct warning styling, tooltip explaining unsupported status
- [X] T031 [US1] Implement function section layout in `ExpressionBuilder.tsx` — render labeled headers for function sections (inputs, output, shortcuts/aliases, conditions, operations, post-conditions) per FR-010, inputs/output/section structure read-only, expression slots render BlockRenderer for each expression body
- [X] T032 [US1] Create barrel export in `packages/visual-editor/src/components/editors/expression-builder/index.ts` — export ExpressionBuilder, BlockRenderer, and all public types

**Checkpoint**: User Story 1 complete — expressions render as nested visual blocks with labeled section headers, all block types display correctly, tests pass

---

## Phase 4: User Story 2 — Build Expressions by Clicking and Selecting (Priority: P1)

**Goal**: Enable domain experts to construct expressions by clicking placeholder slots and selecting from a categorized operator palette — no DSL syntax knowledge required

**Independent Test**: Create a new function operation from scratch using only click interactions and verify the generated DSL text is syntactically valid

### Tests for User Story 2 (TDD — write first, verify they fail)

- [X] T033 [P] [US2] Write OperatorPalette interaction tests in `packages/visual-editor/test/expression-builder/operator-palette.test.tsx` — test: palette opens on placeholder click, categories display (arithmetic/comparison/logic/navigation/collection/control), fuzzy search filters operators, selecting operator creates correct node type, keyboard navigation within palette, Escape closes palette
- [X] T034 [P] [US2] Write ReferencePicker tests in `packages/visual-editor/test/expression-builder/reference-picker.test.tsx` — test: picker shows in-scope variables (inputs, aliases, output) with type and cardinality, selecting reference creates RosettaSymbolReference node, empty scope shows helpful message
- [X] T035 [P] [US2] Write integration tests for build flow in `packages/visual-editor/test/expression-builder/build-flow.test.tsx` — test: click placeholder → select operator → fills slot with new block + child placeholders, complete expression (no placeholders) serializes to valid DSL, partial expression shows placeholders clearly

### Implementation for User Story 2

- [X] T036 [US2] Define operator catalog (categories + definitions) in `packages/visual-editor/src/components/editors/expression-builder/operator-catalog.ts` — OperatorCategory[] with all operators organized per FR-003: arithmetic (+,-,*,/), comparison (=,<>,>,<,>=,<=,contains,disjoint), logic (and,or), navigation (->,->>,exists,is absent), collection (filter,extract,sort,min,max,reduce,sum,count,distinct,first,last,flatten,reverse,only-element), control (if/then/else,switch,default,join)
- [X] T037 [US2] Implement `OperatorPalette.tsx` in `packages/visual-editor/src/components/editors/expression-builder/OperatorPalette.tsx` — cmdk Command component inside Radix Popover, anchored to clicked placeholder, categorized groups with icons (lucide-react), fuzzy search input, keyboard navigation, on select: create ExpressionNode of correct $type with Placeholder children, call store.replaceNode()
- [X] T038 [US2] Implement `ReferencePicker.tsx` in `packages/visual-editor/src/components/editors/expression-builder/ReferencePicker.tsx` — dropdown showing FunctionScope entries (inputs, aliases, output) with name, typeName, cardinality badge, on select: create RosettaSymbolReference node, call store.replaceNode()
- [X] T039 [US2] Implement inline literal editing in `LiteralBlock.tsx` — add contenteditable or controlled input for literal value editing (FR-004), call store.updateLiteral() on change, validate input based on literal type (boolean toggle, numeric input, string input, date picker/formatted date input)
- [X] T040 [US2] Implement `useExpressionBuilder.ts` orchestration hook in `packages/visual-editor/src/hooks/useExpressionBuilder.ts` — wire store to onChange/onBlur slot props: on tree mutation → serializeTree() → onChange(dslText), on mode switch → onBlur(), initialize store from value prop via parseExpression(), sync scope prop to store
- [X] T041 [US2] Wire PlaceholderBlock click to open OperatorPalette — wire `onActivate` prop in `PlaceholderBlock.tsx` to call store.openPalette(nodeId), update `BlockRenderer.tsx` to render OperatorPalette when store.paletteOpen && store.paletteAnchorId matches
- [X] T042 [US2] Wire undo/redo keyboard shortcuts (FR-012) — add Ctrl+Z (undo) and Ctrl+Shift+Z (redo) handlers in `packages/visual-editor/src/hooks/useKeyboardNavigation.ts`, call zundo temporal store `undo()` / `redo()` methods (store already includes zundo from T014; this wires the keyboard bindings so undo/redo is available from MVP onward)

**Checkpoint**: User Story 2 complete — users can build expressions via click interactions, palette shows categorized operators, DSL serializes correctly, undo/redo available

---

## Phase 5: User Story 3 — Toggle Between Builder and Text Modes (Priority: P2)

**Goal**: Support switching between visual builder and raw text editor, with changes synchronized across modes

**Independent Test**: Build an expression visually, switch to text mode (verify DSL text), edit in text, switch back to builder (verify blocks update)

### Tests for User Story 3 (TDD — write first, verify they fail)

- [X] T043 [P] [US3] Write ExpressionBuilder root component tests in `packages/visual-editor/test/expression-builder/expression-builder.test.tsx` — test: renders Tabs with Builder/Text tabs, builder mode shows BlockRenderer, text mode shows textarea, switching modes preserves content, parse error blocks switch to builder with inline error
- [X] T044 [P] [US3] Write DslPreview tests in `packages/visual-editor/test/expression-builder/dsl-preview.test.tsx` — test: preview shows live DSL text, updates on tree mutations, placeholder positions shown as `___` markers

### Implementation for User Story 3

- [X] T045 [US3] Implement `ExpressionBuilder.tsx` root component in `packages/visual-editor/src/components/editors/expression-builder/ExpressionBuilder.tsx` — Tabs component (design system) with "Builder" and "Text" tabs, builder mode renders BlockRenderer + DslPreview, text mode renders textarea with value/onChange, mode toggle calls store.setMode() which triggers parse (text→builder) or serialize (builder→text), parse errors display inline and block switch to builder, conforms to ExpressionBuilderProps (extends ExpressionEditorSlotProps + scope + defaultMode)
- [X] T046 [US3] Implement `DslPreview.tsx` in `packages/visual-editor/src/components/editors/expression-builder/DslPreview.tsx` — read-only panel showing live DSL text from expressionNodeToDslPreview(tree), updates reactively via store subscription, monospace font, syntax-highlighted if feasible, collapsible via design system Collapsible component
- [X] T047 [US3] Wire ExpressionBuilder into FunctionForm via `renderExpressionEditor` slot — update `packages/visual-editor/src/components/editors/FunctionForm.tsx` to pass ExpressionBuilder as the renderExpressionEditor implementation, provide scope prop from function data, integrate with existing form validation

**Checkpoint**: User Story 3 complete — mode toggle works, text↔builder sync preserves content, parse errors handled gracefully

---

## Phase 6: User Story 4 — Context-Aware Operator Filtering (Priority: P2)

**Goal**: Palette shows only operators valid for the current expression position based on type context

**Independent Test**: Click placeholders in various type contexts and verify palette shows only type-compatible options

### Tests for User Story 4 (TDD — write first, verify they fail)

- [X] T048 [P] [US4] Write context filtering tests in `packages/visual-editor/test/expression-builder/context-filtering.test.tsx` — test: numeric context shows arithmetic + numeric refs, boolean context shows comparison + logic, collection context shows collection operators (filter, extract, sum, count), single-value context hides collection-only operators, filter closure body shows boolean-producing operators

### Implementation for User Story 4

- [X] T049 [US4] Implement type context resolution in `packages/visual-editor/src/hooks/useContextFilter.ts` — new hook to determine expectedType from parent node context (binary left/right → infer from operator, conditional if → boolean, lambda body → depends on operator), resolve type from tree structure
- [X] T050 [US4] Add type-aware filtering to OperatorPalette — update `OperatorPalette.tsx` to receive filteredCategories with recommended annotations, visually de-emphasize (but don't hide) operators that don't match context type

**Checkpoint**: User Story 4 complete — palette filters operators by type context, invalid choices de-emphasized

---

## Phase 7: User Story 5 — Restructure Expressions via Drag and Drop (Priority: P3)

**Goal**: Users can restructure expressions by dragging blocks to new positions

**Independent Test**: Drag a sub-expression from one slot to another and verify expression validity and DSL update

### Tests for User Story 5 (TDD — write first, verify they fail)

- [X] T051 [P] [US5] Write drag-and-drop tests in `packages/visual-editor/test/expression-builder/drag-drop.test.tsx` — test: drag block to placeholder fills slot, source becomes placeholder, drag to invalid target shows rejection indicator, tree remains structurally valid after reparenting

### Implementation for User Story 5

- [X] T052 [US5] Implement native HTML drag-and-drop via useDragDrop hook in `packages/visual-editor/src/hooks/useDragDrop.ts` — useDraggable and useDroppable hooks with EXPRESSION_DRAG_TYPE MIME type
- [X] T053 [US5] Add drag source behavior to BlockRenderer — update `BlockRenderer.tsx` with draggable attribute and onDragStart handler for non-placeholder nodes
- [X] T054 [US5] Add drop target behavior to PlaceholderBlock — update `PlaceholderBlock.tsx` with onDragOver/onDragEnter/onDragLeave/onDrop handlers and visual drop indicator

**Checkpoint**: User Story 5 complete — blocks can be dragged to restructure expressions

---

## Phase 8: User Story 6 — Copy, Paste, and Undo Expression Sub-Trees (Priority: P3)

**Goal**: Users can copy/paste sub-expressions (undo/redo keyboard shortcuts already wired in US2 T042)

**Independent Test**: Copy a sub-expression, paste into another placeholder, verify both render.

### Tests for User Story 6 (TDD — write first, verify they fail)

- [X] T055 [P] [US6] Write copy/paste tests in `packages/visual-editor/test/expression-builder/clipboard.test.tsx` — test: copy stores deep clone of sub-tree, paste inserts copy with new ids at placeholder, multiple undo levels work with clipboard operations

### Implementation for User Story 6

- [X] T056 [US6] Clipboard actions already implemented in expression store — copyNode deep-clones sub-tree to store clipboard, pasteNode assigns new randomUUID ids to cloned tree and replaces target placeholder
- [X] T057 [US6] Wire copy/paste keyboard shortcuts — add Ctrl+C (copy selected node) and Ctrl+V (paste at selected placeholder) handlers in `packages/visual-editor/src/hooks/useKeyboardNavigation.ts`

**Checkpoint**: User Story 6 complete — clipboard works via keyboard shortcuts

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T058 Implement keyboard navigation in `packages/visual-editor/src/hooks/useKeyboardNavigation.ts` — aria-activedescendant pattern per R-007: Arrow keys move through linearized depth-first block ordering, Enter opens palette on placeholders, Escape cancels current action, Delete replaces selected block with placeholder (FR-018)
- [ ] T059 Add collapsible sub-expressions — update block components to support Collapsible (design system) wrapper for deeply nested sub-trees (FR-014), toggle via click or keyboard
- [ ] T060 Verify all components use design system tokens and components per FR-019 — audit all block components for CSS token usage (`var(--color-expr-*)`), verify Popover/ScrollArea/Tabs/Badge/Tooltip/Collapsible/Button from design system, CVA variants for block styling
- [ ] T061 Run full test suite and verify all tests pass — `cd packages/visual-editor && pnpm test`
- [ ] T062 Run type-check and lint — `cd packages/visual-editor && pnpm type-check && pnpm lint`
- [ ] T063 Run quickstart.md validation — verify data flow, round-trip, and testing strategy described in quickstart.md match implementation
- [ ] T064 Performance benchmark — test 50-node expression render and interaction timing against <16ms frame budget per plan.md performance goal, document results

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (schemas) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 (adapters, store) — renders expression trees
- **US2 (Phase 4)**: Depends on Phase 3 (block components exist to receive new nodes)
- **US3 (Phase 5)**: Depends on Phase 2 (adapters for parse/serialize) — can proceed in parallel with US1/US2 for the root component, but full integration needs US1
- **US4 (Phase 6)**: Depends on Phase 4 (palette exists to be filtered)
- **US5 (Phase 7)**: Depends on Phase 3 (blocks exist to be dragged)
- **US6 (Phase 8)**: Depends on Phase 4 (undo/redo wired in US2; clipboard extends store from Phase 2)
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational (Phase 2) — No dependencies on other stories
- **US2 (P1)**: Depends on US1 (blocks must exist for palette to insert into)
- **US3 (P2)**: Can start after Foundational for root component; full integration needs US1
- **US4 (P2)**: Depends on US2 (palette must exist to add filtering)
- **US5 (P3)**: Depends on US1 (blocks must exist to be dragged)
- **US6 (P3)**: Depends on US2 (undo/redo keyboard shortcuts must exist; clipboard extends store)

### Within Each User Story

- Tests MUST be written and FAIL before implementation (TDD per constitution)
- Schema/model tasks before adapter/service tasks
- Core rendering before interaction
- Story complete before moving to next priority

### Parallel Opportunities

- T002 + T003 can run in parallel (utility implementation + tests in different files)
- T007 + T008 + T009 + T010 can all run in parallel (test files for different adapters/store)
- T016 + T017 can run in parallel (different test files for US1)
- T019–T030 can all run in parallel (individual block component files)
- T033 + T034 + T035 can run in parallel (different test files for US2)
- T043 + T044 can run in parallel (different test files for US3)
- Different user stories can be worked on in parallel by different team members (after Foundational phase)

---

## Parallel Example: User Story 1

```bash
# Launch all tests for US1 together (TDD - write first):
Task: T016 "Write BlockRenderer component tests in test/expression-builder/block-renderer.test.tsx"
Task: T017 "Write individual block component tests in test/expression-builder/blocks.test.tsx"

# Launch all block components together (after BlockRenderer):
Task: T019 "Implement BinaryBlock.tsx"
Task: T020 "Implement UnaryBlock.tsx"
Task: T021 "Implement FeatureCallBlock.tsx"
Task: T022 "Implement ConditionalBlock.tsx"
Task: T023 "Implement SwitchBlock.tsx"
Task: T024 "Implement LambdaBlock.tsx"
Task: T025 "Implement ConstructorBlock.tsx"
Task: T026 "Implement LiteralBlock.tsx"
Task: T027 "Implement ReferenceBlock.tsx"
Task: T028 "Implement ListBlock.tsx"
Task: T029 "Implement PlaceholderBlock.tsx"
Task: T030 "Implement UnsupportedBlock.tsx"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup (schemas, deriveUiSchema)
2. Complete Phase 2: Foundational (adapters, store, design tokens)
3. Complete Phase 3: User Story 1 (view expressions as blocks)
4. **STOP and VALIDATE**: Test US1 independently — load Rune functions, verify block rendering
5. Complete Phase 4: User Story 2 (build expressions by clicking + undo/redo)
6. **STOP and VALIDATE**: Test US2 independently — construct expressions from scratch via clicks, verify undo/redo
7. Deploy/demo if ready — MVP delivers read + write + undo/redo capability

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add US1 → Test independently → Read-only expression viewing
3. Add US2 → Test independently → Interactive expression building + undo/redo (MVP!)
4. Add US3 → Test independently → Text↔Builder mode toggle
5. Add US4 → Test independently → Context-aware filtering
6. Add US5 → Test independently → Drag-and-drop restructuring
7. Add US6 → Test independently → Copy/paste
8. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing (TDD per constitution)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- All schemas derived via `deriveUiSchema()` — no hand-coded Zod schemas
- `$type` discriminator throughout (matches generated AST schemas)
- ExpressionNode type inferred from schema: `z.infer<typeof ExpressionNodeSchema>`
