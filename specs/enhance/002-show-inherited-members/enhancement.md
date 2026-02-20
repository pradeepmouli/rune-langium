# Enhancement: Visual Editor Feature Expansion

**Enhancement ID**: enhance-002
**Branch**: `enhance/002-show-inherited-members`
**Created**: 2026-02-19
**Priority**: [x] High | [ ] Medium | [ ] Low
**Component**: packages/visual-editor, apps/studio
**Status**: [ ] Planned | [x] In Progress | [ ] Complete

## Input
User description: "Show inherited members in editor forms and graph nodes, add CodeMirror expression editor, source navigation on node select, auto-load base types, support additional language constructs, annotation management"

## Overview
Six interrelated enhancements to the visual editor and studio app: (1) display inherited members in forms and graph nodes via collapsible sections, (2) inline CodeMirror editor for function expressions, (3) navigate source editor to relevant position on node selection, (4) auto-load Rosetta base types/annotations on launch, (5) support additional top-level constructs (recordType, typeAlias, basicType, annotation), and (6) add/remove annotations on existing types.

## Motivation
The visual editor currently shows only direct members of each type, hiding the full picture of inherited attributes. Function expressions use plain textareas with no syntax support. Selecting a node in the graph or namespace panel doesn't scroll the source editor to the relevant code. Base types (number, string, date, etc.) and standard annotations (metadata, deprecated, etc.) must be manually loaded. Only 4 of ~10 top-level Rosetta constructs are supported. Annotations cannot be added or removed from types. These gaps reduce usability and completeness of the editor.

## Proposed Changes

### 1. Inherited Members Display
- Walk `parentName` chain on store nodes to collect inherited members
- Add collapsible `InheritedMembersSection` to DataTypeForm, EnumForm, FunctionForm
- Show inherited members (read-only, visually distinct) in DataNode, EnumNode graph nodes

### 2. CodeMirror Expression Editor
- Create `ExpressionEditor` component wrapping CodeMirror `EditorView`
- Replace `<Textarea>` in FunctionForm with syntax-highlighted expression editor
- Wire Rosetta DSL language mode for expression highlighting

### 3. Source Navigation on Node Selection
- Add `revealLine(line, filePath?)` imperative method to SourceEditor via `useImperativeHandle`
- On node select in EditorPage, extract `source.$cstNode.range` and call `revealLine`
- Handle file switching when node is in a different file than the active tab

### 4. Auto-load Base Types on Launch
- Load `.resources/rune-dsl/basictypes.rosetta` and `annotations.rosetta` on workspace init
- Parse alongside user files so base types and annotations are always available
- Mark base-type files as read-only in the source editor tab bar

### 5. Additional Language Constructs
- Expand `TypeKind` to include `'record'`, `'typeAlias'`, `'basicType'`, `'annotation'`
- Update `AstNodeKindMap`, `AstMemberKindMap`, `ast-to-graph.ts` for new constructs
- Create graph node components and editor form components for each new kind

### 6. Annotation Management
- Add `annotations` field to `TypeNodeData`
- Extract annotations from AST in `ast-to-graph.ts`
- Create annotation picker UI in editor forms (add/remove from available annotations)
- Add store actions: `addAnnotation`, `removeAnnotation`

**Files to Modify**:
- `packages/visual-editor/src/types.ts` — expand TypeKind, AstNodeKindMap, add annotations to TypeNodeData
- `packages/visual-editor/src/adapters/ast-to-graph.ts` — handle new constructs, extract annotations and inherited members
- `packages/visual-editor/src/components/nodes/` — new node components (RecordNode, AnnotationNode, etc.)
- `packages/visual-editor/src/components/forms/` — InheritedMembersSection, ExpressionEditor, AnnotationPicker, new forms
- `packages/visual-editor/src/store/editor-store.ts` — annotation management actions
- `apps/studio/src/components/SourceEditor.tsx` — add revealLine imperative handle
- `apps/studio/src/pages/EditorPage.tsx` — wire node selection → source navigation, auto-load base types
- `apps/studio/src/services/` — workspace service updates for base type loading

**Breaking Changes**: [ ] Yes | [x] No

## Implementation Plan

**Phase 1: Implementation**

**Tasks**:
1. [ ] **Auto-load base types** — Load `.resources/rune-dsl/*.rosetta` files on workspace init; mark as read-only in source tabs
2. [ ] **Expand TypeKind** — Add record, typeAlias, basicType, annotation kinds to types.ts; update AstNodeKindMap and AstMemberKindMap; update ast-to-graph.ts to convert new AST constructs
3. [ ] **Inherited members display** — Create `useInheritedMembers(nodeId)` hook; add InheritedMembersSection (Collapsible) to DataTypeForm, EnumForm, FunctionForm; add inherited member indicators to graph nodes
4. [ ] **Source navigation** — Add `revealLine` to SourceEditor via useImperativeHandle; wire EditorPage node selection to scroll source editor; handle cross-file navigation
5. [ ] **Annotation management** — Add annotations to TypeNodeData; extract from AST; create annotation picker UI; add store actions for add/remove
6. [ ] **CodeMirror expression editor** — Create ExpressionEditor component; replace Textarea in FunctionForm; wire Rosetta DSL language mode
7. [ ] **Build verification and tests** — Ensure build passes, add/update unit tests, manual smoke test

**Acceptance Criteria**:
- [ ] Inherited members from parent types are shown in collapsible sections in both editor forms and graph nodes
- [ ] Function expression text areas are replaced with syntax-highlighted CodeMirror editors
- [ ] Selecting a node in the graph or namespace panel scrolls the source editor to the relevant code
- [ ] Base types (number, string, date, etc.) and standard annotations are available immediately on launch without manual loading
- [ ] recordType, typeAlias, basicType, and annotation constructs appear in the graph and have editor forms
- [ ] Annotations can be added to and removed from data types, enums, and functions via the editor form
- [ ] All existing tests pass; no regressions in current functionality

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing complete
- [ ] Edge cases verified

## Verification Checklist
- [ ] Changes implemented as described
- [ ] Tests written and passing
- [ ] No regressions in existing functionality
- [ ] Documentation updated (if needed)
- [ ] Code reviewed (if appropriate)

## Notes
- **Inheritance chain**: Data uses `superType`, Enum uses `parent`, Function uses `superFunction` — all are `Reference<T>` types in the AST
- **Base type files**: Located at `.resources/rune-dsl/basictypes.rosetta` (basicType, typeAlias, recordType, library functions) and `.resources/rune-dsl/annotations.rosetta` (annotation definitions)
- **AST types for new constructs**: `RosettaBasicType`, `RosettaRecordType` (has `features: Array<RosettaRecordFeature>`), `RosettaTypeAlias` (has `typeCall`), `Annotation` (has `attributes: Array<Attribute>`)
- **AnnotationRef**: Referenced from Data, Choice, RosettaEnumeration, RosettaFunction, RosettaEnumValue — all have `annotations: Array<AnnotationRef>`
- **Design system**: Collapsible/CollapsibleTrigger/CollapsibleContent available at `@rune-langium/design-system/ui/collapsible`
- If the implementation exceeds 7 tasks or requires multiple phases, consider migrating to a full `/speckit.specify` workflow

---
*Enhancement created using `/enhance` workflow - See .specify/extensions/workflows/enhance/*
