# Implementation Plan: Editor Forms for Types, Enums, Choices, and Functions

**Branch**: `004-editor-forms` | **Date**: 2026-02-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-editor-forms/spec.md`

## Summary

Structured editor forms that replace the read-only `DetailPanel` with interactive, form-based editing panels for Data types, Enumerations, Choices, and Functions. The forms use the existing Zustand `EditorStore` mutation actions as the editing layer, integrate shadcn/ui components (already in studio) with the Rune design system tokens, and auto-save with 500ms debounce matching the existing source editor pattern. Each element kind gets a dedicated form variant with shared metadata and type-selector sub-components.

## Technical Context

**Language/Version**: TypeScript 5.9, React 19.2, Tailwind CSS v4
**Primary Dependencies**: `@xyflow/react ^12.10`, `zustand ^5.0.11`, `zundo ^2.3`, shadcn/ui (CVA + Radix), `@rune-langium/core` (Langium AST), `@rune-langium/design-system` (tokens + theme.css), `lucide-react`
**Storage**: In-memory Zustand store (graph state); `.rosetta` file serialization via `graph-to-ast` adapter
**Testing**: Vitest + @testing-library/react for unit/integration; Playwright for E2E
**Target Platform**: Browser (Vite SPA), no SSR
**Project Type**: pnpm monorepo — `packages/visual-editor` (library) + `apps/studio` (app)
**Performance Goals**: Form field updates and validation feedback < 200ms; graph re-render after form edit within existing layout latency budget; models with 400+ types open without perceptible lag
**Constraints**: Parsing runs in web worker; all AST mutations go through typed store actions; no opaque string manipulation of expressions; shadcn/ui new-york style with Rune design system tokens
**Scale/Scope**: CDM corpus has 400+ types, 200+ enums; typical single-file models have 5–30 elements

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Notes |
|-----------|-----------|-------|
| **I. DSL Fidelity & Typed AST** | ✅ PASS | Editor forms operate on `TypeNodeData` backed by typed Langium AST nodes (`Data`, `Choice`, `RosettaEnumeration`, `RosettaFunction`). All mutations produce valid graph state that maps to typed AST via `graph-to-ast` adapter. Expression editor (Phase 2) will parse expressions into typed nodes, not raw strings. |
| **II. Deterministic Fixtures** | ✅ PASS | Tests use vendored `.rosetta` fixtures from CDM corpus already in `.resources/cdm/`. All form tests are deterministic and offline. |
| **III. Validation Parity** | ✅ PASS | Editor form validation reuses `edit-validator.ts` rules (S-01 duplicate names, S-02 circular inheritance, S-04 cardinality bounds). No new validation rules beyond parity scope. |
| **IV. Performance & Workers** | ✅ PASS | Form interactions update local Zustand state (< 1ms). Re-parsing after serialization runs in web worker via existing debounced pipeline. No blocking main thread. 200ms feedback budget met by design. |
| **V. Reversibility & Compatibility** | ✅ PASS | Editor forms extend (not replace) existing inline editors (`TypeCreator`, `AttributeEditor`, `CardinalityEditor`). Both paths produce the same store mutations. The `DetailPanel` is evolved, not deleted—read-only mode remains available for `readOnly: true` config. |

## Project Structure

### Documentation (this feature)

```text
specs/004-editor-forms/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (component API contracts)
└── tasks.md             # Phase 2 output (by /speckit.tasks)
```

### Source Code (repository root)

```text
packages/visual-editor/
├── src/
│   ├── components/
│   │   ├── panels/
│   │   │   └── DetailPanel.tsx          # EVOLVE → EditorFormPanel (dispatch by kind)
│   │   ├── editors/
│   │   │   ├── TypeCreator.tsx          # KEEP (existing inline creator)
│   │   │   ├── AttributeEditor.tsx      # KEEP (existing inline editor)
│   │   │   ├── CardinalityEditor.tsx    # KEEP (existing inline editor)
│   │   │   ├── DataTypeForm.tsx         # NEW — Data type editor form
│   │   │   ├── EnumForm.tsx             # NEW — Enumeration editor form
│   │   │   ├── ChoiceForm.tsx           # NEW — Choice editor form
│   │   │   ├── FunctionForm.tsx         # NEW — Function editor form (Phase 2)
│   │   │   ├── MetadataSection.tsx      # NEW — Shared metadata sub-component
│   │   │   ├── TypeSelector.tsx         # NEW — Searchable type dropdown
│   │   │   ├── AttributeRow.tsx         # NEW — Inline attribute editing row
│   │   │   ├── EnumValueRow.tsx         # NEW — Inline enum value editing row
│   │   │   ├── ChoiceOptionRow.tsx      # NEW — Inline choice option editing row
│   │   │   ├── CardinalityPicker.tsx    # NEW — Refactored cardinality (preset + custom)
│   │   │   └── index.ts                # UPDATE — re-export new components
│   ├── store/
│   │   └── editor-store.ts             # UPDATE — add enum/choice/function actions
│   ├── validation/
│   │   └── edit-validator.ts            # UPDATE — add enum/choice validation rules
│   └── types.ts                        # UPDATE — extend TypeKind with 'func', add FunctionDisplayData, form event types
└── test/
    └── editors/
        ├── DataTypeForm.test.tsx        # NEW
        ├── EnumForm.test.tsx            # NEW
        ├── ChoiceForm.test.tsx          # NEW
        ├── MetadataSection.test.tsx     # NEW
        ├── TypeSelector.test.tsx        # NEW
        └── AttributeRow.test.tsx        # NEW

