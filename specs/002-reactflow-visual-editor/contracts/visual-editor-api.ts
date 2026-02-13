/**
 * @rune-langium/visual-editor — Public API Contract
 *
 * This file defines the TypeScript types for the visual editor component library's
 * public API. These types serve as the contract between the library and its consumers.
 *
 * NOTE: This is a design contract, not runnable code. Implementation types will
 * import from @xyflow/react and @rune-langium/core.
 */

// ---------------------------------------------------------------------------
// Re-exported from @rune-langium/core (for consumer convenience)
// ---------------------------------------------------------------------------

/** Placeholder for the core parser's RosettaModel type */
type RosettaModel = import('@rune-langium/core').RosettaModel;
type ParseResult = import('@rune-langium/core').ParseResult;

// AST types used for source provenance
type Data = import('@rune-langium/core').Data;
type Choice = import('@rune-langium/core').Choice;
type RosettaEnumeration = import('@rune-langium/core').RosettaEnumeration;
type Attribute = import('@rune-langium/core').Attribute;
type ChoiceOption = import('@rune-langium/core').ChoiceOption;
type RosettaEnumValue = import('@rune-langium/core').RosettaEnumValue;

// ---------------------------------------------------------------------------
// AST ↔ Graph Kind Mappings
// ---------------------------------------------------------------------------

/** Maps each TypeKind to its Langium AST node type. */
export interface AstNodeKindMap {
  data: Data;
  choice: Choice;
  enum: RosettaEnumeration;
}

/** Maps each TypeKind to its member AST node type. */
export interface AstMemberKindMap {
  data: Attribute;
  choice: ChoiceOption;
  enum: RosettaEnumValue;
}

/** Union of all AST member types. */
export type AstMemberType = AstMemberKindMap[TypeKind];

/** Union of all AST node types. */
export type AstNodeType = AstNodeKindMap[TypeKind];

// ---------------------------------------------------------------------------
// Graph Data Types
// ---------------------------------------------------------------------------

export type TypeKind = keyof AstNodeKindMap;

export type EdgeKind = 'extends' | 'attribute-ref' | 'choice-option' | 'enum-extends';

/**
 * Display-oriented member representation with optional AST source provenance.
 * `source` carries the original Langium AST member node preserving rich metadata
 * (annotations, synonyms, labels, doc-references, rule-references, etc.).
 */
export interface MemberDisplay<M = AstMemberType> {
  name: string;
  typeName?: string;
  cardinality?: string;
  isOverride: boolean;
  /** Source AST member node — preserves full Langium type information. */
  source?: M;
}

/**
 * Data payload carried by every graph node. Generic over `K extends TypeKind`
 * so that `source` is automatically narrowed to the correct AST type.
 *
 * The index signature `[key: string]: unknown` is required for compatibility
 * with ReactFlow's `Node<T extends Record<string, unknown>>` constraint.
 * While this allows arbitrary properties at runtime, TypeScript will still
 * catch typos in declared property names during development.
 */
export interface TypeNodeData<K extends TypeKind = TypeKind> {
  kind: K;
  name: string;
  namespace: string;
  definition?: string;
  members: Array<MemberDisplay<AstMemberKindMap[K]>>;
  parentName?: string;
  hasExternalRefs: boolean;
  errors: ValidationError[];
  /** Source AST node — preserves full Langium type information. */
  source?: AstNodeKindMap[K];
  /** Required for ReactFlow compatibility: Node<T> requires T extends Record<string, unknown> */
  [key: string]: unknown;
}

/**
 * Data payload for graph edges.
 *
 * The index signature is required for compatibility with ReactFlow's
 * `Edge<T extends Record<string, unknown>>` constraint.
 */
export interface EdgeData {
  kind: EdgeKind;
  label?: string;
  cardinality?: string;
  /** Required for ReactFlow compatibility: Edge<T> requires T extends Record<string, unknown> */
  [key: string]: unknown;
}

export interface ValidationError {
  nodeId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  ruleId?: string;
  /** Optional structured location for parity with core diagnostics */
  line?: number;
  column?: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface GraphFilters {
  namespaces?: string[];
  kinds?: TypeKind[];
  namePattern?: string;
  hideOrphans?: boolean;
}

export type LayoutDirection = 'TB' | 'LR' | 'BT' | 'RL';

export interface LayoutOptions {
  direction?: LayoutDirection;
  nodeSeparation?: number;
  rankSeparation?: number;
}

export interface NodeStyleConfig {
  data?: { headerColor?: string; borderColor?: string };
  choice?: { headerColor?: string; borderColor?: string };
  enum?: { headerColor?: string; borderColor?: string };
}

export interface EdgeStyleConfig {
  extends?: { color?: string; strokeWidth?: number };
  'attribute-ref'?: { color?: string; strokeWidth?: number; dashed?: boolean };
  'choice-option'?: { color?: string; strokeWidth?: number };
  'enum-extends'?: { color?: string; strokeWidth?: number };
}

export interface RuneTypeGraphConfig {
  layout?: LayoutOptions;
  nodeStyles?: NodeStyleConfig;
  edgeStyles?: EdgeStyleConfig;
  initialFilters?: GraphFilters;
  showMinimap?: boolean;
  showControls?: boolean;
  readOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Event Callbacks
// ---------------------------------------------------------------------------

export interface RuneTypeGraphCallbacks {
  /** Fired when a type node is selected */
  onNodeSelect?: (nodeId: string, data: TypeNodeData) => void;
  /** Fired when a type node is double-clicked */
  onNodeDoubleClick?: (nodeId: string, data: TypeNodeData) => void;
  /** Fired when an edge is selected */
  onEdgeSelect?: (edgeId: string, data: EdgeData) => void;
  /** Fired when selection is cleared */
  onSelectionClear?: () => void;
  /** Fired when graph is right-clicked (context menu) */
  onContextMenu?: (position: { x: number; y: number }) => void;

