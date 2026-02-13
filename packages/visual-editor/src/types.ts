/**
 * @rune-langium/visual-editor — Shared types
 *
 * Aligned with contracts/visual-editor-api.ts.
 *
 * Graph node/edge data types are generic over the source Langium AST
 * node kind so that rich type information flows through the pipeline
 * without creating a separate taxonomy.
 */

import type { Node, Edge } from '@xyflow/react';
import type {
  Data,
  Choice,
  RosettaEnumeration,
  Attribute,
  ChoiceOption,
  RosettaEnumValue
} from '@rune-langium/core';

// ---------------------------------------------------------------------------
// AST ↔ Graph kind mappings
// ---------------------------------------------------------------------------

/** Maps each `TypeKind` to the Langium AST node it represents. */
export interface AstNodeKindMap {
  data: Data;
  choice: Choice;
  enum: RosettaEnumeration;
}

/** Maps each `TypeKind` to its member AST node type. */
export interface AstMemberKindMap {
  data: Attribute;
  choice: ChoiceOption;
  enum: RosettaEnumValue;
}

// ---------------------------------------------------------------------------
// Graph Data Types
// ---------------------------------------------------------------------------

export type TypeKind = keyof AstNodeKindMap;

/** Union of all AST member types carried by graph node members. */
export type AstMemberType = AstMemberKindMap[TypeKind];

/** Union of all AST node types carried by graph nodes. */
export type AstNodeType = AstNodeKindMap[TypeKind];

export type EdgeKind = 'extends' | 'attribute-ref' | 'choice-option' | 'enum-extends';

/**
 * Display-oriented representation of a single member (attribute / option / value).
 *
 * `source` carries the original Langium AST member node when the graph
 * was built from a parsed model, preserving all rich metadata (annotations,
 * synonyms, labels, doc-references, rule-references, etc.).
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
 * Data payload carried by every graph node.
 *
 * Generic over `K extends TypeKind` so that `source` is automatically
 * narrowed to the correct Langium AST type when the kind is known.
 *
 * @example
 * ```ts
 * // A DataNode carries Data source and Attribute members
 * const d: TypeNodeData<'data'> = { kind: 'data', source: myDataAst, ... };
 * d.source?.conditions; // ✅ Data.conditions is accessible
 *
 * // An unparameterised use remains fully backward-compatible
 * const generic: TypeNodeData = node.data;
 * ```
 */
export interface TypeNodeData<K extends TypeKind = TypeKind> {
  kind: K;
  name: string;
  namespace: string;
  definition?: string;
  members: MemberDisplay[];
  parentName?: string;
  hasExternalRefs: boolean;
  errors: ValidationError[];
  /** Source AST node — preserves full Langium type information. */
  source?: AstNodeKindMap[K];
  [key: string]: unknown;
}

export interface EdgeData {
  kind: EdgeKind;
  label?: string;
  cardinality?: string;
  [key: string]: unknown;
}

export interface ValidationError {
  nodeId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  ruleId?: string;
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
  onNodeSelect?: (nodeId: string, data: TypeNodeData) => void;
  onNodeDoubleClick?: (nodeId: string, data: TypeNodeData) => void;
  onEdgeSelect?: (edgeId: string, data: EdgeData) => void;
  onSelectionClear?: () => void;
  onContextMenu?: (position: { x: number; y: number }) => void;
  onTypeCreated?: (nodeId: string, kind: TypeKind, name: string) => void;
  onTypeDeleted?: (nodeId: string) => void;
  onModelChanged?: (serialized: Map<string, string>) => void;
  onValidationChange?: (errors: ValidationError[]) => void;
}

// ---------------------------------------------------------------------------
// Component Props & Ref
// ---------------------------------------------------------------------------

export interface RuneTypeGraphProps {
  models: unknown | unknown[];
  config?: RuneTypeGraphConfig;
  callbacks?: RuneTypeGraphCallbacks;
  className?: string;
  /** Optional visibility state for namespace-based filtering. */
  visibilityState?: VisibilityState;
}

export interface RuneTypeGraphRef {
  fitView(): void;
  focusNode(nodeId: string): void;
  search(query: string): string[];
  setFilters(filters: GraphFilters): void;
  getFilters(): GraphFilters;
  relayout(options?: LayoutOptions): void;
  exportImage(format: 'svg' | 'png'): Promise<Blob>;
  createType(kind: TypeKind, name: string, namespace: string): string;
  deleteType(nodeId: string): void;
  undo(): void;
  redo(): void;
  exportRosetta(): Map<string, string>;
}

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

// ---------------------------------------------------------------------------
// Typed ReactFlow aliases
// ---------------------------------------------------------------------------

export type TypeGraphNode = Node<TypeNodeData>;
export type TypeGraphEdge = Edge<EdgeData>;
