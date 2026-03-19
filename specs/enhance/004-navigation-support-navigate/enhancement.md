# Enhancement: Cross-Reference Navigation Between Editor, Source, and Graph

**Enhancement ID**: enhance-004
**Branch**: `enhance/004-navigation-support-navigate`
**Created**: 2026-03-18
**Priority**: [x] High | [ ] Medium | [ ] Low
**Component**: apps/studio (EditorPage, EditorFormPanel, SourceEditor), packages/visual-editor (forms, graph nodes)
**Status**: [x] Planned | [ ] In Progress | [ ] Complete

## Input
User description: "add navigation support to navigate from editor or source of current AstNode to another astNode (source or editor)"

## Overview
Add cross-reference navigation so that clicking on a type reference, function call, enum value, or any named reference in either the editor form panel or source editor navigates to the definition of that referenced AST node — opening its source file, revealing the definition line, selecting it on the graph, and populating the editor form.

## Motivation
Currently, navigation is one-directional: selecting a node on the graph opens its source and editor form. But there's no way to navigate *from* a reference in the editor/source to its target definition. For example, when editing `NonNegativeQuantity` which extends `Quantity`, there's no way to click on "Quantity" to jump to its definition. Similarly, function inputs reference types like `CompareOp` but clicking those type names does nothing. This makes exploring the CDM model cumbersome — users must manually search for referenced types.

## Proposed Changes
- Add clickable type links in the EditorFormPanel (type references in attributes, inputs, output, inheritance, conditions)
- Add full LSP-backed CodeMirror features in the SourceEditor: go-to-definition (Ctrl+Click), find references, document highlights, rename, code actions, signature help, folding ranges, and formatting — all already supported by both the Langium LSP server and `@codemirror/lsp-client`
- Wire a shared `navigateToNode(nodeId)` callback that selects the node on the graph, opens its source file, and reveals its definition line
- Make type names in GenericNode/DataNode/FuncNode graph cards clickable for quick navigation

**Files to Modify**:
- `apps/studio/src/pages/EditorPage.tsx` — expose `navigateToNode` callback, wire to graph focus + source reveal
- `packages/visual-editor/src/components/editors/DataTypeForm.tsx` — make type references (superType, attribute types) clickable links
- `packages/visual-editor/src/components/editors/FunctionForm.tsx` — make input/output type references clickable
- `packages/visual-editor/src/components/editors/EnumForm.tsx` — make parent enum reference clickable
- `packages/visual-editor/src/components/editors/ChoiceForm.tsx` — make choice option type names clickable
- `packages/visual-editor/src/components/editors/TypeAliasForm.tsx` — make aliased type reference clickable
- `packages/visual-editor/src/components/panels/DetailPanel.tsx` — make member type names clickable in view-only mode
- `packages/visual-editor/src/components/panels/EditorFormPanel.tsx` — pass `onNavigateToNode` through to all forms
- `packages/visual-editor/src/types.ts` — add `onNavigateToNode` as separate callback prop
- `packages/visual-editor/src/components/nodes/GenericNode.tsx` — make member type names clickable
- `packages/visual-editor/src/components/nodes/DataNode.tsx` — make attribute type names and superType clickable
- `packages/visual-editor/src/components/nodes/EnumNode.tsx` — make parent enum ref clickable
- `packages/visual-editor/src/components/nodes/ChoiceNode.tsx` — make choice option type names clickable
- `packages/visual-editor/src/components/RuneTypeGraph.tsx` — expose `onNavigateToType` in callbacks prop
- `apps/studio/src/components/SourceEditor.tsx` — enable full LSP feature set (go-to-definition with Ctrl+Click, find references, document highlights, rename, code actions, signature help, folding ranges, formatting); wire go-to-definition to `navigateToNode`
- `apps/studio/src/services/lsp-client.ts` — verify `languageServerExtensions()` enables all supported features; add definition-result callback for graph navigation

**Breaking Changes**: [ ] Yes | [x] No

## Implementation Plan

**Phase 1: Implementation**

