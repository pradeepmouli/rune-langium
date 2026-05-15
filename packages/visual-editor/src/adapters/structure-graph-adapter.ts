// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Adapter: studio document state → StructureGraphInput.
 *
 * Walks the focused type's structure, resolving inheritance and type
 * references. Honors the expansion map to decide which complex-typed
 * attributes should produce child nodes.
 *
 * See docs/superpowers/specs/2026-05-12-structure-view-design.md § 3.
 */

import {
  type StructureGraphInput,
  type StructureNode,
  type StructureDataNode,
  type StructureRow
} from '../types/structure-view.js';

export interface AdapterDocument {
  readonly namespaces: ReadonlyArray<{ uri: string }>;
  readonly nodes: ReadonlyArray<AdapterNode>;
}

export interface AdapterNode {
  readonly id: string;
  readonly $type: 'Data' | 'Choice' | 'Enum';
  readonly name: string;
  readonly namespace: string;
  readonly extends?: string;
  readonly attributes?: ReadonlyArray<AdapterAttribute>;
  readonly values?: ReadonlyArray<{ name: string }>;
}

export interface AdapterAttribute {
  readonly name: string;
  readonly typeCall: { readonly type?: { readonly $refText?: string } } | string;
  readonly card: { readonly min: number; readonly max: number | '*' };
  readonly astRange?: { start: number; end: number };
}

export interface BuildOptions {
  readonly focusedTypeId: string;
  readonly expansionMap: ReadonlyMap<string, boolean>;
}

const BASIC_TYPES = new Set(['string', 'int', 'number', 'boolean', 'date', 'time', 'dateTime', 'zonedDateTime']);

function typeRefText(attr: AdapterAttribute): string {
  if (typeof attr.typeCall === 'string') return attr.typeCall;
  return attr.typeCall.type?.$refText ?? '';
}

function formatCardinality(card: AdapterAttribute['card']): string {
  const max = card.max === '*' ? '*' : String(card.max);
  return `${card.min}..${max}`;
}

function classifyType(typeName: string, doc: AdapterDocument): StructureRow['typeKind'] {
  if (BASIC_TYPES.has(typeName)) return 'BasicType';
  for (const n of doc.nodes) {
    if (n.name === typeName) {
      if (n.$type === 'Data') return 'Data';
      if (n.$type === 'Choice') return 'Choice';
      if (n.$type === 'Enum') return 'Enum';
    }
  }
  return 'Unresolved';
}

function findNodeByName(typeName: string, doc: AdapterDocument): AdapterNode | undefined {
  return doc.nodes.find((n) => n.name === typeName);
}

function buildRow(attr: AdapterAttribute, doc: AdapterDocument, isInherited = false): StructureRow {
  const typeName = typeRefText(attr);
  const typeKind = classifyType(typeName, doc);
  const target = typeKind !== 'BasicType' && typeKind !== 'Unresolved' ? findNodeByName(typeName, doc) : undefined;
  const cardinality = formatCardinality(attr.card);
  return {
    attrName: attr.name,
    typeName,
    typeKind,
    targetNodeId: target?.id,
    targetNamespaceUri: target?.namespace,
    cardinality,
    isOptional: attr.card.min === 0,
    isInherited,
    astRange: attr.astRange
  };
}

function buildDataNode(
  node: AdapterNode,
  doc: AdapterDocument,
  expansions: ReadonlyMap<string, string>
): StructureDataNode {
  const rows = (node.attributes ?? []).map((a) => buildRow(a, doc, false));
  return {
    id: node.id,
    kind: 'data',
    name: node.name,
    namespaceUri: node.namespace,
    extendsName: node.extends,
    extendsNodeId: node.extends ? findNodeByName(node.extends, doc)?.id : undefined,
    rows,
    expansions
  };
}

export function buildStructureGraph(doc: AdapterDocument, opts: BuildOptions): StructureGraphInput {
  const nodes = new Map<string, StructureNode>();
  const root = doc.nodes.find((n) => n.id === opts.focusedTypeId);
  if (!root) {
    return { rootNodeId: opts.focusedTypeId, nodes };
  }

  if (root.$type === 'Data') {
    nodes.set(root.id, buildDataNode(root, doc, new Map()));
  }
  // Choice as root and inheritance handled in later tasks.

  return { rootNodeId: root.id, nodes };
}