apps/studio/
├── src/
│   ├── pages/
│   │   └── EditorPage.tsx              # UPDATE — wire EditorFormPanel into right panel
│   ├── components/
│   │   └── ui/
│   │       ├── label.tsx               # NEW — shadcn Label component
│   │       ├── select.tsx              # NEW — shadcn Select component
│   │       ├── textarea.tsx            # NEW — shadcn Textarea component
│   │       ├── collapsible.tsx         # NEW — shadcn Collapsible component
│   │       ├── popover.tsx             # NEW — shadcn Popover component
│   │       └── command.tsx             # NEW — shadcn Command (for searchable dropdown)
│   └── styles.css                      # UPDATE — editor form dark-theme styles
└── test/
    └── components/
        └── EditorFormPanel.test.tsx     # NEW
```

**Structure Decision**: Editor form components live in `packages/visual-editor` alongside existing editors for library-level reuse. shadcn/ui primitives remain in `apps/studio/src/components/ui/` per existing convention. The studio's `EditorPage` wires the form panel into the layout as a third resizable panel (right side).

**TypeSelector Architecture**: `TypeSelector` in `packages/visual-editor` is an unstyled composition component. It accepts `renderTrigger` and `renderPopover` render-props so the host app (`apps/studio`) can inject its own shadcn Popover + Command primitives. The studio wires these when composing `EditorFormPanel` in `EditorPage`. This keeps the library free of app-level UI dependencies.

**Function Node Representation**: Functions extend `TypeKind` with `'func'` (i.e., `type TypeKind = 'data' | 'choice' | 'enum' | 'func'`). This enables EditorFormPanel to dispatch to `FunctionForm` using the same `kind`-based pattern as other forms and avoids a separate AST-based dispatch path.

## Constitution Re-Check (Post-Design)

| Principle | Compliance | Post-Design Notes |
|-----------|-----------|-------------------|
| **I. DSL Fidelity & Typed AST** | ✅ PASS | `MemberDisplay.displayName` (R-06) keeps enum display names separate from type references. `TypeNodeData.synonyms` (R-06) stores editable metadata without mutating `source` AST. All mutations flow through typed store actions → `graph-to-ast` synthesis → typed Langium AST. Expression editor (P2a) uses `<textarea>` with parse validation, not opaque strings. |
| **II. Deterministic Fixtures** | ✅ PASS | Tests use `.resources/cdm/` fixtures. `useAutoSave` is time-deterministic (configurable delay, `vi.useFakeTimers` in tests). No network dependencies. |
| **III. Validation Parity** | ✅ PASS | New validation rules S-05 (duplicate enum values), S-06 (empty names), S-07 (invalid name chars) are all subsets of existing Xtext parity rules. No new rules beyond parity scope. |
| **IV. Performance & Workers** | ✅ PASS | Form field updates are local state (< 1ms). Debounced commits mutate Zustand store (< 1ms for O(N+E) rename cascade on 400 nodes). Graph re-render is React-driven (no manual layout on edit). Re-parse runs in web worker via existing 500ms debounce pipeline. |
| **V. Reversibility & Compatibility** | ✅ PASS | Existing inline editors (`TypeCreator`, `AttributeEditor`, `CardinalityEditor`) are preserved unchanged. `DetailPanel` read-only mode retained via `readOnly` prop. Both form and inline paths produce identical store mutations. Zundo undo/redo wraps the same store. |

## Complexity Tracking

No constitution violations to justify. Design stays within existing architecture boundaries.
