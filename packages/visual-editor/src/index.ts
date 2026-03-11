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
  TypeKind,
  EdgeKind,
  AstNodeKindMap,
  AstMemberKindMap,
  AstNodeType,
  AstMemberType,
  MemberDisplay,
  TypeNodeData,
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
  VisibilityState
} from './types.js';
export { BUILTIN_TYPES } from './types.js';

// Adapter utilities
export { astToGraph } from './adapters/ast-to-graph.js';
export { graphToModels } from './adapters/graph-to-ast.js';
export type { SyntheticModel, SyntheticElement } from './adapters/graph-to-ast.js';

// Layout
export { computeLayout } from './layout/dagre-layout.js';

// Namespace tree utilities
export { buildNamespaceTree, filterNamespaceTree } from './utils/namespace-tree.js';

// Store (for advanced consumers)
export { createEditorStore, useEditorStore } from './store/editor-store.js';
export type { EditorStore, EditorState, EditorActions } from './store/editor-store.js';

// History / undo-redo
export { useTemporalStore, useCanUndo, useCanRedo, useUndo, useRedo } from './store/history.js';
export type { TrackedState } from './store/history.js';

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