  // P2: Editing callbacks
  /** Fired after a type is created */
  onTypeCreated?: (nodeId: string, kind: TypeKind, name: string) => void;
  /** Fired after a type is deleted */
  onTypeDeleted?: (nodeId: string) => void;
  /** Fired after any edit operation */
  onModelChanged?: (serialized: Map<string, string>) => void;
  /** Fired when validation errors change */
  onValidationChange?: (errors: ValidationError[]) => void;
}

// ---------------------------------------------------------------------------
// Main Component Props
// ---------------------------------------------------------------------------

export interface RuneTypeGraphProps {
  /** Parsed AST model(s) to visualize */
  models: RosettaModel | RosettaModel[];
  /** Configuration options */
  config?: RuneTypeGraphConfig;
  /** Event callbacks */
  callbacks?: RuneTypeGraphCallbacks;
  /** CSS class name for the container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Imperative API (via ref)
// ---------------------------------------------------------------------------

export interface RuneTypeGraphRef {
  /** Fit all nodes in the viewport */
  fitView(): void;
  /** Center viewport on a specific node */
  focusNode(nodeId: string): void;
  /** Apply search query to highlight matching nodes */
  search(query: string): string[];
  /** Apply filters to show/hide nodes */
  setFilters(filters: GraphFilters): void;
  /** Get current filters */
  getFilters(): GraphFilters;
  /** Re-run auto-layout */
  relayout(options?: LayoutOptions): void;
  /** Export graph as image */
  exportImage(format: 'svg' | 'png'): Promise<Blob>;

  // P2: Editing API
  /** Create a new type node */
  createType(kind: TypeKind, name: string, namespace: string): string;
  /** Delete a type node */
  deleteType(nodeId: string): void;
  /** Undo last edit */
  undo(): void;
  /** Redo last undone edit */
  redo(): void;
  /** Get serialized .rosetta source for all models */
  exportRosetta(): Map<string, string>;
}

// ---------------------------------------------------------------------------
// Public API Exports
// ---------------------------------------------------------------------------

/**
 * Usage:
 *
 * ```tsx
 * import { RuneTypeGraph } from '@rune-langium/visual-editor';
 * import '@rune-langium/visual-editor/styles.css';
 * import { parse } from '@rune-langium/core';
 *
 * const result = await parse(rosettaSource);
 * <RuneTypeGraph models={result.value} />
 * ```
 */
export declare const RuneTypeGraph: React.ForwardRefExoticComponent<
  RuneTypeGraphProps & React.RefAttributes<RuneTypeGraphRef>
>;

/**
 * Adapter function: Convert AST models to ReactFlow nodes/edges.
 * Useful for consumers who want to use ReactFlow directly with custom layout.
 */
export declare function astToGraph(
  models: RosettaModel | RosettaModel[],
  options?: { filters?: GraphFilters }
): {
  nodes: Array<import('@xyflow/react').Node<TypeNodeData>>;
  edges: Array<import('@xyflow/react').Edge<EdgeData>>;
};

/**
 * Layout function: Compute node positions using the configured layout engine.
 */
export declare function computeLayout(
  nodes: Array<import('@xyflow/react').Node<TypeNodeData>>,
  edges: Array<import('@xyflow/react').Edge<EdgeData>>,
  options?: LayoutOptions
): Array<import('@xyflow/react').Node<TypeNodeData>>;

// ---------------------------------------------------------------------------
// Namespace Explorer Types
// ---------------------------------------------------------------------------

export interface NamespaceTreeNode {
  namespace: string;
  types: NamespaceTypeEntry[];
  totalCount: number;
  dataCount: number;
  choiceCount: number;
  enumCount: number;
}

export interface NamespaceTypeEntry {
  nodeId: string;
  name: string;
  kind: TypeKind;
}

export interface VisibilityState {
  /** Namespaces whose types are currently visible on the graph. */
  expandedNamespaces: Set<string>;
  /** Individual nodes hidden within expanded namespaces. */
  hiddenNodeIds: Set<string>;
  /** Whether the explorer panel is open. */
  explorerOpen: boolean;
}

/**
 * Build a namespace tree from graph nodes for the explorer panel.
 */
export declare function buildNamespaceTree(
  nodes: Array<import('@xyflow/react').Node<TypeNodeData>>
): NamespaceTreeNode[];
