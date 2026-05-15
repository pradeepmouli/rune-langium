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

/**
 * Side-table entry capturing an expansion edge that was suppressed during
 * materialization because the target was an ancestor in the current recursion
 * path. Suppression is a *context-dependent* decision (it depends on which
 * path we reached the owner through), but the `outerMostId` cache is
 * context-independent. When a cached owner is reused in a different context
 * where the suppressed target is no longer an ancestor, the edge must be
 * promoted — that's what `replaySuppressedEdges` does.
 *
 * Spec §3.2: containment is the single uniform mechanism for both inheritance
 * and type-reference. A cross-tree handle to a completed sibling (target in
 * `out` but not in the current ancestor path) must be preserved.
 */
interface SuppressedEdge {
  /** Node id of the owner whose `expansions` map should receive this edge. */
  readonly ownerNodeId: string;
  readonly attrName: string;
  readonly targetId: string;
  /** Whether the target is a Data node (needs inheritance wrapping) or Choice. */
  readonly targetKind: 'Data' | 'Choice';
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
  out: Map<string, StructureNode>,
  // Ancestors of `node` in the current recursion stack. Edges to anything in
  // this set would form a containment cycle in the Phase 3 React Flow layout
  // (which treats `expansions` as parentId), so they are dropped at record
  // time. Completed-sibling references (target already in `out` but NOT in
  // `path`) are preserved — those render as cross-tree handles, not parents.
  path: ReadonlySet<string>,
  // Cache mapping a Data target's own id to the outermost-container id that
  // wraps it (or the target's own id if there is no inheritance chain). Used
  // by `materializeDataWithInheritance` so repeat expansions of the same
  // target reuse the cached outermost id without re-walking.
  outerMostId: Map<string, string>,
  // Side-table of edges suppressed by the ancestor-cycle guard. Replayed on
  // every cache-reuse so context-dependent suppressions don't become permanent
  // when a target is later revisited through a non-cyclic path. See the
  // `SuppressedEdge` doc for the full rationale.
  suppressedEdges: SuppressedEdge[]
): void {
  const expansions = new Map<string, string>();
  const rows = (node.attributes ?? []).map((a) => buildRow(a, doc, node.namespace, false));

  // Reserve a placeholder so cyclic references terminate when we recurse —
  // children that revisit this node will hit the `out.has(...)` guard below
  // and re-use the placeholder rather than re-walking.
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

  // Fresh per-call set keeps the ancestor path scoped to this recursion
  // branch; siblings in unrelated branches don't share it. Letting `nextPath`
  // go out of scope on return acts as the implicit "leave" cleanup.
  const nextPath = new Set(path);
  nextPath.add(node.id);

  for (const row of rows) {
    if (shouldExpand(row, node.namespace, node.name, opts.expansionMap) && row.targetNodeId) {
      const target = doc.nodes.find((n) => n.id === row.targetNodeId);
      if (!target) continue;
      // Defense-in-depth: re-check the target kind here so this guard cannot
      // disagree with shouldExpand's. If an Enum (or any future non-expandable
      // kind) ever slips through, we skip without recording a dangling edge.
      if (target.$type !== 'Data' && target.$type !== 'Choice') continue;
      // Ancestor cycle guard: dropping both the expansion edge AND the
      // recursion. The row still appears in `rows` as a chip referencing the
      // ancestor by id; only the parent/child containment link is suppressed
      // FOR THIS PATH. We record the suppression in the side table so a later
      // visit through a different (non-cyclic) path can promote the edge —
      // otherwise the context-dependent suppression would become permanent
      // even after the cycle disappears (the Codex P2 cache-reuse defect).
      if (nextPath.has(target.id)) {
        suppressedEdges.push({
          ownerNodeId: node.id,
          attrName: row.attrName,
          targetId: target.id,
          targetKind: target.$type
        });
        continue;
      }
      if (target.$type === 'Data') {
        // Spec §3.2: containment is the single mechanism for both inheritance
        // and type-reference and they compose uniformly. The expansion edge
        // must point at the OUTERMOST base container (if any) so the Data
        // target renders wrapped in its full inheritance chain — matching the
        // focused-root behavior in `buildStructureGraph`.
        const expandedId = materializeDataWithInheritance(
          target,
          doc,
          opts,
          out,
          nextPath,
          outerMostId,
          suppressedEdges
        );
        expansions.set(row.attrName, expandedId);
        // Promote any previously-suppressed edges that are now reachable now
        // that `target` (and its subtree) is in `out`.
        replaySuppressedEdges(doc, opts, out, nextPath, outerMostId, suppressedEdges);
      } else {
        expansions.set(row.attrName, target.id);
        if (!out.has(target.id)) {
          out.set(target.id, buildChoiceNode(target, doc));
        }
        // Choice has no expansions of its own, so no replay needed for the
        // freshly-materialized target, but other cached subtrees may have
        // edges that point at this Choice and were previously suppressed.
        replaySuppressedEdges(doc, opts, out, nextPath, outerMostId, suppressedEdges);
      }
    }
  }
}

