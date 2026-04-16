// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * @rune-langium/visual-editor — Shared types
 *
 * `AstNodeModel<T>` is the central mapped type: it takes any Langium AST
 * node type (Data, RosettaFunction, Attribute, Condition, …) and produces
 * a serialized model that:
 *   - strips Langium internals ($container, $cstNode, $document, …)
 *   - strips unused domain fields (references, labels, ruleReferences, …)
 *   - recursively maps child AST nodes to their AstNodeModel equivalents
 *   - passes through primitives, References, and other non-AST values
 *
 * `GraphNode<T>` adds graph/editor metadata (namespace, position, errors)
 * on top of AstNodeModel for top-level elements rendered by ReactFlow.
 *
 * The generated Zod schemas from langium-zod validate AstNodeModel shapes
 * directly — no transform layer is needed.
 */

import type { Node, Edge } from '@xyflow/react';
import type {
  Data,
  Choice,
  RosettaEnumeration,
  RosettaFunction,
  RosettaRecordType,
  RosettaTypeAlias,
  RosettaBasicType,
  Annotation
} from '@rune-langium/core';

// ---------------------------------------------------------------------------
// AstNodeModel — Recursive mapped type
// ---------------------------------------------------------------------------

/**
 * Structural constraint matching Langium's AstNode interface.
 * Used instead of importing langium directly (it's not a visual-editor dependency).
 */
export interface AstNodeShape {
  readonly $type: string;
  readonly $container?: AstNodeShape;
  readonly $containerProperty?: string;
  readonly $containerIndex?: number;
  readonly $cstNode?: unknown;
  readonly $document?: unknown;
}

/**
 * Fields excluded from AstNodeModel.
 *
 * Langium internals: AST tree metadata not meaningful in the serialized model.
 * Domain fields: metadata arrays unused by the visual editor (doc-references,
 * label annotations, rule references, inline type-call args, enum synonym metadata).
 */
type ExcludedFields =
  | '$container'
  | '$containerProperty'
  | '$containerIndex'
  | '$cstNode'
  | '$document'
  | 'references'
  | 'labels'
  | 'ruleReferences'
  | 'typeCallArgs'
  | 'enumSynonyms';

/**
 * Recursively transforms AST field types to their model equivalents.
 *
 * - `Array<AstNode>` → `Array<AstNodeModel<AstNode>>` (recurse)
 * - `AstNode` → `AstNodeModel<AstNode>` (recurse)
 * - Everything else (primitives, `Reference<T>`, unions) → passthrough
 */
export type SerializeField<F> =
  F extends Array<infer E extends AstNodeShape>
    ? Array<AstNodeModel<E>>
    : F extends AstNodeShape
      ? AstNodeModel<F>
      : F;

/**
 * Mapped type that plucks and recursively serializes fields from any
 * Langium AST node type.
 *
 * `$type` is preserved as a readonly literal (derived from the generic parameter)
 * for runtime discrimination. All other fields are made mutable for editing.
 *
 * @example
 * ```ts
 * // AstNodeModel<Data> yields:
 * // {
 * //   readonly $type: 'Data';
 * //   name: string;
 * //   definition?: string;
 * //   superType?: Reference<DataOrChoice>;
 * //   attributes: AstNodeModel<Attribute>[];
 * //   conditions: AstNodeModel<Condition>[];
 * //   annotations: AstNodeModel<AnnotationRef>[];
 * //   synonyms: AstNodeModel<RosettaClassSynonym>[];
 * // }
 * ```
 */
export type AstNodeModel<T extends AstNodeShape> = {
  readonly $type: T['$type'];
} & {
  -readonly [K in Exclude<keyof T, ExcludedFields | '$type'>]: SerializeField<T[K]>;
};

// ---------------------------------------------------------------------------
// GraphNode — AstNodeModel + graph/editor metadata
// ---------------------------------------------------------------------------

export interface GraphMetadata {
  namespace: string;
  position: { x: number; y: number };
  errors: ValidationError[];
  isReadOnly?: boolean;
  hasExternalRefs: boolean;
  /** UI-only annotation (not from AST). */
  comments?: string;
  /** Required for ReactFlow compatibility: Node<T> requires T extends Record<string, unknown> */
  [key: string]: unknown;
}

