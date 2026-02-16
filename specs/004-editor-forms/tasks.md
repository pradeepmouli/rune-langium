# Tasks: Editor Forms for Types, Enums, Choices, and Functions

**Input**: Design documents from `/specs/004-editor-forms/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Required by constitution (TDD). Test tasks are included before implementation in each phase.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. US5 (Cross-Domain Metadata) is satisfied by the shared MetadataSection component built in Foundational and composed into every form.

## Constitution Check

- [X] CC-001 All form mutations flow through typed store actions → graph-to-ast → typed Langium AST; no opaque string manipulation (DSL Fidelity)
- [X] CC-002 Test fixtures use vendored .rosetta files from .resources/cdm/ — deterministic and offline (Deterministic Fixtures)
- [X] CC-003 Validation rules S-05, S-06, S-07 are subsets of Xtext parity rules; no new rules beyond parity scope (Validation Parity)
- [X] CC-004 Form field updates < 200ms; rename cascade < 1ms at CDM scale (400 nodes); re-parsing runs in web worker (Performance)
- [X] CC-005 Existing inline editors (TypeCreator, AttributeEditor, CardinalityEditor) preserved unchanged; DetailPanel read-only mode retained via readOnly prop (Reversibility)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US6)
- Include exact file paths in descriptions

## Path Conventions

- **Library**: `packages/visual-editor/src/` — unstyled components, store, types, hooks
- **App**: `apps/studio/src/` — styled UI primitives, pages, layout wiring
- **Adapters**: `packages/visual-editor/src/adapters/` — ast-to-graph, graph-to-ast
- **Validation**: `packages/visual-editor/src/validation/` — edit-validator

---

## Phase 1: Setup (Dependencies & shadcn Scaffolding)

**Purpose**: Install new npm packages and add shadcn/ui components needed by the editor forms

- [X] T001 Install npm dependencies (cmdk, @radix-ui/react-popover, @radix-ui/react-collapsible, @radix-ui/react-label, @radix-ui/react-select) in apps/studio via `pnpm --filter @rune-langium/studio add`
- [X] T002 [P] Add shadcn/ui token alias `@theme inline` block (mapping shadcn variable names to Rune design tokens per research.md R-02) to apps/studio/src/styles.css
- [X] T003 [P] Add shadcn Label component to apps/studio/src/components/ui/label.tsx
- [X] T004 [P] Add shadcn Select component to apps/studio/src/components/ui/select.tsx
- [X] T005 [P] Add shadcn Textarea component to apps/studio/src/components/ui/textarea.tsx
- [X] T006 [P] Add shadcn Collapsible component to apps/studio/src/components/ui/collapsible.tsx
- [X] T007 [P] Add shadcn Popover component to apps/studio/src/components/ui/popover.tsx
- [X] T008 [P] Add shadcn Command component (cmdk-based, for searchable dropdown) to apps/studio/src/components/ui/command.tsx

---

## Phase 2: Foundational (Types, Store, Adapters, Shared Components)

**Purpose**: Core type extensions, store actions, validation rules, adapter updates, and shared sub-components that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Tests for Foundational (write FIRST, must FAIL before implementation)

- [X] T042 [P] Unit tests for store actions: test addEnumValue, removeEnumValue, updateEnumValue, setEnumParent, addChoiceOption, removeChoiceOption, updateDefinition, updateComments, addSynonym, removeSynonym, updateAttribute, reorderAttribute, reorderEnumValue against a loaded graph fixture in packages/visual-editor/test/store/editor-store-actions.test.ts
- [X] T043 [P] Unit tests for rename cascade: test renameType updates target node name+ID, all member typeName/parentName references, all edge source/target/labels/IDs, selectedNodeId — with CDM-scale fixture (400 nodes) in packages/visual-editor/test/store/rename-cascade.test.ts
- [X] T044 [P] Unit tests for validation rules: test S-05 duplicate enum values, S-06 empty names, S-07 invalid name chars, expression parse-validation in packages/visual-editor/test/validation/edit-validator.test.ts
- [X] T045 [P] Unit tests for useAutoSave hook: test debounce timing with vi.useFakeTimers, flush-on-unmount, rapid value changes in packages/visual-editor/test/hooks/useAutoSave.test.ts

### Implementation for Foundational

- [X] T009 Extend TypeNodeData with `synonyms?: string[]` and `isReadOnly?: boolean` fields; extend MemberDisplay with `displayName?: string` field in packages/visual-editor/src/types.ts
- [X] T010 Add TypeOption interface, EditorFormActions callback interface, and BUILTIN_TYPES constant (string, int, number, boolean, date, time, dateTime, zonedDateTime) to packages/visual-editor/src/types.ts
- [X] T011 Wire Zundo temporal() middleware into createEditorStore using double-call syntax for TypeScript inference with existing temporalOptions in packages/visual-editor/src/store/editor-store.ts
- [X] T012 [P] Create useAutoSave hook (setTimeout/clearTimeout with ref-based latest value, configurable delay defaulting to 500ms, flush-on-unmount) in packages/visual-editor/src/hooks/useAutoSave.ts
- [X] T013 [P] Export useTemporalStore selector hook and convenience helpers (useCanUndo, useCanRedo, useUndo, useRedo) from packages/visual-editor/src/store/history.ts
- [X] T014 Add 13 new store actions to EditorActions and implement them in createEditorStore: updateAttribute, reorderAttribute, addEnumValue, removeEnumValue, updateEnumValue, reorderEnumValue, setEnumParent, addChoiceOption, removeChoiceOption, updateDefinition, updateComments, addSynonym, removeSynonym in packages/visual-editor/src/store/editor-store.ts
- [X] T015 Update renameType action with cascade logic: rename target node name + ID, update all other nodes' member typeName and parentName references, update all edge source/target/labels/IDs, update selectedNodeId — single atomic set() call in packages/visual-editor/src/store/editor-store.ts
- [X] T016 [P] Add validation rules S-05 (duplicate enum value names within an enum), S-06 (empty type/enum/choice name), S-07 (invalid name characters per Rune DSL identifier rules), and expression parse-validation helper for function expressions (validates expression text via web worker parse pipeline, returns error/success) to packages/visual-editor/src/validation/edit-validator.ts
- [X] T017 [P] Update ast-to-graph adapter to populate TypeNodeData.synonyms from source.synonyms array, TypeNodeData.isReadOnly from source origin, MemberDisplay.displayName from RosettaEnumValue.display in packages/visual-editor/src/adapters/ast-to-graph.ts
- [X] T018 [P] Update graph-to-ast adapter to read TypeNodeData.synonyms for synonym annotation synthesis and MemberDisplay.displayName for enum value displayName syntax in packages/visual-editor/src/adapters/graph-to-ast.ts
- [X] T019 Build TypeSelector component: composition-based (accepts renderTrigger/renderPopover props so host app injects shadcn Popover + Command); with type-ahead search, kind-colored badges (blue=data, amber=choice, green=enum, gray=builtin), grouped by kind then namespace, allowClear option, max-height 300px with scroll in packages/visual-editor/src/components/editors/TypeSelector.tsx
- [X] T020 [P] Build CardinalityPicker component: 4 preset toggle buttons (1..1, 0..1, 0..*, 1..*) with active state + custom input field with validateCardinality() validation in packages/visual-editor/src/components/editors/CardinalityPicker.tsx
- [X] T021 [P] Build MetadataSection component: collapsible section with "Metadata" header (default expanded), auto-resize textarea for description with placeholder, auto-resize textarea for comments with placeholder, synonym tag-list with inline add input and × remove buttons in packages/visual-editor/src/components/editors/MetadataSection.tsx

**Checkpoint**: Foundation ready — types extended, store enriched with 13 new actions and 1 modified (renameType cascade), adapters updated, validation rules added, shared components (TypeSelector, CardinalityPicker, MetadataSection) built. User story implementation can now begin.

---

## Phase 3: User Story 1 — Edit a Data Type (P1) + User Story 5 — Cross-Domain Metadata (P1) 🎯 MVP

**Goal**: Select a Data type node in the graph and edit its name, parent type, attributes (add/remove/update name/type/cardinality), and metadata (description, synonyms) through a structured form panel.

**Independent Test**: Load a .rosetta file with `type Trade extends Event` and attributes. Click the "Trade" node. Verify the editor form renders with editable fields. Rename the type, add an attribute, remove an attribute, reorder attributes via drag, change a cardinality, edit the description, add a synonym. Verify the graph and model update correctly.

**US5 Coverage**: MetadataSection (built in Phase 2) is composed into DataTypeForm here, making cross-domain metadata editing testable for the first time.

### Tests for User Story 1 (write FIRST, must FAIL before implementation)

- [X] T046 [P] [US1] Unit tests for AttributeRow: test name/type/cardinality rendering, auto-save debounce, remove callback, drag reorder callback, override badge display in packages/visual-editor/test/editors/AttributeRow.test.tsx
- [X] T047 [P] [US1] Integration tests for DataTypeForm: test form renders all fields for a loaded Data type, rename triggers renameType, parent type selection triggers setInheritance, add/remove/reorder attribute round-trip in packages/visual-editor/test/editors/DataTypeForm.test.tsx
- [X] T048 [P] [US1] Integration tests for EditorFormPanel: test dispatch by kind (data→DataTypeForm, readOnly→DetailPanel, null→empty), accessibility attributes, Escape key closes in packages/visual-editor/test/editors/EditorFormPanel.test.tsx

### Implementation for User Story 1

- [X] T022 [P] [US1] Build AttributeRow component: inline row with drag handle (⠿), name input, TypeSelector for attribute type, CardinalityPicker, remove button; name and type auto-save with 500ms debounce via useAutoSave; drag-and-drop reorder via onReorder callback; override attributes show dimmed "override" badge in packages/visual-editor/src/components/editors/AttributeRow.tsx
- [X] T023 [US1] Build DataTypeForm component: compose header section (editable name + "Data" blue badge), inheritance section (TypeSelector with allowClear for parent type, immediate commit), attributes section (AttributeRow list + "Add Attribute" button), and MetadataSection at bottom in packages/visual-editor/src/components/editors/DataTypeForm.tsx
- [X] T024 [US1] Build EditorFormPanel dispatch component: render DataTypeForm when kind='data', DetailPanel when readOnly=true, empty state when nodeData=null; scrollable content with sticky header showing name + kind badge; role="complementary" with aria-label; Escape key closes panel in packages/visual-editor/src/components/panels/EditorFormPanel.tsx
- [X] T025 [US1] Update editor component barrel exports to re-export all new components (TypeSelector, CardinalityPicker, MetadataSection, AttributeRow, DataTypeForm, EditorFormPanel) in packages/visual-editor/src/components/editors/index.ts
- [X] T026 [US1] Wire EditorFormPanel into EditorPage: add right-side ResizablePanel, add toolbar toggle button ("Editor" icon), construct EditorFormActions from store actions, pass availableTypes from graph nodes + BUILTIN_TYPES, connect selectedNodeId to node data lookup in apps/studio/src/pages/EditorPage.tsx

**Checkpoint**: Data type editing via forms is fully functional. Metadata editing (US5) works for data types. Select a node → edit in form → graph updates. This is the MVP.

---

## Phase 4: User Story 2 — Edit an Enumeration (P1)

**Goal**: Select an Enumeration node and edit its name, parent enum, and enum values (add/remove, set names and display names) through the editor form.

**Independent Test**: Load a .rosetta file with `enum CurrencyEnum` and values. Select the enum node. Add/remove enum values, reorder values via drag, set display names, change the parent enum. Verify the model and graph update correctly.

### Tests for User Story 2 (write FIRST, must FAIL before implementation)

- [X] T049 [P] [US2] Unit tests for EnumValueRow: test name/displayName rendering, auto-save debounce, remove callback, drag reorder callback, empty name validation in packages/visual-editor/test/editors/EnumValueRow.test.tsx
- [X] T050 [P] [US2] Integration tests for EnumForm: test form renders all fields for a loaded Enum, add/remove/reorder values, set display names, parent enum selection in packages/visual-editor/test/editors/EnumForm.test.tsx

### Implementation for User Story 2

- [X] T027 [P] [US2] Build EnumValueRow component: inline row with drag handle (⠿), value name input, optional display name input (placeholder "Display name (optional)"), remove button; both fields auto-save with 500ms debounce; drag-and-drop reorder via onReorder callback; empty value name shows red border in packages/visual-editor/src/components/editors/EnumValueRow.tsx
- [X] T028 [US2] Build EnumForm component: compose header (editable name + "Enum" green badge), parent enum section (TypeSelector filtered to kind='enum' with allowClear), enum values section (EnumValueRow list + "Add Value" button with auto-focus on new row), MetadataSection at bottom in packages/visual-editor/src/components/editors/EnumForm.tsx
- [X] T029 [US2] Add 'enum' kind dispatch to EditorFormPanel → EnumForm; update barrel exports in packages/visual-editor/src/components/panels/EditorFormPanel.tsx and packages/visual-editor/src/components/editors/index.ts

**Checkpoint**: Enum editing via forms is fully functional. Select an enum node → edit values, display names, parent enum via form → graph updates.

---

## Phase 5: User Story 3 — Edit a Choice (P2)

**Goal**: Select a Choice node and manage its options (add/remove type references) through the editor form.

**Independent Test**: Load a .rosetta file with `choice PaymentType` and options. Select the choice node. Add an option by selecting a type, remove an option. Verify graph edges update correctly.

### Tests for User Story 3 (write FIRST, must FAIL before implementation)

- [X] T051 [P] [US3] Integration tests for ChoiceForm: test form renders all options for a loaded Choice, add option creates member + edge, remove option removes member + edge in packages/visual-editor/test/editors/ChoiceForm.test.tsx

### Implementation for User Story 3

- [X] T030 [P] [US3] Build ChoiceOptionRow component: read-only type label with kind-colored badge, remove button; removing an option removes both the member AND the choice-option edge in packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx
- [X] T031 [US3] Build ChoiceForm component: compose header (editable name + "Choice" amber badge), options section (ChoiceOptionRow list + inline TypeSelector for "Add Option" that creates member + edge), MetadataSection at bottom; choices have NO parent/inheritance in packages/visual-editor/src/components/editors/ChoiceForm.tsx
- [X] T032 [US3] Add 'choice' kind dispatch to EditorFormPanel → ChoiceForm; update barrel exports in packages/visual-editor/src/components/panels/EditorFormPanel.tsx and packages/visual-editor/src/components/editors/index.ts

**Checkpoint**: Choice editing via forms is fully functional. Select a choice node → manage options → graph edges update.

---

## Phase 6: User Story 4 — Edit a Function (P2)

**Goal**: Select a Function and edit its name, input parameters, output type, and expression body through the editor form (P2a level: textarea with parse validation).

**Independent Test**: Load a .rosetta file with a function definition. Select the function. Edit inputs, output type, and expression text. Verify the model updates and invalid expressions show validation errors.

### Tests for User Story 4 (write FIRST, must FAIL before implementation)

- [X] T052 [P] [US4] Integration tests for FunctionForm: test form renders inputs/output/expression for a loaded Function, add/remove input params, change output type, expression textarea validation (valid/invalid), autocompletion popup triggers on type in packages/visual-editor/test/editors/FunctionForm.test.tsx

### Implementation for User Story 4

- [X] T033 [US4] Add FunctionDisplayData interface (name, definition, inputs, output, expressionText, synonyms) to packages/visual-editor/src/types.ts; extend TypeKind with 'func' (i.e., `'data' | 'choice' | 'enum' | 'func'`)
- [X] T034 [US4] Add function store actions to EditorActions and implement them in createEditorStore: addInputParam(nodeId, paramName, typeName), removeInputParam(nodeId, paramName), updateOutputType(nodeId, typeName), updateExpression(nodeId, expressionText) in packages/visual-editor/src/store/editor-store.ts
- [X] T035 [US4] Build FunctionForm component: compose header (editable name + "Function" purple badge), input parameters section (rows with name input + TypeSelector, "Add Input" button), output type section (TypeSelector), expression editor section (textarea with parse-and-validate on blur using expression validation helper from T016, autocompletion for type names/feature paths/built-in functions via T053 hook, red border + error message for invalid expressions), MetadataSection at bottom in packages/visual-editor/src/components/editors/FunctionForm.tsx
- [X] T053 [US4] Build useExpressionAutocomplete hook: given cursor position and expression text, derive completion candidates (type names from availableTypes, feature paths from selected input types, built-in function names); return filtered suggestions for popup rendering; wire into FunctionForm expression editor as an inline completion popup in packages/visual-editor/src/hooks/useExpressionAutocomplete.ts
- [X] T036 [US4] Add 'func' kind dispatch to EditorFormPanel → FunctionForm; update barrel exports in packages/visual-editor/src/components/panels/EditorFormPanel.tsx and packages/visual-editor/src/components/editors/index.ts

**Checkpoint**: Function editing via forms is fully functional with autocompletion. CodeMirror (P2b) and visual blocks (P2c) are deferred.

---

## Phase 7: User Story 6 — Source Synchronization (P2)

**Goal**: Editor form changes reflect in the source code editor within 1 second; source editor changes flow back to the form after re-parse.

**Independent Test**: Edit a type name in the form → verify source editor shows updated .rosetta code. Edit the same type in source → verify the form updates after re-parse.

### Implementation for User Story 6

- [X] T037 [US6] Wire bidirectional sync: add store subscription (or useEffect) that triggers graph-to-ast serialization → source editor content update when nodes/edges change from form edits; verify reverse path (source edit → web worker re-parse → ast-to-graph → store update → form refresh) works correctly with new fields (synonyms, displayName) in apps/studio/src/pages/EditorPage.tsx

**Checkpoint**: Bidirectional synchronization between editor forms and source editor is functional. Edits in either direction propagate within 1 second.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup, style refinements, and cross-story verification

- [X] T038 [P] Add dark-theme editor form styles (form field focus rings, input backgrounds, section borders, badge colors, disabled states) to apps/studio/src/styles.css
- [X] T039 [P] Update visual-editor package public API exports to include all new components, hooks, and types in packages/visual-editor/src/index.ts
- [X] T040 Run `pnpm run lint` and fix any issues across all modified files
- [X] T041 Run quickstart.md validation: verify all 22 implementation steps are addressed and each phase checkpoint passes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1+US5 (Phase 3)**: Depends on Foundational — first story to deliver, includes metadata testing
- **US2 (Phase 4)**: Depends on Foundational — can run in parallel with US1 form components (different files), but EditorFormPanel dispatch update requires US1's initial creation of that component
- **US3 (Phase 5)**: Depends on Foundational + EditorFormPanel existing (from US1)
- **US4 (Phase 6)**: Depends on Foundational + EditorFormPanel existing (from US1)
- **US6 (Phase 7)**: Depends on Foundational + EditorPage wiring from US1 (Phase 3)
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: Creates EditorFormPanel and wires it into EditorPage. All other stories depend on this wiring.
- **US2 (P1)**: Adds enum dispatch to EditorFormPanel. Can build EnumForm in parallel with US1's DataTypeForm.
- **US3 (P2)**: Adds choice dispatch. Requires EditorFormPanel from US1.
- **US4 (P2)**: Adds function dispatch. Requires EditorFormPanel from US1, plus types.ts extension.
- **US5 (P1)**: No separate implementation — MetadataSection built in Foundational, composed into all forms.
- **US6 (P2)**: Requires EditorPage wiring from US1 to be in place.

### Within Each User Story

- Row/sub-components before form composition
- Form composition before EditorFormPanel dispatch update
- EditorFormPanel dispatch before EditorPage wiring (US1 only)

### Parallel Opportunities

```
# Phase 1 Setup — all shadcn components in parallel:
T002, T003, T004, T005, T006, T007, T008 — all [P], different files