/**
 * Materialize a Data node into `out` with its full inheritance chain.
 * Returns the id that a containment edge should point at — the outermost
 * base container if the node has `extends`, or the node's own id if not.
 *
 * Shared between `buildStructureGraph` (focused root) and `walkAndExpand`
 * (each expanded Data target). Containment is the single mechanism for both
 * inheritance and type-reference per spec §3.2; the two callers therefore
 * need identical wrapping behavior. Without this helper, expansion targets
 * would bypass the inheritance chain and render bare (no yellow base
 * containers, no inherited rows), violating §3.2's uniform composition.
 *
 * The chain is walked once per target — repeat expansions of the same Data
 * target reuse the cached outermost id from `outerMostId` and skip
 * re-materialization. Inheritance cycles (A extends B extends A) are broken
 * by a local `visited` set, distinct from the type-reference recursion
 * ancestor `path` (those guard different cycle classes).
 */
function materializeDataWithInheritance(
  focused: AdapterNode,
  doc: AdapterDocument,
  opts: BuildOptions,
  out: Map<string, StructureNode>,
  path: ReadonlySet<string>,
  outerMostId: Map<string, string>,
  suppressedEdges: SuppressedEdge[]
): string {
  // Repeat-expansion fast path: same target reached via multiple references
  // (e.g. Portfolio.trade1 + Portfolio.trade2 both point at Trade). The
  // chain has already been built; reuse the cached outermost id.
  //
  // Note: the cache is for the *outermost wrapper id*, which is intrinsic to
  // the target's inheritance chain and context-independent. Context-dependent
  // expansion edges suppressed during the first materialization are tracked
  // separately in `suppressedEdges` and replayed by the caller after this
  // function returns.
  const cached = outerMostId.get(focused.id);
  if (cached !== undefined) return cached;

  // Materialize the focused Data node first. Its own type-reference
  // expansions still need to walk through `walkAndExpand`. This must happen
  // before the inheritance chain is built so the innermost base container's
  // `childNodeId` can reference the now-present Data node.
  walkAndExpand(focused, doc, opts, out, path, outerMostId, suppressedEdges);

  if (!focused.extends) {
    outerMostId.set(focused.id, focused.id);
    return focused.id;
  }

  // Collect ancestors from nearest base outward, with cycle protection.
  // A type cannot extend itself in well-formed input, but defensive code
  // must not infinite-loop on malformed chains. The `visited` set is local
  // to this call (not threaded through) because a Data type's inheritance
  // chain is intrinsic — it doesn't depend on the expansion context.
  const visited = new Set<string>([focused.id]);
  const ancestors: AdapterNode[] = [];
  let cursor: AdapterNode | undefined = findNodeByName(focused.extends, doc, focused.namespace);
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    ancestors.push(cursor);
    cursor = cursor.extends ? findNodeByName(cursor.extends, doc, cursor.namespace) : undefined;
  }

  if (ancestors.length === 0) {
    outerMostId.set(focused.id, focused.id);
    return focused.id;
  }

  // Build containers inside-out so each parent container references the
  // already-built child container id. The first ancestor (nearest base)
  // wraps the focused Data node; subsequent ancestors wrap the previous
  // container. The last ancestor's container id is the outermost.
  let childId = focused.id;
  let outermost = focused.id;
  for (const baseNode of ancestors) {
    const baseId = `${focused.id}::__base::${baseNode.id}`;
    const baseRows = (baseNode.attributes ?? []).map((a) => buildRow(a, doc, baseNode.namespace, true));

    // Spec §3.2: containment is the uniform mechanism for both inheritance
    // and type-reference. A complex-typed inherited row (e.g.
    // `TradeBase.party: Party`) must be expandable in exactly the same way
    // as a row on the derived type — the expansion edge is owned by the
    // base level (this container), not the focused derived Data node, so
    // the expansion key uses the base node's namespace+name (the attribute's
    // declaration owner). This keeps expansion state stable whether the
    // user views TradeBase directly or any descendant.
    const baseExpansions = new Map<string, string>();
    // Add this base node to the recursion path while walking its rows so a
    // self-referential inherited row (`BaseType.foo: BaseType`) does not
    // form a containment cycle through expansion. Also add the synthetic
    // base-container id itself so an inherited row that loops back to the
    // *container* level (vs. the base node) is correctly suppressed.
    const baseRowPath = new Set(path);
    baseRowPath.add(baseNode.id);
    baseRowPath.add(baseId);

    // Materialize the base container BEFORE walking its rows so that any
    // suppressed-edge replay during target materialization can observe the
    // base container in `out` and promote edges targeting it.
    const baseContainer: StructureBaseContainer = {
      id: baseId,
      kind: 'base',
      baseTypeName: baseNode.name,
      baseTypeNamespaceUri: baseNode.namespace,
      baseRows,
      childNodeId: childId,
      expansions: baseExpansions
    };
    out.set(baseId, baseContainer);

    for (const row of baseRows) {
      if (!shouldExpand(row, baseNode.namespace, baseNode.name, opts.expansionMap)) continue;
      if (!row.targetNodeId) continue;
      const target = doc.nodes.find((n) => n.id === row.targetNodeId);
      if (!target) continue;
      if (target.$type !== 'Data' && target.$type !== 'Choice') continue;
      // Suppression path mirrors `walkAndExpand`: record the edge in the side
      // table so a later cache-reuse of this base container can replay and
      // promote the edge if the cycle no longer holds.
      if (baseRowPath.has(target.id)) {
        suppressedEdges.push({
          ownerNodeId: baseId,
          attrName: row.attrName,
          targetId: target.id,
          targetKind: target.$type
        });
        continue;
      }
      if (target.$type === 'Data') {
        const expandedId = materializeDataWithInheritance(
          target,
          doc,
          opts,
          out,
          baseRowPath,
          outerMostId,
          suppressedEdges
        );
        baseExpansions.set(row.attrName, expandedId);
        replaySuppressedEdges(doc, opts, out, baseRowPath, outerMostId, suppressedEdges);
      } else {
        baseExpansions.set(row.attrName, target.id);
        if (!out.has(target.id)) {
          out.set(target.id, buildChoiceNode(target, doc));
        }
        replaySuppressedEdges(doc, opts, out, baseRowPath, outerMostId, suppressedEdges);
      }
    }
    childId = baseId;
    outermost = baseId;
  }

  outerMostId.set(focused.id, outermost);
  return outermost;
}

