// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

// @rune-langium/visual-editor — Public API

// Main component
export { RuneTypeGraph } from './components/RuneTypeGraph.js';

// Panel components (for custom layouts)
export { DetailPanel } from './components/panels/DetailPanel.js';
export type { DetailPanelProps } from './components/panels/DetailPanel.js';
export { EditorFormPanel } from './components/panels/EditorFormPanel.js';
export type { EditorFormPanelProps } from './components/panels/EditorFormPanel.js';
export { NamespaceExplorerPanel } from './components/panels/NamespaceExplorerPanel.js';
export type { NamespaceExplorerPanelProps } from './components/panels/NamespaceExplorerPanel.js';

// Editor components (P2)
export { TypeCreator } from './components/editors/TypeCreator.js';
export type { TypeCreatorProps } from './components/editors/TypeCreator.js';
export { AttributeEditor } from './components/editors/AttributeEditor.js';
export type { AttributeEditorProps } from './components/editors/AttributeEditor.js';
export { CardinalityEditor } from './components/editors/CardinalityEditor.js';
export type { CardinalityEditorProps } from './components/editors/CardinalityEditor.js';

// New editor form sub-components
export {
  TypeSelector,
  getKindBadgeClasses,
  getKindLabel
} from './components/editors/TypeSelector.js';
export type {
  TypeSelectorProps,
  TypeSelectorTriggerProps,
  TypeSelectorPopoverProps,
  TypeSelectorGroup
} from './components/editors/TypeSelector.js';
export { CardinalityPicker } from './components/editors/CardinalityPicker.js';
export type { CardinalityPickerProps } from './components/editors/CardinalityPicker.js';
export { MetadataSection } from './components/editors/MetadataSection.js';
export type { MetadataSectionProps } from './components/editors/MetadataSection.js';
export { AttributeRow } from './components/editors/AttributeRow.js';
export type { AttributeRowProps } from './components/editors/AttributeRow.js';
export { DataTypeForm } from './components/editors/DataTypeForm.js';
export type { DataTypeFormProps } from './components/editors/DataTypeForm.js';
export { EnumValueRow } from './components/editors/EnumValueRow.js';
export type { EnumValueRowProps } from './components/editors/EnumValueRow.js';
export { EnumForm } from './components/editors/EnumForm.js';
export type { EnumFormProps } from './components/editors/EnumForm.js';
export { ChoiceOptionRow } from './components/editors/ChoiceOptionRow.js';
export type { ChoiceOptionRowProps } from './components/editors/ChoiceOptionRow.js';
export { ChoiceForm } from './components/editors/ChoiceForm.js';
export type { ChoiceFormProps } from './components/editors/ChoiceForm.js';
export { FunctionForm } from './components/editors/FunctionForm.js';
export type { FunctionFormProps } from './components/editors/FunctionForm.js';

// Types
export type {
  AstNodeModel,
  AstNodeShape,
  GraphNode,
  AnyGraphNode,
  GraphMetadata,
  RootAstElement,
  TypeKind,
  EdgeKind,
  EdgeData,
  ValidationError,
  ExpressionEditorSlotProps,
  TypeOption,
  CommonFormActions,
  DataFormActions,
  EnumFormActions,
  ChoiceFormActions,
  FuncFormActions,
  FormActionsKindMap,
  AllEditorFormActions,
  EditorFormActions,
  GraphFilters,
  LayoutDirection,
  LayoutOptions,
  NodeStyleConfig,
  EdgeStyleConfig,
  RuneTypeGraphConfig,
  RuneTypeGraphCallbacks,
  RuneTypeGraphProps,
  RuneTypeGraphRef,
  TypeGraphNode,
  TypeGraphEdge,
  NamespaceTreeNode,
  NamespaceTypeEntry,
  VisibilityState,
  NavigateToNodeCallback
} from './types.js';
export { BUILTIN_TYPES } from './types.js';

// Adapter utilities
export { astToModel, astToGraph } from './adapters/ast-to-model.js';
export { modelsToAst, graphToModels } from './adapters/model-to-ast.js';
export type { ModelOutput, SyntheticModel, SyntheticElement } from './adapters/model-to-ast.js';
export {
  formatCardinality,
  parseCardinality,
  getTypeRefText,
  getRefText,
  annotationsToDisplay,
  conditionsToDisplay,
  classExprSynonymsToStrings,
  enumSynonymsToStrings,
  AST_TYPE_TO_NODE_TYPE,
  NODE_TYPE_TO_AST_TYPE
} from './adapters/model-helpers.js';

// Layout
export {
  computeLayout,
  computeLayoutIncremental,
  clearLayoutCache
} from './layout/dagre-layout.js';
export { computeLayoutAsync, cancelAsyncLayout } from './layout/layout-worker.js';
export { computeGroupedLayout, findInheritanceGroups } from './layout/grouped-layout.js';
export type { GroupInfo } from './layout/grouped-layout.js';

// Namespace tree utilities
export { buildNamespaceTree, filterNamespaceTree } from './utils/namespace-tree.js';

// Store (for advanced consumers)
export { createEditorStore, useEditorStore } from './store/editor-store.js';
export type { EditorStore, EditorState, EditorActions } from './store/editor-store.js';

// History / undo-redo
export { useTemporalStore, useCanUndo, useCanRedo, useUndo, useRedo } from './store/history.js';
export type { TrackedState } from './store/history.js';

// Expression builder
export { ExpressionBuilder } from './components/editors/expression-builder/ExpressionBuilder.js';
export type { ExpressionBuilderProps } from './components/editors/expression-builder/ExpressionBuilder.js';
export type { FunctionScope, FunctionScopeEntry } from './store/expression-store.js';

// Hooks
export { useAutoSave } from './hooks/useAutoSave.js';
export { useExpressionAutocomplete } from './hooks/useExpressionAutocomplete.js';
export type {
  CompletionItem,
  UseExpressionAutocompleteResult
} from './hooks/useExpressionAutocomplete.js';

// Validation utilities
export {
  detectCircularInheritance,
  detectDuplicateName,
  validateCardinality,
  detectDuplicateEnumValue,
  validateNotEmpty,
  validateIdentifier,
  validateExpression,
  validateGraph
} from './validation/edit-validator.js';
export type { ExpressionValidationResult } from './validation/edit-validator.js';
