/**
 * @rune-langium/visual-editor — Shared types
 *
 * Aligned with contracts/visual-editor-api.ts
 */

import type { Node, Edge } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Graph Data Types
// ---------------------------------------------------------------------------

export type TypeKind = 'data' | 'choice' | 'enum';

export type EdgeKind = 'extends' | 'attribute-ref' | 'choice-option' | 'enum-extends';

export interface MemberDisplay {
  name: string;
  typeName?: string;
  cardinality?: string;
  isOverride: boolean;
}

export interface TypeNodeData {
  kind: TypeKind;
  name: string;
  namespace: string;
  definition?: string;
  members: MemberDisplay[];
  parentName?: string;
  hasExternalRefs: boolean;
  errors: ValidationError[];
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
// Typed ReactFlow aliases
// ---------------------------------------------------------------------------

export type TypeGraphNode = Node<TypeNodeData>;
export type TypeGraphEdge = Edge<EdgeData>;