/**
 * Re-evaluate suppressed expansion edges against the current recursion path.
 *
 * The `outerMostId` cache makes wrapper-id resolution context-independent,
 * but expansion edges are context-dependent (they depend on whether the
 * target is an ancestor in the recursion path at the moment of suppression).
 * When a target is later reached through a path where the formerly-cycling
 * peer is now a *completed sibling* (in `out`, not in `path`), the
 * suppressed edge can — and must — be promoted to a real containment edge.
 *
 * Iterates to fixed point because promoting one edge may bring a new owner
 * into a state where its own previously-suppressed children become reachable.
 *
 * Spec §3.2: containment is the uniform mechanism for both inheritance and
 * type-reference; completed-sibling cross-references are first-class.
 */
function replaySuppressedEdges(
  doc: AdapterDocument,
  opts: BuildOptions,
  out: Map<string, StructureNode>,
  path: ReadonlySet<string>,
  outerMostId: Map<string, string>,
  suppressedEdges: SuppressedEdge[]
): void {
  // Fixed-point: promotion may materialize a target whose own subtree
  // previously suppressed edges that are now reachable. We bound iteration
  // by the length of the suppressed list, which strictly decreases on every
  // successful promotion.
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = suppressedEdges.length - 1; i >= 0; i--) {
      const entry = suppressedEdges[i];
      // Sanity guard — owner must exist in `out`. If it doesn't, leave the
      // entry alone so the eventual materialization can attach to it.
      const owner = out.get(entry.ownerNodeId);
      if (!owner) continue;
      // Still cyclic in the current path? Leave it for a future replay.
      if (path.has(entry.targetId)) continue;

      let expandedId: string;
      if (entry.targetKind === 'Data') {
        const targetNode = doc.nodes.find((n) => n.id === entry.targetId);
        if (!targetNode) continue;
        // Reuse the same materialization path that the original (suppressed)
        // call would have taken. If the target is already in `out`, the
        // `outerMostId` cache produces the outermost id; otherwise the chain
        // is built fresh and any nested cycles are handled recursively.
        expandedId = materializeDataWithInheritance(targetNode, doc, opts, out, path, outerMostId, suppressedEdges);
      } else {
        expandedId = entry.targetId;
        if (!out.has(entry.targetId)) {
          const choiceNode = doc.nodes.find((n) => n.id === entry.targetId);
          if (!choiceNode) continue;
          out.set(entry.targetId, buildChoiceNode(choiceNode, doc));
        }
      }

      // Mutate the owner's expansions map in place. The `ReadonlyMap` view in
      // the public type is a TypeScript-only constraint — the underlying Map
      // is mutable and shared with this builder. Both `StructureDataNode` and
      // `StructureBaseContainer` carry `expansions`, and both kinds can be
      // owners (data-row suppression vs. inherited-row suppression).
      const expansionsMap = (owner as StructureDataNode | StructureBaseContainer).expansions as Map<string, string>;
      expansionsMap.set(entry.attrName, expandedId);
      suppressedEdges.splice(i, 1);
      changed = true;
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
    // Spec §3.2: Multi-level inheritance nests yellow inside yellow
    // recursively. Both the focused root AND expansion targets must wrap
    // in their full inheritance chain — the shared
    // `materializeDataWithInheritance` helper enforces this symmetry.
    const outerMostId = new Map<string, string>();
    // Edges suppressed by the ancestor-cycle guard during recursion are held
    // here and replayed after the walk so context-dependent suppressions
    // don't outlive the cycle that caused them. See `SuppressedEdge` and
    // `replaySuppressedEdges` for the full rationale.
    const suppressedEdges: SuppressedEdge[] = [];
    const rootId = materializeDataWithInheritance(
      root,
      doc,
      opts,
      nodes,
      new Set<string>(),
      outerMostId,
      suppressedEdges
    );
    // NOTE: no empty-path final replay. Suppressions are promoted only when
    // a target is *actually reached* through a non-cyclic path during the
    // walk (cache-hit replay inside `walkAndExpand` /
    // `materializeDataWithInheritance`). Promoting them at empty path here
    // would un-suppress pure cycles (Tree.parent → Tree, A → B → A with no
    // alternate route) which the spec mandates stay suppressed — those
    // edges have NO non-cyclic path and must remain dropped.
    return { rootNodeId: rootId, nodes };
  }
  // Choice as root handled in later tasks.

  return { rootNodeId: root.id, nodes };
}
