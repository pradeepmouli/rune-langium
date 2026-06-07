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
import type { TypeGraphNode, TypeGraphEdge } from '../types.js';
import { modelsToAst } from '../adapters/model-to-ast.js';
import { astRelevantProjection } from '../store/node-projection.js';
import { serializeModel } from '@rune-langium/core';

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
  parseEpoch = 0
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
      const baseline = new Map<string, string>();
      for (const model of modelsToAst(nodes, edges)) {
        try {
          baseline.set(model.name, serializeModel(model));
        } catch {
          baseline.set(model.name, `// Error serializing ${model.name}`);
        }
      }
      hasFiredInitialSerializeRef.current = true;
      lastSerializedRef.current = baseline;
      return;
    }

    const outputModels = modelsToAst(nodes, edges);
    const next = new Map<string, string>();
    for (const model of outputModels) {
      try {
        next.set(model.name, serializeModel(model));
      } catch {
        next.set(model.name, `// Error serializing ${model.name}`);
      }
    }

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
  }, [nodes, edges, parseEpoch]);
}
