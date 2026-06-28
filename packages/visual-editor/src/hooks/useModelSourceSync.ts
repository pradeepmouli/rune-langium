// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * useModelSourceSync — fire `onModelChanged` (serialized source per namespace)
 * whenever the editor-store's node/edge DATA changes, independent of which
 * visual pane (Graph, Structure, or none) is mounted.
 *
 * @remarks
 * Previously this subscription lived inside `RuneTypeGraph`. Because
 * `CenterStackPanel` conditionally mounts only the active pane, the Graph
 * pane was unmounted while the user worked in the Structure pane, so the
 * subscription never fired and the source text fell out of sync with store
 * edits. Lifting the hook here and mounting it unconditionally in `EditorPage`
 * fixes the dead-pane regression (2026-05-21, fix/inspector-source-sync).
 *
 * Semantics (preserved verbatim from RuneTypeGraph):
 *   - Skips the very first emission after mount (initial-skip) — source pane
 *     already has authoritative parsed text at load time.
 *   - Short-circuits on position-only changes via a cheap content fingerprint
 *     that excludes `position`, `errors`, and `hasExternalRefs`.
 *   - Skips when serialized output is byte-for-byte equal to the previous
 *     emission (no-op store re-renders).
 *   - Fire-and-forget: does not await the handler's return value.
 */

import { useEffect, useRef } from 'react';
import type { Patches } from 'mutative';
import type { TypeGraphNode, TypeGraphEdge } from '../types.js';
import { astRelevantProjection, nameFromNodeId } from '../store/node-projection.js';
import { serializeNamespaceToSource } from '../serialize/cst-reuse-serializer.js';
import { buildDirtyIndex } from '../serialize/dirty-paths.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Cheap content fingerprint — ignores `position`, `errors`, and
 * `hasExternalRefs` so position-only mutations (drag, layout, fit-view) don't
 * trigger the serialization pipeline.
 *
 * Extracted from RuneTypeGraph's former source-sync effect and made the sole owner here.
 */
function computeContentFingerprint(nodes: TypeGraphNode[], edges: TypeGraphEdge[]): string {
  const nodeParts: string[] = [];
  // Sort by id so reordering (e.g. drag-reorder) doesn't churn the
  // fingerprint — graph-content equivalence is what we care about.
  const sortedNodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  for (const n of sortedNodes) {
    // Project to the AST-relevant subset: skip GraphMetadata that
    // changes on view-only operations (position, errors, hasExternalRefs).
    //
    // NOTE (Deliverable B — Phase 3D-2): `toDomain(n.data)` is intentionally
    // NOT used here. `toDomain` produces a different key-set than
    // `astRelevantProjection`: it adds the `extends`/`members` normalisation
    // keys and drops GraphMetadata fields (`namespace`, `comments`, …).
    // Switching to
    // `toDomain` here would silently re-fingerprint every model node on
    // first load and trigger a spurious `onModelChanged` emission (source
    // churn). `astRelevantProjection` is the STABLE content-fingerprint
    // contract — its key-set must not change.
    const projection = astRelevantProjection(n.data);
    try {
      nodeParts.push(`${n.id}:${JSON.stringify(projection)}`);
    } catch {
      // Cyclic structures (shouldn't happen post-strip but be safe).
      nodeParts.push(`${n.id}:?`);
    }
  }
  const edgeParts: string[] = [];
  const sortedEdges = [...edges].sort((a, b) => a.id.localeCompare(b.id));
  for (const e of sortedEdges) {
    edgeParts.push(`${e.id}:${e.data?.kind ?? ''}`);
  }
  return `n=${nodeParts.join('|')}#e=${edgeParts.join('|')}`;
}

// ---------------------------------------------------------------------------
// Pure helper — exported so it can be unit-tested without React
// ---------------------------------------------------------------------------

export interface BuildSourceArgs {
  nodes: TypeGraphNode[];
  edges: TypeGraphEdge[];
  originalSourceByNamespace: Map<string, string>;
  patches: Patches;
}