/**
 * Top-level graph node data: AstNodeModel with graph/editor metadata.
 * Used for elements rendered by ReactFlow (Data, Choice, Enum, Function, etc.).
 */
export type GraphNode<T extends AstNodeShape> = AstNodeModel<T> & GraphMetadata;

// ---------------------------------------------------------------------------
// Supported top-level AST types (for union/discrimination)
// ---------------------------------------------------------------------------

/** Union of all top-level AST element types that appear as graph nodes. */
export type RootAstElement =
  | Data
  | Choice
  | RosettaEnumeration
  | RosettaFunction
  | RosettaRecordType
  | RosettaTypeAlias
  | RosettaBasicType
  | Annotation;

/** Union of all GraphNode variants for top-level elements. */
export type AnyGraphNode =
  | GraphNode<Data>
  | GraphNode<Choice>
  | GraphNode<RosettaEnumeration>
  | GraphNode<RosettaFunction>
  | GraphNode<RosettaRecordType>
  | GraphNode<RosettaTypeAlias>
  | GraphNode<RosettaBasicType>
  | GraphNode<Annotation>;

// ---------------------------------------------------------------------------
// Type kind (short alias strings for UI/form dispatch)
// ---------------------------------------------------------------------------

/** Short kind strings used for UI dispatch, badge rendering, and form actions. */
export type TypeKind =
  | 'data'
  | 'choice'
  | 'enum'
  | 'func'
  | 'record'
  | 'typeAlias'
  | 'basicType'
  | 'annotation';

export type EdgeKind =
  | 'extends'
  | 'attribute-ref'
  | 'choice-option'
  | 'enum-extends'
  | 'type-alias-ref';

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

/**
 * Props provided to the expression editor render-prop slot.
 *
 * `packages/visual-editor` is editor-agnostic — the host app provides
 * the actual editor implementation (e.g. CodeMirror, Monaco) via a
 * `renderExpressionEditor` prop on `FunctionForm`.
 */
export interface ExpressionEditorSlotProps {
  /** Current expression text. */
  value: string;
  /** Called on every keystroke / change. */
  onChange: (value: string) => void;
  /** Called when the editor loses focus — triggers validation & commit. */
  onBlur: () => void;
  /** Validation error message (null when valid). */
  error?: string | null;
  /** Placeholder text shown when the editor is empty. */
  placeholder?: string;
  /** Raw AST expression object — enables direct tree conversion without reparsing text. */
  expressionAst?: unknown;
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
  kind: TypeKind | 'builtin' | 'record' | 'typeAlias' | 'basicType' | 'annotation';
  /** Namespace for grouping in the dropdown. */
  namespace?: string;
}

// ---------------------------------------------------------------------------
// Kind-specific form action interfaces
// ---------------------------------------------------------------------------

/** Actions shared by all type kinds. */
export interface CommonFormActions {
  renameType(nodeId: string, newName: string): void;
  deleteType(nodeId: string): void;
  updateDefinition(nodeId: string, definition: string): void;
  updateComments(nodeId: string, comments: string): void;
  addSynonym(nodeId: string, synonym: string): void;
  removeSynonym(nodeId: string, index: number): void;
  addAnnotation(nodeId: string, annotationName: string): void;
  removeAnnotation(nodeId: string, index: number): void;
  addCondition(
    nodeId: string,
    condition: {
      name?: string;
      definition?: string;
      expressionText: string;
      isPostCondition?: boolean;
    }
  ): void;
  removeCondition(nodeId: string, index: number): void;
  updateCondition(
    nodeId: string,
    index: number,
    updates: {
      name?: string;
      definition?: string;
      expressionText?: string;
    }
  ): void;
  reorderCondition(nodeId: string, fromIndex: number, toIndex: number): void;
  validate(): ValidationError[];
}

/** Data type–specific editor actions. */
export interface DataFormActions extends CommonFormActions {
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
}