# Phase 2 Foundational — tests first (all parallel):
T042, T043, T044, T045 — all [P], different test files

# Phase 2 Foundational — independent implementation tasks in parallel:
T012 (useAutoSave hook), T013 (history exports) — [P], different files
T016 (edit-validator), T017 (ast-to-graph), T018 (graph-to-ast) — [P], different files
T019 (TypeSelector), T020 (CardinalityPicker), T021 (MetadataSection) — [P], different files

# Phase 3 US1 — tests first (all parallel):
T046 (AttributeRow tests), T047 (DataTypeForm tests), T048 (EditorFormPanel tests)

# Phase 3 US1 — AttributeRow in parallel with nothing else in phase:
T022 (AttributeRow) — [P], own file; T023 depends on T022

# Phase 4 US2 — tests first (all parallel):
T049 (EnumValueRow tests), T050 (EnumForm tests)

# Phase 4 US2 — EnumValueRow in parallel:
T027 (EnumValueRow) — [P], own file; T028 depends on T027

# Phase 5 US3 — test first:
T051 (ChoiceForm tests)

# Phase 5 US3 — ChoiceOptionRow in parallel:
T030 (ChoiceOptionRow) — [P], own file; T031 depends on T030

# Phase 6 US4 — test first:
T052 (FunctionForm tests)