/** Pure: produce Map<namespace, full .rosetta source> via CST-reuse. */
export function buildSourceForNamespaces(args: BuildSourceArgs): Map<string, string> {
  const { nodes, edges, originalSourceByNamespace, patches } = args;
  const dirty = buildDirtyIndex(patches);

  // Inheritance is carried on EDGES (extends / enum-extends), not on the
  // node's data subtree, so an inheritance change does NOT produce a `nodes`
  // patch. Reflect the edge-derived parent onto a shallow clone of node.data
  // and force-regenerate any node whose effective parent differs from the
  // original (dehydrated) value. Mirrors model-to-ast.ts:buildInheritanceMap.
  const inheritanceTarget = new Map<string, string>(); // sourceNodeId -> targetNodeId
  for (const e of edges) {
    if (e.data?.kind === 'extends' || e.data?.kind === 'enum-extends') {
      inheritanceTarget.set(e.source, e.target);
    }
  }
  const forceDirtyNodeIds = new Set<string>();
  const effectiveNodes = nodes.map((n) => {
    const targetId = inheritanceTarget.get(n.id);
    const d = n.data as { $type?: string; superType?: { $refText?: string }; parent?: { $refText?: string } };
    const refKey = d.$type === 'RosettaEnumeration' ? 'parent' : 'superType';
    const original = (d as Record<string, { $refText?: string } | undefined>)[refKey]?.$refText;
    const effective = targetId === undefined ? undefined : nameFromNodeId(targetId);
    // Prefer the existing qualified $refText when the edge agrees; only override
    // when the edge introduces/changes/removes inheritance.
    if (effective !== undefined && original === undefined) {
      forceDirtyNodeIds.add(n.id);
      return cloneWithRef(n, refKey, effective);
    }
    if (effective === undefined && original !== undefined) {
      forceDirtyNodeIds.add(n.id);
      return cloneWithRef(n, refKey, undefined);
    }
    return n; // unchanged inheritance (or both absent) — reuse as-is
  });

  const byNs = new Map<string, TypeGraphNode[]>();
  for (const n of effectiveNodes) {
    if (n.meta.deferred) continue; // curated placeholders are never source
    const ns = n.meta.namespace;
    (byNs.get(ns) ?? byNs.set(ns, []).get(ns)!).push(n);
  }
  const out = new Map<string, string>();
  for (const [ns, nsNodes] of byNs) {
    const originalSource = originalSourceByNamespace.get(ns);
    if (originalSource === undefined) continue; // no baseline to reuse — skip (degraded)
    out.set(ns, serializeNamespaceToSource({ nodes: nsNodes, originalSource, dirty, forceDirtyNodeIds }));
  }
  return out;
}

