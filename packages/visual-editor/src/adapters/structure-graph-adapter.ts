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
  type StructureChoiceNode,
  type StructureBaseContainer,
  type StructureRow,
  expansionKey
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

function shouldExpand(
  row: StructureRow,
  ownerNamespace: string,
  ownerTypeName: string,
  expansionMap: ReadonlyMap<string, boolean>
): boolean {
  if (row.typeKind !== 'Data' && row.typeKind !== 'Choice') return false;
  if (!row.targetNodeId) return false;
  const k = expansionKey({
    namespaceUri: ownerNamespace,
    typeId: ownerTypeName,
    attrName: row.attrName
  });
  return expansionMap.get(k) === true;
}

function buildChoiceNode(node: AdapterNode, doc: AdapterDocument): StructureChoiceNode {
  const options = (node.attributes ?? []).map((a) => buildRow(a, doc, false));
  return {
    id: node.id,
    kind: 'choice',
    name: node.name,
    namespaceUri: node.namespace,
    options
  };
}

function walkAndExpand(
  node: AdapterNode,
  doc: AdapterDocument,
  opts: BuildOptions,
  out: Map<string, StructureNode>
): StructureDataNode {
  const expansions = new Map<string, string>();
  const rows = (node.attributes ?? []).map((a) => buildRow(a, doc, false));

  // Reserve a placeholder so cyclic references (A → B → A) terminate when we
  // recurse — children that revisit this node will hit the `out.has(...)`
  // guard below and short-circuit on the placeholder id.
  const placeholder: StructureDataNode = {
    id: node.id,
    kind: 'data',
    name: node.name,
    namespaceUri: node.namespace,
    extendsName: node.extends,
    extendsNodeId: node.extends ? findNodeByName(node.extends, doc)?.id : undefined,
    rows,
    expansions
  };
  out.set(node.id, placeholder);

  for (const row of rows) {
    if (shouldExpand(row, node.namespace, node.name, opts.expansionMap) && row.targetNodeId) {
      const target = doc.nodes.find((n) => n.id === row.targetNodeId);
      if (!target) continue;
      expansions.set(row.attrName, target.id);
      if (out.has(target.id)) {
        // Already materialized (or in-flight from a cyclic walk). Re-use.
        continue;
      }
      if (target.$type === 'Data') {
        walkAndExpand(target, doc, opts, out);
      } else if (target.$type === 'Choice') {
        out.set(target.id, buildChoiceNode(target, doc));
      }
    }
  }

  return placeholder;
}

export function buildStructureGraph(doc: AdapterDocument, opts: BuildOptions): StructureGraphInput {
  const nodes = new Map<string, StructureNode>();
  const root = doc.nodes.find((n) => n.id === opts.focusedTypeId);
  if (!root) {
    return { rootNodeId: opts.focusedTypeId, nodes };
  }

  if (root.$type === 'Data') {
    if (root.extends) {
      const baseNode = findNodeByName(root.extends, doc);
      if (baseNode) {
        const baseId = `${root.id}::__base`;
        const baseRows = (baseNode.attributes ?? []).map((a) => buildRow(a, doc, true));
        const baseContainer: StructureBaseContainer = {
          id: baseId,
          kind: 'base',
          baseTypeName: baseNode.name,
          baseTypeNamespaceUri: baseNode.namespace,
          baseRows,
          childNodeId: root.id
        };
        nodes.set(baseId, baseContainer);
        walkAndExpand(root, doc, opts, nodes);
        return { rootNodeId: baseId, nodes };
      }
    }

    walkAndExpand(root, doc, opts, nodes);
  }
  // Choice as root handled in later tasks.

  return { rootNodeId: root.id, nodes };
}
