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
  type StructureChoiceArm,
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
  /** Data nodes carry their attributes here. */
  readonly attributes?: ReadonlyArray<AdapterAttribute>;
  /** Choice nodes carry their arms here — real ChoiceOption AST shape (typeCall only, no name/card). */
  readonly choiceOptions?: ReadonlyArray<AdapterChoiceOption>;
  readonly values?: ReadonlyArray<{ name: string }>;
}

/**
 * Mirrors the real ChoiceOption AST shape: only `typeCall`, no `name`, no `card`.
 * Choice arms are alternatives ("pick one of these types"), not attributes.
 */
export interface AdapterChoiceOption {
  /** The type reference in the same union form as AdapterAttribute.typeCall. */
  readonly typeCall: { readonly type?: { readonly $refText?: string } } | string;
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

/**
 * Phase 14e — per-instance materialization makes the SuppressedEdge side-table
 * mechanism obsolete. Under canonical-id dedup, the cache shared one
 * StructureNode across multiple visible references, so a containment edge
 * suppressed by the cycle guard in one context could be promoted later when
 * the same target was reached via a non-cyclic sibling path (replay). Under
 * per-instance materialization, each visible reference builds its own
 * StructureNode independently — there is no shared "completed sibling" to
 * promote into. Cycles are still detected via the canonical-id `path` set
 * (recursion ancestors), but the resulting suppression is purely local: the
 * cyclic row's `expansions` map simply omits the cyclic edge. The row chip
 * remains visible.
 *
 * Sibling cross-references (Trade.party AND Trade.counterparty → Party) are
 * preserved naturally: each gets its own Party instance with its own subtree;
 * the spec §3.2 "completed sibling" semantics now manifest as two visible
 * instances of the same canonical type instead of a shared cross-tree handle.
 *
 * The `SuppressedEdge` interface and `replaySuppressedEdges` helper that this
 * file used to expose are removed — kept here as a doc comment to explain why
 * the cycle-guard branches don't push anything anymore.
 */

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
  // A failed qualified lookup is authoritative — type names can't contain
  // dots in the DSL, so a $refText with dots is unambiguously a qualified
  // reference. Falling back to unqualified matching here would let a
  // typoed namespace silently resolve to a same-named type elsewhere.
  const lastDot = typeName.lastIndexOf('.');
  if (lastDot > 0) {
    const qualifiedNs = typeName.slice(0, lastDot);
    const qualifiedName = typeName.slice(lastDot + 1);
    return doc.nodes.find((n) => n.name === qualifiedName && n.namespace === qualifiedNs);
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

/**
 * Decide whether `row` should be expanded into a child node for THIS visible
 * occurrence of its owner.
 *
 * **Per-instance semantics (Phase 14d).** `instancePath` carries the chain of
 * React Flow instance ids of the owner's ancestors (NOT including the owner
 * itself). The adapter builds the expansion key with the same `instancePath`
 * the renderer uses for its chevron, so a toggle on one visible occurrence
 * only affects that occurrence's subtree.
 *
 * The expansion map is checked with a plain `=== true` look-up on the
 * per-instance key. Absent entries are collapsed; only an explicit `true`
 * expands. `toggleExpansion` in the store writes `true` on expand and
 * DELETES on collapse, so the map stays compact.
 */
function shouldExpand(
  row: StructureRow,
  ownerNamespace: string,
  ownerTypeName: string,
  expansionMap: ReadonlyMap<string, boolean>,
  instancePath: ReadonlyArray<string>
): boolean {
  if (row.typeKind !== 'Data' && row.typeKind !== 'Choice') return false;
  if (!row.targetNodeId) return false;
  const key = expansionKey({
    namespaceUri: ownerNamespace,
    typeId: ownerTypeName,
    attrName: row.attrName,
    instancePath
  });
  return expansionMap.get(key) === true;
}

function choiceOptRefText(opt: AdapterChoiceOption): string {
  if (typeof opt.typeCall === 'string') return opt.typeCall;
  return opt.typeCall.type?.$refText ?? '';
}

/**
 * Resolve a single ChoiceOption arm into a StructureChoiceArm.
 * Reuses `findNodeByName` (the same lookup `buildRow` uses) to classify and
 * resolve the referenced type — no fabricated name or cardinality.
 */
function buildChoiceArm(opt: AdapterChoiceOption, doc: AdapterDocument, ownerNamespace: string): StructureChoiceArm {
  const refText = choiceOptRefText(opt);
  if (!refText) {
    return { typeName: '<unresolved>', typeKind: 'Unresolved' };
  }
  if (BUILTIN_SET.has(refText)) {
    return { typeName: refText, typeKind: 'Builtin' };
  }
  const target = findNodeByName(refText, doc, ownerNamespace);
  if (!target) {
    return { typeName: refText, typeKind: 'Unresolved' };
  }
  const typeKind: StructureChoiceArm['typeKind'] =
    target.$type === 'Data' ? 'Data' : target.$type === 'Choice' ? 'Choice' : 'Enum';
  return { typeName: refText, typeKind, targetNodeId: target.id };
}

function buildChoiceNode(node: AdapterNode, doc: AdapterDocument, instanceId: string): StructureChoiceNode {
  const arms = (node.choiceOptions ?? []).map((opt) => buildChoiceArm(opt, doc, node.namespace));
  return {
    id: node.id,
    instanceId,
    kind: 'choice',
    name: node.name,
    namespaceUri: node.namespace,
    options: arms
  };
}

/**
 * Compose the React Flow instance id a layout placement would assign to an
 * expansion child. Mirrors the layout's `makeInstanceId` so the adapter and
 * layout agree on what `data.instancePath` should look like in renderer chevrons.
 *
 * Layout source of truth: `packages/visual-editor/src/layout/structure-layout.ts:339`.
 *
 * Phase 14e: this is also the key the adapter uses for `out` entries — each
 * unique (parentInstanceId × attrName × canonicalTarget) gets its own
 * StructureNode in the per-instance graph.
 */
function adapterChildInstanceId(parentInstanceId: string, attrName: string, targetCanonicalId: string): string {
  return `${parentInstanceId}::${attrName}::${targetCanonicalId}`;
}

/**
 * Compose the instance id of a base container nested one level deeper than its
 * outer instance (via the layout's `__derived` slot).
 */
function adapterDerivedInstanceId(outerInstanceId: string, innerCanonicalId: string): string {
  return `${outerInstanceId}::__derived::${innerCanonicalId}`;
}

/**
 * Phase 14d helper: walk the inheritance chain of `focused` to determine the
 * canonical id of the OUTERMOST base container wrapping it (or `focused.id`
 * itself if there is no inheritance). Mirrors the wrapper-id construction in
 * `materializeDataWithInheritance` so callers can pre-compute the outermost
 * id before invoking materialization (needed when the outermost id is also
 * used as the layout's rfId — i.e. for the root placement).
 *
 * Cycle protection mirrors the inheritance walk in
 * `materializeDataWithInheritance`: a local `visited` set breaks malformed
 * chains; well-formed inputs cannot self-extend.
 */
function computeOutermostCanonicalId(focused: AdapterNode, doc: AdapterDocument, cache?: Map<string, string>): string {
  if (cache?.has(focused.id)) return cache.get(focused.id) as string;
  if (!focused.extends) {
    cache?.set(focused.id, focused.id);
    return focused.id;
  }
  const visited = new Set<string>([focused.id]);
  let outermost = focused.id;
  let cursor: AdapterNode | undefined = findNodeByName(focused.extends, doc, focused.namespace);
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    outermost = `${focused.id}::__base::${cursor.id}`;
    cursor = cursor.extends ? findNodeByName(cursor.extends, doc, cursor.namespace) : undefined;
  }
  cache?.set(focused.id, outermost);
  return outermost;
}

/**
 * Phase 14e — full per-instance materialization.
 *
 * Walk a Data node's rows and, for each expanded row, materialize a fresh
 * per-instance subtree. Unlike the previous Phase 14d implementation, `out`
 * is now keyed on instance ids (not canonical ids), so two visible occurrences
 * of the same type (e.g. `buyer.Party` and `seller.Party`) produce two
 * independent StructureDataNode entries with their own `expansions` maps.
 *
 * Toggling a chevron on one instance writes a per-instance store key (the
 * renderer uses `data.instancePath` + self's rfId), and `shouldExpand` for
 * the OTHER instance checks a different key — so siblings stay independent.
 *
 * Cycle protection is keyed on CANONICAL ids (cycles are a property of the
 * type graph, not visible instances) — the `path` set carries canonical ids
 * of recursion ancestors. A second SIBLING instance of an ancestor type is
 * still legal; only re-entering the SAME ancestor (which would loop forever)
 * is suppressed.
 */
function walkAndExpand(
  node: AdapterNode,
  doc: AdapterDocument,
  opts: BuildOptions,
  out: Map<string, StructureNode>,
  // Canonical ids of `node`'s ancestors in the current recursion stack. A
  // target already on `path` forms a containment cycle in the layout — the
  // edge is dropped, but the row chip remains visible. Per-instance semantics
  // mean no cross-instance "completed sibling" promotion is needed.
  path: ReadonlySet<string>,
  // Cache mapping a Data target's canonical id to its outermost wrapper's
  // canonical id. Performance-only.
  outerMostCanonicalCache: Map<string, string>,
  // INSTANCE id of the StructureNode being walked. Used as the `out` key for
  // this node's `expansions` map AND as the parent instance id when computing
  // child instance ids.
  currentInstanceId: string,
  // Chain of ancestor instance ids leading to this node (NOT including this
  // node itself).
  instancePath: ReadonlyArray<string>
): void {
  const expansions = new Map<string, string>();
  const rows = (node.attributes ?? []).map((a) => buildRow(a, doc, node.namespace, false));

  const placeholder: StructureDataNode = {
    id: node.id,
    instanceId: currentInstanceId,
    kind: 'data',
    name: node.name,
    namespaceUri: node.namespace,
    extendsName: node.extends,
    extendsNodeId: node.extends ? findNodeByName(node.extends, doc, node.namespace)?.id : undefined,
    rows,
    expansions
  };
  out.set(currentInstanceId, placeholder);

  // Cycle guard carries CANONICAL ids — cycles are properties of the type
  // graph, not visible instances.
  const nextPath = new Set(path);
  nextPath.add(node.id);
  const childInstancePath: ReadonlyArray<string> = [...instancePath, currentInstanceId];

  for (const row of rows) {
    if (shouldExpand(row, node.namespace, node.name, opts.expansionMap, childInstancePath) && row.targetNodeId) {
      const target = doc.nodes.find((n) => n.id === row.targetNodeId);
      if (!target) continue;
      if (target.$type !== 'Data' && target.$type !== 'Choice') continue;
      if (nextPath.has(target.id)) {
        // Cyclic; drop the containment edge silently. The row chip remains.
        continue;
      }
      if (target.$type === 'Data') {
        const targetOutermostCanonical = computeOutermostCanonicalId(target, doc, outerMostCanonicalCache);
        const childInstanceId = adapterChildInstanceId(currentInstanceId, row.attrName, targetOutermostCanonical);
        const expandedId = materializeDataWithInheritance(
          target,
          doc,
          opts,
          out,
          nextPath,
          outerMostCanonicalCache,
          childInstanceId,
          childInstancePath
        );
        expansions.set(row.attrName, expandedId);
      } else {
        const childInstanceId = adapterChildInstanceId(currentInstanceId, row.attrName, target.id);
        if (!out.has(childInstanceId)) {
          out.set(childInstanceId, buildChoiceNode(target, doc, childInstanceId));
        }
        expansions.set(row.attrName, childInstanceId);
      }
    }
  }
}

/**
 * Materialize a Data node into `out` with its full inheritance chain, per
 * instance. Returns the INSTANCE id that a containment edge should point at —
 * either the outermost base container's instance id (if the node has
 * `extends`) or the focused node's own instance id.
 *
 * Shared between `buildStructureGraph` (focused root) and `walkAndExpand`
 * (each expanded Data target). Containment is the single mechanism for both
 * inheritance and type-reference per spec §3.2.
 *
 * Phase 14e (per-instance materialization): each call builds FRESH
 * StructureNode entries keyed under instance ids; multiple visible
 * occurrences of the same canonical type produce multiple, independent
 * subtrees. The `outerMostCanonicalCache` is performance-only (canonical id
 * → canonical outermost id); it does NOT short-circuit re-materialization.
 * Inheritance-chain cycles are broken by a local `visited` set; expansion
 * cycles are guarded by the canonical-id `path` set threaded through.
 */
function materializeDataWithInheritance(
  focused: AdapterNode,
  doc: AdapterDocument,
  opts: BuildOptions,
  out: Map<string, StructureNode>,
  path: ReadonlySet<string>,
  outerMostCanonicalCache: Map<string, string>,
  /**
   * INSTANCE id that the OUTERMOST wrapper of this Data type will carry (the
   * outermost base container, or the focused node itself if no inheritance).
   * Used both as the `out` key and as the basis for nested-container instance
   * ids beneath this wrapper.
   */
  outermostInstanceId: string,
  /**
   * Instance path for the OUTERMOST wrapper's `instancePath` (= ancestors of
   * the wrapper, NOT including the wrapper itself). For the root this is
   * `[]`; for an expanded child it's `[...parentPath, parentInstanceId]`.
   * Inner containers (and the focused Data node) build their own deeper
   * paths from this value.
   */
  instancePath: ReadonlyArray<string>
): string {
  // Collect ancestors from nearest base outward, with inheritance-cycle
  // protection. `visited` is intrinsic to the type's chain and local to
  // this call.
  const visited = new Set<string>([focused.id]);
  const ancestors: AdapterNode[] = [];
  let cursor: AdapterNode | undefined = focused.extends
    ? findNodeByName(focused.extends, doc, focused.namespace)
    : undefined;
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    ancestors.push(cursor);
    cursor = cursor.extends ? findNodeByName(cursor.extends, doc, cursor.namespace) : undefined;
  }

