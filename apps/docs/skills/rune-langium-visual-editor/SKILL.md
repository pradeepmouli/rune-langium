---
name: rune-langium-visual-editor
description: Documentation site for rune-langium
---

# @rune-langium/visual-editor

Documentation site for rune-langium

## When to Use

- Rendering two or more `RuneTypeGraph` components simultaneously (different
- namespaces, split-pane editors, etc.)
- Writing tests that need an isolated store per test case

**Avoid when:**
- You only need a single graph — use the pre-created `useEditorStore` singleton.
- API surface: 49 functions, 68 types, 10 constants

## Pitfalls

- Each `createEditorStore()` call allocates a new Zustand store + Zundo temporal
- tracker. Do NOT call this inside a render function — call once at module level
- or in a `useState` initializer.

## Quick Reference

**DetailPanel:** `DetailPanel`, `DetailPanelProps`
**TypeSelector:** `TypeSelector`, `getKindBadgeClasses`, `getKindLabel`, `TypeSelectorProps`, `TypeSelectorTriggerProps`, `TypeSelectorPopoverProps`, `TypeSelectorGroup`
**CardinalityPicker:** `CardinalityPicker`, `CardinalityPickerProps`
**MetadataSection:** `MetadataSection`, `MetadataSectionProps`
**AttributeRow:** `AttributeRow`, `AttributeRowProps`
**DataTypeForm:** `DataTypeForm`, `DataTypeFormProps`
**EnumValueRow:** `EnumValueRow`, `EnumValueRowProps`
**EnumForm:** `EnumForm`, `EnumFormProps`
**ChoiceOptionRow:** `ChoiceOptionRow`, `ChoiceOptionRowProps`
**ChoiceForm:** `ChoiceForm`, `ChoiceFormProps`
**FunctionForm:** `FunctionForm`, `FunctionFormProps`
**ast-to-model:** `astToModel`
**model-to-ast:** `modelsToAst`, `ModelOutput`, `SyntheticModel`, `SyntheticElement`
**model-helpers:** `formatCardinality`, `parseCardinality`, `getTypeRefText`, `getRefText`, `annotationsToDisplay`, `conditionsToDisplay`, `classExprSynonymsToStrings`, `enumSynonymsToStrings`, `AST_TYPE_TO_NODE_TYPE`, `NODE_TYPE_TO_AST_TYPE`
**dagre-layout:** `computeLayout`, `computeLayoutIncremental`, `clearLayoutCache`
**layout-worker:** `computeLayoutAsync`, `cancelAsyncLayout`
**grouped-layout:** `computeGroupedLayout`, `findInheritanceGroups`, `GroupInfo`
**namespace-tree:** `buildNamespaceTree`, `filterNamespaceTree`
**Visual Editor:** `createEditorStore`, `GraphFilters`, `RuneTypeGraphConfig`, `RuneTypeGraphCallbacks`, `RuneTypeGraphProps`, `RuneTypeGraphRef`, `EditorStore`, `EditorState`
**history:** `useTemporalStore`, `useCanUndo`, `useCanRedo`, `useUndo`, `useRedo`, `TrackedState`
**ExpressionBuilder:** `ExpressionBuilder`, `ExpressionBuilderProps`
**useAutoSave:** `useAutoSave`
**useExpressionAutocomplete:** `useExpressionAutocomplete`, `CompletionItem`, `UseExpressionAutocompleteResult`
**edit-validator:** `detectCircularInheritance`, `detectDuplicateName`, `validateCardinality`, `detectDuplicateEnumValue`, `validateNotEmpty`, `validateIdentifier`, `validateExpression`, `validateGraph`, `ExpressionValidationResult`
**EditorFormPanel:** `EditorFormPanelProps`, `EditorFormPanel`
**NamespaceExplorerPanel:** `NamespaceExplorerPanelProps`, `NamespaceExplorerPanel`
**TypeCreator:** `TypeCreatorProps`, `TypeCreator`
**AttributeEditor:** `AttributeEditorProps`, `AttributeEditor`
**CardinalityEditor:** `CardinalityEditorProps`, `CardinalityEditor`
**types:** `AstNodeModel`, `AstNodeShape`, `GraphNode`, `AnyGraphNode`, `GraphMetadata`, `RootAstElement`, `TypeKind`, `EdgeKind`, `EdgeData`, `ValidationError`, `ExpressionEditorSlotProps`, `TypeOption`, `CommonFormActions`, `DataFormActions`, `EnumFormActions`, `ChoiceFormActions`, `FuncFormActions`, `FormActionsKindMap`, `AllEditorFormActions`, `EditorFormActions`, `LayoutDirection`, `LayoutOptions`, `NodeStyleConfig`, `EdgeStyleConfig`, `TypeGraphNode`, `TypeGraphEdge`, `NamespaceTreeNode`, `NamespaceTypeEntry`, `VisibilityState`, `NavigateToNodeCallback`, `BUILTIN_TYPES`
**editor-store:** `EditorActions`, `useEditorStore`
**expression-store:** `FunctionScope`, `FunctionScopeEntry`
**RuneTypeGraph:** `RuneTypeGraph`

## Links

- Author: Pradeep Mouli <pmouli@mac.com> (https://github.com/pradeepmouli)