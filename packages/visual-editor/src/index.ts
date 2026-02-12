// @rune-langium/visual-editor — Public API

// Main component
export { RuneTypeGraph } from './components/RuneTypeGraph.js';

// Panel components (for custom layouts)
export { DetailPanel } from './components/panels/DetailPanel.js';
export type { DetailPanelProps } from './components/panels/DetailPanel.js';

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
  TypeGraphEdge
} from './types.js';

// Adapter utilities
export { astToGraph } from './adapters/ast-to-graph.js';
export { graphToModels } from './adapters/graph-to-ast.js';
export type { SyntheticModel, SyntheticElement } from './adapters/graph-to-ast.js';

// Layout
export { computeLayout } from './layout/dagre-layout.js';

// Store (for advanced consumers)
export { createEditorStore, useEditorStore } from './store/editor-store.js';
export type { EditorStore, EditorState, EditorActions } from './store/editor-store.js';