/** Enum-specific editor actions. */
export interface EnumFormActions extends CommonFormActions {
  addEnumValue(nodeId: string, valueName: string, displayName?: string): void;
  removeEnumValue(nodeId: string, valueName: string): void;
  updateEnumValue(nodeId: string, oldName: string, newName: string, displayName?: string): void;
  reorderEnumValue(nodeId: string, fromIndex: number, toIndex: number): void;
  setEnumParent(nodeId: string, parentId: string | null): void;
}

/** Choice-specific editor actions. */
export interface ChoiceFormActions extends CommonFormActions {
  addChoiceOption(nodeId: string, typeName: string): void;
  removeChoiceOption(nodeId: string, typeName: string): void;
}

/** Function-specific editor actions. */
export interface FuncFormActions extends CommonFormActions {
  addInputParam(nodeId: string, paramName: string, typeName: string): void;
  removeInputParam(nodeId: string, paramName: string): void;
  updateOutputType(nodeId: string, typeName: string): void;
  updateExpression(nodeId: string, expressionText: string): void;
}

/** Maps each `TypeKind` to its form actions interface. */
export interface FormActionsKindMap {
  data: DataFormActions;
  enum: EnumFormActions;
  choice: ChoiceFormActions;
  func: FuncFormActions;
  record: CommonFormActions;
  typeAlias: CommonFormActions;
  basicType: CommonFormActions;
  annotation: CommonFormActions;
}

/** Intersection of all kind-specific actions (every method available). */
export type AllEditorFormActions = DataFormActions &
  EnumFormActions &
  ChoiceFormActions &
  FuncFormActions;

/**
 * Kind-aware editor form actions.
 *
 * When parameterized with a specific kind (e.g. `EditorFormActions<'data'>`),
 * only that kind's actions + common actions are available.
 *
 * When unparameterized (`EditorFormActions`), resolves to the full intersection
 * of all kind-specific actions for backward compatibility.
 *
 * @example
 * ```ts
 * // Narrow — DataTypeForm only sees data + common actions
 * const dataActions: EditorFormActions<'data'>;
 * dataActions.addAttribute(...); // ✅
 * dataActions.addEnumValue(...); // ❌ compile error
 *
 * // Full — EditorFormPanel passes the complete set
 * const allActions: EditorFormActions;
 * allActions.addAttribute(...); // ✅
 * allActions.addEnumValue(...); // ✅
 * ```
 */
export type EditorFormActions<K extends TypeKind = TypeKind> = [TypeKind] extends [K]
  ? AllEditorFormActions
  : FormActionsKindMap[K];

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Visibility filter state for the type graph.
 *
 * @config
 * - `namespaces` — only show types from the listed namespaces (e.g., `["com.isda.cdm.product"]`)
 * - `kinds` — restrict to specific node types (`"data"`, `"choice"`, `"enum"`, `"function"`)
 * - `namePattern` — case-insensitive substring or glob match against type names
 * - `hideOrphans` — remove nodes with no edges (types not referenced by any other type)
 *
 * @category Visual Editor
 */
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
  /** Group nodes into inheritance trees and lay out each tree independently. */
  groupByInheritance?: boolean;
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

/**
 * Configuration props for the `RuneTypeGraph` component.
 *
 * @config
 * - `layout` — Dagre layout algorithm options (direction, separation distances,
 *   inheritance grouping). Changes trigger a full re-layout.
 * - `nodeStyles` — per-kind header and border color overrides.
 * - `edgeStyles` — per-edge-kind color, stroke width, and dash style overrides.
 * - `initialFilters` — filter state applied on first mount. Does NOT update the
 *   graph if changed after mount — call `ref.setFilters()` imperatively instead.
 * - `showMinimap` — render a minimap overview (default: `false`).
 * - `showControls` — render zoom/fit controls (default: `true`).
 * - `readOnly` — disable edit controls and context menus (default: `true`).
 *
 * @pitfalls
 * - `initialFilters` is only read on mount — passing a new object on re-render
 *   does NOT update the graph filters. Use the `RuneTypeGraphRef.setFilters()`
 *   imperative handle for dynamic filter changes.
 *
 * @category Visual Editor
 */
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

