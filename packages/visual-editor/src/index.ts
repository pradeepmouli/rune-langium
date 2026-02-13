// @rune-langium/visual-editor — Public API

// Main component
export { RuneTypeGraph } from './components/RuneTypeGraph.js';

// Panel components (for custom layouts)
export { DetailPanel } from './components/panels/DetailPanel.js';
export type { DetailPanelProps } from './components/panels/DetailPanel.js';
export { NamespaceExplorerPanel } from './components/panels/NamespaceExplorerPanel.js';
export type { NamespaceExplorerPanelProps } from './components/panels/NamespaceExplorerPanel.js';

// Editor components (P2)
export { TypeCreator } from './components/editors/TypeCreator.js';
export type { TypeCreatorProps } from './components/editors/TypeCreator.js';
export { AttributeEditor } from './components/editors/AttributeEditor.js';
export type { AttributeEditorProps } from './components/editors/AttributeEditor.js';
export { CardinalityEditor } from './components/editors/CardinalityEditor.js';
export type { CardinalityEditorProps } from './components/editors/CardinalityEditor.js';

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