**Tasks**:
1. [x] Define `onNavigateToNode(nodeId: string)` as a separate callback prop (not in EditorFormActions) in `types.ts`. Thread through `EditorFormPanel` → all form components (DataTypeForm, FunctionForm, TypeAliasForm, EnumForm, ChoiceForm, DetailPanel) and graph node components
2. [x] Implement `navigateToNode` in `EditorPage.tsx` that calls `graphRef.focusNode()`, `storeSelectNode()`, resolves the target file via `$container.$document.uri`, opens it in source, and reveals the definition line. When the target node is not found (built-in type or unloaded file), show a brief toast: "Built-in type" or "Type not loaded"
3. [x] Make type references clickable in `DataTypeForm` — superType link, attribute type names render as `<button>` that calls `onNavigateToNode` with the resolved node ID (`namespace::typeName`)
4. [x] Make type references clickable in `FunctionForm` — input parameter types, output type, and expression builder references render as navigable links
4b. [x] Make type references clickable in remaining forms — `EnumForm` (parent enum ref), `ChoiceForm` (choice option type names), `TypeAliasForm` (aliased type ref), `DetailPanel` (member types in view-only mode)
5. [x] Make type references clickable in graph node components (`GenericNode`, `DataNode`, `EnumNode`, `ChoiceNode`) — member/option type names become clickable, dispatching navigation via a new `onNavigateToType` callback from `RuneTypeGraph`
6. [x] Verify existing LSP features in SourceEditor — `languageServerExtensions()` and `client.plugin(uri)` already enable hover, completion, definition (F12), references (Shift+F12), rename (F2), format (Shift+Alt+F), signature help, diagnostics. All working.
7. [x] Wire go-to-definition in SourceEditor to `navigateToNode` — same-file F12 results sync to graph via `select.definition` user event detection. Cross-file with `StudioWorkspace.displayFile()` for open tabs.
8. [x] Implement back-navigation — navigation history stack in `useRef`, keyboard shortcut Alt+ArrowLeft / Meta+[ on editor page div
9. [x] Add visual affordance (underline on hover, cursor:pointer) for navigable type links across editor forms and graph nodes

**Acceptance Criteria**:
- [ ] Clicking a superType name (e.g., "Quantity" in NonNegativeQuantity's editor) navigates to the Quantity node (selects on graph, opens source file, reveals definition line)
- [ ] Clicking an attribute type name (e.g., "UnitType" in Measure's editor) navigates to that type
- [ ] Clicking a function input/output type navigates to the referenced type
- [ ] Ctrl+Click on an identifier in the source editor navigates to its definition (syncs graph + editor form)
- [ ] LSP features work in source editor: hover tooltips, autocomplete, find references, document highlights, rename, code actions, signature help, folding, formatting
- [ ] Navigation works across files (navigating from a type in file A to a definition in file B)
- [ ] Back-navigation works via keyboard shortcut (Alt+Left / Cmd+[) to return to previous selection

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing complete
- [ ] Edge cases verified (built-in types show toast instead of navigating, unresolved references show "Type not loaded" toast, circular refs handled)

## Verification Checklist
- [ ] Changes implemented as described
- [ ] Tests written and passing
- [ ] No regressions in existing functionality
- [ ] Documentation updated (if needed)
- [ ] Code reviewed (if appropriate)

## Clarifications

### Session 2026-03-18
- Q: How should navigation resolve type references that don't map to a loaded graph node? → A: Show a brief toast/tooltip: "Built-in type" or "Type not loaded"
- Q: Should SourceEditor Ctrl+Click go-to-definition be included or deferred? → A: Include Ctrl+Click and all CodeMirror features supported by both CodeMirror and the LSP server
- Q: How should navigateToNode resolve a type name to a node ID when namespace is unknown? → A: Use Langium's resolved Reference (ref target + $container) to get exact namespace::name. Existing helpers (getTypeRefText, getRefText, resolveRef) already handle $refText extraction; navigation extends this to also read ref.$container for namespace

## Notes
- The `$container.$document.uri.path` on AST nodes (discovered in this session) provides reliable file resolution for cross-file navigation
- Node IDs follow the `namespace::name` pattern (e.g., `cdm.base.math::Quantity`)
- Type references in the AST are Langium `Reference<T>` objects with `$refText` (display name) and `ref` (resolved target) — the resolved target's `$container` provides the model namespace for exact node ID resolution. Existing helpers (`getTypeRefText`, `getRefText`, `resolveRef`) already extract `$refText`; navigation extends these to also read `ref.$container` for namespace
- Navigation history stack for back-navigation is included in Task 8 (Alt+Left / Cmd+[)

---
*Enhancement created using `/enhance` workflow - See .specify/extensions/workflows/enhance/*