# Phase 6 US4 — autocompletion hook in parallel with FunctionForm:
T053 (useExpressionAutocomplete) — [P], own file; T035 depends on T053

# Cross-story parallel (if team capacity allows):
DataTypeForm (T023), EnumForm (T028), ChoiceForm (T031) — different files,
can be built in parallel; EditorFormPanel dispatches added sequentially
```

---

## Implementation Strategy

### MVP First (US1 + US5 Only)

1. Complete Phase 1: Setup (install deps, add shadcn components)
2. Complete Phase 2: Foundational (types, store, hooks, adapters, shared components)
3. Complete Phase 3: US1 + US5 (DataTypeForm, EditorFormPanel, EditorPage wiring)
4. **STOP and VALIDATE**: Select a Data type node → edit name, attributes, metadata via form → verify graph updates
5. Deploy/demo if ready — this covers the highest-value use case (400+ types in CDM)

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 + US5 → Test independently → Deploy/Demo (**MVP!**)
3. Add US2 (Enums) → Test independently → Deploy/Demo
4. Add US3 (Choices) → Test independently → Deploy/Demo
5. Add US6 (Source Sync) → Verify bidirectional flow
6. Add US4 (Functions) → Test independently → Deploy/Demo (P2a expression editor)
7. Polish → Final cleanup, lint, validation

### Parallel Team Strategy

With multiple developers after Foundational is complete:

- Developer A: US1 + US5 (Data types + metadata + EditorFormPanel + EditorPage wiring)
- Developer B: US2 (Enumerations — EnumValueRow + EnumForm)
- Developer C: US3 (Choices — ChoiceOptionRow + ChoiceForm)
- Integrate: Each adds their dispatch to EditorFormPanel after Developer A creates it

---

## Notes

- **Test tasks included** — per constitution TDD mandate. Tests are written before implementation in each phase and must fail before code is written.
- **US5 has no separate phase** — MetadataSection is built in Foundational (T021) and composed into every form component. Metadata editing (including comments) is testable from US1 onward.
- **US6 builds on existing infrastructure** — the re-parse pipeline (source → web worker → ast-to-graph → store) already exists. The main new work is the reverse path: form edit → store change → graph-to-ast serialization → source update.
- **US4 scope is P2a** — textarea with parse validation and autocompletion for type names, feature paths, and built-in functions (T053). CodeMirror (P2b) and visual block editor (P2c) are explicitly deferred per research.md R-07.
- **Undo/redo** is covered by Zundo wiring in Foundational (T011, T013). All form edits go through store actions → automatically tracked by temporal middleware.
- **TypeSelector architecture** — uses composition/render-props pattern so the library component (`packages/visual-editor`) remains free of app-level UI dependencies. The host app (`apps/studio`) injects shadcn Popover + Command primitives.
- **Function node representation** — `TypeKind` is extended with `'func'` for uniform `kind`-based dispatch in EditorFormPanel.
- **Reorder support** — AttributeRow and EnumValueRow include drag handles for reordering via `reorderAttribute`/`reorderEnumValue` store actions. Order is preserved in the `members` array and reflected in serialized `.rosetta` output.
- **Total**: 53 tasks across 8 phases (42 implementation + 11 test tasks).
