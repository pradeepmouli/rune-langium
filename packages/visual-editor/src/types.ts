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
  RosettaFunction,
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
  func: RosettaFunction;
}

/** Maps each `TypeKind` to its member AST node type. */
export interface AstMemberKindMap {
  data: Attribute;
  choice: ChoiceOption;
  enum: RosettaEnumValue;
  func: Attribute;
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
  /** Display name for enum values. Separate from typeName to avoid false edge references. */
  displayName?: string;
  /** Source AST member node — preserves full Langium type information. */
  source?: M;
}

/**
 * Data payload carried by every graph node.
 *
 * Generic over `K extends TypeKind` so that `source` is automatically
 * narrowed to the correct Langium AST type when the kind is known.
 *
 * The index signature `[key: string]: unknown` is required for compatibility
 * with ReactFlow's `Node<T extends Record<string, unknown>>` constraint.
 * While this allows arbitrary properties at runtime, TypeScript will still
 * catch typos in declared property names during development.
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
  members: Array<MemberDisplay<AstMemberKindMap[K]>>;
  parentName?: string;
  hasExternalRefs: boolean;
  errors: ValidationError[];
  /** Editable synonym values for this element. */
  synonyms?: string[];
  /** Whether this element is read-only (from external/locked source). */
  isReadOnly?: boolean;
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
  line?: number;
  column?: number;
}

// ---------------------------------------------------------------------------
// Editor Form Types
// ---------------------------------------------------------------------------

/** Built-in primitive types available in the Rune DSL. */
export const BUILTIN_TYPES = [
  'string',
  'int',
  'number',
  'boolean',
  'date',
  'time',
  'dateTime',
  'zonedDateTime'
] as const;

/** A type option for searchable type selectors. */
export interface TypeOption {
  /** Node ID, or special ID for built-in types. */
  value: string;
  /** Display label (type name). */
  label: string;
  /** Type kind for badge coloring. */
  kind: TypeKind | 'builtin';
  /** Namespace for grouping in the dropdown. */
  namespace?: string;
}

/** Callback interface exposing all editor form store actions. */
export interface EditorFormActions {
  // --- Type operations (all kinds) ---
  renameType(nodeId: string, newName: string): void;
  deleteType(nodeId: string): void;
  updateDefinition(nodeId: string, definition: string): void;
  updateComments(nodeId: string, comments: string): void;
  addSynonym(nodeId: string, synonym: string): void;
  removeSynonym(nodeId: string, index: number): void;

  // --- Data type operations ---
  addAttribute(nodeId: string, attrName: string, typeName: string, cardinality: string): void;
  removeAttribute(nodeId: string, attrName: string): void;
  updateAttribute(
    nodeId: string,
    oldName: string,
    newName: string,
    typeName: string,
    cardinality: string
  ): void;
  reorderAttribute(nodeId: string, fromIndex: number, toIndex: number): void;
  setInheritance(childId: string, parentId: string | null): void;

  // --- Enum operations ---
  addEnumValue(nodeId: string, valueName: string, displayName?: string): void;
  removeEnumValue(nodeId: string, valueName: string): void;
  updateEnumValue(nodeId: string, oldName: string, newName: string, displayName?: string): void;
  reorderEnumValue(nodeId: string, fromIndex: number, toIndex: number): void;
  setEnumParent(nodeId: string, parentId: string | null): void;

  // --- Choice operations ---
  addChoiceOption(nodeId: string, typeName: string): void;
  removeChoiceOption(nodeId: string, typeName: string): void;

  // --- Function operations ---
  addInputParam(nodeId: string, paramName: string, typeName: string): void;
  removeInputParam(nodeId: string, paramName: string): void;
  updateOutputType(nodeId: string, typeName: string): void;
  updateExpression(nodeId: string, expressionText: string): void;

  // --- Validation ---
  validate(): ValidationError[];
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

  // --- Editor form ref API (T026) ---
  /** Get current data for a node by ID (returns null if not found). */
  getNodeData(nodeId: string): TypeNodeData | null;
  /** Get all current nodes (for building availableTypes list). */
  getNodes(): TypeGraphNode[];
  /** Rename a type with CASCADE: updates node ID, all member refs, all edges. */
  renameType(nodeId: string, newName: string): void;
  /** Update a specific attribute on a node. */
  updateAttribute(
    nodeId: string,
    oldName: string,
    newName: string,
    typeName: string,
    cardinality: string
  ): void;
  /** Add an attribute to a node. */
  addAttribute(nodeId: string, attrName: string, typeName: string, cardinality: string): void;
  /** Remove an attribute from a node. */
  removeAttribute(nodeId: string, attrName: string): void;
  /** Reorder attributes within a node. */
  reorderAttribute(nodeId: string, fromIndex: number, toIndex: number): void;
  /** Set or clear inheritance for a node. */
  setInheritance(childId: string, parentId: string | null): void;
  /** Update the definition (description) of a node. */
  updateDefinition(nodeId: string, definition: string): void;
  /** Update the comments on a node. */
  updateComments(nodeId: string, comments: string): void;
  /** Add a synonym to a node. */
  addSynonym(nodeId: string, synonym: string): void;
  /** Remove a synonym from a node by index. */
  removeSynonym(nodeId: string, index: number): void;
  /** Validate the current graph and return errors. */
  validate(): ValidationError[];
  /** Update cardinality on a specific attribute. */
  updateCardinality(nodeId: string, attrName: string, cardinality: string): void;
  /** Add an enum value. */
  addEnumValue(nodeId: string, valueName: string, displayName?: string): void;
  /** Remove an enum value. */
  removeEnumValue(nodeId: string, valueName: string): void;
  /** Update an enum value. */
  updateEnumValue(nodeId: string, oldName: string, newName: string, displayName?: string): void;
  /** Reorder enum values. */
  reorderEnumValue(nodeId: string, fromIndex: number, toIndex: number): void;
  /** Set or clear parent enum. */
  setEnumParent(nodeId: string, parentId: string | null): void;
  /** Add a choice option. */
  addChoiceOption(nodeId: string, typeName: string): void;
  /** Remove a choice option. */
  removeChoiceOption(nodeId: string, typeName: string): void;
  /** Add an input parameter to a function. */
  addInputParam(nodeId: string, paramName: string, typeName: string): void;
  /** Remove an input parameter from a function. */
  removeInputParam(nodeId: string, paramName: string): void;
  /** Update a function's output type. */
  updateOutputType(nodeId: string, typeName: string): void;
  /** Update a function's expression text. */
  updateExpression(nodeId: string, expressionText: string): void;
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