  // Compute the canonical id chain of base containers (outermost FIRST).
  // ancestors is INNERMOST → OUTERMOST; reverse for layout placement order.
  const outerToInner = [...ancestors].reverse();
  const baseCanonicalIds = outerToInner.map((baseNode) => `${focused.id}::__base::${baseNode.id}`);

  // Compute the per-instance rfId AND instancePath for each base container,
  // plus the focused Data node. The outermost container's rfId is
  // `outermostInstanceId` (passed in); each inner is the layout's `__derived`
  // slot of the previous outer.
  const baseRfIds: string[] = [];
  const basePaths: Array<ReadonlyArray<string>> = [];
  let prevRfId = outermostInstanceId;
  let prevPath: ReadonlyArray<string> = instancePath;
  for (let i = 0; i < baseCanonicalIds.length; i++) {
    if (i === 0) {
      baseRfIds.push(outermostInstanceId);
      basePaths.push(instancePath);
    } else {
      const myRfId = adapterDerivedInstanceId(prevRfId, baseCanonicalIds[i]);
      const myPath = [...prevPath, prevRfId];
      baseRfIds.push(myRfId);
      basePaths.push(myPath);
    }
    prevRfId = baseRfIds[i];
    prevPath = basePaths[i];
  }
  // Focused node sits one __derived deeper than the innermost base (or IS
  // the outermost wrapper when there's no inheritance).
  const focusedRfId = ancestors.length === 0 ? outermostInstanceId : adapterDerivedInstanceId(prevRfId, focused.id);
  const focusedPath: ReadonlyArray<string> = ancestors.length === 0 ? instancePath : [...prevPath, prevRfId];

