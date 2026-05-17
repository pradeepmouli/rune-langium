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
 * Empty/undefined `instancePath` produces the legacy key form, which preserves
 * old persisted maps and behaves as "root-level / shared" for the root node.
 *
 * **Back-compat fallback.** When `instancePath` is non-empty, we ALSO check
 * the legacy key (no instancePath). If either matches, expand. This lets old
 * persisted expansion maps (which only have legacy keys) keep working AT ALL
 * NESTING LEVELS after upgrade — without it, only root-row expansions would
 * survive an upgrade, and deeply-nested user-expanded rows would silently
 * collapse on the next session. Once the user toggles any chevron, the
 * per-instance key gets written via the renderer's onToggleExpansion path,
 * so over time the map naturally migrates to per-instance entries.
 *
 * The fallback is intentionally lossy in the per-instance direction: legacy
 * keys expand ALL instances of a row. This matches the old shared semantics
 * exactly, which is what we want for upgrade continuity.
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
  const perInstanceKey = expansionKey({
    namespaceUri: ownerNamespace,
    typeId: ownerTypeName,
    attrName: row.attrName,
    instancePath
  });
  if (expansionMap.get(perInstanceKey) === true) return true;
  // Back-compat fallback: also check the legacy key (no instancePath). For
  // root-row chevrons (instancePath = []), this is a no-op because the
  // per-instance and legacy keys serialize to the same string.
  if (instancePath.length > 0) {
    const legacyKey = expansionKey({
      namespaceUri: ownerNamespace,
      typeId: ownerTypeName,
      attrName: row.attrName
    });
    if (expansionMap.get(legacyKey) === true) return true;
  }
  return false;
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