/** Callback for navigating to a type definition by node ID (namespace::name). */
export type NavigateToNodeCallback = (nodeId: string) => void;

/**
 * Event callbacks for the `RuneTypeGraph` component.
 *
 * @remarks
 * All callbacks are optional. `onModelChanged` fires after every committed edit
 * with the full serialized model as a `Map<namespace, rosettaSource>`. Use it
 * to persist model state.
 *
 * @pitfalls
 * - `onModelChanged` may fire frequently during drag operations — debounce it
 *   before persisting to disk or a backend.
 * - `onValidationChange` fires synchronously after each model mutation and may
 *   deliver validation errors before the UI has fully re-rendered.
 *
 * @category Visual Editor
 */
export interface RuneTypeGraphCallbacks {
  onNodeDoubleClick?: (nodeId: string, data: AnyGraphNode) => void;
  /** Called when a type reference is clicked within a graph node (e.g., attribute type name). */
  onNavigateToType?: NavigateToNodeCallback;
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

/**
 * Props for the `RuneTypeGraph` React component.
 *
 * @remarks
 * `config` and `callbacks` are both optional. When omitted, the graph renders
 * in read-only mode with default layout and styling.
 *
 * @category Visual Editor
 * @see {@link RuneTypeGraphConfig}
 * @see {@link RuneTypeGraphCallbacks}
 * @see {@link RuneTypeGraphRef}
 */
export interface RuneTypeGraphProps {
  config?: RuneTypeGraphConfig;
  callbacks?: RuneTypeGraphCallbacks;
  className?: string;
}

/**
 * Imperative ref handle for `RuneTypeGraph`.
 *
 * @remarks
 * Obtain via `React.useRef<RuneTypeGraphRef>()` and pass as `ref` to
 * `<RuneTypeGraph ref={ref} />`. All methods are synchronous except
 * `exportImage()`.
 *
 * @pitfalls
 * - `relayout()` triggers a full Dagre computation — avoid calling it in rapid
 *   succession (e.g., in a `useEffect` with frequent deps). Batch layout updates
 *   with a debounce.
 * - `exportImage()` renders the current viewport — hidden nodes (filtered out)
 *   will not appear in the export.
 *
 * @category Visual Editor
 */
export interface RuneTypeGraphRef {
  fitView(): void;
  focusNode(nodeId: string): void;
  search(query: string): string[];
  setFilters(filters: GraphFilters): void;
  getFilters(): GraphFilters;
  relayout(options?: LayoutOptions): void;
  exportImage(format: 'svg' | 'png'): Promise<Blob>;
  exportRosetta(): Map<string, string>;
  /** Get current data for a node by ID (returns null if not found). */
  getNodeData(nodeId: string): AnyGraphNode | null;
  /** Get all current nodes (for building availableTypes list). */
  getNodes(): TypeGraphNode[];
  /** Validate the current graph and return errors. */
  validate(): ValidationError[];
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
  funcCount: number;
}

export interface NamespaceTypeEntry {
  nodeId: string;
  name: string;
  kind: TypeKind;
  /** Whether this entry is from a system/base-type file (read-only). */
  isSystem?: boolean;
}

export interface VisibilityState {
  /** Namespaces whose types are currently visible on the graph. */
  expandedNamespaces: Set<string>;
  /** Individual nodes hidden within expanded namespaces. */
  hiddenNodeIds: Set<string>;
  /** Whether the explorer panel is open. */
  explorerOpen: boolean;
  /** Which node kinds are visible (all visible by default). */
  visibleNodeKinds: Set<TypeKind>;
  /** Which edge kinds are visible (all visible by default). */
  visibleEdgeKinds: Set<EdgeKind>;
}

// ---------------------------------------------------------------------------
// Typed ReactFlow aliases
// ---------------------------------------------------------------------------

export type TypeGraphNode = Node<AnyGraphNode>;
export type TypeGraphEdge = Edge<EdgeData>;