  // Walk the focused Data node first. Under per-instance keying, the
  // canonical-id `path` cycle guard is sufficient — if the focused canonical
  // id is already on `path`, walkAndExpand's per-row check will suppress
  // re-entry via the `nextPath.has(target.id)` guard before recursion. The
  // pre-seed cache sentinel that the previous canonical-keyed implementation
  // needed is no longer required: each call writes its own per-instance
  // entry into `out` under a unique key, so there is no cross-instance
  // collision to defend against.
  walkAndExpand(focused, doc, opts, out, path, outerMostCanonicalCache, focusedRfId, focusedPath);

  // No inheritance chain → the focused Data node IS the outermost wrapper.
  if (ancestors.length === 0) {
    outerMostCanonicalCache.set(focused.id, focused.id);
    return focusedRfId;
  }

  // Build containers inside-out. Each base container is its own
  // per-instance entry keyed by its rfId, mirroring the layout placement.
  let childInstanceId = focusedRfId;
  let outermostCanonical = focused.id;
  let outermostRfId = focusedRfId;
  for (let ai = 0; ai < ancestors.length; ai++) {
    const baseNode = ancestors[ai];
    const baseCanonicalId = `${focused.id}::__base::${baseNode.id}`;
    const baseRows = (baseNode.attributes ?? []).map((a) => buildRow(a, doc, baseNode.namespace, true));

    // Look up the rfId+path computed for this base container above. Loop
    // walks INNERMOST → OUTERMOST; arrays are OUTERMOST → INNERMOST.
    const oi = ancestors.length - 1 - ai;
    const baseRfId = baseRfIds[oi];
    const baseRowInstancePath = basePaths[oi];

    const baseExpansions = new Map<string, string>();
    // Cycle guard set carries CANONICAL ids. Include focused.id, the base
    // type, and the synthetic container id so an inherited row that loops
    // back to any of those levels is correctly suppressed.
    const baseRowPath = new Set(path);
    baseRowPath.add(focused.id);
    baseRowPath.add(baseNode.id);
    baseRowPath.add(baseCanonicalId);

    const baseContainer: StructureBaseContainer = {
      id: baseCanonicalId,
      instanceId: baseRfId,
      kind: 'base',
      baseTypeName: baseNode.name,
      baseTypeNamespaceUri: baseNode.namespace,
      baseRows,
      childNodeId: childInstanceId,
      expansions: baseExpansions
    };
    out.set(baseRfId, baseContainer);

    // Children of this base's expanded rows see this base container as their
    // immediate parent: instancePath = `[...baseRowInstancePath, baseRfId]`.
    const childExpansionInstancePath: ReadonlyArray<string> = [...baseRowInstancePath, baseRfId];

    for (const row of baseRows) {
      if (!shouldExpand(row, baseNode.namespace, baseNode.name, opts.expansionMap, childExpansionInstancePath))
        continue;
      if (!row.targetNodeId) continue;
      const target = doc.nodes.find((n) => n.id === row.targetNodeId);
      if (!target) continue;
      if (target.$type !== 'Data' && target.$type !== 'Choice') continue;
      if (baseRowPath.has(target.id)) {
        // Cyclic; drop the containment edge. Per-instance materialization
        // means each visible occurrence is independent; no cross-instance
        // replay needed.
        continue;
      }
      if (target.$type === 'Data') {
        const targetOutermostCanonical = computeOutermostCanonicalId(target, doc, outerMostCanonicalCache);
        const targetInstanceId = adapterChildInstanceId(baseRfId, row.attrName, targetOutermostCanonical);
        const expandedId = materializeDataWithInheritance(
          target,
          doc,
          opts,
          out,
          baseRowPath,
          outerMostCanonicalCache,
          targetInstanceId,
          childExpansionInstancePath
        );
        baseExpansions.set(row.attrName, expandedId);
      } else {
        const targetInstanceId = adapterChildInstanceId(baseRfId, row.attrName, target.id);
        if (!out.has(targetInstanceId)) {
          out.set(targetInstanceId, buildChoiceNode(target, doc, targetInstanceId));
        }
        baseExpansions.set(row.attrName, targetInstanceId);
      }
    }
    childInstanceId = baseRfId;
    outermostCanonical = baseCanonicalId;
    outermostRfId = baseRfId;
  }