function buildChoiceNode(node: AdapterNode, doc: AdapterDocument): StructureChoiceNode {
  const arms = (node.choiceOptions ?? []).map((opt) => buildChoiceArm(opt, doc, node.namespace));
  return {
    id: node.id,
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
 */
function adapterChildInstanceId(parentInstanceId: string, attrName: string, targetCanonicalId: string): string {
  return `${parentInstanceId}::${attrName}::${targetCanonicalId}`;
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
function computeOutermostCanonicalId(focused: AdapterNode, doc: AdapterDocument): string {
  if (!focused.extends) return focused.id;
  const visited = new Set<string>([focused.id]);
  let outermost = focused.id;
  let cursor: AdapterNode | undefined = findNodeByName(focused.extends, doc, focused.namespace);
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    outermost = `${focused.id}::__base::${cursor.id}`;
    cursor = cursor.extends ? findNodeByName(cursor.extends, doc, cursor.namespace) : undefined;
  }
  return outermost;
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
  suppressedEdges: SuppressedEdge[],
  // Phase 14d: per-instance expansion. `currentInstanceId` is the React Flow
  // instance id that layout will assign to this node's placement (root: the
  // canonical id; nested: makeInstanceId result from the parent's perspective).
  // `instancePath` is the chain of ancestor instance ids leading to this node
  // (NOT including this node itself) and is what `shouldExpand` uses to scope
  // the expansion key for THIS node's rows. The chevron-renderer in DataNode
  // sees the same `instancePath` via `data.instancePath` (injected by layout),
  // so the keys match round-trip through the persistence layer.
  //
  // Note: the adapter still dedupes by canonical id. Two separate visible
  // instances of the same type therefore share one `expansions` map — for the
  // direct buyer.Party vs seller.Party case (both reached from Trade with the
  // same canonical-id path `[Trade]`), the expansion set is the union. Full
  // per-instance materialization (one StructureNode per instance) is a larger
  // refactor and deferred to a future phase.
  currentInstanceId: string,
  instancePath: ReadonlyArray<string>
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
  // Children see this node's instance id appended to their instance path.
  const childInstancePath: ReadonlyArray<string> = [...instancePath, currentInstanceId];

  for (const row of rows) {
    // Phase 14d (fix): expansion key must include self's rfId so the adapter
    // key matches the chevron's rowKey (which now appends `id` to instancePath).
    // `childInstancePath` = [...instancePath, currentInstanceId]; use that here
    // so owner-rows keys align with the renderer — the renderer appends `id`
    // (this node's rfId) to `data.instancePath` when building rowKey.
    if (shouldExpand(row, node.namespace, node.name, opts.expansionMap, childInstancePath) && row.targetNodeId) {
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
        //
        // Phase 14d: the layout uses the OUTERMOST canonical id (target's
        // wrapper chain's outer) as the child's rfId — so we pass that into
        // materialize, computed via the shared `computeOutermostCanonicalId`
        // helper. Adapter rfId matches what the layout will use.
        const targetOutermostCanonical = computeOutermostCanonicalId(target, doc);
        const expandedId = materializeDataWithInheritance(
          target,
          doc,
          opts,
          out,
          nextPath,
          outerMostId,
          suppressedEdges,
          adapterChildInstanceId(currentInstanceId, row.attrName, targetOutermostCanonical),
          childInstancePath
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
  suppressedEdges: SuppressedEdge[],
  /**
   * React Flow instance id that layout will assign to the OUTERMOST wrapper
   * of this Data type (i.e., the outermost base container, or `focused.id`
   * if there is no inheritance chain). This is what shows up as the rfId of
   * the placed node and is the basis for child instance ids underneath.
   *
   * For the root focused type, this equals `focused.id` (no parent prefix).
   * For an expanded child, it's the makeInstanceId result computed by the
   * caller in `walkAndExpand`.
   *
   * Phase 14d: per-instance expansion. Threading instance ids and paths
   * through here so `walkAndExpand` (called for the focused node and each
   * base level) can scope row chevron keys per-instance.
   */
  outermostInstanceId: string,
  /**
   * Instance path that `walkAndExpand` should use for the FOCUSED node's rows
   * (ancestors of the focused node — NOT including the outermost wrapper).
   * For the root focused type, this is `[]`. For an expanded child, it's the
   * caller's child-instance-path (`[...parentPath, parentInstanceId]`).
   *
   * Note: when `focused` has inheritance, the outermost wrapper is a base
   * container — that container's own rows (`baseRows`) sit at the wrapper's
   * own level, so their owner's instance path = `instancePath` and their
   * owner's instance id = `outermostInstanceId`. The focused (innermost)
   * Data node's rows sit one level deeper, with instance path extended by
   * each intervening base container's instance id.
   */
  instancePath: ReadonlyArray<string>
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

  // Pre-seed the cache with a sentinel BEFORE walking the inheritance chain
  // or recursing into the target's rows. If an inherited base-container row
  // (e.g. `Base.child: Derived` where `Derived extends Base`) loops back at
  // the focused type, the re-entry would otherwise recurse forever because
  // the real cache entry is only written after the chain walk completes.
  // The tentative value is `focused.id` — the value that would be returned
  // if the chain turned out to be empty — and is overwritten with the real
  // outermost id at end-of-materialize. On re-entry, the helper sees the
  // sentinel and returns it as a cache hit, which is the correct cycle-
  // collapsing behavior (Phase 3 cannot resolve a parent-cycle anyway, and
  // the cache-replay logic will promote any non-cyclic alternate path
  // discovered later). This is the Codex P2 cache-seeding defect: the
  // ancestor `path` set alone is insufficient because base-container row
  // walks build `baseRowPath` from `path + base ids`, omitting `focused.id`.
  outerMostId.set(focused.id, focused.id);

  // Collect ancestors from nearest base outward, with cycle protection.
  // A type cannot extend itself in well-formed input, but defensive code
  // must not infinite-loop on malformed chains. The `visited` set is local
  // to this call (not threaded through) because a Data type's inheritance
  // chain is intrinsic — it doesn't depend on the expansion context.
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
  // The outermost base wraps everything; the innermost base's `childNodeId`
  // is the focused Data node. For no-inheritance, ancestors is empty and we
  // skip directly to the focused walk below.
  //
  // `ancestors` is built INNERMOST → OUTERMOST during the chain walk, so
  // reversing gives OUTERMOST → INNERMOST — the order the layout places them
  // (outermost = root rfId, each inner is a `__derived` child of the next outer).
  const outerToInner = [...ancestors].reverse();
  const baseCanonicalIds = outerToInner.map((baseNode) => `${focused.id}::__base::${baseNode.id}`);

  // Phase 14d: compute the rfId AND instancePath that each base container will
  // have at placement time, plus the focused Data node's. The outermost
  // container has rfId = `outermostInstanceId` (passed in) and instancePath =
  // `instancePath` (passed in). Each inner is reached via the layout's
  // `__derived` slot from the previous outer, so its rfId =
  // `${outerRfId}::__derived::${innerCanonical}` and its instancePath =
  // `[...outerPath, outerRfId]`.
  //
  // The focused Data node sits inside the innermost base container (or is the
  // root itself when ancestors.length === 0) with the same `__derived` link.
  const baseRfIds: string[] = [];
  const basePaths: Array<ReadonlyArray<string>> = [];
  let prevRfId = outermostInstanceId;
  let prevPath: ReadonlyArray<string> = instancePath;
  for (let i = 0; i < baseCanonicalIds.length; i++) {
    if (i === 0) {
      baseRfIds.push(outermostInstanceId);
      basePaths.push(instancePath);
    } else {
      const myRfId = `${prevRfId}::__derived::${baseCanonicalIds[i]}`;
      const myPath = [...prevPath, prevRfId];
      baseRfIds.push(myRfId);
      basePaths.push(myPath);
    }
    prevRfId = baseRfIds[i];
    prevPath = basePaths[i];
  }
  // Focused node sits one __derived deeper than the innermost base (or is the
  // root itself when no inheritance).
  const focusedRfId = ancestors.length === 0 ? outermostInstanceId : `${prevRfId}::__derived::${focused.id}`;
  const focusedPath: ReadonlyArray<string> = ancestors.length === 0 ? instancePath : [...prevPath, prevRfId];

  // Materialize the focused Data node first. Its own type-reference
  // expansions still need to walk through `walkAndExpand`. This must happen
  // before the inheritance chain is built so the innermost base container's
  // `childNodeId` can reference the now-present Data node.
  walkAndExpand(focused, doc, opts, out, path, outerMostId, suppressedEdges, focusedRfId, focusedPath);

  // No inheritance chain → no base container wrapping. The focused Data node
  // is itself the outermost wrapper. (`focused.extends` can be set yet
  // unresolvable; in that case ancestors is empty.)
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
  for (let ai = 0; ai < ancestors.length; ai++) {
    const baseNode = ancestors[ai];
    const baseId = `${focused.id}::__base::${baseNode.id}`;
    const baseRows = (baseNode.attributes ?? []).map((a) => buildRow(a, doc, baseNode.namespace, true));

    // Look up the rfId+path computed for this base container above. The
    // ancestors loop walks INNERMOST → OUTERMOST, but baseRfIds/basePaths are
    // indexed OUTERMOST → INNERMOST (the layout's placement order). Index
    // conversion: innermost has ancestors index 0, outerToInner index
    // ancestors.length - 1 — so outerToInner index = ancestors.length-1-ai.
    const oi = ancestors.length - 1 - ai;
    const baseRfId = baseRfIds[oi];
    const baseRowInstancePath = basePaths[oi];

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
    //
    // Crucially, include `focused.id` too: when an inherited row points back
    // at the focused (descendant) type (`Base.child: Derived` where Derived
    // extends Base), the SuppressedEdge mechanism must treat Derived as on
    // the recursion path. Without this, the cycle-suppression check would
    // miss the loop and the cache sentinel set above would only prevent
    // runaway recursion — the edge would still be (wrongly) promoted as a
    // containment edge, producing a parent-cycle Phase 3 can't lay out.
    // Belt-and-braces with the cache sentinel: the sentinel stops runaway
    // recursion; this keeps suppression semantics consistent with how
    // ancestors are handled elsewhere.
    const baseRowPath = new Set(path);
    baseRowPath.add(focused.id);
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

    // Children of this base container's expanded rows have instancePath =
    // `[...baseRowInstancePath, baseRfId]`. Used when recursing into expansion
    // targets via materializeDataWithInheritance.
    const childExpansionInstancePath: ReadonlyArray<string> = [...baseRowInstancePath, baseRfId];

    for (const row of baseRows) {
      // Phase 14d (fix): use childExpansionInstancePath (= [...baseRowInstancePath, baseRfId])
      // so this key matches the GroupContainerNode chevron's rowKey (which also appends `id`
      // to `data.instancePath`). `baseRowInstancePath` is the ancestors of this base container;
      // `baseRfId` is the container's own rfId — together they mirror the renderer's self-inclusive key.
      if (!shouldExpand(row, baseNode.namespace, baseNode.name, opts.expansionMap, childExpansionInstancePath))
        continue;
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
        const targetOutermostCanonical = computeOutermostCanonicalId(target, doc);
        const expandedId = materializeDataWithInheritance(
          target,
          doc,
          opts,
          out,
          baseRowPath,
          outerMostId,
          suppressedEdges,
          adapterChildInstanceId(baseRfId, row.attrName, targetOutermostCanonical),
          childExpansionInstancePath
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
        //
        // Phase 14d: replay paths use the target's CANONICAL id as the
        // outermost instance id and an empty instance path. This matches the
        // back-compat default and avoids reconstructing the original
        // suppression context (which would require capturing it at
        // suppression time). The replay only promotes the EDGE, so the
        // expansion key would already have fired correctly during the
        // original walkAndExpand pass — this is a side-table catch-up only.
        expandedId = materializeDataWithInheritance(
          targetNode,
          doc,
          opts,
          out,
          path,
          outerMostId,
          suppressedEdges,
          entry.targetId,
          []
        );
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
    // Phase 14d: pre-compute the outermost canonical id from the inheritance
    // chain so the adapter passes the SAME id to materialize that the layout
    // will use as the root rfId. The layout calls `placeNode(rootId, rootId)`
    // for the root — i.e. rfId === canonical id — so adapter and renderer
    // chevron keys agree.
    const outermostCanonicalId = computeOutermostCanonicalId(root, doc);
    const rootId = materializeDataWithInheritance(
      root,
      doc,
      opts,
      nodes,
      new Set<string>(),
      outerMostId,
      suppressedEdges,
      outermostCanonicalId,
      []
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
