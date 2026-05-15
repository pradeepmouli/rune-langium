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
import { BUILTIN_TYPES } from '../types.js';

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

/**
 * Canonical cardinality shape mirroring `model-helpers.ts`'s `CardinalityShape`.
 * Re-declared here (not imported) because that type is not exported, but kept
 * structurally identical so the adapter can be wired to the real Langium AST
 * in Phase 3 without a second migration.
 */
export interface AdapterCardinality {
  readonly inf: number;
  readonly sup?: number;
  readonly unbounded: boolean;
}

export interface AdapterAttribute {
  readonly name: string;
  readonly typeCall: { readonly type?: { readonly $refText?: string } } | string;
  readonly card: AdapterCardinality;
  readonly astRange?: { start: number; end: number };
}

export interface BuildOptions {
  readonly focusedTypeId: string;
  readonly expansionMap: ReadonlyMap<string, boolean>;
}

// classifyType treats anything in BUILTIN_TYPES as a chip-only "primitive-like" leaf; UI does not drill into them.
const BUILTIN_SET = new Set<string>(BUILTIN_TYPES);

function typeRefText(attr: AdapterAttribute): string {
  if (typeof attr.typeCall === 'string') return attr.typeCall;
  return attr.typeCall.type?.$refText ?? '';
}

/**
 * Pill-label form of cardinality: `"0..1"`, `"0..*"`, `"1..*"`.
 *
 * Deliberately parens-less; the canonical `formatCardinality` in
 * `model-helpers.ts` returns parens form (`"(0..1)"`) for AstNodeModel
 * display. The structure-view spec calls for the bare form on
 * `StructureRow.cardinality`.
 */
function formatCardinality(card: AdapterCardinality): string {
  const sup = card.unbounded ? '*' : String(card.sup ?? card.inf);
  return `${card.inf}..${sup}`;
}

function classifyType(typeName: string, doc: AdapterDocument, callerNamespace?: string): StructureRow['typeKind'] {
  if (BUILTIN_SET.has(typeName)) return 'BasicType';
  const match = findNodeByName(typeName, doc, callerNamespace);
  if (!match) return 'Unresolved';
  if (match.$type === 'Data') return 'Data';
  if (match.$type === 'Choice') return 'Choice';
  return 'Enum';
}

// callerNamespace is always provided by current callers (classifyType / buildRow / inheritance / root lookup); the undefined-namespace branch is defensive fallback.
//
// Rune DSL grammar (rune-dsl.langium) declares `TypeCall.type` and `extends`
// superType references as `[T:QualifiedName]`, so $refText can be either a
// bare name ("Party") or a fully-qualified name ("cdm.product.Party"). We
// handle both forms here so the qualified-name source-drop path (Phase 9)
// resolves correctly.
function findNodeByName(typeName: string, doc: AdapterDocument, callerNamespace?: string): AdapterNode | undefined {
  // Qualified-ref form: "<ns.segments>.<TypeName>". Split on the last dot:
  // everything before is the namespace, everything after is the simple name.
  const lastDot = typeName.lastIndexOf('.');
  if (lastDot > 0) {
    const qualifiedNs = typeName.slice(0, lastDot);
    const qualifiedName = typeName.slice(lastDot + 1);
    const qualifiedMatch = doc.nodes.find((n) => n.name === qualifiedName && n.namespace === qualifiedNs);
    if (qualifiedMatch) return qualifiedMatch;
    // Fall through to the unqualified path below — defensive cover for a
    // $refText that looks qualified but is actually a bare name containing a
    // dot. In practice this branch is dead but it's cheap defense.
  }

  // Unqualified path: name match, optionally prefer same-namespace caller.
  let firstMatch: AdapterNode | undefined;
  for (const n of doc.nodes) {
    if (n.name !== typeName) continue;
    if (callerNamespace && n.namespace === callerNamespace) return n;
    if (!firstMatch) firstMatch = n;
  }
  return firstMatch;
}

function buildRow(
  attr: AdapterAttribute,
  doc: AdapterDocument,
  callerNamespace: string,
  isInherited = false
): StructureRow {
  const typeName = typeRefText(attr);
  const typeKind = classifyType(typeName, doc, callerNamespace);
  const target =
    typeKind !== 'BasicType' && typeKind !== 'Unresolved' ? findNodeByName(typeName, doc, callerNamespace) : undefined;
  const cardinality = formatCardinality(attr.card);
  return {
    attrName: attr.name,
    typeName,
    typeKind,
    targetNodeId: target?.id,
    targetNamespaceUri: target?.namespace,
    cardinality,
    isOptional: attr.card.inf === 0,
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
  const options = (node.attributes ?? []).map((a) => buildRow(a, doc, node.namespace, false));
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
): void {
  const expansions = new Map<string, string>();
  const rows = (node.attributes ?? []).map((a) => buildRow(a, doc, node.namespace, false));

  // Reserve a placeholder so cyclic references (A → B → A) terminate when we
  // recurse — children that revisit this node will hit the `out.has(...)`
  // guard below and short-circuit on the placeholder id.
  const placeholder: StructureDataNode = {
    id: node.id,
    kind: 'data',
    name: node.name,
    namespaceUri: node.namespace,
    extendsName: node.extends,
    extendsNodeId: node.extends ? findNodeByName(node.extends, doc, node.namespace)?.id : undefined,
    rows,
    expansions
  };
  out.set(node.id, placeholder);

  for (const row of rows) {
    if (shouldExpand(row, node.namespace, node.name, opts.expansionMap) && row.targetNodeId) {
      const target = doc.nodes.find((n) => n.id === row.targetNodeId);
      if (!target) continue;
      // Defense-in-depth: re-check the target kind here so this guard cannot
      // disagree with shouldExpand's. If an Enum (or any future non-expandable
      // kind) ever slips through, we skip without recording a dangling edge.
      if (target.$type !== 'Data' && target.$type !== 'Choice') continue;
      expansions.set(row.attrName, target.id);
      if (out.has(target.id)) {
        // Already materialized (or in-flight from a cyclic walk). Re-use.
        continue;
      }
      if (target.$type === 'Data') {
        walkAndExpand(target, doc, opts, out);
      } else {
        out.set(target.id, buildChoiceNode(target, doc));
      }
    }
  }
}

export function buildStructureGraph(doc: AdapterDocument, opts: BuildOptions): StructureGraphInput {
  const nodes = new Map<string, StructureNode>();
  const root = doc.nodes.find((n) => n.id === opts.focusedTypeId);
  if (!root) {
    return { rootNodeId: opts.focusedTypeId, nodes };
  }

  if (root.$type === 'Data') {
    if (root.extends) {
      const baseNode = findNodeByName(root.extends, doc, root.namespace);
      if (baseNode) {
        // Phase 2 only flattens one inheritance level; deeper chains land in a follow-up phase.
        const baseId = `${root.id}::__base`;
        const baseRows = (baseNode.attributes ?? []).map((a) => buildRow(a, doc, baseNode.namespace, true));
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