  outerMostCanonicalCache.set(focused.id, outermostCanonical);
  return outermostRfId;
}

export function buildStructureGraph(doc: AdapterDocument, opts: BuildOptions): StructureGraphInput {
  const nodes = new Map<string, StructureNode>();
  const root = doc.nodes.find((n) => n.id === opts.focusedTypeId);
  if (!root) {
    return { rootNodeId: opts.focusedTypeId, nodes };
  }

  if (root.$type === 'Data') {
    // Phase 14e — per-instance materialization. The `out` map is keyed by
    // instance id (one entry per visible occurrence). `outerMostCanonicalCache`
    // is canonical→canonical (performance only).
    //
    // Root instance id === outermost canonical id, matching the layout's
    // root rfId convention so `data.instancePath = []` at the root.
    const outerMostCanonicalCache = new Map<string, string>();
    const outermostCanonicalId = computeOutermostCanonicalId(root, doc, outerMostCanonicalCache);
    const rootInstanceId = materializeDataWithInheritance(
      root,
      doc,
      opts,
      nodes,
      new Set<string>(),
      outerMostCanonicalCache,
      outermostCanonicalId,
      []
    );
    return { rootNodeId: rootInstanceId, nodes };
  }
  // Choice as root handled in later tasks; preserve the Phase 2 contract of
  // an empty `nodes` map with `rootNodeId` echoing the focused id.
  return { rootNodeId: root.id, nodes };
}

/**
 * Find the first StructureNode whose canonical id matches.
 *
 * Phase 14e: `StructureGraphInput.nodes` is keyed by INSTANCE id (per-instance
 * materialization). Callers that need to look up a node by its canonical id —
 * tests, AST navigation, cell editors — use this helper instead of `nodes.get`.
 *
 * If multiple visible instances share the canonical id (e.g. `buyer.Party`
 * and `seller.Party`), the FIRST entry in iteration order is returned. Use
 * `findAllByCanonicalId` for the full list.
 */
export function findByCanonicalId(
  nodes: ReadonlyMap<string, StructureNode>,
  canonicalId: string
): StructureNode | undefined {
  for (const node of nodes.values()) {
    if (node.id === canonicalId) return node;
  }
  return undefined;
}

/** Return all StructureNodes whose canonical id matches. */
export function findAllByCanonicalId(nodes: ReadonlyMap<string, StructureNode>, canonicalId: string): StructureNode[] {
  const out: StructureNode[] = [];
  for (const node of nodes.values()) {
    if (node.id === canonicalId) out.push(node);
  }
  return out;
}