// Shallow-clone a node, replacing the inheritance ref field. $cstRange survives
// the shallow clone (it is a sibling field on data).
function cloneWithRef(n: TypeGraphNode, refKey: string, refText: string | undefined): TypeGraphNode {
  const data = { ...(n.data as Record<string, unknown>) };
  data[refKey] = refText === undefined ? undefined : { $refText: refText };
  return { ...n, data } as TypeGraphNode;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fires `onModelChanged` (serialized source keyed by namespace name) whenever
 * `nodes` or `edges` change in content — independent of which visual pane is
 * currently mounted.
 *
 * @param nodes - Current nodes from the editor store.
 * @param edges - Current edges from the editor store.
 * @param onModelChanged - Callback invoked with a `Map<namespace, serializedText>`
 *   on each content change after the initial mount.
 */
export function useModelSourceSync(
  nodes: TypeGraphNode[],
  edges: TypeGraphEdge[],
  onModelChanged?: (serialized: Map<string, string>) => void | Promise<void>,
  /**
   * The editor store's `parseEpoch` — bumped ONLY when the graph is (re)built
   * from a parse result. Used to gate serialization: a `nodes`/`edges` change
   * that arrives together with a `parseEpoch` bump came FROM the source (a
   * parse), so serializing it back is pointless and — for a degraded reparse
   * (worker unavailable) — actively corrupts the file. We serialize ONLY when
   * the change is USER-EDIT-origin (parseEpoch unchanged since the last run).
   * Optional/defaulted so non-studio callers (tests, standalone) keep the old
   * "serialize every content change" behavior.
   */
  parseEpoch = 0,
  /**
   * The store's accumulated Mutative patches since the last parse. Drives the
   * CST-reuse dirty set: only nodes/subtrees touched by a patch are
   * regenerated; everything else is sliced verbatim from originalSourceByNamespace.
   */
  patches: Patches = [],
  /**
   * Original source text keyed by namespace name — used as the CST baseline for
   * the reuse serializer. Built by the caller from the current workspace files.
   * Defaults to an empty map so legacy/test callers that don't supply it get an
   * empty output (no write-back).
   */
  originalSourceByNamespace: Map<string, string> = new Map()
): void {
  // Keep a stable ref so the effect doesn't need to re-register when the
  // callback identity changes (e.g. inline arrow in EditorPage).
  const onModelChangedRef = useRef(onModelChanged);
  useEffect(() => {
    onModelChangedRef.current = onModelChanged;
  }, [onModelChanged]);

  const lastSerializedRef = useRef<Map<string, string> | null>(null);
  const hasFiredInitialSerializeRef = useRef(false);
  const lastContentFingerprintRef = useRef<string | null>(null);
  const lastParseEpochRef = useRef(parseEpoch);

  useEffect(() => {
    const handler = onModelChangedRef.current;
    if (!handler) return;
    if (nodes.length === 0) return;

    // Did this render's nodes/edges change arrive together with a parse? If so
    // the graph was rebuilt FROM source — it must NOT be serialized back.
    const parseAdvanced = parseEpoch !== lastParseEpochRef.current;
    lastParseEpochRef.current = parseEpoch;

    const fingerprint = computeContentFingerprint(nodes, edges);
    if (lastContentFingerprintRef.current === fingerprint) return;
    lastContentFingerprintRef.current = fingerprint;

    // PARSE-ORIGIN GATE (source-corruption fix): a content change that came
    // with a parseEpoch bump is the graph being (re)derived from the source —
    // re-serializing it is a no-op at best and, when the parse is degraded
    // (worker unavailable), splices truncated text over the real file. Adopt
    // the parse as the new serialize baseline and bail without emitting. Only
    // genuine USER edits (parseEpoch unchanged) fall through to serialize.
    if (parseAdvanced) {
      // At parse time pendingEditPatches has just been cleared, so patches is
      // empty → every node is subtree-clean → each namespace's text is sliced
      // verbatim from originalSourceByNamespace (the authoritative parsed source).
      // Using the same serializer as the user-edit path keeps the
      // lastSerializedRef baseline byte-equal to what the edit path will produce,
      // so the byte-equality de-dup fires correctly on the first user edit.
      lastSerializedRef.current = buildSourceForNamespaces({ nodes, edges, originalSourceByNamespace, patches });
      hasFiredInitialSerializeRef.current = true;
      return;
    }

    const next = buildSourceForNamespaces({ nodes, edges, originalSourceByNamespace, patches });

    // Skip the very first emission after mount — at load time the source
    // pane already has the authoritative parsed text, and re-emitting would
    // mark every file dirty for no user-visible reason.
    if (!hasFiredInitialSerializeRef.current) {
      hasFiredInitialSerializeRef.current = true;
      lastSerializedRef.current = next;
      return;
    }

    const prev = lastSerializedRef.current;
    if (prev && prev.size === next.size) {
      let changed = false;
      for (const [k, v] of next) {
        if (prev.get(k) !== v) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
    }

    lastSerializedRef.current = next;
    // Fire-and-forget — the handler may return a Promise (e.g. studio's
    // async smart-merge), but the source-sync effect intentionally does
    // not await it.
    void handler(next);
  }, [nodes, edges, parseEpoch, patches, originalSourceByNamespace]);
}
