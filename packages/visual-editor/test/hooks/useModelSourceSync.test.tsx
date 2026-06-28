// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Unit tests for useModelSourceSync hook.
 *
 * Core regression: inspector/structure-view edits propagated to the editor-store
 * but never reached the source pane when the Graph pane was not mounted.
 * The source-sync subscription lived inside RuneTypeGraph, which is only mounted
 * when the Graph pane is active. Lifting the subscription into this hook and
 * mounting it unconditionally in EditorPage fixes the dead-pane regression.
 *
 * These tests exercise the hook DIRECTLY via renderHook — no RuneTypeGraph is
 * mounted, proving the sync fires regardless of which visual pane is active.
 *
 * Semantics pinned:
 *   1. Does NOT call onModelChanged on the initial render (skip-initial).
 *   2. Calls onModelChanged when node DATA changes (content edit).
 *   3. Does NOT call onModelChanged on position-only changes (fingerprint guards it).
 *   4. Emitted value is a non-empty Map<string, string> of serialized source text.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Patches } from 'mutative';
import { parse } from '@rune-langium/core';
import { useModelSourceSync } from '../../src/hooks/useModelSourceSync.js';
import { useEditorStore } from '../../src/store/editor-store.js';
import { COMBINED_MODEL_SOURCE } from '../helpers/fixture-loader.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadCombinedModel() {
  const result = await parse(COMBINED_MODEL_SOURCE);
  act(() => {
    // Reset in-flight edit patches before loading: the singleton store persists
    // across tests, and a prior test's edit would otherwise be replayed onto this
    // fresh parse (one-shot reconcile), polluting the baseline graph.
    useEditorStore.setState({ pendingEditPatches: [] });
    useEditorStore.getState().selectNode(null);
    useEditorStore.getState().loadModels(result.value);
    useEditorStore.getState().expandAllNamespaces();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useModelSourceSync', () => {
  beforeEach(async () => {
    await loadCombinedModel();
  });

  it('does NOT call onModelChanged on the initial render (skip-initial)', async () => {
    const onModelChanged = vi.fn();
    const nodes = useEditorStore.getState().nodes;
    const edges = useEditorStore.getState().edges;

    renderHook(() => useModelSourceSync(nodes, edges, onModelChanged));

    // Give effects a full microtask + macrotask cycle to run.
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(onModelChanged).not.toHaveBeenCalled();
  });

  it('calls onModelChanged with a non-empty Map when a node attribute changes', async () => {
    const onModelChanged = vi.fn();
    // Supply the original source so the CST-reuse serializer has a baseline
    // to slice clean subtrees from and regenerate the dirty attribute.
    const srcMap = new Map([['test.combined', COMBINED_MODEL_SOURCE]]);

    const { rerender } = renderHook(
      ({
        nodes,
        edges,
        patches
      }: {
        nodes: ReturnType<typeof useEditorStore.getState>['nodes'];
        edges: ReturnType<typeof useEditorStore.getState>['edges'];
        patches: Patches;
      }) => useModelSourceSync(nodes, edges, onModelChanged, 0, patches, srcMap),
      {
        initialProps: {
          nodes: useEditorStore.getState().nodes,
          edges: useEditorStore.getState().edges,
          patches: [] as Patches
        }
      }
    );

    // Allow initial-skip to settle.
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    onModelChanged.mockClear();

    // Mutate the store (same path taken by inspector/structure edits).
    const tradeNode = useEditorStore.getState().nodes.find((n) => n.data.name === 'Trade')!;
    const productNode = useEditorStore.getState().nodes.find((n) => n.data.name === 'Product')!;

    act(() => {
      useEditorStore.getState().updateAttributeType(tradeNode.id, 'currency', productNode.data.name, productNode.id);
    });

    // Re-render the hook with the new nodes/edges + accumulated patches from the store.
    const newNodes = useEditorStore.getState().nodes;
    const newEdges = useEditorStore.getState().edges;
    const newPatches = useEditorStore.getState().pendingEditPatches;
    rerender({ nodes: newNodes, edges: newEdges, patches: newPatches });

    await waitFor(() => {
      expect(onModelChanged).toHaveBeenCalled();
    });

    const lastCall = onModelChanged.mock.calls.at(-1)!;
    const serialized = lastCall[0] as Map<string, string>;

    // Must be a non-empty Map.
    expect(serialized).toBeInstanceOf(Map);
    expect(serialized.size).toBeGreaterThan(0);

    // The CST-reuse serializer regenerates the dirty Trade node and preserves
    // all other content. The updated attribute type must appear in the output.
    const text = serialized.get('test.combined')!;
    expect(text).toBeDefined();
    expect(text).toMatch(/currency Product\b/);
    expect(text).not.toMatch(/currency CurrencyEnum\b/);
  });

  it('slices the FROZEN parse-baseline across two edits before a reparse (offset-drift guard)', async () => {
    // Finding A: `$cstRange` offsets index the source the parser CONSUMED, and are
    // only re-stamped on a reparse (parseEpoch bump). The caller builds
    // originalSourceByNamespace from LIVE file content, which diverges from those
    // offsets the moment the FIRST write-back mutates the file. A SECOND edit made
    // before a reparse then slices the already-mutated content with STALE offsets,
    // corrupting clean siblings. The hook must freeze the baseline at parse time
    // and ignore live content until parseEpoch advances.
    const onModelChanged = vi.fn();
    const baseline = COMBINED_MODEL_SOURCE;

    const baselineNodes = useEditorStore.getState().nodes;
    const tradeNode = baselineNodes.find((n) => n.data.name === 'Trade')!;
    const productNode = baselineNodes.find((n) => n.data.name === 'Product')!;
    const tradeId = tradeNode.id;
    const productId = productNode.id;

    // parseEpoch is held CONSTANT (no reparse) across both edits.
    const EPOCH = 5;
    const { rerender } = renderHook(
      ({
        nodes,
        patches,
        srcMap
      }: {
        nodes: ReturnType<typeof useEditorStore.getState>['nodes'];
        patches: Patches;
        srcMap: Map<string, string>;
      }) => useModelSourceSync(nodes, [], onModelChanged, EPOCH, patches, srcMap),
      {
        initialProps: {
          nodes: baselineNodes,
          patches: [] as Patches,
          srcMap: new Map([['test.combined', baseline]])
        }
      }
    );

    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    onModelChanged.mockClear();

    // --- Edit #1: Trade.currency CurrencyEnum -> Product (a length-changing edit
    // that shifts every offset after the Trade block). ---
    act(() => {
      useEditorStore.getState().updateAttributeType(tradeId, 'currency', 'Product', productId);
    });
    rerender({
      nodes: useEditorStore.getState().nodes,
      patches: useEditorStore.getState().pendingEditPatches,
      srcMap: new Map([['test.combined', baseline]])
    });
    await waitFor(() => expect(onModelChanged).toHaveBeenCalled());
    const out1 = (onModelChanged.mock.calls.at(-1)![0] as Map<string, string>).get('test.combined')!;
    expect(out1).toContain('currency Product (1..1)');

    // Simulate the write-back: live file content is now `out1`. A BUGGY caller
    // would feed THIS (already-mutated, offsets stale) into the next serialize.
    const liveAfterWriteback = new Map([['test.combined', out1]]);
    onModelChanged.mockClear();

    // --- Edit #2 BEFORE any reparse (parseEpoch still EPOCH): Product.productName
    // string -> Trade. Patches accumulate; both Trade and Product are now dirty. ---
    act(() => {
      useEditorStore.getState().updateAttributeType(productId, 'productName', 'Trade', tradeId);
    });
    rerender({
      nodes: useEditorStore.getState().nodes,
      patches: useEditorStore.getState().pendingEditPatches,
      srcMap: liveAfterWriteback // the live, mutated content — must be IGNORED
    });
    await waitFor(() => expect(onModelChanged).toHaveBeenCalled());
    const out2 = (onModelChanged.mock.calls.at(-1)![0] as Map<string, string>).get('test.combined')!;

    // Correct result = baseline with BOTH edits applied; clean siblings (the
    // PaymentType choice and CurrencyEnum enum) byte-for-byte intact. Slicing the
    // mutated `out1` with stale offsets would corrupt those clean blocks.
    const expected = baseline
      .replace('currency CurrencyEnum (1..1)', 'currency Product (1..1)')
      .replace('productName string (1..1)', 'productName Trade (1..1)');
    expect(out2).toBe(expected);
  });

  it('does NOT call onModelChanged when only node position changes', async () => {
    const onModelChanged = vi.fn();

    const { rerender } = renderHook(
      ({
        nodes,
        edges
      }: {
        nodes: ReturnType<typeof useEditorStore.getState>['nodes'];
        edges: ReturnType<typeof useEditorStore.getState>['edges'];
      }) => useModelSourceSync(nodes, edges, onModelChanged),
      {
        initialProps: {
          nodes: useEditorStore.getState().nodes,
          edges: useEditorStore.getState().edges
        }
      }
    );

    // Allow initial-skip to settle.
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    onModelChanged.mockClear();

    // Apply a position-only change — same store action ReactFlow uses on drag.
    const tradeNode = useEditorStore.getState().nodes.find((n) => n.data.name === 'Trade')!;
    act(() => {
      useEditorStore.getState().applyReactFlowNodeChanges([
        {
          type: 'position',
          id: tradeNode.id,
          position: { x: tradeNode.position.x + 100, y: tradeNode.position.y + 50 }
        }
      ]);
    });

    // Re-render with updated nodes.
    const newNodes = useEditorStore.getState().nodes;
    const newEdges = useEditorStore.getState().edges;
    rerender({ nodes: newNodes, edges: newEdges });

    // Give effects a full cycle.
    await new Promise((r) => setTimeout(r, 0));

    expect(onModelChanged).not.toHaveBeenCalled();
  });

  it('does NOT serialize a PARSE-origin change (parseEpoch advanced) — source-corruption guard', async () => {
    // Regression for the source-corruption bug: when the parse worker is
    // unavailable a degraded reparse rebuilds `nodes` (attributes stripped) and
    // bumps `parseEpoch`. Serializing that back to source splices truncated text
    // over the real file. The gate: a content change that arrives WITH a
    // parseEpoch bump came FROM the source (a parse) → must NOT be serialized.
    const onModelChanged = vi.fn();
    const baselineNodes = useEditorStore.getState().nodes;
    const edges = useEditorStore.getState().edges;

    // Produce genuinely different graph content (as a reparse would).
    const tradeNode = baselineNodes.find((n) => n.data.name === 'Trade')!;
    const productNode = baselineNodes.find((n) => n.data.name === 'Product')!;
    act(() => {
      useEditorStore.getState().updateAttributeType(tradeNode.id, 'currency', productNode.data.name, productNode.id);
    });
    const changedNodes = useEditorStore.getState().nodes;

    const { rerender } = renderHook(
      ({ nodes, epoch }: { nodes: typeof baselineNodes; epoch: number }) =>
        useModelSourceSync(nodes, edges, onModelChanged, epoch),
      { initialProps: { nodes: baselineNodes, epoch: 0 } }
    );
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    onModelChanged.mockClear();

    // Content differs AND parseEpoch advanced → parse-origin → no serialize.
    rerender({ nodes: changedNodes, epoch: 1 });
    await new Promise((r) => setTimeout(r, 0));
    expect(onModelChanged).not.toHaveBeenCalled();
  });

  it('DOES serialize a USER-origin change (same content change, parseEpoch unchanged)', async () => {
    // Control for the gate above: the SAME content change WITHOUT a parseEpoch
    // bump is a user edit and MUST still serialize — proving the gate keys on
    // parse-origin, not on the change itself (and doesn't break normal edits,
    // including deletions which are also user edits).
    const onModelChanged = vi.fn();
    const baselineNodes = useEditorStore.getState().nodes;
    const edges = useEditorStore.getState().edges;
    // Supply source so CST-reuse can produce content to compare.
    const srcMap = new Map([['test.combined', COMBINED_MODEL_SOURCE]]);

    const tradeNode = baselineNodes.find((n) => n.data.name === 'Trade')!;
    const productNode = baselineNodes.find((n) => n.data.name === 'Product')!;
    act(() => {
      useEditorStore.getState().updateAttributeType(tradeNode.id, 'currency', productNode.data.name, productNode.id);
    });
    const changedNodes = useEditorStore.getState().nodes;
    const changedPatches = useEditorStore.getState().pendingEditPatches;

    const { rerender } = renderHook(
      ({ nodes, epoch, patches }: { nodes: typeof baselineNodes; epoch: number; patches: Patches }) =>
        useModelSourceSync(nodes, edges, onModelChanged, epoch, patches, srcMap),
      { initialProps: { nodes: baselineNodes, epoch: 7, patches: [] as Patches } }
    );
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    onModelChanged.mockClear();

    // Content differs, parseEpoch UNCHANGED (7) → user-origin → serialize fires.
    rerender({ nodes: changedNodes, epoch: 7, patches: changedPatches });
    await waitFor(() => {
      expect(onModelChanged).toHaveBeenCalled();
    });
  });

  it('does NOT serialize deferred placeholder nodes (curated stubs the user did not author)', async () => {
    // Deferred-export placeholders (`meta.deferred === true`) are `{ $type, name }`
    // stubs for namespaces the user did NOT author. Serializing them emits stub
    // elements into source files the user never wrote — buildSourceForNamespaces
    // filters them at the serialization boundary; this pins that end-to-end
    // through the hook's emission path.
    const onModelChanged = vi.fn();
    const deferredStub = {
      id: 'other.curated.Stub',
      type: 'data',
      position: { x: 0, y: 0 },
      data: { $type: 'Data', name: 'Stub' },
      meta: { namespace: 'other.curated', errors: [], hasExternalRefs: false, deferred: true }
    } as unknown as ReturnType<typeof useEditorStore.getState>['nodes'][number];

    const baselineNodes = [...useEditorStore.getState().nodes, deferredStub];
    const edges = useEditorStore.getState().edges;
    // Supply source only for the user-authored namespace; curated has none.
    const srcMap = new Map([['test.combined', COMBINED_MODEL_SOURCE]]);

    const { rerender } = renderHook(
      ({ nodes, patches }: { nodes: typeof baselineNodes; patches: Patches }) =>
        useModelSourceSync(nodes, edges, onModelChanged, 0, patches, srcMap),
      { initialProps: { nodes: baselineNodes, patches: [] as Patches } }
    );

    // Allow initial-skip to settle.
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    onModelChanged.mockClear();

    // User edit (same path as inspector/structure edits).
    const tradeNode = useEditorStore.getState().nodes.find((n) => n.data.name === 'Trade')!;
    const productNode = useEditorStore.getState().nodes.find((n) => n.data.name === 'Product')!;
    act(() => {
      useEditorStore.getState().updateAttributeType(tradeNode.id, 'currency', productNode.data.name, productNode.id);
    });

    const newPatches = useEditorStore.getState().pendingEditPatches;
    rerender({ nodes: [...useEditorStore.getState().nodes, deferredStub], patches: newPatches });

    await waitFor(() => {
      expect(onModelChanged).toHaveBeenCalled();
    });

    const serialized = onModelChanged.mock.calls.at(-1)![0] as Map<string, string>;
    // The user-authored namespace serializes; the deferred stub's namespace must NOT.
    expect(serialized.has('test.combined')).toBe(true);
    expect(serialized.has('other.curated')).toBe(false);
  });

  it('does NOT call onModelChanged when onModelChanged is undefined', async () => {
    // Should not throw, should be a no-op.
    const nodes = useEditorStore.getState().nodes;
    const edges = useEditorStore.getState().edges;

    expect(() => {
      renderHook(() => useModelSourceSync(nodes, edges, undefined));
    }).not.toThrow();
  });
});
